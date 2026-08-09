// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';

import { JiraClient } from './client.js';
import { JiraAuthError, JiraError } from './errors.js';
import type { JiraSession } from './session.js';

// Shape mirrors a real Jira Server/DC subtask response.
const SUBTASK = {
  key: 'PROJ-123',
  fields: {
    summary: 'Backend. Profile API endpoint',
    status: { name: 'In Review' },
    issuetype: { name: 'Sub-task', subtask: true },
    parent: { key: 'PROJ-100', fields: { summary: 'Add user profiles' } },
  },
};

/** Start a throwaway HTTP server on a random port; returns its base URL. */
async function listen(
  t: TestContext,
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<string> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return `http://localhost:${(server.address() as AddressInfo).port}`;
}

/** Set an env var for the duration of the test, restoring it afterwards. */
function setEnv(t: TestContext, key: string, value: string | undefined): void {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  });
}

/** A fresh session-file path under a throwaway dir (cleaned up on teardown). */
function tmpSessionPath(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), 'jira-client-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'session.json');
}

test('login and getIssue work over real HTTP and replay the cookie', async (t: TestContext) => {
  setEnv(t, 'JIRA_URL', undefined);
  let sentCookie: string | undefined;
  const base = await listen(t, (req, res) => {
    const { pathname } = new URL(req.url ?? '', 'http://localhost');
    if (req.method === 'POST' && pathname === '/rest/auth/1/session') {
      res.setHeader('Set-Cookie', 'JSESSIONID=ABC123; Path=/; HttpOnly');
      res.end('{}');
      return;
    }
    if (req.method === 'GET' && pathname === '/rest/api/2/issue/PROJ-123') {
      sentCookie = req.headers.cookie;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(SUBTASK));
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });
  const client = new JiraClient({ sessionPath: tmpSessionPath(t) });

  const session = await client.login(base, 'alice', 'secret');
  assert.equal(session.baseUrl, base);
  assert.equal(session.cookie, 'JSESSIONID=ABC123');
  assert.deepEqual(await client.loadSession(), session);

  const issue = await client.getIssue(session, 'PROJ-123');
  assert.deepEqual(issue, {
    key: 'PROJ-123',
    summary: 'Backend. Profile API endpoint',
    status: 'In Review',
    issueType: 'Sub-task',
    parent: { key: 'PROJ-100', summary: 'Add user profiles', issueType: null },
    description: null,
    comments: [],
    attachments: [],
    subtasks: [],
    raw: SUBTASK,
  });
  assert.equal(sentCookie, 'JSESSIONID=ABC123');
});

test('getIssue surfaces a 401 as JiraAuthError and other errors as null', async (t: TestContext) => {
  setEnv(t, 'JIRA_URL', undefined);
  const base = await listen(t, (req, res) => {
    res.statusCode = (req.url ?? '').includes('/EXPIRED-1') ? 401 : 404;
    res.end('{}');
  });
  const session: JiraSession = { baseUrl: base, cookie: 'JSESSIONID=x' };
  const client = new JiraClient({ sessionPath: tmpSessionPath(t) });
  await assert.rejects(() => client.getIssue(session, 'EXPIRED-1'), JiraAuthError);
  assert.equal(await client.getIssue(session, 'MISSING-1'), null);
});

test('getIssue strict turns a non-2xx into a thrown JiraError carrying the status', async (t: TestContext) => {
  setEnv(t, 'JIRA_URL', undefined);
  const base = await listen(t, (_req, res) => {
    res.statusCode = 500;
    res.end('boom');
  });
  const session: JiraSession = { baseUrl: base, cookie: 'JSESSIONID=x' };
  const client = new JiraClient({ sessionPath: tmpSessionPath(t) });
  await assert.rejects(
    () => client.getIssue(session, 'X-1', { strict: true }),
    (err: unknown) => err instanceof JiraError && err.status === 500,
  );
});

test('JIRA_URL overrides the session base URL, read at request time', async (t: TestContext) => {
  let hitSession = false;
  let hitOverride = false;
  const reply = (res: ServerResponse) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(SUBTASK));
  };
  const sessionBase = await listen(t, (_req, res) => {
    hitSession = true;
    reply(res);
  });
  const overrideBase = await listen(t, (_req, res) => {
    hitOverride = true;
    reply(res);
  });
  const session: JiraSession = { baseUrl: sessionBase, cookie: 'JSESSIONID=x' };
  const client = new JiraClient({ sessionPath: tmpSessionPath(t) });

  // Override set *after* construction → must still take effect (per-call read).
  setEnv(t, 'JIRA_URL', overrideBase);
  await client.getIssue(session, 'PROJ-123');
  assert.equal(hitOverride, true);
  assert.equal(hitSession, false);

  // Clearing it falls back to the session's own base URL.
  delete process.env.JIRA_URL;
  hitOverride = false;
  await client.getIssue(session, 'PROJ-123');
  assert.equal(hitSession, true);
  assert.equal(hitOverride, false);
});

