#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { normalize, scoreBusiness } from "./lib/business-fagverk-scoring.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaults = {
  corpus: "data/integrations/candidates/history-go-fagverk-naeringsliv.candidate.v1.json",
  policy: "data/integrations/review/history-go-fagverk-naeringsliv.term-policy.v1.json",
  matrix: "data/evaluation/aha-business-fagverk-evaluation-matrix.v1.json",
  output: "data/evaluation/aha-business-fagverk-evaluation-report.v1.json"
};

function args(argv) {
  const result = { ...defaults };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--corpus") result.corpus = argv[++i] || result.corpus;
    else if (token === "--policy") result.policy = argv[++i] || result.policy;
    else if (token === "--matrix") result.matrix = argv[++i] || result.matrix;
    else if (token === "--output") result.output = argv[++i] || result.output;
    else if (token === "--help") result.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return result;
}

function read(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, relativePath), "utf8"));
}

function write(relativePath, value) {
  const target = path.resolve(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function evaluate(item, kind, corpus, policy) {
  const result = scoreBusiness(item.text, corpus, policy);
  const errors = [];
  if (kind === "ambiguity") {
    if (!(item.allowed_statuses || []).includes(result.status)) errors.push(`Expected ${item.allowed_statuses.join("/")}, got ${result.status}.`);
  } else {
    if (result.status !== item.expected_status) errors.push(`Expected ${item.expected_status}, got ${result.status}.`);
    if (result.selected_chapter_id !== item.expected_chapter_id) errors.push(`Expected ${item.expected_chapter_id}, got ${result.selected_chapter_id || "none"}.`);
    if ((item.forbidden_chapter_ids || []).includes(result.selected_chapter_id)) errors.push(`Selected forbidden chapter ${result.selected_chapter_id}.`);
    const top = result.ranking.find((row) => row.chapter_id === item.expected_chapter_id);
    const matched = new Set((top?.matched_reviewed_evidence_terms || []).map((row) => normalize(row.term)));
    for (const term of item.required_evidence || []) if (!matched.has(normalize(term))) errors.push(`Missing reviewed evidence: ${term}.`);
  }
  return { id: item.id, kind, passed: errors.length === 0, errors, result };
}

function main() {
  const options = args(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/evaluate-business-fagverk-policy.mjs [--corpus path] [--policy path] [--matrix path] [--output path]");
    return;
  }
  const corpus = read(options.corpus);
  const policy = read(options.policy);
  const matrix = read(options.matrix);
  const inputErrors = [];
  if (corpus.subject_filter !== "naeringsliv" || policy.subject_id !== "naeringsliv" || matrix.subject_id !== "naeringsliv") inputErrors.push("Business identity mismatch.");
  if (corpus.source_ref !== policy.source_ref || corpus.source_ref !== matrix.source_ref) inputErrors.push("Source refs differ.");
  if (corpus.content_sha256 !== policy.corpus_sha256 || corpus.content_sha256 !== matrix.corpus_sha256) inputErrors.push("Corpus digests differ.");
  if (corpus.entries.length !== 12) inputErrors.push("Corpus must contain 12 chapters.");
  if (matrix.positive_cases.length !== 12 || matrix.confusion_cases.length !== 12 || matrix.ambiguity_cases.length !== 12) inputErrors.push("Matrix must be 12 + 12 + 12.");
  const cases = [
    ...matrix.positive_cases.map((item) => evaluate(item, "positive", corpus, policy)),
    ...matrix.confusion_cases.map((item) => evaluate(item, "confusion", corpus, policy)),
    ...matrix.ambiguity_cases.map((item) => evaluate(item, "ambiguity", corpus, policy))
  ];
  const failures = cases.filter((item) => !item.passed);
  const coverage = [...new Set(matrix.positive_cases.map((item) => item.expected_chapter_id))].sort();
  const report = {
    schema: "aha_business_fagverk_evaluation_report_v1",
    version: "1.0.0",
    source_ref: corpus.source_ref,
    corpus_sha256: corpus.content_sha256,
    policy_version: policy.version,
    matrix_version: matrix.version,
    status: inputErrors.length || failures.length ? "failed" : "passed_review_gate",
    runtime_activation_allowed: false,
    summary: {
      total: cases.length,
      passed: cases.length - failures.length,
      failed: failures.length,
      positive: matrix.positive_cases.length,
      confusion: matrix.confusion_cases.length,
      ambiguity: matrix.ambiguity_cases.length,
      chapters_covered: coverage.length,
      evidence_errors: inputErrors.length
    },
    chapter_coverage: coverage,
    evidence_errors: inputErrors,
    failures,
    cases
  };
  write(options.output, report);
  console.log(`Business evaluation: ${report.summary.passed}/${report.summary.total} passed; ${coverage.length} chapters covered.`);
  if (report.status !== "passed_review_gate") {
    inputErrors.forEach((error) => console.error(error));
    failures.forEach((failure) => console.error(`${failure.id}: ${failure.errors.join(" ")}`));
    process.exit(1);
  }
}

main();
