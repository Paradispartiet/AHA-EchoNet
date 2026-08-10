const assert = require('assert');
const fs = require('fs');

const baseline = JSON.parse(fs.readFileSync('data/integrations/review/history-go-fagverk-politikk.release-baseline.v1.json', 'utf8'));
const subjectBaseline = JSON.parse(fs.readFileSync('data/integrations/review/history-go-fagverk-subject-content-baseline.v1.json', 'utf8')).subjects.politikk;
const drift = JSON.parse(fs.readFileSync('data/integrations/review/history-go-fagverk-politikk.release-drift.v1.json', 'utf8'));
const observed = JSON.parse(fs.readFileSync('data/integrations/history-go-fagverk-release.observed.json', 'utf8'));
const candidate = JSON.parse(fs.readFileSync('data/integrations/candidates/history-go-fagverk-politikk.candidate.v1.json', 'utf8'));
const corpus = JSON.parse(fs.readFileSync('data/integrations/review/history-go-fagverk-politikk.audit.v1.json', 'utf8'));
const policy = JSON.parse(fs.readFileSync('data/integrations/review/history-go-fagverk-politikk.term-policy.v1.json', 'utf8'));
const evaluation = JSON.parse(fs.readFileSync('data/evaluation/aha-politics-fagverk-evaluation-report.v1.json', 'utf8'));
const corrections = JSON.parse(fs.readFileSync('data/evaluation/aha-politics-fixture-correction-report.v1.json', 'utf8'));
const approved = JSON.parse(fs.readFileSync('data/integrations/history-go-fagverk-release.approved.json', 'utf8'));
const active = JSON.parse(fs.readFileSync('data/integrations/history-go-fagverk-release.runtime-active.json', 'utf8'));
const runtimeCode = fs.readFileSync('backend/aha_engine/app/engine/fagverk_grounding.py', 'utf8');

assert.equal(baseline.status, 'review_baseline_not_runtime_input');
assert.equal(baseline.runtime_activation_allowed, false);
assert.equal(observed.subjects.politikk.content_sha256, subjectBaseline.subject_content_sha256, 'current observed Politics content remains review-compatible');
assert.equal(candidate.source_ref, subjectBaseline.approved_source_ref);
assert.equal(drift.schema, 'aha_politics_fagverk_release_drift_v1');
assert.equal(drift.status, 'source_rebased_no_semantic_drift');
assert.equal(drift.previous_source_ref, baseline.source_ref);
assert.equal(drift.observed_source_ref, subjectBaseline.approved_source_ref);
assert.equal(drift.observed_release_sha256, subjectBaseline.approved_release_sha256);
assert.equal(drift.reviewed_source_ref, candidate.source_ref);
assert.equal(drift.reviewed_source_ref, corpus.source_ref);
assert.equal(drift.previous_corpus_sha256, baseline.corpus_sha256);
assert.equal(drift.reviewed_corpus_sha256, candidate.content_sha256);
assert.equal(drift.reviewed_corpus_sha256, corpus.content_sha256);
assert.equal(drift.checks.source_rebased, true);
assert.equal(drift.checks.observed_source_matches_candidate, true);
assert.equal(drift.checks.candidate_matches_review_source, true);
assert.equal(drift.checks.corpus_content_changed, false);
assert.equal(drift.checks.chapter_inventory_changed, false);
assert.equal(drift.checks.module_depth_changed, false);
assert.equal(drift.checks.policy_summary_changed, false);
assert.equal(drift.checks.evaluation_regressed, false);
assert.equal(drift.checks.fixture_corrections_regressed, false);
assert.equal(drift.checks.audit_gate_passed, true);
assert.equal(drift.checks.candidate_review_only, true);
assert.equal(drift.checks.approved_pointer_unchanged, true);
assert.equal(drift.checks.active_pointer_not_observed_release, true);
assert.deepEqual(drift.summary, {
  semantic_drift_detected: false,
  quality_regression_detected: false,
  approval_boundary_failure_detected: false,
  chapter_count: 13,
  module_files_per_chapter: 3,
  policy_terms: 143,
  evaluation_passed: 34,
  evaluation_total: 34,
  fixture_corrections_passed: 16,
  fixture_corrections_total: 16
});
assert.equal(policy.source_ref, drift.reviewed_source_ref);
assert.equal(policy.approval_required, true);
assert.equal(policy.activation_allowed, false);
assert.equal(policy.runtime_activation_allowed, false);
assert.equal(evaluation.source_ref, drift.reviewed_source_ref);
assert.equal(evaluation.status, 'passed_review_gate');
assert.equal(corrections.source_ref, drift.reviewed_source_ref);
assert.equal(corrections.status, 'passed_correction_gate');
assert.equal(drift.approval_recommendation, 'review_artifacts_may_be_approved_for_current_source_without_runtime_activation');
assert.equal(drift.approval_required, true);
assert.equal(drift.runtime_activation_allowed, false);
assert.equal(drift.explicit_activation_pull_request_required, true);
assert.equal(approved.approved_source_commit, baseline.source_ref);
assert.equal(active.active_source_commit, baseline.source_ref);
assert.notEqual(active.active_source_commit, observed.source_commit);
assert.equal(runtimeCode.includes('history-go-fagverk-politikk.release-drift.v1.json'), false);
assert.equal(runtimeCode.includes('history-go-fagverk-politikk.term-policy.v1.json'), false);
assert.equal(runtimeCode.includes('data/integrations/candidates'), false);

console.log('aha-politics-fagverk-release-drift tests passed');
