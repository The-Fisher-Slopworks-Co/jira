<!--
SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# jira

A small, dependency-free **cookie-auth REST client for Jira Server / Data
Center**. No API token: it signs in with a username/password against
`POST /rest/auth/1/session`, persists the resulting `JSESSIONID`, and replays it
on later requests.

> Jira **Cloud** disables cookie auth (it expects an API token), so this targets
> Jira **Server / Data Center** only.

> **No Personal Access Token (PAT), either.** A PAT — Jira's long-lived bearer
> token (`Authorization: Bearer …`) — would sidestep the periodic re-login that a
> cookie session forces (a `JSESSIONID` is a server-side session with an idle
> timeout, ~5h by default). But PATs only landed in Jira **8.14**; on older
> Server / Data Center releases the only thing that works is cookie auth via
> `/rest/auth/1/session`, which is what this client implements.

It has **zero runtime dependencies** and **no side effects**: the only thing it
touches is the global `fetch`. No filesystem access, no environment variables, no
module-level state — a session is plain data you pass in and get back. So it
bundles cleanly into a single binary (`bun build --compile`), runs in a worker or
at the edge, and drops into any project that has `fetch`.

## Install

```sh
bun add @slopworks/jira      # or: npm i @slopworks/jira
```

It's scoped because the bare name `jira` on the registry belongs to an unrelated
package. From a local checkout, a `file:` dependency or `bun link` works too.

The package **ships TypeScript source** (`main`/`types` point at `index.ts`); it
has no build step. That's by design for Bun / NodeNext-TS consumers, which
compile the source directly. A plain-JS / Node consumer, or one on classic
`moduleResolution`, would need a build step first (emit `dist/*.js` + `.d.ts`).

## Quickstart

```ts
import { JiraClient, JiraAuthError } from '@slopworks/jira';

const jira = new JiraClient();

// 1. Sign in. You get the session back — nothing is written anywhere.
const session = await jira.login('https://jira.example.com', 'alice', 'secret');

// 2. Fetch an issue's common fields (summary / status / type / parent + raw body).
try {
  const issue = await jira.getIssue(session, 'PROJ-123');
  if (issue) console.log(issue.summary, issue.status, issue.parent?.key);
} catch (err) {
  if (err instanceof JiraAuthError) {
    // 401 — the session expired; sign in again.
  }
}

// 3. Or hit any endpoint yourself with the session's cookie applied.
const me = await jira.getJson(session, '/rest/api/2/myself');
```

### Keeping the session between runs

A `JiraSession` is just `{ baseUrl, cookie }`, so storing it is your call — a
file, a keychain, a secrets manager, or nowhere at all. The client deliberately
doesn't decide for you. A file-backed version is a few lines, and note the `0600`:
the cookie is a live credential.

```ts
import { readFile, writeFile } from 'node:fs/promises';
import type { JiraSession } from '@slopworks/jira';

async function loadSession(path: string): Promise<JiraSession | null> {
  try {
    const { baseUrl, cookie } = JSON.parse(await readFile(path, 'utf8'));
    return typeof baseUrl === 'string' && typeof cookie === 'string' ? { baseUrl, cookie } : null;
  } catch {
    return null; // missing or malformed → sign in again
  }
}

const saveSession = (path: string, session: JiraSession) =>
  writeFile(path, JSON.stringify(session), { mode: 0o600 });
```

## API

### `new JiraClient(options?)`

| Option      | Default        | Meaning                                                                       |
|-------------|----------------|-------------------------------------------------------------------------------|
| `timeoutMs` | `6000`         | Per-request timeout — keeps an interactive CLI from hanging on a stalled host. |
| `fetch`     | global `fetch` | Injectable `fetch`, for tests.                                                |

Methods:

- `login(baseUrl, username, password)` → `JiraSession`. Signs in and returns the
  session; storing it is up to you. Throws `JiraError` with a readable message on
  bad credentials, a non-Server endpoint (404 / Jira Cloud), a CAPTCHA wall, or a
  network failure.
- `getIssue(session, key, { fields?, strict? })` → `JiraIssue | null`.
  **Best-effort:** returns `null` on a not-found / network / parse failure;
  throws `JiraAuthError` on a 401. `strict: true` throws `JiraError` instead of
  returning `null`. `fields` defaults to `summary, status, issuetype, parent`;
  pass `DETAIL_ISSUE_FIELDS` to also fetch `subtasks`, `description`, `comment`,
  and `attachment` (parsed into `JiraIssue.subtasks` / `.description` /
  `.comments` / `.attachments`, which are otherwise `[]` / `null` / `[]` / `[]`).
- `getJson<T>(session, path)` → `T`. Authenticated GET. Throws `JiraAuthError`
  on 401, `JiraError` on any other non-2xx / parse failure.
- `request(session, path, init?)` → `Response`. The low-level escape hatch
  (POST, custom headers, …); applies the cookie, `Accept`, and the timeout.

### Choosing the host

The base URL always comes from `session.baseUrl` — there is no environment
variable and no other ambient override. To send an existing session somewhere
else (a staging instance, a proxy), hand over a session with a different
`baseUrl`:

```ts
await jira.getIssue({ ...session, baseUrl: 'https://jira-staging.example.com' }, 'PROJ-123');
```

A trailing slash is normalised for you, and passing an absolute URL as the
`path` argument bypasses the base entirely.

### Errors

- `JiraError extends Error` — base failure, with `status?: number` when it came
  from a response.
- `JiraAuthError extends JiraError` — a 401; the cookie session is no longer
  valid. Catch it to re-authenticate.

### Also exported

The pieces the client is built from — all pure functions and types, usable
without ever constructing a `JiraClient`:
`JiraSession`, `JiraIssue`, `JiraParent`, `JiraSubtask`, `JiraComment`,
`JiraAttachment`, `parseIssue`, `extractJsessionid`, `stripTrailingSlash`,
`joinUrl`, `isAbsoluteUrl`, `issuePath`, `issueUrl`, `DEFAULT_ISSUE_FIELDS`,
`DETAIL_ISSUE_FIELDS`, `DEFAULT_TIMEOUT_MS`.

## Development

```sh
bun install
bun test            # node:test suite over a real local HTTP server (no creds)
bun run typecheck   # tsc --noEmit
```

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE). The repository is
[REUSE](https://reuse.software/)-compliant.

## Contributing

Contribution guidelines, the Code of Conduct, and the security policy are shared
org-wide via
[The-Fisher-Slopworks-Co/.github](https://github.com/The-Fisher-Slopworks-Co/.github).
