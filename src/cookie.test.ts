// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import test from 'node:test';

import { extractJsessionid } from './cookie.js';

test('extract finds the JSESSIONID pair', () => {
  assert.equal(extractJsessionid(['JSESSIONID=ABC123; Path=/; HttpOnly']), 'JSESSIONID=ABC123');
});

test('extract skips other cookies', () => {
  assert.equal(
    extractJsessionid(['atlassian.xsrf.token=tok; Path=/', 'JSESSIONID=XYZ; Secure']),
    'JSESSIONID=XYZ',
  );
});

test('extract returns null when absent or empty-valued', () => {
  assert.equal(extractJsessionid([]), null);
  assert.equal(extractJsessionid(['other=1; Path=/']), null);
  assert.equal(extractJsessionid(['JSESSIONID=; Path=/']), null);
});