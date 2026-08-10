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
  matrix: "data/evaluation/aha-by-fagverk-evaluation-matrix.v1.json",
  output: "data/evaluation/aha-by-fagverk-evaluation-report.v1.json"
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--corpus") args.corpus = argv[++i] || args.corpus;
    else if (token === "--policy") args.policy = argv[++i] || args.policy;
    else if (token === "--matrix") args.matrix = argv[++i] || args.matrix;
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

function allowedEvidence(corpus, policy, chapterId) {
  const entry = corpus.entries.find((item) => item.chapter_id === chapterId);
  const rule = policy.chapter_rules?.[chapterId] || {};
  if (!entry) return new Set();
  return new Set([
    ...(entry.title_terms || []), ...(entry.concept_terms || []), ...(entry.support_terms || []),
    ...(rule.supplemental_evidence_terms || []).map((item) => item.term)
  ].map(normalize));
}

function evaluate(corpus, policy, matrix) {
  const evidenceErrors = [];
  const cases = [];
  for (const testCase of matrix.positive_cases || []) {
    const allowed = allowedEvidence(corpus, policy, testCase.expected_chapter_id);
    for (const evidence of testCase.required_evidence || []) {
      if (!allowed.has(normalize(evidence))) evidenceErrors.push(`${testCase.id}: evidence not registered for ${testCase.expected_chapter_id}: ${evidence}`);
    }
    const result = scoreBy(testCase.text, corpus, policy);
    const errors = [];
    if (result.status !== "grounded") errors.push(`Expected grounded, got ${result.status}.`);
    if (result.selected_chapter_id !== testCase.expected_chapter_id) errors.push(`Expected ${testCase.expected_chapter_id}, got ${result.selected_chapter_id || "none"}.`);
    const selected = result.ranking.find((item) => item.chapter_id === testCase.expected_chapter_id);
    if (!selected?.matched_anchor_terms?.length) errors.push("Expected at least one mandatory anchor match.");
    cases.push({ id: testCase.id, kind: "positive", passed: errors.length === 0, errors, result });
  }
  for (const testCase of matrix.abstention_cases || []) {
    const result = scoreBy(testCase.text, corpus, policy);
    const errors = result.status === "unsupported" ? [] : [`Expected unsupported, got ${result.status}${result.selected_chapter_id ? ` (${result.selected_chapter_id})` : ""}.`];
    cases.push({ id: testCase.id, kind: "abstention", passed: errors.length === 0, errors, result });
  }
  const failed = cases.filter((item) => !item.passed);
  const covered = [...new Set((matrix.positive_cases || []).map((item) => item.expected_chapter_id))].sort();
  return {
    schema: "aha_by_fagverk_evaluation_report_v1",
    version: "1.0.0",
    source_ref: corpus.source_ref,
    corpus_sha256: corpus.content_sha256,
    policy_version: policy.version,
    matrix_version: matrix.version,
    status: failed.length || evidenceErrors.length ? "failed" : "passed_review_gate",
    runtime_activation_allowed: false,
    summary: {
      total: cases.length,
      passed: cases.length - failed.length,
      failed: failed.length,
      positive: (matrix.positive_cases || []).length,
      abstention: (matrix.abstention_cases || []).length,
      chapters_covered: covered.length,
      evidence_errors: evidenceErrors.length
    },
    chapter_coverage: covered,
    evidence_errors: evidenceErrors,
    failures: failed,
    cases
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = evaluate(readJson(args.corpus), readJson(args.policy), readJson(args.matrix));
  writeJson(args.output, report);
  console.log(`By evaluation: ${report.summary.passed}/${report.summary.total} passed; ${report.summary.chapters_covered}/17 chapters covered; ${report.summary.evidence_errors} evidence errors.`);
  if (report.status !== "passed_review_gate") {
    report.evidence_errors.forEach((error) => console.error(error));
    report.failures.forEach((failure) => console.error(`${failure.id}: ${failure.errors.join(" ")}`));
    process.exit(1);
  }
}

main();
