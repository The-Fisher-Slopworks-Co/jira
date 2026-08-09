// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/** A parent issue reference, as nested under `fields.parent` on Jira Server/DC. */
export interface JiraParent {
  key: string;
  summary: string | null;
  issueType: string | null;
}

/** A child subtask reference, as nested under `fields.subtasks[]` on Jira Server/DC. */
export interface JiraSubtask {
  key: string;
  summary: string | null;
  /** Workflow status name of the subtask (e.g. `Done`), or `null` if absent. */
  status: string | null;
  issueType: string | null;
}

/** One comment from `fields.comment.comments[]` on Jira Server/DC. */
export interface JiraComment {
  id: string | null;
  /** Display name of the comment's author, or `null`. */
  author: string | null;
  /** Comment text. Plain/wiki markup on Server/DC (a string), or `null`. */
  body: string | null;
  /** ISO-8601 creation timestamp as Jira returned it, or `null`. */
  created: string | null;
  /** ISO-8601 last-update timestamp, or `null` (absent / never edited). */
  updated: string | null;
}

/** One attachment from `fields.attachment[]` on Jira Server/DC. */
export interface JiraAttachment {
  id: string | null;
  /** Original file name, or `null`. */
  filename: string | null;
  /** Display name of whoever attached it, or `null`. */
  author: string | null;
  /** ISO-8601 upload timestamp, or `null`. */
  created: string | null;
  /** Size in bytes, or `null` if Jira didn't report a number. */
  size: number | null;
  /** MIME type (e.g. `image/png`), or `null`. */
  mimeType: string | null;
  /** Absolute URL to download the file (needs the session cookie), or `null`. */
  content: string | null;
}

/**
 * A parsed Jira issue. Common fields are surfaced as typed properties; the full
 * untouched response is kept on {@link JiraIssue.raw} for fields the library
 * doesn't model.
 */
export interface JiraIssue {
  key: string | null;
  summary: string | null;
  /** Workflow status name (e.g. `In Review`, `Done`), or `null` if absent. */
  status: string | null;
  /** Issue type name (e.g. `Story`, `Sub-task`), or `null` if absent. */
  issueType: string | null;
  /** Parent issue (set on subtasks), or `null`. */
  parent: JiraParent | null;
  /**
   * Issue description. Plain/wiki markup on Server/DC (a string), or `null` when
   * absent or not requested. Only populated when `description` is among the
   * requested fields (see {@link DETAIL_ISSUE_FIELDS}).
   */
  description: string | null;
  /**
   * Comments, oldest first, from `fields.comment.comments`. Empty when there are
   * none or the `comment` field wasn't requested.
   */
  comments: JiraComment[];
  /**
   * Attachments, in the order Jira returned them, from `fields.attachment`.
   * Empty when there are none or the `attachment` field wasn't requested.
   */
  attachments: JiraAttachment[];
  /**
   * Child subtasks, in the order Jira returned them, from `fields.subtasks`.
   * Empty when there are none or the `subtasks` field wasn't requested. Each
   * carries the subtask's key, summary, status, and type (nested at
   * `fields.subtasks[].fields` on Server/DC); subtasks without a key are dropped.
   */
  subtasks: JiraSubtask[];
  /** The full `/rest/api/2/issue` response body, as received. */
  raw: unknown;
}

/** Narrow an unknown value to a `string`, or `null`. */
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/** Narrow an unknown value to a finite `number`, or `null`. */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Display name nested under an author-like object (`{ displayName }`), or `null`. */
function authorName(v: unknown): string | null {
  return str((v as { displayName?: unknown } | null | undefined)?.displayName);
}

/**
 * Map a raw `/rest/api/2/issue` body to {@link JiraIssue}. Tolerant by design:
 * every field defaults to `null` when absent or of the wrong type, so callers
 * decide what they require. The parent's summary is nested at
 * `fields.parent.fields.summary` on Jira Server/DC, so one request yields both.
 */
export function parseIssue(json: unknown): JiraIssue {
  const root = (json ?? {}) as { key?: unknown; fields?: unknown };
  const fields = (root.fields ?? {}) as {
    summary?: unknown;
    status?: { name?: unknown };
    issuetype?: { name?: unknown };
    parent?: { key?: unknown; fields?: { summary?: unknown; issuetype?: { name?: unknown } } };
    description?: unknown;
    comment?: { comments?: unknown };
    attachment?: unknown;
    subtasks?: unknown;
  };
  const parentRaw = fields.parent;
  const parentKey = str(parentRaw?.key);
  const parent: JiraParent | null =
    parentKey == null
      ? null
      : {
          key: parentKey,
          summary: str(parentRaw?.fields?.summary),
          issueType: str(parentRaw?.fields?.issuetype?.name),
        };
  const comments = Array.isArray(fields.comment?.comments)
    ? fields.comment.comments.map(parseComment)
    : [];
  const attachments = Array.isArray(fields.attachment)
    ? fields.attachment.map(parseAttachment)
    : [];
  const subtasks = Array.isArray(fields.subtasks)
    ? fields.subtasks.map(parseSubtask).filter((s): s is JiraSubtask => s != null)
    : [];
  return {
    key: str(root.key),
    summary: str(fields.summary),
    status: str(fields.status?.name),
    issueType: str(fields.issuetype?.name),
    parent,
    // On Server/DC description is a string; tolerate the field being absent or
    // (on instances configured for ADF) a non-string by netting to null.
    description: str(fields.description),
    comments,
    attachments,
    subtasks,
    raw: json,
  };
}

/**
 * Map one raw `fields.subtasks[]` element to {@link JiraSubtask}, or `null` when
 * it has no key (an unkeyed subtask can't be linked to or shown usefully). The
 * summary, status, and type are nested under `fields`, mirroring the parent.
 */
function parseSubtask(raw: unknown): JiraSubtask | null {
  const s = (raw ?? {}) as {
    key?: unknown;
    fields?: { summary?: unknown; status?: { name?: unknown }; issuetype?: { name?: unknown } };
  };
  const key = str(s.key);
  if (key == null) return null;
  return {
    key,
    summary: str(s.fields?.summary),
    status: str(s.fields?.status?.name),
    issueType: str(s.fields?.issuetype?.name),
  };
}

/** Map one raw `fields.comment.comments[]` element to {@link JiraComment}. */
function parseComment(raw: unknown): JiraComment {
  const c = (raw ?? {}) as {
    id?: unknown;
    author?: unknown;
    body?: unknown;
    created?: unknown;
    updated?: unknown;
  };
  return {
    id: str(c.id),
    author: authorName(c.author),
    body: str(c.body),
    created: str(c.created),
    updated: str(c.updated),
  };
}

/** Map one raw `fields.attachment[]` element to {@link JiraAttachment}. */
function parseAttachment(raw: unknown): JiraAttachment {
  const a = (raw ?? {}) as {
    id?: unknown;
    filename?: unknown;
    author?: unknown;
    created?: unknown;
    size?: unknown;
    mimeType?: unknown;
    content?: unknown;
  };
  return {
    id: str(a.id),
    filename: str(a.filename),
    author: authorName(a.author),
    created: str(a.created),
    size: num(a.size),
    mimeType: str(a.mimeType),
    content: str(a.content),
  };
}