test('login uses its baseUrl argument, ignoring JIRA_URL', async (t: TestContext) => {
  const base = await listen(t, (req, res) => {
    if (req.method === 'POST' && new URL(req.url ?? '', 'http://x').pathname === '/rest/auth/1/session') {
      res.setHeader('Set-Cookie', 'JSESSIONID=REAL; Path=/');
      res.end('{}');
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
  setEnv(t, 'JIRA_URL', 'http://127.0.0.1:1/bogus');
  const client = new JiraClient({ sessionPath: tmpSessionPath(t) });
  const session = await client.login(base, 'alice', 'secret');
  assert.equal(session.baseUrl, base);
  assert.equal(session.cookie, 'JSESSIONID=REAL');
});

test('getJson replays the cookie and maps statuses to errors', async (t: TestContext) => {
  setEnv(t, 'JIRA_URL', undefined);
  let sentCookie: string | undefined;
  const base = await listen(t, (req, res) => {
    const { pathname } = new URL(req.url ?? '', 'http://localhost');
    if (pathname === '/rest/api/2/myself') {
      sentCookie = req.headers.cookie;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ name: 'alice' }));
      return;
    }
    res.statusCode = pathname === '/unauth' ? 401 : 404;
    res.end('{}');
  });
  const session: JiraSession = { baseUrl: base, cookie: 'JSESSIONID=tok' };
  const client = new JiraClient({ sessionPath: tmpSessionPath(t) });

  assert.deepEqual(await client.getJson<{ name: string }>(session, '/rest/api/2/myself'), {
    name: 'alice',
  });
  assert.equal(sentCookie, 'JSESSIONID=tok');
  await assert.rejects(() => client.getJson(session, '/unauth'), JiraAuthError);
  await assert.rejects(
    () => client.getJson(session, '/missing'),
    (err: unknown) => err instanceof JiraError && err.status === 404,
  );
});

test('login reports bad credentials and a non-Server endpoint', async (t: TestContext) => {
  setEnv(t, 'JIRA_URL', undefined);
  // /rest/auth/1/session → 401 (bad password); any other path → 404 (wrong host).
  const base = await listen(t, (req, res) => {
    const { pathname } = new URL(req.url ?? '', 'http://localhost');
    res.statusCode = pathname === '/rest/auth/1/session' ? 401 : 404;
    res.end('{}');
  });
  const client = new JiraClient({ sessionPath: tmpSessionPath(t) });
  await assert.rejects(() => client.login(base, 'alice', 'bad'), /wrong username\/password/);
  await assert.rejects(
    () => client.login(`${base}/wrong`, 'alice', 'x'),
    /Jira Cloud|wrong URL|not found/,
  );
});

test('login surfaces a CAPTCHA wall distinctly from a bad password', async (t: TestContext) => {
  setEnv(t, 'JIRA_URL', undefined);
  const base = await listen(t, (_req, res) => {
    res.statusCode = 401;
    res.setHeader('X-Authentication-Denied-Reason', 'AUTH_DENIED_PASSWORD_RESET,CAPTCHA_CHALLENGE');
    res.end('{}');
  });
  const client = new JiraClient({ sessionPath: tmpSessionPath(t) });
  await assert.rejects(() => client.login(base, 'alice', 'secret'), /CAPTCHA/);
});

test('login persist:false returns the session without writing it to disk', async (t: TestContext) => {
  setEnv(t, 'JIRA_URL', undefined);
  const base = await listen(t, (_req, res) => {
    res.setHeader('Set-Cookie', 'JSESSIONID=NOPERSIST; Path=/');
    res.end('{}');
  });
  const client = new JiraClient({ sessionPath: tmpSessionPath(t) });
  const session = await client.login(base, 'alice', 'secret', { persist: false });
  assert.equal(session.cookie, 'JSESSIONID=NOPERSIST');
  assert.equal(await client.loadSession(), null);
});