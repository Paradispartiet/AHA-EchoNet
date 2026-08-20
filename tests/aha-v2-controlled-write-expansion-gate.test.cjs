const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const sourcePath = "js/ahaV2ControlledWriteExpansionGate.js";
const source = fs.readFileSync(sourcePath, "utf8");
const evidence = JSON.parse(fs.readFileSync("ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json", "utf8"));
const oneRecordProof = JSON.parse(fs.readFileSync("ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json", "utf8"));

const context = { globalThis: null };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: sourcePath });
const gate = context.AHAV2ControlledWriteExpansionGate;
assert.ok(gate, "expansion gate must register");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const baseline = gate.validateOneRecordPilotProof(oneRecordProof);
assert.equal(baseline.valid, true, JSON.stringify(baseline));
assert.deepEqual(Array.from(baseline.blocking_reasons), []);
assert.equal(baseline.identity.production_main, "486c9f53096e381bc9aeb4e20521d3700633366d");
assert.equal(baseline.identity.workflow_run_id, 32411347026);
assert.equal(baseline.identity.artifact_id, 9422272974);

const current = gate.evaluate({ evidence, one_record_pilot_proof: oneRecordProof });
assert.equal(current.schema, "aha_v2_controlled_write_expansion_gate_v1");
assert.equal(current.mode, "decision_only");
assert.equal(current.decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
assert.equal(current.eligible_for_bounded_expansion_pilot, true);
assert.equal(current.eligible_for_expansion_activation, false);
assert.equal(current.eligible_for_normal_chat_persistence, false);
assert.deepEqual(Array.from(current.blocking_reasons), []);
assert.deepEqual(evidence.expected_blockers, []);
assert.equal(current.checks.filter((check) => check.passed).length, 12);
assert.equal(current.checks.filter((check) => !check.passed).length, 0);
assert.equal(current.evaluated_scope.scope_id, "bounded_local_chamber_two_record_candidate_v1");
assert.equal(current.evaluated_scope.max_chamber_records_created, 2);
assert.equal(current.policy.current_one_record_pilot_max_records, 1);
assert.equal(current.policy.current_one_record_pilot_budget_may_change, false);
assert.equal(current.policy.expansion_runtime_open, false);
assert.equal(current.policy.separate_activation_pr_required, true);
assert.equal(current.policy.fresh_post_activation_production_proof_required, true);
assert.match(current.next_action, /separate explicit activation PR/);

const scope = gate.validateScopeContract(evidence.expansion_scope_contract);
assert.equal(scope.valid, true, JSON.stringify(scope));
assert.equal(scope.max_records, 2);
assert.equal(scope.scope_id, "bounded_local_chamber_two_record_candidate_v1");

const invalidScopes = [
  ["max=1", { max_chamber_records_created: 1 }, "expansion_scope_not_larger_than_current_pilot"],
  ["batch", { batch_activation: true }, "expansion_scope_batch_activation_open"],
  ["automatic", { automatic_activation: true }, "expansion_scope_automatic_activation_open"],
  ["review approval", { review_approval_per_record: false }, "expansion_scope_review_approval_missing"],
  ["canonical approval", { canonical_approval_per_record: false }, "expansion_scope_canonical_approval_missing"],
  ["rollback approval", { rollback_approval_per_record: false }, "expansion_scope_rollback_approval_missing"],
  ["source binding", { source_binding_per_record: false }, "expansion_scope_source_binding_missing"],
  ["budget persistence", { lifetime_budget_persists_after_rollback: false }, "expansion_scope_budget_reopen_risk"],
  ["sentinel protection", { unrelated_chamber_records_preserved: false }, "expansion_scope_unrelated_state_not_protected"],
  ["fingerprint", { scope_fingerprint: "not-a-hash" }, "expansion_scope_fingerprint_invalid"]
];
for (const [label, patch, blocker] of invalidScopes) {
  const candidate = { ...clone(evidence.expansion_scope_contract), ...patch };
  const result = gate.validateScopeContract(candidate);
  assert.equal(result.valid, false, `${label} must fail`);
  assert.ok(Array.from(result.blocking_reasons).includes(blocker), `${label} must include ${blocker}`);
}

const independentFailures = [
  ["baseline permanent", (value) => { value.one_record_pilot_proof_permanent = false; }, "one_record_pilot_proof_not_ready"],
  ["scope", (value) => { value.expansion_scope_contract = null; }, "expansion_scope_contract_missing_or_invalid"],
  ["rollback", (value) => { value.multi_record_rollback_rehearsal_proven = false; }, "multi_record_rollback_proof_missing"],
  ["compensation", (value) => { value.partial_failure_compensation_proven = false; }, "partial_failure_compensation_proof_missing"],
  ["idempotence", (value) => { value.idempotent_multi_record_replay_proven = false; }, "idempotent_multi_record_replay_proof_missing"],
  ["state drift", (value) => { value.multi_record_state_drift_fail_closed_proven = false; }, "multi_record_state_drift_proof_missing"],
  ["canary", (value) => { value.production_expansion_canary_count = 1; }, "expansion_production_canary_proof_missing"],
  ["deploy", (value) => { value.deployed_commit_sha = "2222222222222222222222222222222222222222"; }, "expansion_deploy_parity_missing"],
  ["unexpected write", (value) => { value.no_unexpected_persistence_write_observed = false; }, "expansion_no_write_observation_missing"],
  ["authority observation", (value) => { value.no_authority_leak_observed = false; }, "expansion_authority_leak_observation_missing"],
  ["redaction", (value) => { value.raw_source_text_in_evidence = true; }, "expansion_proof_redaction_missing"],
  ["current boundary", (value) => { value.current_one_record_pilot_max_records = 2; }, "current_pilot_boundary_not_preserved"]
];
for (const [label, mutate, blocker] of independentFailures) {
  const value = clone(evidence);
  mutate(value);
  const result = gate.evaluate({ evidence: value, one_record_pilot_proof: oneRecordProof });
  assert.equal(result.decision, "NO_GO", `${label} must fail closed`);
  assert.ok(Array.from(result.blocking_reasons).includes(blocker), `${label} must include ${blocker}`);
  assert.equal(result.policy.current_one_record_pilot_max_records, 1);
  assert.equal(result.policy.current_one_record_pilot_budget_may_change, false);
  assert.equal(result.eligible_for_expansion_activation, false);
}

const authorityFields = [
  "normal_chat_persistence_open",
  "automatic_backfill_open",
  "backend_sync_open",
  "backend_persistent_write_open",
  "broad_canonical_write_open",
  "projection_store_write_open",
  "meta_write_open",
  "remote_write_open",
  "automatic_activation_open",
  "batch_activation_open"
];
for (const field of authorityFields) {
  const value = clone(evidence);
  value[field] = true;
  const result = gate.evaluate({ evidence: value, one_record_pilot_proof: oneRecordProof });
  assert.equal(result.decision, "NO_GO", `${field} must fail closed`);
  assert.ok(Array.from(result.blocking_reasons).includes("expansion_authority_leak_observation_missing"));
  assert.equal(result.eligible_for_expansion_activation, false);
}

const modifiedBaseline = clone(oneRecordProof);
modifiedBaseline.pilot.reload_second_activation_error = "allowed";
const badBaseline = gate.evaluate({ evidence, one_record_pilot_proof: modifiedBaseline });
assert.equal(badBaseline.decision, "NO_GO");
assert.ok(Array.from(badBaseline.blocking_reasons).includes("one_record_pilot_proof_not_ready"));

const deterministicA = gate.evaluate({ evidence, one_record_pilot_proof: oneRecordProof });
const deterministicB = gate.evaluate({ evidence, one_record_pilot_proof: oneRecordProof });
assert.equal(deterministicA.gate_id, deterministicB.gate_id);

assert.doesNotMatch(source, /localStorage\.|sessionStorage\.|indexedDB\.|fetch\(|XMLHttpRequest|saveChamber|setItem\(|removeItem\(/u);
assert.match(source, /current_one_record_pilot_max_records: 1/u);
assert.match(source, /current_one_record_pilot_budget_may_change: false/u);
assert.match(source, /separate_activation_pr_required: true/u);
assert.match(source, /fresh_post_activation_production_proof_required: true/u);

console.log("aha-v2-controlled-write-expansion-gate.test.cjs: OK");
