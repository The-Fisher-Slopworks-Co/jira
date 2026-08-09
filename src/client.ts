// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { extractJsessionid } from './cookie.js';
import { JiraAuthError, JiraError } from './errors.js';
import { type JiraIssue, parseIssue } from './issue.js';
import { DEFAULT_ISSUE_FIELDS, isAbsoluteUrl, issuePath, joinUrl, stripTrailingSlash } from './url.js';

/** Default per-request timeout. A best-effort tool must not hang on a slow host. */
export const DEFAULT_TIMEOUT_MS = 6000;

/**
 * A Jira session: the base URL and the cookie header to replay. Returned by
 * {@link JiraClient.login} and accepted by every authenticated method. It is
 * plain, serialisable data — storing it between runs is the caller's job.
 */
export interface JiraSession {
  /** Base URL, no trailing slash (e.g. `https://jira.example.com`). */
  baseUrl: string;
  /** Cookie header value to send, e.g. `JSESSIONID=ABC123`. */
  cookie: string;
}

/** Options for {@link JiraClient}. All optional, with sensible defaults. */
export interface JiraClientOptions {
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
 * The client keeps no ambient state: it never touches the filesystem and never
 * reads an environment variable. Every request is decided by the
 * {@link JiraSession} it is handed, and the only dependencies are the global
 * `fetch` and nothing else — so it bundles cleanly and runs wherever `fetch`
 * exists.
 */
export class JiraClient {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: JiraClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? fetch;
  }

  /**
   * Authenticate against `POST /rest/auth/1/session` and return the session.
   * Throws {@link JiraError} with a human-readable message on bad credentials,
   * a non-Server endpoint, a CAPTCHA wall, or a network failure.
   *
   * The session is returned, never stored: persist it yourself if later runs
   * should reuse it instead of signing in again.
   */
  async login(baseUrl: string, username: string, password: string): Promise<JiraSession> {
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
    return { baseUrl: base, cookie };
  }

  /**
   * Low-level authenticated request. `path` is an API path (leading slash
   * optional) or a full absolute URL; for a path, the base URL comes from the
   * session. Returns the raw `Response` — the caller inspects status and body.
   */
  request(session: JiraSession, path: string, init: RequestInit = {}): Promise<Response> {
    const target = isAbsoluteUrl(path) ? path : joinUrl(session.baseUrl, path);
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
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}