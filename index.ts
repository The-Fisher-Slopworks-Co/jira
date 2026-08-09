// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * `jira` — a cookie-auth REST client for Jira Server / Data Center. No API
 * token: it signs in with a username/password against
 * `POST /rest/auth/1/session`, persists the resulting `JSESSIONID`, and replays
 * it on later requests.
 *
 * Start with {@link JiraClient}; the rest are building blocks and pure helpers.
 */
export { JiraError, JiraAuthError } from './src/errors.js';
export { extractJsessionid } from './src/cookie.js';
export {
  DEFAULT_ISSUE_FIELDS,
  DETAIL_ISSUE_FIELDS,
  isAbsoluteUrl,
  issuePath,
  issueUrl,
  joinUrl,
  stripTrailingSlash,
} from './src/url.js';
export {
  defaultSessionPath,
  readSession,
  writeSession,
  type JiraSession,
} from './src/session.js';
export {
  parseIssue,
  type JiraAttachment,
  type JiraComment,
  type JiraIssue,
  type JiraParent,
  type JiraSubtask,
} from './src/issue.js';
export {
  DEFAULT_TIMEOUT_MS,
  JiraClient,
  type GetIssueOptions,
  type JiraClientOptions,
} from './src/client.js';