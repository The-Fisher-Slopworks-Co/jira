# jira

## Commands

```sh
bun install         # also installs the lefthook pre-commit hook
bun run check       # the gate: typecheck, lint, format:check, knip, reuse, test
bun test            # runs against a real local HTTP server, no creds
bun run typecheck   # tsc --noEmit, covers the tests too
bun run format      # prettier --write
bun run build       # tsc -p tsconfig.build.json → dist/
```

`bun run reuse` needs [uv](https://docs.astral.sh/uv/) on the machine.

## Definition of done

- **Issues and pull requests are written in English** — title and body, whatever language the task was discussed in.
- **Never commit to main.** Every task starts on a fresh branch off `origin/main`, named `<type>/<short-task>` — `fix/`, `feat/`, `refactor/`, `chore/`.
- **One task = one branch = one PR.** Past ~300 changed lines, split it into several PRs. `.github/workflows/pr-size.yml` labels every PR `size:XS`…`size:XXL`; **`size:XL` or `size:XXL` means split the PR**, not "explain why it is large".
- **PR title is the squash commit subject:** conventional commit with a scope, enforced by `.github/workflows/pr-title.yml`.
  - Type: `feat` `fix` `refactor` `chore` `docs` `test` `ci` `perf` `revert`.
  - Scope (required): a `src/` module — `client` `cookie` `errors` `issue` `url` — or `deps` `github` `release`. A new module means adding it to the `scopes:` list in that workflow.
  - Subject: lowercase start, imperative, no trailing period.
  - The body describes this PR alone, following the PR template.
- **No AI attribution.** No `Assisted-by:` / `Co-Authored-By: <LLM>` trailers, no agent as commit author or committer, and no "Generated with/by …" lines or agent-platform links in PR bodies. The PR body becomes the squash commit body, so the PR title workflow checks the title, the body and every commit of the PR.
- **Before opening:** `bun run check` and `bun run build` green, then open the PR and report its URL.
- **Never merge locally.** Merging happens on GitHub, squash only.

## Architecture

`index.ts` is the public barrel. `src/` holds single-purpose modules:

- `client.ts` — `JiraClient` (`login`, `getIssue`, `getJson`, `request`) and the `JiraSession` type.
- `cookie.ts` — `extractJsessionid` from `Set-Cookie`.
- `url.ts` — URL joining and issue-path helpers.
- `issue.ts` — `parseIssue` (raw Jira JSON → `JiraIssue`).
- `errors.ts` — `JiraError`, `JiraAuthError` (401).

## Gotchas

- Import local modules with a `.js` extension even though the files are `.ts`:
  `import { x } from "./cookie.js"`. NodeNext rejects the extensionless form and
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
