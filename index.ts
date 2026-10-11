// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * `jira` — a cookie-auth REST client for Jira Server / Data Center. No API
 * token: it signs in with a username/password against
 * `POST /rest/auth/1/session` and replays the resulting `JSESSIONID` on later
 * requests.
 *
 * Everything here is pure: no filesystem access, no environment variables, no
 * module-level state. A {@link JiraSession} is plain data the caller owns and
 * stores however it likes.
 *
 * Start with {@link JiraClient}; the rest are building blocks and pure helpers.
 */
export { JiraError, JiraAuthError } from "./src/errors.js";
export { extractJsessionid } from "./src/cookie.js";
export {
  DEFAULT_ISSUE_FIELDS,
  DETAIL_ISSUE_FIELDS,
  isAbsoluteUrl,
  issuePath,
  issueUrl,
  joinUrl,
  stripTrailingSlash,
} from "./src/url.js";
export {
  parseIssue,
  type JiraAttachment,
  type JiraComment,
  type JiraIssue,
  type JiraParent,
  type JiraSubtask,
} from "./src/issue.js";
export {
  DEFAULT_TIMEOUT_MS,
  JiraClient,
  type GetIssueOptions,
  type JiraClientOptions,
  type JiraSession,
} from "./src/client.js";
