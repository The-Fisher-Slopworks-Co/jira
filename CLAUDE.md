# jira

## Commands

```sh
bun install
bun test            # runs against a real local HTTP server, no creds
bun run typecheck   # tsc --noEmit, covers the tests too
bun run build       # tsc -p tsconfig.build.json → dist/
```

## Architecture

`index.ts` is the public barrel. `src/` holds single-purpose modules:

- `client.ts` — `JiraClient` (`login`, `getIssue`, `getJson`, `request`) and the `JiraSession` type.
- `cookie.ts` — `extractJsessionid` from `Set-Cookie`.
- `url.ts` — URL joining and issue-path helpers.
- `issue.ts` — `parseIssue` (raw Jira JSON → `JiraIssue`).
- `errors.ts` — `JiraError`, `JiraAuthError` (401).

## Gotchas

- Import local modules with a `.js` extension even though the files are `.ts`:
  `import { x } from './cookie.js'`. NodeNext rejects the extensionless form and
  emits the specifier verbatim, so what you write is what runs.
- Keep the library pure. In the non-test sources: no `node:` imports, no
  `process.env`, no filesystem, no module-level state. Persistence and
  configuration are the caller's, and the base URL comes only from
  `session.baseUrl`. If something seems to need ambient state, take a parameter.
- Two tsconfigs. `tsconfig.json` is `noEmit` and includes the tests, so it backs
  `typecheck`; `tsconfig.build.json` emits to `dist/` and excludes them. A new
  compiler option almost always belongs in the base one.
- `getIssue` is best-effort: `null` on not-found, network or parse failure,
  `JiraAuthError` on 401, `strict: true` to throw instead.
- Fixtures stay generic. Issue keys are `PROJ-*`, statuses are English, summaries
  are invented. No real tracker data.

## Compliance

The repo follows the [org compliance standard](https://github.com/The-Fisher-Slopworks-Co/.github/blob/main/COMPLIANCE.md);
`.github/workflows/reuse.yml` fails the build when `reuse lint` does.

- The license is `AGPL-3.0-or-later`, never bare `AGPL-3.0` or `AGPL-3.0-only`.
  It appears in `package.json`, the README, `REUSE.toml` and every source header.
- Every new file needs copyright and license. Source files carry a two-line SPDX
  header in their own comment syntax; anything that cannot hold a comment falls
  under the `**` wildcard in `REUSE.toml`.
  ```ts
  // SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
  //
  // SPDX-License-Identifier: AGPL-3.0-or-later
  ```
- Don't add `CODE_OF_CONDUCT.md`, `SECURITY.md` or `CONTRIBUTING.md`. They are
  inherited org-wide from the `.github` repo.
- Third-party files keep their own license and get their own `REUSE.toml`
  annotation instead of the blanket wildcard.
