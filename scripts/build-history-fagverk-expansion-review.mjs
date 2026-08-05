#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const PATHS = {
  baseline: "data/integrations/history-go-fagverk-corpus.v1.json",
  candidate: "data/integrations/candidates/history-go-fagverk-historie.candidate.v1.json",
  observed: "data/integrations/history-go-fagverk-release.observed.json",
  output: "data/integrations/review/history-go-fagverk-historie.expansion-review.v1.json"
};

function parseArgs(argv) {
  const args = { ...PATHS };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--baseline") args.baseline = argv[++index] || args.baseline;
    else if (token === "--candidate") args.candidate = argv[++index] || args.candidate;
    else if (token === "--observed") args.observed = argv[++index] || args.observed;
    else if (token === "--output") args.output = argv[++index] || args.output;
    else if (token === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  const outputPath = path.resolve(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildReview(baseline, candidate, observed) {
  if (candidate.subject_filter !== "historie") throw new Error("Candidate is not History-scoped.");
  if (candidate.source_ref !== observed.source_commit) throw new Error("History candidate is not built from the observed release.");
  if (candidate.entries.length !== 23) throw new Error("History candidate must contain 23 chapters.");
  const baselineEntries = (baseline.entries || []).filter((entry) => entry.subject_id === "historie");
  if (baselineEntries.length !== 1 || baselineEntries[0].chapter_id !== "1814_statsdannelse") {
    throw new Error("Legacy runtime baseline is not the documented one-chapter History seed.");
  }

  const before = new Set(baselineEntries.map((entry) => entry.chapter_id));
  const after = new Set(candidate.entries.map((entry) => entry.chapter_id));
  const retained = [...before].filter((id) => after.has(id)).sort();
  const added = [...after].filter((id) => !before.has(id)).sort();
  const removed = [...before].filter((id) => !after.has(id)).sort();
  if (retained.length !== 1 || added.length !== 22 || removed.length !== 0) {
    throw new Error(`Unexpected History expansion: retained=${retained.length}, added=${added.length}, removed=${removed.length}.`);
  }

  return {
    schema: "aha_history_fagverk_expansion_review_v1",
    version: "1.0.0",
    status: "reviewed_subject_expansion_not_runtime_active",
    lifecycle_stage: "subject_release_review",
    subject_id: "historie",
    source_repo: candidate.source_repo,
    baseline: {
      source_ref: baseline.source_ref,
      corpus_path: PATHS.baseline,
      chapter_count: baselineEntries.length,
      chapter_ids: [...before].sort()
    },
    candidate: {
      source_ref: candidate.source_ref,
      corpus_path: PATHS.candidate,
      corpus_sha256: candidate.content_sha256,
      chapter_count: candidate.entries.length,
      module_file_count: candidate.entries.reduce((sum, entry) => sum + (entry.module_source_paths || []).length, 0)
    },
    delta: {
      retained_chapter_count: retained.length,
      added_chapter_count: added.length,
      removed_chapter_count: removed.length,
      retained_chapter_ids: retained,
      added_chapter_ids: added,
      removed_chapter_ids: removed,
      source_ref_changed: baseline.source_ref !== candidate.source_ref,
      semantic_expansion: true
    },
    review_finding: "History expands from one legacy seed chapter to the complete 23-chapter registered subject. This is an intentional semantic expansion, not a no-drift source rebase.",
    approval_required: true,
    runtime_activation_allowed: false,
    explicit_runtime_activation_pull_request_required: true
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/build-history-fagverk-expansion-review.mjs [--baseline path] [--candidate path] [--observed path] [--output path]");
    return;
  }
  const review = buildReview(readJson(args.baseline), readJson(args.candidate), readJson(args.observed));
  writeJson(args.output, review);
  console.log(`History expansion reviewed: ${review.baseline.chapter_count} -> ${review.candidate.chapter_count} chapters; runtime remains inactive.`);
}

main();
