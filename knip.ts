// SPDX-FileCopyrightText: 2026 The Fisher Slopworks Co
//
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { KnipConfig } from "knip";

const config: KnipConfig = {
  entry: [
    // The public barrel. `package.json` points `exports` at the built
    // `dist/index.js`, which does not exist before `bun run build`, so the
    // source it is built from is named directly. Its exports are the library's
    // API and are not reported as unused.
    "index.ts",
    // Co-located tests are roots of their own: an export that only a test
    // reaches is still reached.
    "src/**/*.test.ts",
  ],
  project: ["*.ts", "src/**/*.ts"],
  // `uv` is a machine prerequisite (README → Development), not an npm package.
  ignoreBinaries: ["uvx"],
};

export default config;
