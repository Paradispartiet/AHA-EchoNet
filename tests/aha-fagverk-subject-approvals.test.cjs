const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const registryPath = 'data/integrations/review/history-go-fagverk-subject-approval-registry.v1.json';
const baselinePath = 'data/integrations/review/history-go-fagverk-subject-content-baseline.v1.json';
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const observed = JSON.parse(fs.readFileSync('data/integrations/history-go-fagverk-release.observed.json', 'utf8'));
const runtimeApproved = JSON.parse(fs.readFileSync('data/integrations/history-go-fagverk-release.approved.json', 'utf8'));
const runtimeActive = JSON.parse(fs.readFileSync('data/integrations/history-go-fagverk-release.runtime-active.json', 'utf8'));
const runtimeCode = fs.readFileSync('backend/aha_engine/app/engine/fagverk_grounding.py', 'utf8');

assert.equal(registry.schema, 'aha_history_go_fagverk_subject_approval_registry_v1');
assert.equal(registry.status, 'review_gate_registry_not_runtime_input');
assert.equal(registry.runtime_activation_allowed, false);
assert.deepEqual(Object.keys(registry.subjects), ['historie', 'naeringsliv', 'natur', 'politikk', 'subkultur', 'by']);
assert.equal(baseline.schema, 'aha_history_go_fagverk_subject_content_baseline_v1');
assert.equal(baseline.status, 'review_approval_subject_content_baseline');
assert.equal(baseline.runtime_activation_allowed, false);
assert.deepEqual(Object.keys(baseline.subjects), Object.keys(registry.subjects));

const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aha-fagverk-subject-approvals-'));
const result = spawnSync(process.execPath, ['scripts/build-history-go-fagverk-subject-approvals.mjs', '--all', '--output-root', outputRoot], { encoding: 'utf8' });
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

for (const [subjectId, config] of Object.entries(registry.subjects)) {
  const generatedPath = path.join(outputRoot, path.basename(config.approval_path));
  assert.equal(fs.existsSync(generatedPath), true, `${subjectId}: generated approval exists`);
  assert.equal(fs.existsSync(config.approval_path), true, `${subjectId}: checked approval exists`);
  assert.equal(fs.readFileSync(generatedPath).equals(fs.readFileSync(config.approval_path)), true, `${subjectId}: checked approval is deterministic and current`);
  const approval = JSON.parse(fs.readFileSync(config.approval_path, 'utf8'));
  const subjectBaseline = baseline.subjects[subjectId];
  assert.equal(approval.schema, 'aha_history_go_fagverk_subject_approval_v1');
  assert.equal(approval.status, 'subject_review_approved_not_runtime_active');
  assert.equal(approval.subject_id, subjectId);
  assert.equal(approval.source_ref, subjectBaseline.approved_source_ref);
  assert.equal(approval.observed_release_sha256, subjectBaseline.approved_release_sha256);
  assert.equal(observed.subjects[subjectId].content_sha256, subjectBaseline.subject_content_sha256);
  assert.equal(approval.gate_summary.total, config.gates.length);
  assert.equal(approval.gate_summary.passed, config.gates.length);
  assert.equal(approval.gate_summary.failed, 0);
  assert.equal(approval.gates.every((gate) => gate.passed === true && gate.errors.length === 0), true);
  assert.deepEqual(approval.errors, []);
  assert.equal(approval.approval_scope, 'subject_review_artifacts_only');
  assert.equal(approval.approval_required_for_runtime, true);
  assert.equal(approval.runtime_activation_allowed, false);
  assert.equal(approval.runtime_approved_pointer_changed, false);
  assert.equal(approval.runtime_active_pointer_changed, false);
  assert.equal(approval.explicit_runtime_activation_pull_request_required, true);
}

