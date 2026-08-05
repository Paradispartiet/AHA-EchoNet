#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { scoreHistory } from "./lib/history-fagverk-scoring.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const PATHS = {
  corpus: "data/integrations/candidates/history-go-fagverk-historie.candidate.v1.json",
  policy: "data/integrations/review/history-go-fagverk-historie.term-policy.v1.json",
  corrections: "data/evaluation/aha-history-fixture-corrections.v1.json",
  output: "data/evaluation/aha-history-fixture-correction-report.v1.json"
};

function parseArgs(argv) {
  const args = { ...PATHS };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--corpus") args.corpus = argv[++index] || args.corpus;
    else if (token === "--policy") args.policy = argv[++index] || args.policy;
    else if (token === "--corrections") args.corrections = argv[++index] || args.corrections;
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

function buildReport(corpus, policy, corrections) {
  const validationErrors = [];
  if (corpus.subject_filter !== "historie" || policy.subject_id !== "historie" || corrections.subject_id !== "historie") {
    validationErrors.push("Fixture correction inputs are not consistently History-scoped.");
  }
  if (corpus.source_ref !== policy.source_ref || corpus.source_ref !== corrections.source_ref) {
    validationErrors.push("Fixture correction source refs differ.");
  }
  if (corpus.content_sha256 !== policy.corpus_sha256 || corpus.content_sha256 !== corrections.corpus_sha256) {
    validationErrors.push("Fixture correction corpus digests differ.");
  }
  if (!Array.isArray(corrections.cases) || corrections.cases.length !== 16) {
    validationErrors.push("History fixture correction matrix must contain all 16 canonical fixtures.");
  }

  const cases = (corrections.cases || []).map((correction) => {
    const fixture = readJson(correction.fixture_path);
    const result = scoreHistory(fixture.inputText, corpus, policy);
    const errors = [];
    if (result.status !== correction.expected_history_status) {
      errors.push(`Expected status ${correction.expected_history_status}, got ${result.status}.`);
    }
    if ((correction.expected_chapter_id || null) !== result.selected_chapter_id) {
      errors.push(`Expected chapter ${correction.expected_chapter_id || "none"}, got ${result.selected_chapter_id || "none"}.`);
    }
    return {
      id: correction.id,
      fixture_path: correction.fixture_path,
      passed: errors.length === 0,
      errors,
      expected_history_status: correction.expected_history_status,
      expected_chapter_id: correction.expected_chapter_id,
      result
    };
  });

  const failed = cases.filter((item) => !item.passed);
  return {
    schema: "aha_history_fixture_correction_report_v1",
    version: "1.0.0",
    source_ref: corpus.source_ref,
    corpus_sha256: corpus.content_sha256,
    policy_version: policy.version,
    status: failed.length || validationErrors.length ? "failed" : "passed_correction_gate",
    runtime_activation_allowed: false,
    summary: {
      total: cases.length,
      passed: cases.length - failed.length,
      failed: failed.length,
      validation_errors: validationErrors.length,
      grounded: cases.filter((item) => item.result.status === "grounded").length,
      unsupported: cases.filter((item) => item.result.status === "unsupported").length,
      ambiguous: cases.filter((item) => item.result.status === "ambiguous").length
    },
    validation_errors: validationErrors,
    failures: failed,
    cases
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/compare-history-fixture-corrections.mjs [--corpus path] [--policy path] [--corrections path] [--output path]");
    return;
  }
  const report = buildReport(readJson(args.corpus), readJson(args.policy), readJson(args.corrections));
  writeJson(args.output, report);
  console.log(`History fixture corrections: ${report.summary.passed}/${report.summary.total} passed.`);
  if (report.status !== "passed_correction_gate") {
    report.validation_errors.forEach((error) => console.error(error));
    report.failures.forEach((failure) => console.error(`${failure.id}: ${failure.errors.join(" ")}`));
    process.exit(1);
  }
}

main();
