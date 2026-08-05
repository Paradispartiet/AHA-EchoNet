#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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

function normalize(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenSet(value) {
  return new Set(normalize(value).match(/[a-zæøå0-9]+/gi) || []);
}

function termPresent(text, tokens, term) {
  const value = normalize(term);
  if (!value) return false;
  if (/\s|-/.test(value)) return text.includes(value);
  return tokens.has(value);
}

function groupTerms(entry) {
  const groups = [
    ["title_terms", 5],
    ["concept_terms", 3],
    ["support_terms", 1.5]
  ];
  const terms = new Map();
  for (const [group, weight] of groups) {
    for (const rawTerm of entry[group] || []) {
      const term = normalize(rawTerm);
      if (!term) continue;
      const current = terms.get(term);
      if (!current || weight > current.base_weight) terms.set(term, { term, group, base_weight: weight });
    }
  }
  return [...terms.values()];
}

function scoreText(textValue, corpus, policy) {
  const text = normalize(textValue);
  const tokens = tokenSet(text);
  const policyByTerm = new Map((policy.terms || []).map((item) => [normalize(item.term), item]));
  const scores = corpus.entries.map((entry) => {
    const matched = [];
    let score = 0;
    for (const candidate of groupTerms(entry)) {
      if (!termPresent(text, tokens, candidate.term)) continue;
      const termPolicy = policyByTerm.get(candidate.term);
      const multiplier = termPolicy ? Number(termPolicy.multiplier || 0) : 1;
      const contribution = candidate.base_weight * multiplier;
      if (contribution <= 0) continue;
      matched.push({
        term: candidate.term,
        group: candidate.group,
        base_weight: candidate.base_weight,
        multiplier,
        contribution: Number(contribution.toFixed(3))
      });
      score += contribution;
    }
    matched.sort((a, b) => b.contribution - a.contribution || a.term.localeCompare(b.term, "nb"));
    return {
      chapter_id: entry.chapter_id,
      title: entry.title,
      score: Number(score.toFixed(3)),
      matched_terms: matched
    };
  }).sort((a, b) => b.score - a.score || a.chapter_id.localeCompare(b.chapter_id, "nb"));

  const top = scores[0];
  const second = scores[1];
  let status = "unsupported";
  if (top && top.score >= 6 && top.matched_terms.length >= 2) {
    status = second && second.score >= 6 && (top.score - second.score) < 3 ? "ambiguous" : "grounded";
  }
  return {
    status,
    selected_chapter_id: status === "grounded" ? top.chapter_id : null,
    top_score: top?.score || 0,
    second_score: second?.score || 0,
    ranking: scores.slice(0, 5)
  };
}

function evaluateCase(testCase, corpus, policy, kind) {
  const result = scoreText(testCase.text, corpus, policy);
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
  const errors = [];
  for (const testCase of [...matrix.positive_cases, ...matrix.confusion_cases]) {
    const entry = entryById.get(testCase.expected_chapter_id);
    if (!entry) {
      errors.push(`${testCase.id}: unknown expected chapter ${testCase.expected_chapter_id}.`);
      continue;
    }
    const terms = new Set([...entry.title_terms, ...entry.concept_terms, ...entry.support_terms].map(normalize));
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
      const termPolicy = policyByTerm.get(normalize(evidence));
      if (!termPolicy || termPolicy.action !== "non_scoring") {
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
  const corpus = readJson(args.corpus);
  const policy = readJson(args.policy);
  const matrix = readJson(args.matrix);
  const report = buildReport(corpus, policy, matrix);
  writeJson(args.output, report);
  console.log(`Politics evaluation: ${report.summary.passed}/${report.summary.total} passed; ${report.summary.chapters_covered} chapters covered.`);
  if (report.status !== "passed_review_gate") {
    for (const error of report.evidence_errors) console.error(error);
    for (const failure of report.failures) console.error(`${failure.id}: ${failure.errors.join(" ")}`);
    process.exit(1);
  }
}

main();