const byApproval = JSON.parse(fs.readFileSync('data/integrations/approvals/history-go-fagverk-by.approved.v1.json', 'utf8'));
assert.equal(byApproval.candidate.chapter_count, 17);
assert.equal(byApproval.reviewed_corpus.chapter_count, 17);
assert.equal(byApproval.gate_summary.total, 4);
assert.equal(byApproval.gate_summary.passed, 4);
assert.equal(byApproval.source_ref, 'd52cebbe2c6c01e5780be301e9b0e4a9c61c5254');

const compatibilityRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aha-fagverk-subject-compatibility-'));
const advancedObserved = structuredClone(observed);
advancedObserved.source_commit = 'synthetic-next-release-commit';
advancedObserved.release_sha256 = 'synthetic-next-release-digest';
const advancedObservedPath = path.join(compatibilityRoot, 'observed.json');
fs.writeFileSync(advancedObservedPath, `${JSON.stringify(advancedObserved, null, 2)}\n`);
const advancedOutputRoot = path.join(compatibilityRoot, 'approvals');
const advancedResult = spawnSync(process.execPath, ['scripts/build-history-go-fagverk-subject-approvals.mjs', '--all', '--observed', advancedObservedPath, '--output-root', advancedOutputRoot], { encoding: 'utf8' });
assert.equal(advancedResult.status, 0, `${advancedResult.stdout}\n${advancedResult.stderr}`);
for (const [subjectId, config] of Object.entries(registry.subjects)) {
  const approval = JSON.parse(fs.readFileSync(path.join(advancedOutputRoot, path.basename(config.approval_path)), 'utf8'));
  assert.equal(approval.status, 'subject_review_approved_not_runtime_active');
  assert.equal(approval.source_ref, baseline.subjects[subjectId].approved_source_ref);
  assert.equal(approval.observed_release_sha256, baseline.subjects[subjectId].approved_release_sha256);
}

const changedObserved = structuredClone(advancedObserved);
changedObserved.subjects.historie.content_sha256 = 'semantic-history-change';
const changedObservedPath = path.join(compatibilityRoot, 'observed-history-changed.json');
fs.writeFileSync(changedObservedPath, `${JSON.stringify(changedObserved, null, 2)}\n`);
const blockedOutputRoot = path.join(compatibilityRoot, 'blocked');
const blockedResult = spawnSync(process.execPath, ['scripts/build-history-go-fagverk-subject-approvals.mjs', '--subject', 'historie', '--observed', changedObservedPath, '--output-root', blockedOutputRoot], { encoding: 'utf8' });
assert.notEqual(blockedResult.status, 0);
const blockedHistory = JSON.parse(fs.readFileSync(path.join(blockedOutputRoot, 'history-go-fagverk-historie.approved.v1.json'), 'utf8'));
assert.equal(blockedHistory.status, 'subject_review_blocked');
assert.equal(blockedHistory.errors.includes('Observed subject content differs from approved subject-content baseline.'), true);

const businessApproval = JSON.parse(fs.readFileSync('data/integrations/approvals/history-go-fagverk-naeringsliv.approved.v1.json', 'utf8'));
assert.equal(businessApproval.candidate.chapter_count, 12);
assert.equal(businessApproval.gate_summary.total, 5);
assert.notEqual(runtimeApproved.approved_source_commit, observed.source_commit);
assert.notEqual(runtimeActive.active_source_commit, observed.source_commit);
assert.deepEqual(Object.keys(runtimeActive.active_subjects), ['by', 'historie', 'naeringsliv', 'natur', 'politikk', 'subkultur']);
assert.equal(runtimeActive.active_subjects.by.chapter_count, 17);
assert.equal(runtimeActive.active_subjects.by.activation_status, 'runtime_subject_active');
assert.equal(runtimeActive.effective_entry_count, 84);
assert.equal(runtimeCode.includes('data/integrations/approvals'), false);
assert.equal(runtimeCode.includes('subject_review_approved_not_runtime_active'), false);

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.rmSync(compatibilityRoot, { recursive: true, force: true });
console.log('aha-fagverk-subject-approvals tests passed');
