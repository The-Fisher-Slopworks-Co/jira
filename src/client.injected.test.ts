// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';

import { JiraClient } from './client.js';
import { JiraError } from './errors.js';
import type { JiraSession } from './session.js';

// These tests drive the transport / parse / no-cookie branches that a real HTTP
// server can't reach without flakiness, by injecting a `fetch` stub. The
// session-file path is a throwaway none of these paths actually write to.

type FetchStub = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function clientWith(t: TestContext, stub: FetchStub): JiraClient {
  const dir = mkdtempSync(join(tmpdir(), 'jira-injected-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return new JiraClient({ fetch: stub as unknown as typeof fetch, sessionPath: join(dir, 's.json') });
}

function setEnv(t: TestContext, key: string, value: string | undefined): void {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  t.after(() => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const SESSION: JiraSession = { baseUrl: 'https://session.invalid', cookie: 'JSESSIONID=tok' };

test('request uses an absolute URL verbatim and applies the cookie, ignoring JIRA_URL and the session base', async (t: TestContext) => {
  setEnv(t, 'JIRA_URL', 'https://override.invalid');
  let calledUrl: string | undefined;
  let sentCookie: string | null = null;
  const client = clientWith(t, async (input, init) => {
    calledUrl = String(input);
    sentCookie = new Headers(init?.headers).get('cookie');
    return json({ name: 'alice' });
  });
  await client.getJson(SESSION, 'https://elsewhere.test/rest/api/2/myself');
  assert.equal(calledUrl, 'https://elsewhere.test/rest/api/2/myself'); // not override.invalid, not session.invalid
  assert.equal(sentCookie, 'JSESSIONID=tok');
});

test('getJson maps a transport failure to JiraError', async (t: TestContext) => {
  const client = clientWith(t, async () => {
    throw new Error('ECONNREFUSED');
  });
  await assert.rejects(
    () => client.getJson(SESSION, '/rest/api/2/myself'),
    (err: unknown) => err instanceof JiraError && /failed/.test(err.message),
  );
});

test('getJson maps a non-JSON 200 body to JiraError', async (t: TestContext) => {
  const client = clientWith(
    t,
    async () => new Response('<html>nope</html>', { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  await assert.rejects(
    () => client.getJson(SESSION, '/rest/api/2/myself'),
    (err: unknown) => err instanceof JiraError && /parse/.test(err.message),
  );
});

test('getIssue is best-effort on transport/parse failures; strict turns them into JiraError', async (t: TestContext) => {
  const transport = clientWith(t, async () => {
    throw new Error('down');
  });
  assert.equal(await transport.getIssue(SESSION, 'X-1'), null);
  await assert.rejects(() => transport.getIssue(SESSION, 'X-1', { strict: true }), JiraError);

  const badBody = clientWith(
    t,
    async () => new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  assert.equal(await badBody.getIssue(SESSION, 'X-1'), null);
  await assert.rejects(() => badBody.getIssue(SESSION, 'X-1', { strict: true }), JiraError);
});

test('login throws when the 2xx response carries no JSESSIONID cookie', async (t: TestContext) => {
  const client = clientWith(t, async () => new Response('{}', { status: 200 }));
  await assert.rejects(
    () => client.login('https://jira.test', 'alice', 'secret'),
    /no JSESSIONID/,
  );
  // Nothing should have been persisted on the failure path.
  assert.equal(await client.loadSession(), null);
});

test('login maps a transport failure to a reachability error', async (t: TestContext) => {
  const client = clientWith(t, async () => {
    throw new Error('getaddrinfo ENOTFOUND');
  });
  await assert.rejects(
    () => client.login('https://jira.test', 'alice', 'secret'),
    /could not reach Jira/,
  );
});

test('login reports a generic non-2xx with its status', async (t: TestContext) => {
  const client = clientWith(t, async () => new Response('boom', { status: 500 }));
  await assert.rejects(
    () => client.login('https://jira.test', 'alice', 'secret'),
    (err: unknown) => err instanceof JiraError && err.status === 500 && /HTTP 500/.test(err.message),
  );
});