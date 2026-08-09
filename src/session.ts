// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** A persisted Jira session: the base URL and the cookie header to replay. */
export interface JiraSession {
  /** Base URL, no trailing slash (e.g. `https://jira.example.com`). */
  baseUrl: string;
  /** Cookie header value to send, e.g. `JSESSIONID=ABC123`. */
  cookie: string;
}

/**
 * Default on-disk location for a saved session:
 * `$XDG_CONFIG_HOME/<app>/<file>`, falling back to `~/.config` when
 * `XDG_CONFIG_HOME` is unset.
 */
export function defaultSessionPath(app: string, file = 'session.json'): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(configHome, app, file);
}

/** Read and validate a persisted session. Never throws; returns `null` on any problem. */
export async function readSession(path: string): Promise<JiraSession | null> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return null;
  }
  try {
    const obj = JSON.parse(raw) as { baseUrl?: unknown; cookie?: unknown };
    if (typeof obj.baseUrl === 'string' && typeof obj.cookie === 'string') {
      return { baseUrl: obj.baseUrl, cookie: obj.cookie };
    }
  } catch {
    // Fall through to null on malformed JSON.
  }
  return null;
}

/** Persist a session, creating the directory and locking the file to mode 0600. */
export async function writeSession(session: JiraSession, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(session, null, 2), { mode: 0o600 });
  // writeFile's mode only applies on creation; enforce it on an existing file too.
  await chmod(path, 0o600);
}