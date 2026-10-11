// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert/strict";
import test from "node:test";

import { parseIssue } from "./issue.js";

// Shape mirrors a real Jira Server/DC subtask response (fields=summary,parent,status,issuetype).
const SUBTASK = {
  key: "PROJ-123",
  fields: {
    summary: "Backend. Profile API endpoint",
    status: { name: "In Review" },
    issuetype: { name: "Sub-task", subtask: true },
    parent: {
      key: "PROJ-100",
      fields: {
        summary: "Add user profiles",
        issuetype: { name: "Story", subtask: false },
      },
    },
  },
};

test("parse extracts key, summary, status, issueType, and nested parent", () => {
  assert.deepEqual(parseIssue(SUBTASK), {
    key: "PROJ-123",
    summary: "Backend. Profile API endpoint",
    status: "In Review",
    issueType: "Sub-task",
    parent: {
      key: "PROJ-100",
      summary: "Add user profiles",
      issueType: "Story",
    },
    description: null,
    comments: [],
    attachments: [],
    subtasks: [],
    raw: SUBTASK,
  });
});

// Shape mirrors a real Jira Server/DC issue read with fields=...,description,comment,attachment.
const WITH_BODY = {
  key: "PROJ-7",
  fields: {
    summary: "Has a body",
    status: { name: "In Progress" },
    description: "Line one\nLine two",
    comment: {
      comments: [
        {
          id: "101",
          author: { displayName: "Alice" },
          body: "first comment",
          created: "2026-01-02T10:00:00.000+0000",
          updated: "2026-01-02T10:05:00.000+0000",
        },
        {
          id: "102",
          author: { displayName: "Bob" },
          body: "second",
          created: "2026-01-03T09:00:00.000+0000",
        },
      ],
    },
    attachment: [
      {
        id: "5",
        filename: "diagram.png",
        author: { displayName: "Alice" },
        created: "2026-01-02T10:00:00.000+0000",
        size: 2048,
        mimeType: "image/png",
        content: "https://jira.example.com/secure/attachment/5/diagram.png",
      },
    ],
  },
};

test("parse extracts description, comments, and attachments", () => {
  const parsed = parseIssue(WITH_BODY);
  assert.equal(parsed.description, "Line one\nLine two");
  assert.deepEqual(parsed.comments, [
    {
      id: "101",
      author: "Alice",
      body: "first comment",
      created: "2026-01-02T10:00:00.000+0000",
      updated: "2026-01-02T10:05:00.000+0000",
    },
    {
      id: "102",
      author: "Bob",
      body: "second",
      created: "2026-01-03T09:00:00.000+0000",
      updated: null,
    },
  ]);
  assert.deepEqual(parsed.attachments, [
    {
      id: "5",
      filename: "diagram.png",
      author: "Alice",
      created: "2026-01-02T10:00:00.000+0000",
      size: 2048,
      mimeType: "image/png",
      content: "https://jira.example.com/secure/attachment/5/diagram.png",
    },
  ]);
});

test("parse nets a non-string (ADF) description to null and tolerates odd comment/attachment shapes", () => {
  const parsed = parseIssue({
    fields: {
      summary: "Cloud-style",
      description: { type: "doc", content: [] },
      comment: { comments: [{}, null] },
      attachment: [{ filename: "x.txt" }, null],
    },
  });
  assert.equal(parsed.description, null);
  assert.deepEqual(parsed.comments, [
    { id: null, author: null, body: null, created: null, updated: null },
    { id: null, author: null, body: null, created: null, updated: null },
  ]);
  assert.deepEqual(parsed.attachments, [
    {
      id: null,
      filename: "x.txt",
      author: null,
      created: null,
      size: null,
      mimeType: null,
      content: null,
    },
    {
      id: null,
      filename: null,
      author: null,
      created: null,
      size: null,
      mimeType: null,
      content: null,
    },
  ]);
});

// Shape mirrors a real Server/DC parent-story read with fields=...,subtasks: each
// child carries its key plus summary/status/issuetype nested under `fields`.
const WITH_SUBTASKS = {
  key: "PROJ-100",
  fields: {
    summary: "Add user profiles",
    issuetype: { name: "Story" },
    subtasks: [
      {
        key: "PROJ-123",
        fields: {
          summary: "Backend. Profile API endpoint",
          status: { name: "Done" },
          issuetype: { name: "Sub-task", subtask: true },
        },
      },
      {
        key: "PROJ-124",
        fields: {
          summary: "Frontend. Profile page",
          status: { name: "In Review" },
        },
      },
    ],
  },
};

test("parse extracts subtasks with their key, summary, status, and type", () => {
  assert.deepEqual(parseIssue(WITH_SUBTASKS).subtasks, [
    {
      key: "PROJ-123",
      summary: "Backend. Profile API endpoint",
      status: "Done",
      issueType: "Sub-task",
    },
    {
      key: "PROJ-124",
      summary: "Frontend. Profile page",
      status: "In Review",
      issueType: null,
    },
  ]);
});

test("parse drops subtasks without a key and tolerates odd shapes", () => {
  const parsed = parseIssue({
    fields: {
      subtasks: [{ fields: { summary: "no key" } }, null, { key: "K-1" }],
    },
  });
  assert.deepEqual(parsed.subtasks, [
    { key: "K-1", summary: null, status: null, issueType: null },
  ]);
});

test("parse with no subtasks field yields an empty array", () => {
  assert.deepEqual(
    parseIssue({ fields: { summary: "Standalone" } }).subtasks,
    [],
  );
});

test("parse with no parent yields a null parent", () => {
  const issue = {
    fields: { summary: "Standalone task", status: { name: "Done" } },
  };
  const parsed = parseIssue(issue);
  assert.equal(parsed.summary, "Standalone task");
  assert.equal(parsed.status, "Done");
  assert.equal(parsed.parent, null);
});

test("parse with no status yields null status", () => {
  assert.equal(
    parseIssue({ fields: { summary: "No status here" } }).status,
    null,
  );
});

test("parse with a parent key but no parent summary keeps the key", () => {
  const parsed = parseIssue({
    fields: { summary: "T", parent: { key: "P-1" } },
  });
  assert.deepEqual(parsed.parent, {
    key: "P-1",
    summary: null,
    issueType: null,
  });
});

test("parse is tolerant of missing/empty/null bodies (all fields null)", () => {
  for (const input of [{ fields: {} }, {}, null, undefined]) {
    const parsed = parseIssue(input);
    assert.equal(parsed.summary, null);
    assert.equal(parsed.status, null);
    assert.equal(parsed.issueType, null);
    assert.equal(parsed.parent, null);
    assert.equal(parsed.key, null);
  }
});
