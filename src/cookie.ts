// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Extract the `JSESSIONID=<value>` cookie from a response's `Set-Cookie`
 * headers, or `null` if absent. Takes the array form (one entry per header,
 * e.g. from `Headers.getSetCookie()`) to avoid the lossy comma-joining of
 * `Headers.get('set-cookie')`.
 */
export function extractJsessionid(setCookieHeaders: string[]): string | null {
  for (const header of setCookieHeaders) {
    const pair = header.split(";", 1)[0]?.trim() ?? "";
    if (pair.startsWith("JSESSIONID=") && pair.length > "JSESSIONID=".length) {
      return pair;
    }
  }
  return null;
}
