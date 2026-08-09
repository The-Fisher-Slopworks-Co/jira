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

Its only dependency is a global `fetch`. A session is just `{ baseUrl, cookie }`:
`login` gives you one, every other method takes it back, and keeping it around
between runs is up to you.

## Install

```sh
bun add @slopworks/jira      # npm i @slopworks/jira
```

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

`getIssue` returns `null` when the issue is missing or the request fails, and
throws `JiraAuthError` when the cookie has expired. Pass `{ strict: true }` if
you would rather have an exception than a `null`. By default it asks for summary,
status, type and parent; pass `DETAIL_ISSUE_FIELDS` to also get the description,
comments, attachments and subtasks.

## Development

```sh
bun install
bun test
bun run typecheck
```

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
