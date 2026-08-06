#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { scoreBusiness } from "./lib/business-fagverk-scoring.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaults = {
  corpus: "data/integrations/candidates/history-go-fagverk-naeringsliv.candidate.v1.json",
  policy: "data/integrations/review/history-go-fagverk-naeringsliv.term-policy.v1.json",
  corrections: "data/evaluation/aha-business-fixture-corrections.v1.json",
  output: "data/evaluation/aha-business-fixture-correction-report.v1.json"
};

function args(argv) {
  const result = { ...defaults };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--corpus") result.corpus = argv[++i] || result.corpus;
    else if (token === "--policy") result.policy = argv[++i] || result.policy;
    else if (token === "--corrections") result.corrections = argv[++i] || result.corrections;
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

function main() {
  const options = args(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/compare-business-fixture-corrections.mjs [--corpus path] [--policy path] [--corrections path] [--output path]");
    return;
  }
  const corpus = read(options.corpus);
  const policy = read(options.policy);
  const corrections = read(options.corrections);
  const validationErrors = [];
  if (corpus.subject_filter !== "naeringsliv" || policy.subject_id !== "naeringsliv" || corrections.subject_id !== "naeringsliv") validationErrors.push("Fixture inputs are not consistently Business-scoped.");
  if (corpus.source_ref !== policy.source_ref || corpus.source_ref !== corrections.source_ref) validationErrors.push("Fixture source refs differ.");
  if (corpus.content_sha256 !== policy.corpus_sha256 || corpus.content_sha256 !== corrections.corpus_sha256) validationErrors.push("Fixture corpus digests differ.");
  if (corrections.cases.length !== 16) validationErrors.push("Business fixture matrix must contain all 16 canonical fixtures.");

  const cases = corrections.cases.map((correction) => {
    const fixture = read(correction.fixture_path);
    const result = scoreBusiness(fixture.inputText, corpus, policy);
    const errors = [];
    if (result.status !== correction.expected_business_status) errors.push(`Expected ${correction.expected_business_status}, got ${result.status}.`);
    if (result.selected_chapter_id !== correction.expected_chapter_id) errors.push(`Expected chapter ${correction.expected_chapter_id || "none"}, got ${result.selected_chapter_id || "none"}.`);
    return {
      id: correction.id,
      fixture_path: correction.fixture_path,
      expected_business_status: correction.expected_business_status,
      expected_chapter_id: correction.expected_chapter_id,
      actual_status: result.status,
      actual_chapter_id: result.selected_chapter_id,
      passed: errors.length === 0,
      errors,
      result
    };
  });
  const failed = cases.filter((item) => !item.passed);
  const report = {
    schema: "aha_business_fixture_correction_report_v1",
    version: "1.0.0",
    source_ref: corpus.source_ref,
    corpus_sha256: corpus.content_sha256,
    status: validationErrors.length || failed.length ? "failed" : "passed_correction_gate",
    runtime_activation_allowed: false,
    summary: {
      total: cases.length,
      passed: cases.length - failed.length,
      failed: failed.length,
      validation_errors: validationErrors.length,
      grounded: cases.filter((item) => item.actual_status === "grounded").length,
      unsupported: cases.filter((item) => item.actual_status === "unsupported").length,
      ambiguous: cases.filter((item) => item.actual_status === "ambiguous").length
    },
    validation_errors: validationErrors,
    failures: failed,
    cases
  };
  write(options.output, report);
  console.log(`Business fixture corrections: ${report.summary.passed}/${report.summary.total} passed.`);
  if (report.status !== "passed_correction_gate") {
    validationErrors.forEach((error) => console.error(error));
    failed.forEach((failure) => console.error(`${failure.id}: ${failure.errors.join(" ")}`));
    process.exit(1);
  }
}

main();
