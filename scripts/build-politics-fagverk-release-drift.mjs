#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const defaults = {
  baseline: "data/integrations/review/history-go-fagverk-politikk.release-baseline.v1.json",
  observed: "data/integrations/history-go-fagverk-release.observed.json",
  candidate: "data/integrations/candidates/history-go-fagverk-politikk.candidate.v1.json",
  corpus: "data/integrations/review/history-go-fagverk-politikk.audit.v1.json",
  audit: "data/integrations/review/history-go-fagverk-politikk.audit-report.v1.json",
  policy: "data/integrations/review/history-go-fagverk-politikk.term-policy.v1.json",
  evaluation: "data/evaluation/aha-politics-fagverk-evaluation-report.v1.json",
  corrections: "data/evaluation/aha-politics-fixture-correction-report.v1.json",
  approved: "data/integrations/history-go-fagverk-release.approved.json",
  active: "data/integrations/history-go-fagverk-release.runtime-active.json",
  output: "data/integrations/review/history-go-fagverk-politikk.release-drift.v1.json"
};

function parseArgs(argv) {
  const args = { ...defaults };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--help") args.help = true;
    else if (token.startsWith("--") && Object.hasOwn(args, token.slice(2))) args[token.slice(2)] = argv[++i] || args[token.slice(2)];
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

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function politicsSubject(observed) {
  const subject = (observed.subjects || observed.packages || []).find((item) => item.subject_id === "politikk");
  if (!subject) throw new Error("Observed release lacks Politics.");
  return subject;
}

function buildReport({ baseline, observed, candidate, corpus, audit, policy, evaluation, corrections, approved, active }) {
  const observedPolitics = politicsSubject(observed);
  const chapterIds = corpus.entries.map((entry) => entry.chapter_id);
  const policySummary = {
    version: policy.version,
    total: policy.summary?.total,
    non_scoring: policy.summary?.non_scoring,
    down_weight: policy.summary?.down_weight,
    context_only: policy.summary?.context_only
  };
  const evaluationSummary = {
    version: evaluation.version,
    total: evaluation.summary?.total,
    passed: evaluation.summary?.passed,
    failed: evaluation.summary?.failed,
    chapters_covered: evaluation.summary?.chapters_covered,
    evidence_errors: evaluation.summary?.evidence_errors
  };
  const correctionSummary = {
    version: corrections.version,
    total: corrections.summary?.total,
    passed: corrections.summary?.passed,
    failed: corrections.summary?.failed,
    validation_errors: corrections.summary?.validation_errors
  };
  const checks = {
    source_rebased: baseline.source_ref !== corpus.source_ref,
    observed_source_matches_candidate: observed.source_commit === candidate.source_ref,
    candidate_matches_review_source: candidate.source_ref === corpus.source_ref,
    corpus_content_changed: baseline.corpus_sha256 !== corpus.content_sha256,
    chapter_inventory_changed: !same(baseline.chapter_ids, chapterIds),
    module_depth_changed: corpus.entries.some((entry) => entry.provenance?.module_file_count !== baseline.module_files_per_chapter),
    policy_summary_changed: !same(baseline.term_policy, policySummary),
    evaluation_regressed: !same(baseline.evaluation, evaluationSummary),
    fixture_corrections_regressed: !same(baseline.fixture_corrections, correctionSummary),
    audit_gate_passed: audit.gate?.passed === true,
    candidate_review_only: candidate.approval_required === true && candidate.runtime_activation_allowed === false,
    approved_pointer_unchanged: approved.approved_source_commit === baseline.source_ref,
    active_pointer_not_observed_release: active.active_source_commit !== observed.source_commit
  };
  const semanticDrift = checks.corpus_content_changed || checks.chapter_inventory_changed || checks.module_depth_changed || checks.policy_summary_changed;
  const qualityRegression = checks.evaluation_regressed || checks.fixture_corrections_regressed || !checks.audit_gate_passed;
  const boundaryFailure = !checks.observed_source_matches_candidate || !checks.candidate_matches_review_source || !checks.candidate_review_only || !checks.approved_pointer_unchanged || !checks.active_pointer_not_observed_release;
  const reviewPassed = !semanticDrift && !qualityRegression && !boundaryFailure;
  return {
    schema: "aha_politics_fagverk_release_drift_v1",
    version: "1.0.0",
    status: reviewPassed ? "source_rebased_no_semantic_drift" : "review_required",
    lifecycle_stage: "subject_release_review",
    subject_id: "politikk",
    source_repo: candidate.source_repo,
    previous_source_ref: baseline.source_ref,
    observed_source_ref: observed.source_commit,
    reviewed_source_ref: corpus.source_ref,
    observed_release_sha256: observed.release_sha256,
    previous_corpus_sha256: baseline.corpus_sha256,
    reviewed_corpus_sha256: corpus.content_sha256,
    observed_subject: {
      package_status: observedPolitics.package_status,
      chapter_status: observedPolitics.chapter_status,
      chapter_count: observedPolitics.chapter_count,
      module_file_count: observedPolitics.module_file_count,
      referenced_file_count: observedPolitics.referenced_file_count
    },
    checks,
    summary: {
      semantic_drift_detected: semanticDrift,
      quality_regression_detected: qualityRegression,
      approval_boundary_failure_detected: boundaryFailure,
      chapter_count: chapterIds.length,
      module_files_per_chapter: baseline.module_files_per_chapter,
      policy_terms: policySummary.total,
      evaluation_passed: evaluationSummary.passed,
      evaluation_total: evaluationSummary.total,
      fixture_corrections_passed: correctionSummary.passed,
      fixture_corrections_total: correctionSummary.total
    },
    approval_recommendation: reviewPassed
      ? "review_artifacts_may_be_approved_for_current_source_without_runtime_activation"
      : "resolve_drift_or_quality_failures_before_subject_approval",
    approval_required: true,
    runtime_activation_allowed: false,
    explicit_activation_pull_request_required: true
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/build-politics-fagverk-release-drift.mjs [--output path]");
    return;
  }
  const inputs = {};
  for (const key of ["baseline", "observed", "candidate", "corpus", "audit", "policy", "evaluation", "corrections", "approved", "active"]) inputs[key] = readJson(args[key]);
  const report = buildReport(inputs);
  writeJson(args.output, report);
  console.log(`Politics Fagverk release drift: ${report.status}; ${report.summary.evaluation_passed}/${report.summary.evaluation_total} evaluation cases and ${report.summary.fixture_corrections_passed}/${report.summary.fixture_corrections_total} fixture corrections pass.`);
  if (report.status !== "source_rebased_no_semantic_drift") process.exitCode = 1;
}

main();
