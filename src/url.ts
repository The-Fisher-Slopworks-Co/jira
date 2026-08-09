// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/** Drop a single trailing slash so URL joins don't double up. */
export function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/** Does this string already look like an absolute `http(s)` URL? */
export function isAbsoluteUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

/** Join a base URL and an API path, normalising the slash between them. */
export function joinUrl(baseUrl: string, path: string): string {
  const base = stripTrailingSlash(baseUrl);
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}

/** Fields {@link issuePath} requests by default — the ones the library models. */
export const DEFAULT_ISSUE_FIELDS = ['summary', 'status', 'issuetype', 'parent'] as const;

/**
 * Fields for a full issue read: the defaults plus the child `subtasks` and the
 * heavier `description`, `comment`, and `attachment`. Use this when you need an
 * issue's body rather than just its summary/status (see {@link DEFAULT_ISSUE_FIELDS}).
 */
export const DETAIL_ISSUE_FIELDS = [
  'summary',
  'status',
  'issuetype',
  'parent',
  'subtasks',
  'description',
  'comment',
  'attachment',
] as const;

/** Build the relative `/rest/api/2/issue/<key>` path, scoped to the given fields. */
export function issuePath(
  key: string,
  fields: readonly string[] = DEFAULT_ISSUE_FIELDS,
): string {
  const query = fields.length ? `?fields=${fields.map(encodeURIComponent).join(',')}` : '';
  return `/rest/api/2/issue/${encodeURIComponent(key)}${query}`;
}

/** Build the absolute issue endpoint URL (base + {@link issuePath}). */
export function issueUrl(
  baseUrl: string,
  key: string,
  fields: readonly string[] = DEFAULT_ISSUE_FIELDS,
): string {
  return joinUrl(baseUrl, issuePath(key, fields));
}