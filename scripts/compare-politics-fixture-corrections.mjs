#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const DEFAULTS = {
  corpus: "data/integrations/review/history-go-fagverk-politikk.audit.v1.json",
  policy: "data/integrations/review/history-go-fagverk-politikk.term-policy.v1.json",
  corrections: "data/evaluation/aha-politics-fixture-corrections.v1.json",
  output: "data/evaluation/aha-politics-fixture-correction-report.v1.json"
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
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

function resolve(relativePath) {
  return path.resolve(repoRoot, relativePath);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(resolve(relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  const outputPath = resolve(relativePath);
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
  const terms = new Map();
  for (const [group, weight] of [["title_terms", 5], ["concept_terms", 3], ["support_terms", 1.5]]) {
    for (const rawTerm of entry[group] || []) {
      const term = normalize(rawTerm);
      if (!term) continue;
      const current = terms.get(term);
      if (!current || weight > current.base_weight) terms.set(term, { term, group, base_weight: weight });
    }
  }
  return [...terms.values()];
}

function scorePolitics(textValue, corpus, policy) {
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

function classifyComparison(expectedStatus, expectedChapter, actual) {
  if (expectedStatus === actual.status && (expectedStatus !== "grounded" || expectedChapter === actual.selected_chapter_id)) return "correct";
  if (expectedStatus === "unsupported" && actual.status === "grounded") return "false_positive";
  if (expectedStatus === "grounded" && actual.status !== "grounded") return "false_negative";
  if (expectedStatus === "grounded" && actual.status === "grounded" && expectedChapter !== actual.selected_chapter_id) return "wrong_chapter";
  return "status_mismatch";
}

function validateCase(correction, fixture) {
  const errors = [];
  if (fixture.id !== correction.fixture_id && correction.fixture_id) errors.push(`fixture id mismatch: ${fixture.id}`);
  const source = normalize(fixture.inputText);
  for (const evidence of correction.source_evidence || []) {
    if (!source.includes(normalize(evidence))) errors.push(`source evidence missing: ${evidence}`);
  }
  if (!Array.isArray(correction.unsupported_interpretations) || !correction.unsupported_interpretations.length) errors.push("unsupported_interpretations missing");
  if (!Array.isArray(correction.required_uncertainty) || !correction.required_uncertainty.length) errors.push("required_uncertainty missing");
  if (correction.expected_politics_status === "grounded" && !correction.expected_chapter_id) errors.push("grounded case lacks expected_chapter_id");
  if (correction.expected_politics_status === "unsupported" && correction.expected_chapter_id !== null) errors.push("unsupported case must use null expected_chapter_id");
  return errors;
}

function buildReport(corpus, policy, corrections) {
  if (corpus.content_sha256 !== corrections.corpus_sha256 || corpus.content_sha256 !== policy.corpus_sha256) {
    throw new Error("Correction set, corpus and term policy digest differ.");
  }
  const validationErrors = [];
  const cases = corrections.cases.map((correction) => {
    const fixture = readJson(correction.fixture_path);
    const errors = validateCase(correction, fixture);
    validationErrors.push(...errors.map((error) => `${correction.id}: ${error}`));
    const actual = scorePolitics(fixture.inputText, corpus, policy);
    const comparison = classifyComparison(correction.expected_politics_status, correction.expected_chapter_id, actual);
    const forbiddenSelected = (correction.forbidden_chapter_ids || []).includes(actual.selected_chapter_id);
    return {
      id: correction.id,
      fixture_path: correction.fixture_path,
      fixture_id: fixture.id,
      fixture_role: correction.fixture_role,
      legacy_analysis: {
        content_type: fixture.expectedCanonicalAnalysis?.contentType || null,
        domain: fixture.expectedCanonicalAnalysis?.domain || null,
        theme: fixture.expectedCanonicalAnalysis?.theme || null,
        main_tension: fixture.expectedCanonicalAnalysis?.mainTension || null,
        confidence: fixture.expectedCanonicalAnalysis?.confidence || null
      },
      human_review: {
        expected_politics_status: correction.expected_politics_status,
        expected_chapter_id: correction.expected_chapter_id,
        source_evidence: correction.source_evidence || [],
        supported_concepts: correction.supported_concepts || [],
        forbidden_chapter_ids: correction.forbidden_chapter_ids || [],
        unsupported_interpretations: correction.unsupported_interpretations || [],
        required_uncertainty: correction.required_uncertainty || []
      },
      policy_grounding: actual,
      comparison,
      passed: comparison === "correct" && !forbiddenSelected,
      forbidden_chapter_selected: forbiddenSelected,
      validation_errors: errors
    };
  });

  const byComparison = cases.reduce((summary, item) => {
    summary[item.comparison] = (summary[item.comparison] || 0) + 1;
    return summary;
  }, {});
  const passed = cases.filter((item) => item.passed).length;
  const failed = cases.length - passed;
  return {
    schema: "aha_politics_fixture_correction_report_v1",
    version: "1.0.0",
    status: validationErrors.length ? "invalid_correction_set" : failed ? "correction_required" : "passed_correction_gate",
    runtime_activation_allowed: false,
    source_ref: corpus.source_ref,
    corpus_sha256: corpus.content_sha256,
    policy_version: policy.version,
    correction_version: corrections.version,
    summary: {
      total: cases.length,
      passed,
      failed,
      exact_legacy_baselines: cases.filter((item) => item.fixture_role === "legacy_exact_baseline").length,
      qualitative_targets: cases.filter((item) => item.fixture_role === "qualitative_target_fixture").length,
      comparisons: byComparison,
      validation_errors: validationErrors.length
    },
    validation_errors: validationErrors,
    failures: cases.filter((item) => !item.passed),
    cases
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/compare-politics-fixture-corrections.mjs [--corpus path] [--policy path] [--corrections path] [--output path]");
    return;
  }
  const report = buildReport(readJson(args.corpus), readJson(args.policy), readJson(args.corrections));
  writeJson(args.output, report);
  console.log(`Politics fixture correction baseline: ${report.summary.passed}/${report.summary.total} pass; ${report.summary.failed} corrections required.`);
  if (report.validation_errors.length) {
    report.validation_errors.forEach((error) => console.error(error));
    process.exit(1);
  }
}

main();
