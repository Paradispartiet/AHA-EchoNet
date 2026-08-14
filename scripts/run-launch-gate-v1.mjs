#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const tests = [
  "tests/aha-launch-journey-v1.test.cjs",
  "tests/aha-chat-application-composition.test.cjs",
  "tests/aha-chat-golden-output-regression.test.cjs",
  "tests/aha-chat-insight-end-to-end-audit.test.cjs",
  "tests/aha-chat-export-source-binding.test.cjs",
  "tests/aha-historygo-import-e2e.test.cjs",
  "tests/aha-longitudinal-user-robustness.test.cjs"
];

let failed = 0;
for (const test of tests) {
  process.stdout.write(`\n▶ launch gate: ${test}\n`);
  const result = spawnSync(process.execPath, [path.join(root, test)], {
    cwd: root,
    stdio: "inherit"
  });
  if (result.status !== 0) failed += 1;
}

console.log(`\nAHA launch gate v1: ${tests.length - failed}/${tests.length} passed.`);
process.exit(failed ? 1 : 0);
