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
const oldPolicyBlock = `        subject_id = str(entry.get("subject_id") or "")
        policy = subject_policies.get(subject_id)
        if policy:
`;
const canonicalPolicyBlock = `        subject_id = str(entry.get("subject_id") or "")
        policy = subject_policies.get(subject_id)
        if policy and entry.get("chapter_id") not in (policy.get("chapter_rules") or {}):
            policy = None
        if policy:
`;
const oldGenericThresholds = `            scoring_mode = "generic_v1"
            minimum_score = 8.0
            minimum_terms = 2
            ambiguity_margin = 3.0
`;
const canonicalGenericThresholds = `            scoring_mode = "canonical_generic_v2" if payload.get("status") == "canonical_history_go_deployment_index_v2" else "generic_v1"
            minimum_score = 10.0 if scoring_mode == "canonical_generic_v2" else 8.0
            minimum_terms = 2
            ambiguity_margin = 3.0
`;

function transform(source) {
  let next = source;
  if (!next.includes(canonicalImport)) {
    if (!next.includes(importAnchor)) throw new Error("Python Fagverk import anchor not found.");
    next = next.replace(importAnchor, importAnchor + canonicalImport);
  }
  if (next.includes(oldDefault)) next = next.replace(oldDefault, canonicalDefault);
  if (!next.includes(canonicalDefault)) throw new Error("Python ground_message canonical default not found.");
  if (next.includes(oldPolicyBlock)) next = next.replace(oldPolicyBlock, canonicalPolicyBlock);
  if (!next.includes(canonicalPolicyBlock)) throw new Error("Python reviewed-policy scope guard missing.");
  if (next.includes(oldGenericThresholds)) next = next.replace(oldGenericThresholds, canonicalGenericThresholds);
  if (!next.includes(canonicalGenericThresholds)) throw new Error("Python canonical generic thresholds missing.");
  if (!next.includes("def load_fagverk_corpus")) throw new Error("Legacy calibration compatibility loader unexpectedly missing.");
  return next;
}

const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--check") ? "check" : "";
if (!mode) throw new Error("Use --write or --check.");
const current = fs.readFileSync(targetPath, "utf8");
const expected = transform(current);
if (mode === "write") {
  if (expected !== current) fs.writeFileSync(targetPath, expected);
  console.log(expected === current ? "Python canonical Fagverk consumer already current." : "Python canonical Fagverk consumer updated.");
} else {
  if (expected !== current) throw new Error("Python canonical Fagverk consumer drift detected.");
  console.log("Python canonical Fagverk consumer: verified.");
}
