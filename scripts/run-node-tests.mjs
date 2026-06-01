#!/usr/bin/env node
// Runs the deterministic AHA frontend Node test suite.
//
// Every test file in tests/ is a standalone script that throws / exits
// non-zero on failure. This runner executes each one in its own process and
// aggregates the results so the suite can gate CI.
//
// Tests that need a live external backend are excluded here and stay opt-in
// via their own npm scripts (e.g. test:aha-python-smoke needs the Python
// engine running with uvicorn).

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const testsDir = path.join(here, "..", "tests");

const EXCLUDE = new Set([
  // Needs the Python AHA engine running (uvicorn); opt-in via test:aha-python-smoke.
  "aha-python-engine-smoke.test.cjs"
]);

const isTestFile = (name) =>
  name.endsWith(".test.cjs") || name.endsWith(".test.mjs") || name.endsWith(".cjs");

const files = readdirSync(testsDir)
  .filter(isTestFile)
  .filter((name) => !EXCLUDE.has(name))
  .sort();

if (!files.length) {
  console.error("No test files found in tests/.");
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const fullPath = path.join(testsDir, file);
  process.stdout.write(`\n▶ ${file}\n`);
  const result = spawnSync(process.execPath, [fullPath], { stdio: "inherit" });
  if (result.status !== 0) {
    failed += 1;
    console.error(`✖ FAILED: ${file} (exit ${result.status})`);
  } else {
    console.log(`✓ passed: ${file}`);
  }
}

const passed = files.length - failed;
console.log(`\nNode test suite: ${passed}/${files.length} passed${failed ? `, ${failed} failed` : ""}.`);
process.exit(failed ? 1 : 0);
