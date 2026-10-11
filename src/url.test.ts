// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ISSUE_FIELDS,
  isAbsoluteUrl,
  issuePath,
  issueUrl,
  joinUrl,
  stripTrailingSlash,
} from "./url.js";

test("stripTrailingSlash drops only one trailing slash", () => {
  assert.equal(stripTrailingSlash("https://x/"), "https://x");
  assert.equal(stripTrailingSlash("https://x"), "https://x");
  assert.equal(stripTrailingSlash("https://x//"), "https://x/");
});

test("isAbsoluteUrl recognises http(s) URLs only", () => {
  assert.equal(isAbsoluteUrl("https://jira.test/x"), true);
  assert.equal(isAbsoluteUrl("http://jira.test"), true);
  assert.equal(isAbsoluteUrl("/rest/api/2/myself"), false);
  assert.equal(isAbsoluteUrl("rest/api/2/myself"), false);
});

test("joinUrl normalises the slash between base and path", () => {
  assert.equal(joinUrl("https://x", "/a/b"), "https://x/a/b");
  assert.equal(joinUrl("https://x/", "/a/b"), "https://x/a/b");
  assert.equal(joinUrl("https://x/", "a/b"), "https://x/a/b");
  assert.equal(joinUrl("https://x", "a/b"), "https://x/a/b");
});

test("issuePath builds a relative, fields-scoped path", () => {
  assert.equal(
    issuePath("PROJ-123"),
    "/rest/api/2/issue/PROJ-123?fields=summary,status,issuetype,parent",
  );
  assert.equal(
    issuePath("X-1", ["summary"]),
    "/rest/api/2/issue/X-1?fields=summary",
  );
  assert.equal(issuePath("X-1", []), "/rest/api/2/issue/X-1");
});

test("issueUrl joins the base with issuePath and strips a trailing slash", () => {
  assert.equal(
    issueUrl("https://jira.test", "PROJ-123", ["summary", "parent", "status"]),
    "https://jira.test/rest/api/2/issue/PROJ-123?fields=summary,parent,status",
  );
  assert.equal(
    issueUrl("https://jira.test/", "X-1", ["summary"]),
    "https://jira.test/rest/api/2/issue/X-1?fields=summary",
  );
});

test("DEFAULT_ISSUE_FIELDS are the modelled fields", () => {
  assert.deepEqual(
    [...DEFAULT_ISSUE_FIELDS],
    ["summary", "status", "issuetype", "parent"],
  );
});
