// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Base error for all Jira client failures. Carries the HTTP {@link status} when
 * the failure came from a response (absent for transport / parse failures).
 */
export class JiraError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'JiraError';
    this.status = status;
  }
}

/**
 * A 401 from Jira: the cookie session is no longer valid. Thrown (rather than
 * folded into `null`) so callers can choose to re-authenticate — distinct from
 * the recoverable failures that best-effort methods swallow.
 */
export class JiraAuthError extends JiraError {
  constructor(message = 'Jira session expired or unauthenticated') {
    super(message, 401);
    this.name = 'JiraAuthError';
  }
}