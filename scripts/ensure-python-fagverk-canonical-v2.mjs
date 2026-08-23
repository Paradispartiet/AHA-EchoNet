#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const targetPath = path.join(repoRoot, "backend/aha_engine/app/engine/fagverk_grounding.py");
const importAnchor = "from app.engine.analyzer import analyze_message\n";
const canonicalImport = "from app.engine.fagverk_canonical import load_canonical_fagverk_corpus\n";
const oldDefault = "    payload = corpus or load_fagverk_corpus()\n";
const canonicalDefault = "    payload = corpus or load_canonical_fagverk_corpus()\n";

function transform(source) {
  let next = source;
  if (!next.includes(canonicalImport)) {
    if (!next.includes(importAnchor)) throw new Error("Python Fagverk import anchor not found.");
    next = next.replace(importAnchor, importAnchor + canonicalImport);
  }
  if (next.includes(oldDefault)) next = next.replace(oldDefault, canonicalDefault);
  if (!next.includes(canonicalDefault)) throw new Error("Python ground_message canonical default not found.");
  if (!next.includes("def load_fagverk_corpus")) throw new Error("Legacy calibration compatibility loader unexpectedly missing.");
  return next;
}

const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--check") ? "check" : "";
if (!mode) throw new Error("Use --write or --check.");
const current = fs.readFileSync(targetPath, "utf8");
const expected = transform(current);
if (mode === "write") {
  if (expected !== current) fs.writeFileSync(targetPath, expected);
  console.log(expected === current ? "Python canonical Fagverk default already current." : "Python canonical Fagverk default updated.");
} else {
  if (expected !== current) throw new Error("Python canonical Fagverk default drift detected.");
  console.log("Python canonical Fagverk default: verified.");
}
