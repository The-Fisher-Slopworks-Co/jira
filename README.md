<!--
SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# jira

A small REST client for Jira Server and Data Center that signs in with a username
and password instead of an API token. It posts to `/rest/auth/1/session`, gets a
`JSESSIONID` back, and replays that cookie on later requests. On older on-prem
instances this is usually the only option left: Jira Cloud disabled cookie auth,
and personal access tokens need Jira 8.14 or newer.

No dependencies and no side effects. It never touches the filesystem and never
reads an environment variable. A session is just `{ baseUrl, cookie }` that you
hand in and get back, so where it gets stored is your decision rather than the
library's. The one thing it needs is a global `fetch`.

## Install

```sh
bun add @slopworks/jira      # npm i @slopworks/jira
```

Scoped because plain `jira` on npm is somebody else's package. The package ships
TypeScript source with no build step, which suits Bun and NodeNext. A plain-JS or
classic-resolution consumer needs to compile it first.

## Usage

```ts
import { JiraClient } from '@slopworks/jira';

const jira = new JiraClient();
const session = await jira.login('https://jira.example.com', 'alice', 'secret');

const issue = await jira.getIssue(session, 'PROJ-123');
console.log(issue?.summary, issue?.status, issue?.parent?.key);

// ...or any other endpoint, with the cookie applied
const me = await jira.getJson(session, '/rest/api/2/myself');
```

That is the whole idea. A few things worth knowing once you get past it:

`getIssue` returns `null` when the issue is missing or the request fails, and
throws `JiraAuthError` when the cookie has expired. Pass `{ strict: true }` if
you would rather have an exception than a `null`. By default it asks for summary,
status, type and parent; pass `DETAIL_ISSUE_FIELDS` to also get the description,
comments, attachments and subtasks.

To reuse a session tomorrow, write those two fields somewhere yourself. Use mode
`0600` if that somewhere is a file, because the cookie is a live credential.

Everything else is small enough to just read: `request`, `getJson`, `getIssue`,
and the pure helpers (`parseIssue`, `issueUrl`, `extractJsessionid`) are all
listed in [`index.ts`](index.ts).

## Development

```sh
bun install
bun test
bun run typecheck
```

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).

## Contributing

Guidelines, the Code of Conduct and the security policy are shared org-wide via
[The-Fisher-Slopworks-Co/.github](https://github.com/The-Fisher-Slopworks-Co/.github).
