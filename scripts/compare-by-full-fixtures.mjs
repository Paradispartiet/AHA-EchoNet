#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { normalize, scoreBy } from "./lib/by-fagverk-scoring.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const DEFAULTS = {
  corpus: "data/integrations/candidates/history-go-fagverk-by.candidate.v1.json",
  policy: "data/integrations/review/history-go-fagverk-by.term-policy.v1.json",
  baseline: "data/evaluation/aha-politics-fixture-corrections.v1.json",
  output: "data/evaluation/aha-by-full-fixture-report.v1.json"
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--corpus") args.corpus = argv[++i] || args.corpus;
    else if (token === "--policy") args.policy = argv[++i] || args.policy;
    else if (token === "--baseline") args.baseline = argv[++i] || args.baseline;
    else if (token === "--output") args.output = argv[++i] || args.output;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

const readJson = (p) => JSON.parse(fs.readFileSync(path.resolve(repoRoot, p), "utf8"));
function writeJson(p, value) {
  const out = path.resolve(repoRoot, p);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const corpus = readJson(args.corpus);
  const policy = readJson(args.policy);
  const baseline = readJson(args.baseline);
  const results = [];

  for (const reviewCase of baseline.cases || []) {
    const fixture = readJson(reviewCase.fixture_path);
    const text = String(fixture.inputText || "");
    const result = scoreBy(text, corpus, policy);
    const evidence = (reviewCase.source_evidence || []).map((item) => ({
      text: item,
      found: normalize(text).includes(normalize(item))
    }));
    const errors = [];
    if (!text) errors.push("Fixture has no inputText.");
    if (evidence.some((item) => !item.found)) errors.push("Human-reviewed source evidence is not present in fixture inputText.");
    if (result.status !== "unsupported") errors.push(`By must abstain on existing fixture; got ${result.status}${result.selected_chapter_id ? ` (${result.selected_chapter_id})` : ""}.`);
    results.push({
      id: reviewCase.id,
      fixture_path: reviewCase.fixture_path,
      expected_by_status: "unsupported",
      source_evidence: evidence,
      result,
      passed: errors.length === 0,
      errors
    });
  }

  const failed = results.filter((item) => !item.passed);
  const evidenceErrors = results.reduce((count, item) => count + item.source_evidence.filter((e) => !e.found).length, 0);
  const report = {
    schema: "aha_by_full_fixture_report_v1",
    version: "1.0.0",
    status: failed.length ? "failed" : "passed_full_fixture_gate",
    source_ref: corpus.source_ref,
    corpus_sha256: corpus.content_sha256,
    policy_version: policy.version,
    baseline_schema: baseline.schema,
    baseline_version: baseline.version,
    runtime_activation_allowed: false,
    summary: {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      unsupported: results.filter((item) => item.result.status === "unsupported").length,
      false_positives: results.filter((item) => item.result.status !== "unsupported").length,
      evidence_errors: evidenceErrors
    },
    failures: failed,
    cases: results
  };
  writeJson(args.output, report);
  console.log(`By full fixtures: ${report.summary.passed}/${report.summary.total} passed; ${report.summary.false_positives} false positives; ${report.summary.evidence_errors} evidence errors.`);
  if (report.status !== "passed_full_fixture_gate") {
    failed.forEach((item) => console.error(`${item.id}: ${item.errors.join(" ")}`));
    process.exit(1);
  }
}

main();
