#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { normalize, scorePolitics } from "./lib/politics-fagverk-scoring.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const PATHS = {
  corpus: "data/integrations/review/history-go-fagverk-politikk.audit.v1.json",
  policy: "data/integrations/review/history-go-fagverk-politikk.term-policy.v1.json",
  matrix: "data/evaluation/aha-politics-fagverk-evaluation-matrix.v1.json",
  output: "data/evaluation/aha-politics-fagverk-evaluation-report.v1.json"
};

function parseArgs(argv) {
  const args = { ...PATHS };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--corpus") args.corpus = argv[++index] || args.corpus;
    else if (token === "--policy") args.policy = argv[++index] || args.policy;
    else if (token === "--matrix") args.matrix = argv[++index] || args.matrix;
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

function evaluateCase(testCase, corpus, policy, kind) {
  const result = scorePolitics(testCase.text, corpus, policy);
  const errors = [];
  if (kind === "ambiguity") {
    if (!(testCase.allowed_statuses || []).includes(result.status)) {
      errors.push(`Expected one of ${(testCase.allowed_statuses || []).join(", ")}, got ${result.status}.`);
    }
  } else {
    if (result.status !== testCase.expected_status) errors.push(`Expected status ${testCase.expected_status}, got ${result.status}.`);
    if (result.selected_chapter_id !== testCase.expected_chapter_id) {
      errors.push(`Expected chapter ${testCase.expected_chapter_id}, got ${result.selected_chapter_id || "none"}.`);
    }
    if ((testCase.forbidden_chapter_ids || []).includes(result.selected_chapter_id)) {
      errors.push(`Selected forbidden chapter ${result.selected_chapter_id}.`);
    }
  }
  return { id: testCase.id, kind, passed: errors.length === 0, errors, result };
}

function validateEvidence(matrix, corpus, policy) {
  const entryById = new Map(corpus.entries.map((entry) => [entry.chapter_id, entry]));
  const policyByTerm = new Map((policy.terms || []).map((item) => [normalize(item.term), item]));
  const chapterRules = policy.chapter_rules || {};
  const errors = [];
  for (const testCase of [...matrix.positive_cases, ...matrix.confusion_cases]) {
    const entry = entryById.get(testCase.expected_chapter_id);
    if (!entry) {
      errors.push(`${testCase.id}: unknown expected chapter ${testCase.expected_chapter_id}.`);
      continue;
    }
    const supplemental = (chapterRules[entry.chapter_id]?.supplemental_evidence_terms || []).map((item) => item.term);
    const terms = new Set([...entry.title_terms, ...entry.concept_terms, ...entry.support_terms, ...supplemental].map(normalize));
    for (const evidence of testCase.required_evidence || []) {
      const term = normalize(evidence);
      if (!terms.has(term)) errors.push(`${testCase.id}: required evidence not found in expected chapter: ${term}.`);
      const termPolicy = policyByTerm.get(term);
      if (termPolicy?.action === "non_scoring" || termPolicy?.action === "context_only") {
        errors.push(`${testCase.id}: required evidence is non-scoring: ${term}.`);
      }
    }
  }
  for (const testCase of matrix.ambiguity_cases) {
    for (const evidence of testCase.non_scoring_evidence || []) {
      const term = normalize(evidence);
      const termPolicy = policyByTerm.get(term);
      const globallyBlocked = (policy.global_non_scoring_terms || []).map(normalize).includes(term);
      if ((!termPolicy || termPolicy.action !== "non_scoring") && !globallyBlocked) {
        errors.push(`${testCase.id}: ambiguity evidence must be explicitly non-scoring: ${evidence}.`);
      }
    }
  }
  return errors;
}

function buildReport(corpus, policy, matrix) {
  const evidenceErrors = validateEvidence(matrix, corpus, policy);
  const cases = [
    ...matrix.positive_cases.map((item) => evaluateCase(item, corpus, policy, "positive")),
    ...matrix.confusion_cases.map((item) => evaluateCase(item, corpus, policy, "confusion")),
    ...matrix.ambiguity_cases.map((item) => evaluateCase(item, corpus, policy, "ambiguity"))
  ];
  const failed = cases.filter((item) => !item.passed);
  const chapterCoverage = [...new Set(matrix.positive_cases.map((item) => item.expected_chapter_id))].sort();
  return {
    schema: "aha_politics_fagverk_evaluation_report_v1",
    version: "1.1.0",
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
      positive: matrix.positive_cases.length,
      confusion: matrix.confusion_cases.length,
      ambiguity: matrix.ambiguity_cases.length,
      chapters_covered: chapterCoverage.length,
      evidence_errors: evidenceErrors.length
    },
    chapter_coverage: chapterCoverage,
    evidence_errors: evidenceErrors,
    failures: failed,
    cases
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/evaluate-politics-fagverk-policy.mjs [--corpus path] [--policy path] [--matrix path] [--output path]");
    return;
  }
  const report = buildReport(readJson(args.corpus), readJson(args.policy), readJson(args.matrix));
  writeJson(args.output, report);
  console.log(`Politics evaluation: ${report.summary.passed}/${report.summary.total} passed; ${report.summary.chapters_covered} chapters covered.`);
  if (report.status !== "passed_review_gate") {
    report.evidence_errors.forEach((error) => console.error(error));
    report.failures.forEach((failure) => console.error(`${failure.id}: ${failure.errors.join(" ")}`));
    process.exit(1);
  }
}

main();
