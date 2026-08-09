// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { extractJsessionid } from './cookie.js';
import { JiraAuthError, JiraError } from './errors.js';
import { type JiraIssue, parseIssue } from './issue.js';
import {
  defaultSessionPath,
  type JiraSession,
  readSession,
  writeSession,
} from './session.js';
import { DEFAULT_ISSUE_FIELDS, isAbsoluteUrl, issuePath, joinUrl, stripTrailingSlash } from './url.js';

/** Default per-request timeout. A best-effort tool must not hang on a slow host. */
export const DEFAULT_TIMEOUT_MS = 6000;

/** Options for {@link JiraClient}. All optional, with sensible defaults. */
export interface JiraClientOptions {
  /**
   * Application name, used to derive the default session path
   * (`$XDG_CONFIG_HOME/<app>/<sessionFile>`). Defaults to `jira`.
   */
  app?: string;
  /** Session file name under the app directory. Defaults to `session.json`. */
  sessionFile?: string;
  /** Explicit session file path. Overrides {@link JiraClientOptions.app}/{@link JiraClientOptions.sessionFile}. */
  sessionPath?: string;
  /** Per-request timeout in ms. Defaults to {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** `fetch` implementation, for testing. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

/** Options for {@link JiraClient.getIssue}. */
export interface GetIssueOptions {
  /** Issue fields to request. Defaults to {@link DEFAULT_ISSUE_FIELDS}. */
  fields?: readonly string[];
  /**
   * When `true`, a non-2xx (other than 401) or a transport / parse failure
   * throws {@link JiraError} instead of returning `null`. Defaults to `false`
   * (best-effort).
   */
  strict?: boolean;
}

/**
 * Cookie-auth client for Jira Server / Data Center: {@link JiraClient.login}
 * mints a `JSESSIONID` via `POST /rest/auth/1/session`,
 * {@link JiraClient.request}/{@link JiraClient.getJson} replay it, and
 * {@link JiraClient.getIssue} reads an issue's common fields.
 *
 * Construction is side-effect-free; the session file is only touched inside the
 * async methods. The client has no runtime dependencies beyond `node:` builtins
 * and the global `fetch`, so it bundles cleanly and runs wherever those exist.
 */
export class JiraClient {
  private readonly sessionPath: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: JiraClientOptions = {}) {
    this.sessionPath =
      options.sessionPath ??
      defaultSessionPath(options.app ?? 'jira', options.sessionFile ?? 'session.json');
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? fetch;
  }

  /** The path this client reads/writes the persisted session to. */
  getSessionPath(): string {
    return this.sessionPath;
  }

  /** Read the persisted session, or `null` if there isn't a valid one. */
  loadSession(): Promise<JiraSession | null> {
    return readSession(this.sessionPath);
  }

  /** Persist a session to disk (mode 0600). */
  saveSession(session: JiraSession): Promise<void> {
    return writeSession(session, this.sessionPath);
  }

