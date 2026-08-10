const assert = require("assert");
const fs = require("fs");
const crypto = require("crypto");

function read(path) {
  assert.equal(fs.existsSync(path), true, path);
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

const paths = {
  candidate: "data/integrations/candidates/history-go-fagverk-natur.candidate.v1.json",
  audit: "data/integrations/candidates/history-go-fagverk-natur.candidate-audit.v1.json",
  policy: "data/integrations/review/history-go-fagverk-natur.term-policy.v1.json",
  expansion: "data/integrations/review/history-go-fagverk-natur.expansion-review.v1.json",
  matrix: "data/evaluation/aha-nature-fagverk-evaluation-matrix.v1.json",
  evaluation: "data/evaluation/aha-nature-fagverk-evaluation-report.v1.json",
  corrections: "data/evaluation/aha-nature-fixture-corrections.v1.json",
  correctionReport: "data/evaluation/aha-nature-fixture-correction-report.v1.json",
  approval: "data/integrations/approvals/history-go-fagverk-natur.approved.v1.json",
  registry: "data/integrations/review/history-go-fagverk-subject-approval-registry.v1.json",
  runtime: "data/integrations/history-go-fagverk-release.runtime-active.json"
};

const candidate = read(paths.candidate);
const audit = read(paths.audit);
const policy = read(paths.policy);
const expansion = read(paths.expansion);
const matrix = read(paths.matrix);
const evaluation = read(paths.evaluation);
const corrections = read(paths.corrections);
const correctionReport = read(paths.correctionReport);
const approval = read(paths.approval);
const registry = read(paths.registry);
const runtime = read(paths.runtime);

assert.equal(candidate.subject_filter, "natur");
assert.equal(candidate.entries.length, 11);
assert.equal(candidate.entries.reduce((sum, entry) => sum + entry.module_source_paths.length, 0), 0);
assert.equal(candidate.approval_required, true);
assert.equal(candidate.runtime_activation_allowed, false);
assert.equal(audit.gate.passed, true);
assert.deepEqual(audit.coverage, {
  expected: 11,
  registered: 11,
  materialized: 11,
  missing: [],
  unexpected: [],
  duplicate_chapter_ids: []
});
assert.deepEqual(audit.term_collision_summary, {
  total: 99,
  high_risk: 37,
  medium_risk: 53,
  low_risk: 9
});

assert.equal(policy.schema, "aha_nature_fagverk_term_policy_v1");
assert.equal(policy.source_ref, candidate.source_ref);
assert.equal(policy.corpus_sha256, candidate.content_sha256);
assert.equal(policy.summary.total, 99);
assert.equal(policy.summary.risks.high, 37);
assert.equal(policy.summary.risks.medium, 53);
assert.equal(policy.summary.risks.low, 9);
assert.equal(policy.summary.chapter_count, 11);
assert.equal(policy.summary.module_file_count, 0);
assert.equal(Object.keys(policy.chapter_rules).length, 11);
assert.equal(policy.chapters.length, 11);
assert.equal(policy.domain_gate.required, true);
assert.equal(policy.runtime_activation_allowed, false);
for (const entry of candidate.entries) {
  const rule = policy.chapter_rules[entry.chapter_id];
  assert.ok(rule, entry.chapter_id);
  assert.ok(rule.required_anchor_terms.length >= 5, entry.chapter_id);
  assert.ok(rule.supplemental_evidence_terms.length >= 5, entry.chapter_id);
}

assert.equal(expansion.status, "reviewed_subject_expansion_not_runtime_active");
assert.equal(expansion.baseline.chapter_count, 1);
assert.equal(expansion.candidate.chapter_count, 11);
assert.equal(expansion.candidate.module_file_count, 0);
assert.equal(expansion.delta.retained_chapter_count, 1);
assert.equal(expansion.delta.added_chapter_count, 10);
assert.equal(expansion.delta.removed_chapter_count, 0);
assert.equal(expansion.materialization_assessment.chapter_contract_sufficient_for_subject_review, true);
assert.equal(expansion.materialization_assessment.module_absence_is_visible_review_debt, true);
assert.equal(expansion.runtime_activation_allowed, false);

assert.equal(matrix.positive_cases.length, 11);
assert.equal(matrix.confusion_cases.length, 11);
assert.equal(matrix.ambiguity_cases.length, 12);
assert.equal(new Set(matrix.positive_cases.map((item) => item.expected_chapter_id)).size, 11);
assert.equal(evaluation.status, "passed_review_gate");
assert.deepEqual(evaluation.summary, {
  total: 34,
  passed: 34,
  failed: 0,
  positive: 11,
  confusion: 11,
  ambiguity: 12,
  chapters_covered: 11,
  evidence_errors: 0
});

assert.equal(corrections.cases.length, 16);
assert.equal(correctionReport.status, "passed_correction_gate");
assert.equal(correctionReport.summary.total, 16);
assert.equal(correctionReport.summary.passed, 16);
assert.equal(correctionReport.summary.failed, 0);
assert.equal(correctionReport.summary.validation_errors, 0);
assert.equal(correctionReport.summary.grounded, 0);
assert.equal(correctionReport.summary.unsupported, 16);
assert.equal(correctionReport.summary.ambiguous, 0);

assert.equal(registry.subjects.natur.subject_id, "natur");
assert.equal(registry.runtime_activation_allowed, false);
assert.equal(approval.status, "subject_review_approved_not_runtime_active");
assert.equal(approval.subject_id, "natur");
assert.equal(approval.source_ref, candidate.source_ref);
assert.equal(approval.candidate.chapter_count, 11);
assert.equal(approval.gate_summary.total, 5);
assert.equal(approval.gate_summary.passed, 5);
assert.equal(approval.gate_summary.failed, 0);
assert.equal(approval.runtime_activation_allowed, false);
assert.equal(approval.runtime_active_pointer_changed, false);

const activeNature = runtime.active_subjects?.natur;
assert.equal(activeNature.subject_id, "natur");
assert.equal(activeNature.source_commit, candidate.source_ref);
assert.equal(activeNature.chapter_count, 11);
assert.equal(activeNature.corpus_path, "data/integrations/runtime/history-go-fagverk-natur.corpus.v1.json");
assert.equal(activeNature.policy_path, "data/integrations/runtime/history-go-fagverk-natur.policy.v1.json");
assert.equal(activeNature.activation_status, "runtime_subject_active");
assert.equal(runtime.full_release_active, false);
assert.equal(runtime.effective_entry_count, Object.values(runtime.active_subjects).reduce((sum, item) => sum + item.chapter_count, 0));

const matrixDigest = crypto.createHash("sha256").update(fs.readFileSync(paths.matrix)).digest("hex");
assert.match(matrixDigest, /^[0-9a-f]{64}$/);

console.log("aha-nature-fagverk-review tests passed");
