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
assert.ok(gate);
const clone = (value) => JSON.parse(JSON.stringify(value));

const baseline = gate.validateOneRecordPilotProof(oneRecordProof);
assert.equal(baseline.valid, true, JSON.stringify(baseline));
assert.equal(baseline.identity.production_main, "486c9f53096e381bc9aeb4e20521d3700633366d");

const current = gate.evaluate({ evidence, one_record_pilot_proof: oneRecordProof });
assert.equal(current.schema, "aha_v2_controlled_write_expansion_gate_v1");
assert.equal(current.mode, "decision_only");
assert.equal(current.decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
assert.equal(current.eligible_for_bounded_expansion_pilot, true);
assert.equal(current.eligible_for_expansion_activation, false);
assert.equal(current.eligible_for_normal_chat_persistence, false);
assert.deepEqual(Array.from(current.blocking_reasons), []);
assert.equal(current.checks.length, 12);
assert.equal(current.checks.filter((check) => check.passed).length, 12);
assert.equal(current.checks.filter((check) => !check.passed).length, 0);
assert.equal(current.policy.current_one_record_pilot_max_records, 1);
assert.equal(current.policy.current_one_record_pilot_budget_may_change, false);
assert.equal(current.policy.expansion_runtime_open, false);
assert.equal(evidence.current_decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
assert.deepEqual(evidence.expected_blockers, []);
assert.equal(evidence.expansion_temporary_pull_request, 867);
assert.equal(evidence.expansion_workflow_run_id, 32421978733);
assert.equal(evidence.expansion_artifact_id, 9426036702);
assert.equal(evidence.expansion_proof_revision, "corrected_v2");
assert.equal(evidence.corrected_proof_controls.later_target_drift_ordinal, 2);
assert.equal(evidence.corrected_proof_controls.indexeddb_snapshot_mode, "stable_keys_values_sha256");
assert.equal(evidence.corrected_proof_controls.execution_source, "hash_verified_deployed_asset_copies");

const scope = gate.validateScopeContract(evidence.expansion_scope_contract);
assert.equal(scope.valid, true, JSON.stringify(scope));
assert.equal(scope.max_records, 2);
assert.equal(scope.scope_id, "bounded_local_chamber_two_record_candidate_v1");
assert.equal(scope.scope_fingerprint, "ee6952eef3517af8a868c83e4424125c70591af42ff4f568e76a8bba4aa3b5f8");

const evidenceRequirements = [
  ["multi_record_rollback_rehearsal_proven", "multi_record_rollback_proof_missing"],
  ["rollback_each_record_exactly_bound", "multi_record_rollback_proof_missing"],
  ["unrelated_chamber_records_preserved", "multi_record_rollback_proof_missing"],
  ["partial_failure_compensation_proven", "partial_failure_compensation_proof_missing"],
  ["compensation_restores_exact_pre_run_state", "partial_failure_compensation_proof_missing"],
  ["idempotent_multi_record_replay_proven", "idempotent_multi_record_replay_proof_missing"],
  ["identical_replay_write_count_zero", "idempotent_multi_record_replay_proof_missing"],
  ["multi_record_state_drift_fail_closed_proven", "multi_record_state_drift_proof_missing"],
  ["production_expansion_canary_proof", "expansion_production_canary_proof_missing"],
  ["production_canary_coverage_complete", "expansion_production_canary_proof_missing"],
  ["deployment_commit_matches_candidate_main", "expansion_deploy_parity_missing"],
  ["no_unexpected_persistence_write_observed", "expansion_no_write_observation_missing"],
  ["no_authority_leak_observed", "expansion_authority_leak_observation_missing"],
  ["production_evidence_redacted", "expansion_proof_redaction_missing"],
  ["current_one_record_pilot_budget_unchanged", "current_pilot_boundary_not_preserved"],
  ["separate_activation_pr_required", "current_pilot_boundary_not_preserved"],
  ["fresh_post_activation_production_proof_required", "current_pilot_boundary_not_preserved"]
];
for (const [field, expectedBlocker] of evidenceRequirements) {
  const value = clone(evidence);
  value[field] = false;
  const result = gate.evaluate({ evidence: value, one_record_pilot_proof: oneRecordProof });
  assert.equal(result.decision, "NO_GO", `${field} must fail closed`);
  assert.ok(Array.from(result.blocking_reasons).includes(expectedBlocker), `${field} should report ${expectedBlocker}`);
}

for (const field of ["raw_source_text_in_evidence", "raw_evidence_quotes_in_evidence", "signatures_in_evidence"]) {
  const value = clone(evidence);
  value[field] = true;
  const result = gate.evaluate({ evidence: value, one_record_pilot_proof: oneRecordProof });
  assert.equal(result.decision, "NO_GO", `${field} must fail closed`);
  assert.ok(Array.from(result.blocking_reasons).includes("expansion_proof_redaction_missing"));
}

const badMax = clone(evidence);
badMax.current_one_record_pilot_max_records = 2;
const badMaxResult = gate.evaluate({ evidence: badMax, one_record_pilot_proof: oneRecordProof });
assert.equal(badMaxResult.decision, "NO_GO");
assert.ok(Array.from(badMaxResult.blocking_reasons).includes("current_pilot_boundary_not_preserved"));

// The decision gate intentionally accepts bounded multi-record contracts larger
// than two at the schema layer. With only two production canaries, max=3 must
// still fail closed on coverage. Exact immutable max=2 binding is enforced by
// the rehearsal/runtime proof and separately regression-tested there.
const uncoveredScope = clone(evidence);
uncoveredScope.expansion_scope_contract.max_chamber_records_created = 3;
const uncoveredResult = gate.evaluate({ evidence: uncoveredScope, one_record_pilot_proof: oneRecordProof });
assert.equal(uncoveredResult.decision, "NO_GO");
assert.ok(Array.from(uncoveredResult.blocking_reasons).includes("expansion_production_canary_proof_missing"));
assert.equal(gate.validateScopeContract(uncoveredScope.expansion_scope_contract).valid, true);

// A real scope-contract violation must fail the dedicated scope check.
const invalidScope = clone(evidence);
invalidScope.expansion_scope_contract.activation_mode = "automatic";
const invalidScopeResult = gate.evaluate({ evidence: invalidScope, one_record_pilot_proof: oneRecordProof });
assert.equal(invalidScopeResult.decision, "NO_GO");
assert.ok(Array.from(invalidScopeResult.blocking_reasons).includes("expansion_scope_contract_missing_or_invalid"));
assert.equal(gate.validateScopeContract(invalidScope.expansion_scope_contract).valid, false);

for (const field of [
  "normal_chat_persistence_open", "automatic_backfill_open", "backend_sync_open",
  "backend_persistent_write_open", "broad_canonical_write_open", "projection_store_write_open",
  "meta_write_open", "remote_write_open", "automatic_activation_open", "batch_activation_open"
]) {
  const value = clone(evidence);
  value[field] = true;
  const result = gate.evaluate({ evidence: value, one_record_pilot_proof: oneRecordProof });
  assert.equal(result.decision, "NO_GO", `${field} must fail closed`);
  assert.ok(Array.from(result.blocking_reasons).includes("expansion_authority_leak_observation_missing"));
}

const brokenBaseline = clone(oneRecordProof);
brokenBaseline.status = "invalid";
const brokenBaselineResult = gate.evaluate({ evidence, one_record_pilot_proof: brokenBaseline });
assert.equal(brokenBaselineResult.decision, "NO_GO");
assert.ok(Array.from(brokenBaselineResult.blocking_reasons).includes("one_record_pilot_proof_not_ready"));

assert.doesNotMatch(source, /localStorage\.|sessionStorage\.|indexedDB\.|fetch\(|XMLHttpRequest|saveChamber|setItem\(|removeItem\(/u);
assert.match(source, /current_one_record_pilot_max_records: 1/u);
assert.match(source, /current_one_record_pilot_budget_may_change: false/u);
assert.match(source, /separate_activation_pr_required: true/u);
assert.match(source, /fresh_post_activation_production_proof_required: true/u);
console.log("aha-v2-controlled-write-expansion-gate.test.cjs: corrected current evidence is 12/12 green and fail-closed under mutation");
