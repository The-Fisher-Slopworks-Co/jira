// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';

import { defaultSessionPath, readSession, writeSession } from './session.js';

test('defaultSessionPath honors XDG_CONFIG_HOME and the app/file', () => {
  const prev = process.env.XDG_CONFIG_HOME;
  try {
    process.env.XDG_CONFIG_HOME = '/tmp/xdg-config';
    assert.equal(defaultSessionPath('myapp', 'jira-session.json'), '/tmp/xdg-config/myapp/jira-session.json');
    assert.equal(defaultSessionPath('jira'), '/tmp/xdg-config/jira/session.json');
  } finally {
    if (prev === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = prev;
  }
});

test('session round-trips and is written 0600', async (t: TestContext) => {
  const dir = mkdtempSync(join(tmpdir(), 'jira-sess-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'nested', 'session.json');
  const session = { baseUrl: 'https://jira.test', cookie: 'JSESSIONID=abc' };
  await writeSession(session, path);
  assert.deepEqual(await readSession(path), session);
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test('readSession returns null for a missing file', async () => {
  assert.equal(await readSession(join(tmpdir(), 'jira-does-not-exist-12345.json')), null);
});

test('readSession returns null for malformed or incomplete content', async (t: TestContext) => {
  const dir = mkdtempSync(join(tmpdir(), 'jira-sess-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const bad = join(dir, 'bad.json');
  writeFileSync(bad, 'not json');
  assert.equal(await readSession(bad), null);

  const partial = join(dir, 'partial.json');
  writeFileSync(partial, JSON.stringify({ baseUrl: 'https://x' }));
  assert.equal(await readSession(partial), null);
});