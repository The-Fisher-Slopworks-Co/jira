# jira

Cookie-auth REST client for **Jira Server / Data Center** (no API token): signs
in via `POST /rest/auth/1/session`, persists the `JSESSIONID`, replays it on
later requests. **Zero runtime dependencies** (`node:` builtins + global `fetch`).
Jira **Cloud is unsupported** (it disables cookie auth). See README.md for the
full API.

## Commands

```sh
bun install
bun test            # suite runs against a real local HTTP server, no creds
bun run typecheck   # tsc --noEmit
```

## Architecture

`index.ts` is the public barrel. `src/` holds single-purpose modules:

- `client.ts`  — `JiraClient`: login, session load/save, `getIssue`, `getJson`, `request`.
- `session.ts` — session persistence (path resolution, 0600 read/write).
- `cookie.ts`  — `extractJsessionid` from `Set-Cookie`.
- `url.ts`     — URL joining / issue-path helpers.
- `issue.ts`   — `parseIssue` (raw Jira JSON → `JiraIssue`).
- `errors.ts`  — `JiraError`, `JiraAuthError` (401).

## Gotchas

- **NodeNext imports:** import local modules with a `.js` extension even though
  the files are `.ts` — e.g. `import { x } from './cookie.js'`. Builds fail otherwise.
- **`JIRA_URL`** overrides the session's stored base URL for replayed requests
  (`request`/`getJson`/`getIssue`), read **per call**. `login` ignores it.
- **No build step** — `main`/`types` point at `index.ts`; the package ships TS source.
- `getIssue` is **best-effort**: returns `null` on not-found/network/parse failure,
  throws `JiraAuthError` on 401. Pass `strict: true` to throw instead.

## Bun preferences

Default to Bun over Node: `bun <file>`, `bun test`, `bun install`, `bunx`.
Bun auto-loads `.env` — don't add `dotenv`. Prefer `Bun.file` over `node:fs`.

## Compliance (org standard)

This repo follows the [The Fisher Slopworks Co compliance standard](https://github.com/The-Fisher-Slopworks-Co/.github/blob/main/COMPLIANCE.md).
CI (`.github/workflows/reuse.yml`) fails the build if `reuse lint` doesn't pass.

- **License is `AGPL-3.0-or-later`** — the explicit `-or-later` variant, never
  bare `AGPL-3.0` or `AGPL-3.0-only`. It's declared in `package.json`, the README
  `## License` section, `REUSE.toml`, and every source header.
- **Every new file needs copyright + license.** Source files carry a two-line
  SPDX header in the file's comment syntax; files that can't hold a comment are
  covered by the `**` wildcard in `REUSE.toml`. Verify with `reuse lint`.
  ```ts
  // SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
  //
  // SPDX-License-Identifier: AGPL-3.0-or-later
  ```
- **Don't add `CODE_OF_CONDUCT.md` / `SECURITY.md` / `CONTRIBUTING.md`** — they're
  inherited org-wide from the `.github` repo.
- **Third-party files keep their own license** — never fold them under the
  blanket wildcard; give them their own `REUSE.toml` annotation.
- **Fixtures stay generic.** Issue keys are `PROJ-*`, statuses are English
  (`In Review`, `Done`), summaries are invented. No real tracker data.
