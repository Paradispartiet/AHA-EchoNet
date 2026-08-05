const assert = require("assert");
const fs = require("fs");
const crypto = require("crypto");

function read(path) {
  assert.equal(fs.existsSync(path), true, path);
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

const paths = {
  candidate: "data/integrations/candidates/history-go-fagverk-historie.candidate.v1.json",
  audit: "data/integrations/candidates/history-go-fagverk-historie.candidate-audit.v1.json",
  policy: "data/integrations/review/history-go-fagverk-historie.term-policy.v1.json",
  expansion: "data/integrations/review/history-go-fagverk-historie.expansion-review.v1.json",
  matrix: "data/evaluation/aha-history-fagverk-evaluation-matrix.v1.json",
  evaluation: "data/evaluation/aha-history-fagverk-evaluation-report.v1.json",
  corrections: "data/evaluation/aha-history-fixture-corrections.v1.json",
  correctionReport: "data/evaluation/aha-history-fixture-correction-report.v1.json",
  approval: "data/integrations/approvals/history-go-fagverk-historie.approved.v1.json",
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

assert.equal(candidate.subject_filter, "historie");
assert.equal(candidate.entries.length, 23);
assert.equal(candidate.entries.reduce((sum, entry) => sum + entry.module_source_paths.length, 0), 69);
assert.equal(candidate.approval_required, true);
assert.equal(candidate.runtime_activation_allowed, false);
assert.equal(audit.gate.passed, true);
assert.deepEqual(audit.coverage, {
  expected: 23,
  registered: 23,
  materialized: 23,
  missing: [],
  unexpected: [],
  duplicate_chapter_ids: []
});
assert.deepEqual(audit.term_collision_summary, {
  total: 292,
  high_risk: 96,
  medium_risk: 108,
  low_risk: 88
});

assert.equal(policy.schema, "aha_history_fagverk_term_policy_v1");
assert.equal(policy.source_ref, candidate.source_ref);
assert.equal(policy.corpus_sha256, candidate.content_sha256);
assert.equal(policy.summary.total, 292);
assert.equal(policy.summary.risks.high, 96);
assert.equal(policy.summary.risks.medium, 108);
assert.equal(policy.summary.risks.low, 88);
assert.equal(Object.keys(policy.chapter_rules).length, 23);
assert.equal(policy.chapters.length, 23);
assert.equal(policy.temporal_gate.required, true);
assert.equal(policy.runtime_activation_allowed, false);
for (const entry of candidate.entries) {
  const rule = policy.chapter_rules[entry.chapter_id];
  assert.ok(rule, entry.chapter_id);
  assert.ok(rule.required_anchor_terms.length >= 5, entry.chapter_id);
  assert.ok(rule.supplemental_evidence_terms.length >= 5, entry.chapter_id);
}

assert.equal(expansion.status, "reviewed_subject_expansion_not_runtime_active");
assert.equal(expansion.baseline.chapter_count, 1);
assert.equal(expansion.candidate.chapter_count, 23);
assert.equal(expansion.candidate.module_file_count, 69);
assert.equal(expansion.delta.retained_chapter_count, 1);
assert.equal(expansion.delta.added_chapter_count, 22);
assert.equal(expansion.delta.removed_chapter_count, 0);
assert.equal(expansion.runtime_activation_allowed, false);

assert.equal(matrix.positive_cases.length, 23);
assert.equal(matrix.confusion_cases.length, 23);
assert.equal(matrix.ambiguity_cases.length, 12);
assert.equal(new Set(matrix.positive_cases.map((item) => item.expected_chapter_id)).size, 23);
assert.equal(evaluation.status, "passed_review_gate");
assert.deepEqual(evaluation.summary, {
  total: 58,
  passed: 58,
  failed: 0,
  positive: 23,
  confusion: 23,
  ambiguity: 12,
  chapters_covered: 23,
  evidence_errors: 0
});

assert.equal(corrections.cases.length, 16);
assert.equal(correctionReport.status, "passed_correction_gate");
assert.equal(correctionReport.summary.total, 16);
assert.equal(correctionReport.summary.passed, 16);
assert.equal(correctionReport.summary.failed, 0);
assert.equal(correctionReport.summary.validation_errors, 0);
assert.equal(correctionReport.summary.grounded, 4);
assert.equal(correctionReport.summary.unsupported, 12);
assert.equal(correctionReport.summary.ambiguous, 0);

assert.equal(registry.subjects.historie.subject_id, "historie");
assert.equal(registry.runtime_activation_allowed, false);
assert.equal(approval.status, "subject_review_approved_not_runtime_active");
assert.equal(approval.subject_id, "historie");
assert.equal(approval.source_ref, candidate.source_ref);
assert.equal(approval.candidate.chapter_count, 23);
assert.equal(approval.gate_summary.total, 5);
assert.equal(approval.gate_summary.passed, 5);
assert.equal(approval.gate_summary.failed, 0);
assert.equal(approval.runtime_activation_allowed, false);
assert.equal(approval.runtime_active_pointer_changed, false);

const activeHistory = runtime.active_subjects?.historie;
assert.equal(activeHistory.subject_id, "historie");
assert.equal(activeHistory.source_commit, "c16a187453d16a40f9cab4ca694c32e96014f31b");
assert.equal(activeHistory.chapter_count, 23);
assert.equal(activeHistory.corpus_path, "data/integrations/runtime/history-go-fagverk-historie.corpus.v1.json");
assert.equal(activeHistory.policy_path, "data/integrations/runtime/history-go-fagverk-historie.policy.v1.json");
assert.equal(runtime.active_subjects?.natur?.chapter_count, 11);
assert.equal(runtime.full_release_active, false);
assert.equal(runtime.effective_entry_count, 47);

const matrixDigest = crypto.createHash("sha256").update(fs.readFileSync(paths.matrix)).digest("hex");
assert.match(matrixDigest, /^[0-9a-f]{64}$/);

console.log("aha-history-fagverk-review tests passed");
