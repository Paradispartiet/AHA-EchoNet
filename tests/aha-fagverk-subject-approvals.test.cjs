const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const registryPath = 'data/integrations/review/history-go-fagverk-subject-approval-registry.v1.json';
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const observed = JSON.parse(fs.readFileSync('data/integrations/history-go-fagverk-release.observed.json', 'utf8'));
const runtimeApproved = JSON.parse(fs.readFileSync('data/integrations/history-go-fagverk-release.approved.json', 'utf8'));
const runtimeActive = JSON.parse(fs.readFileSync('data/integrations/history-go-fagverk-release.runtime-active.json', 'utf8'));
const runtimeCode = fs.readFileSync('backend/aha_engine/app/engine/fagverk_grounding.py', 'utf8');

assert.equal(registry.schema, 'aha_history_go_fagverk_subject_approval_registry_v1');
assert.equal(registry.status, 'review_gate_registry_not_runtime_input');
assert.equal(registry.runtime_activation_allowed, false);
assert.deepEqual(Object.keys(registry.subjects), ['politikk']);

const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aha-fagverk-subject-approvals-'));
const result = spawnSync(process.execPath, ['scripts/build-history-go-fagverk-subject-approvals.mjs', '--all', '--output-root', outputRoot], {
  encoding: 'utf8'
});
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

for (const [subjectId, config] of Object.entries(registry.subjects)) {
  const generatedPath = path.join(outputRoot, path.basename(config.approval_path));
  assert.equal(fs.existsSync(generatedPath), true, `${subjectId}: generated approval exists`);
  assert.equal(fs.existsSync(config.approval_path), true, `${subjectId}: checked approval exists`);
  assert.equal(fs.readFileSync(generatedPath).equals(fs.readFileSync(config.approval_path)), true, `${subjectId}: checked approval is deterministic and current`);

  const approval = JSON.parse(fs.readFileSync(config.approval_path, 'utf8'));
  assert.equal(approval.schema, 'aha_history_go_fagverk_subject_approval_v1');
  assert.equal(approval.status, 'subject_review_approved_not_runtime_active');
  assert.equal(approval.subject_id, subjectId);
  assert.equal(approval.source_ref, observed.source_commit);
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

assert.notEqual(runtimeApproved.approved_source_commit, observed.source_commit);
assert.notEqual(runtimeActive.active_source_commit, observed.source_commit);
assert.equal(runtimeCode.includes('data/integrations/approvals'), false);
assert.equal(runtimeCode.includes('subject_review_approved_not_runtime_active'), false);

fs.rmSync(outputRoot, { recursive: true, force: true });
console.log('aha-fagverk-subject-approvals tests passed');