  /**
   * Authenticate against `POST /rest/auth/1/session` and return the session,
   * persisting it unless `persist: false`. Always uses the explicit `baseUrl`
   * argument (never the `JIRA_URL` override — that only affects replayed
   * requests). Throws {@link JiraError} with a human-readable message on bad
   * credentials, a non-Server endpoint, a CAPTCHA wall, or a network failure.
   */
  async login(
    baseUrl: string,
    username: string,
    password: string,
    options: { persist?: boolean } = {},
  ): Promise<JiraSession> {
    const base = stripTrailingSlash(baseUrl);
    let res: Response;
    try {
      res = await this.fetchImpl(`${base}/rest/auth/1/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new JiraError(`could not reach Jira at ${base}: ${errMessage(err)}`);
    }
    if (res.status === 404) {
      throw new JiraError(
        `login endpoint not found at ${base} — wrong URL, or Jira Cloud ` +
          '(cookie auth needs Jira Server/Data Center)',
        404,
      );
    }
    if (res.status === 401 || res.status === 403) {
      if (res.headers.get('x-authentication-denied-reason')) {
        throw new JiraError(
          'Jira requires a CAPTCHA — sign in via the web UI once, then retry',
          res.status,
        );
      }
      throw new JiraError('wrong username/password (or no permission to log in)', res.status);
    }
    if (!res.ok) {
      throw new JiraError(`Jira login failed (HTTP ${res.status})`, res.status);
    }
    const cookie = extractJsessionid(res.headers.getSetCookie());
    if (cookie == null) {
      throw new JiraError('login succeeded but Jira returned no JSESSIONID cookie', res.status);
    }
    const session: JiraSession = { baseUrl: base, cookie };
    if (options.persist !== false) {
      await this.saveSession(session);
    }
    return session;
  }

  /**
   * Low-level authenticated request. `path` is an API path (leading slash
   * optional) or a full absolute URL; for a path, the base URL comes from
   * `JIRA_URL` if set, else the session. Returns the raw `Response` — the
   * caller inspects status and body.
   */
  request(session: JiraSession, path: string, init: RequestInit = {}): Promise<Response> {
    const target = isAbsoluteUrl(path) ? path : joinUrl(this.resolveBaseUrl(session), path);
    const headers = new Headers(init.headers);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    headers.set('Cookie', session.cookie);
    return this.fetchImpl(target, {
      ...init,
      headers,
      signal: init.signal ?? AbortSignal.timeout(this.timeoutMs),
    });
  }

  /**
   * Authenticated GET returning parsed JSON. Throws {@link JiraAuthError} on
   * 401, and {@link JiraError} on any other non-2xx or a transport / parse
   * failure.
   */
  async getJson<T = unknown>(session: JiraSession, path: string): Promise<T> {
    let res: Response;
    try {
      res = await this.request(session, path);
    } catch (err) {
      throw new JiraError(`request to ${path} failed: ${errMessage(err)}`);
    }
    if (res.status === 401) {
      throw new JiraAuthError();
    }
    if (!res.ok) {
      throw new JiraError(`Jira returned HTTP ${res.status} for ${path}`, res.status);
    }
    try {
      return (await res.json()) as T;
    } catch (err) {
      throw new JiraError(`could not parse Jira response for ${path}: ${errMessage(err)}`);
    }
  }

  /**
   * Fetch an issue's common fields. Best-effort by default: returns `null` on a
   * not-found / network / parse failure so callers can fall back gracefully,
   * and throws {@link JiraAuthError} on 401 so they can re-authenticate. Pass
   * `strict: true` to turn the recoverable failures into thrown
   * {@link JiraError}s instead.
   */
  async getIssue(
    session: JiraSession,
    key: string,
    options: GetIssueOptions = {},
  ): Promise<JiraIssue | null> {
    const path = issuePath(key, options.fields ?? DEFAULT_ISSUE_FIELDS);
    let res: Response;
    try {
      res = await this.request(session, path);
    } catch (err) {
      if (options.strict) throw new JiraError(`could not reach Jira: ${errMessage(err)}`);
      return null; // network error or timeout → caller's fallback
    }
    if (res.status === 401) {
      throw new JiraAuthError();
    }
    if (!res.ok) {
      if (options.strict) throw new JiraError(`Jira returned HTTP ${res.status}`, res.status);
      return null; // 404 (no access / unknown key) and anything else
    }
    try {
      return parseIssue(await res.json());
    } catch (err) {
      if (options.strict) throw new JiraError(`could not parse issue ${key}: ${errMessage(err)}`);
      return null;
    }
  }

  /** `JIRA_URL` (read per call) overrides the stored base URL, so one saved session can be replayed against another host. */
  private resolveBaseUrl(session: JiraSession): string {
    return stripTrailingSlash(process.env.JIRA_URL || session.baseUrl);
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}