const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');

function read(path) {
  assert.equal(fs.existsSync(path), true, path);
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const paths = {
  candidate: 'data/integrations/candidates/history-go-fagverk-naeringsliv.candidate.v1.json',
  audit: 'data/integrations/candidates/history-go-fagverk-naeringsliv.candidate-audit.v1.json',
  config: 'data/integrations/review/history-go-fagverk-naeringsliv.policy-config.v1.json',
  policy: 'data/integrations/review/history-go-fagverk-naeringsliv.term-policy.v1.json',
  expansion: 'data/integrations/review/history-go-fagverk-naeringsliv.expansion-review.v1.json',
  matrix: 'data/evaluation/aha-business-fagverk-evaluation-matrix.v1.json',
  evaluation: 'data/evaluation/aha-business-fagverk-evaluation-report.v1.json',
  corrections: 'data/evaluation/aha-business-fixture-corrections.v1.json',
  correctionReport: 'data/evaluation/aha-business-fixture-correction-report.v1.json',
  approval: 'data/integrations/approvals/history-go-fagverk-naeringsliv.approved.v1.json',
  registry: 'data/integrations/review/history-go-fagverk-subject-approval-registry.v1.json',
  runtime: 'data/integrations/history-go-fagverk-release.runtime-active.json'
};

const candidate = read(paths.candidate);
const audit = read(paths.audit);
const config = read(paths.config);
const policy = read(paths.policy);
const expansion = read(paths.expansion);
const matrix = read(paths.matrix);
const evaluation = read(paths.evaluation);
const corrections = read(paths.corrections);
const correctionReport = read(paths.correctionReport);
const approval = read(paths.approval);
const registry = read(paths.registry);
const runtime = read(paths.runtime);

assert.equal(candidate.subject_filter, 'naeringsliv');
assert.equal(candidate.entries.length, 12);
assert.equal(candidate.entries.reduce((sum, entry) => sum + entry.module_source_paths.length, 0), 36);
assert.equal(candidate.entries.every((entry) => entry.module_source_paths.length === 3), true);
assert.equal(candidate.approval_required, true);
assert.equal(candidate.runtime_activation_allowed, false);
assert.equal(audit.gate.passed, true);
assert.deepEqual(audit.coverage, {
  expected: 12,
  registered: 12,
  materialized: 12,
  missing: [],
  unexpected: [],
  duplicate_chapter_ids: []
});
assert.deepEqual(audit.term_collision_summary, {
  total: 140,
  high_risk: 65,
  medium_risk: 51,
  low_risk: 24
});

assert.equal(config.schema, 'aha_business_fagverk_policy_config_v1');
assert.equal(config.source_ref, candidate.source_ref);
assert.equal(config.corpus_sha256, candidate.content_sha256);
assert.deepEqual(config.thresholds, {
  minimum_score: 7,
  minimum_terms: 2,
  minimum_reviewed_evidence_terms: 2,
  ambiguity_margin: 3
});
assert.equal(Object.keys(config.chapter_rules).length, 12);
assert.equal(Object.values(config.chapter_rules).reduce((sum, rule) => sum + rule.required_anchor_terms.length, 0), 60);
assert.equal(Object.values(config.chapter_rules).reduce((sum, rule) => sum + rule.supplemental_evidence_terms.length, 0), 60);
for (const entry of candidate.entries) {
  const rule = config.chapter_rules[entry.chapter_id];
  assert.ok(rule, entry.chapter_id);
  assert.equal(rule.required_anchor_terms.length, 5, entry.chapter_id);
  assert.equal(rule.supplemental_evidence_terms.length, 5, entry.chapter_id);
}

assert.equal(policy.schema, 'aha_business_fagverk_term_policy_v1');
assert.equal(policy.status, 'review_policy_full_fixture_candidate_not_runtime_active');
assert.equal(policy.source_ref, candidate.source_ref);
assert.equal(policy.corpus_sha256, candidate.content_sha256);
assert.equal(policy.policy_config_path, paths.config);
assert.equal(policy.policy_rules.candidate_title_concept_support_terms, 'non_decisive_review_context_only');
assert.equal(policy.policy_rules.collision_inventory, 'documented_in_source_audit_not_runtime_scoring_input');
assert.equal(policy.policy_rules.supplemental_evidence, 'at_least_two_chapter_scoped_terms_required');
assert.deepEqual(policy.summary, {
  total: 140,
  risks: { high: 65, medium: 51, low: 24 },
  chapter_count: 12,
  module_file_count: 36,
  required_anchor_count: 60,
  supplemental_evidence_count: 60
});
assert.equal(policy.approval_required, true);
assert.equal(policy.runtime_activation_allowed, false);

assert.equal(expansion.status, 'reviewed_subject_expansion_not_runtime_active');
assert.equal(expansion.baseline.chapter_count, 0);
assert.equal(expansion.candidate.chapter_count, 12);
assert.equal(expansion.candidate.module_file_count, 36);
assert.equal(expansion.delta.retained_chapter_count, 0);
assert.equal(expansion.delta.added_chapter_count, 12);
assert.equal(expansion.delta.removed_chapter_count, 0);
assert.equal(expansion.materialization_assessment.chapter_contract_sufficient_for_subject_review, true);
assert.equal(expansion.materialization_assessment.complete_three_module_structure_per_chapter, true);
assert.equal(expansion.runtime_activation_allowed, false);

assert.equal(matrix.positive_cases.length, 12);
assert.equal(matrix.confusion_cases.length, 12);
assert.equal(matrix.ambiguity_cases.length, 12);
assert.equal(new Set(matrix.positive_cases.map((item) => item.expected_chapter_id)).size, 12);
assert.equal(evaluation.status, 'passed_review_gate');
assert.deepEqual(evaluation.summary, {
  total: 36,
  passed: 36,
  failed: 0,
  positive: 12,
  confusion: 12,
  ambiguity: 12,
  chapters_covered: 12,
  evidence_errors: 0
});
assert.equal(evaluation.cases.every((item) => item.passed === true), true);

assert.equal(corrections.cases.length, 16);
assert.equal(correctionReport.status, 'passed_correction_gate');
assert.deepEqual(correctionReport.summary, {
  total: 16,
  passed: 16,
  failed: 0,
  validation_errors: 0,
  grounded: 0,
  unsupported: 16,
  ambiguous: 0
});
assert.equal(correctionReport.cases.every((item) => item.passed === true), true);

assert.equal(registry.subjects.naeringsliv.subject_id, 'naeringsliv');
assert.equal(registry.runtime_activation_allowed, false);
assert.equal(approval.status, 'subject_review_approved_not_runtime_active');
assert.equal(approval.subject_id, 'naeringsliv');
assert.equal(approval.source_ref, candidate.source_ref);
assert.equal(approval.candidate.chapter_count, 12);
assert.equal(approval.reviewed_corpus.chapter_count, 12);
assert.equal(approval.gate_summary.total, 5);
assert.equal(approval.gate_summary.passed, 5);
assert.equal(approval.gate_summary.failed, 0);
assert.equal(approval.runtime_activation_allowed, false);
assert.equal(approval.runtime_active_pointer_changed, false);

const activeBusiness = runtime.active_subjects?.naeringsliv;
assert.equal(activeBusiness.subject_id, 'naeringsliv');
assert.equal(activeBusiness.source_commit, candidate.source_ref);
assert.equal(activeBusiness.chapter_count, 12);
assert.equal(activeBusiness.corpus_path, 'data/integrations/runtime/history-go-fagverk-naeringsliv.corpus.v1.json');
assert.equal(activeBusiness.policy_path, 'data/integrations/runtime/history-go-fagverk-naeringsliv.policy.v1.json');
assert.equal(activeBusiness.activation_status, 'runtime_subject_active');
assert.equal(runtime.full_release_active, false);
assert.equal(runtime.effective_entry_count, Object.values(runtime.active_subjects).reduce((sum, item) => sum + item.chapter_count, 0));

for (const path of [paths.config, paths.matrix, paths.corrections]) {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
  assert.match(digest, /^[0-9a-f]{64}$/);
}

console.log('aha-business-fagverk-review tests passed');
