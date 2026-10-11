<!--
SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
SPDX-License-Identifier: AGPL-3.0-or-later
-->

# jira

A REST client for Jira Server and Data Center that signs in with a username and
password instead of an API token. It posts to `/rest/auth/1/session`, gets a
`JSESSIONID` back, and replays that cookie on later requests. Jira Cloud disabled
cookie auth and personal access tokens need Jira 8.14 or newer, so on older
on-prem instances this is what is left.

## Install

```sh
bun add @slopworks/jira      # npm i @slopworks/jira
```

No dependencies.

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
throws `JiraAuthError` when the cookie has expired; `{ strict: true }` makes it
throw instead. It requests summary, status, type and parent; `DETAIL_ISSUE_FIELDS`
adds description, comments, attachments and subtasks.

## Development

```sh
bun install       # also installs the pre-commit hook
bun run check     # typecheck, lint, format, unused code, REUSE, tests
bun run build
```

`bun run check` runs `reuse lint` through `uvx`, so it needs
[uv](https://docs.astral.sh/uv/).

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
