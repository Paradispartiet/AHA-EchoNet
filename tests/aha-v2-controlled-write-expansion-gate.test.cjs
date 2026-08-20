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
assert.equal(current.decision, "NO_GO");
assert.equal(current.eligible_for_bounded_expansion_pilot, false);
assert.equal(current.eligible_for_expansion_activation, false);
assert.equal(current.eligible_for_normal_chat_persistence, false);
assert.deepEqual(Array.from(current.blocking_reasons), evidence.expected_blockers);
assert.equal(current.checks.filter((check) => check.passed).length, 6);
assert.equal(current.checks.filter((check) => !check.passed).length, 6);
assert.match(current.next_action, /Collect the missing bounded-expansion evidence/);
assert.equal(current.policy.current_one_record_pilot_max_records, 1);
assert.equal(current.policy.current_one_record_pilot_budget_may_change, false);
assert.equal(current.policy.expansion_runtime_open, false);

const scope = gate.validateScopeContract(evidence.expansion_scope_contract);
assert.equal(scope.valid, true, JSON.stringify(scope));
assert.equal(scope.max_records, 2);
assert.equal(scope.scope_id, "bounded_local_chamber_two_record_candidate_v1");
assert.equal(scope.scope_fingerprint, "ee6952eef3517af8a868c83e4424125c70591af42ff4f568e76a8bba4aa3b5f8");

// The decision algorithm still permits a bounded candidate only when every
// invalidated proof dimension is explicitly replaced by fresh green evidence.
const fullyReproved = clone(evidence);
fullyReproved.multi_record_rollback_rehearsal_proven = true;
fullyReproved.rollback_each_record_exactly_bound = true;
fullyReproved.partial_failure_compensation_proven = true;
fullyReproved.compensation_restores_exact_pre_run_state = true;
fullyReproved.idempotent_multi_record_replay_proven = true;
fullyReproved.multi_record_state_drift_fail_closed_proven = true;
fullyReproved.production_expansion_canary_proof = true;
fullyReproved.production_canary_coverage_complete = true;
fullyReproved.no_unexpected_persistence_write_observed = true;
const eligible = gate.evaluate({ evidence: fullyReproved, one_record_pilot_proof: oneRecordProof });
assert.equal(eligible.decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
assert.equal(eligible.eligible_for_bounded_expansion_pilot, true);
assert.equal(eligible.eligible_for_expansion_activation, false);
assert.equal(eligible.policy.current_one_record_pilot_max_records, 1);

const unsafeScope = clone(evidence);
unsafeScope.expansion_scope_contract.max_chamber_records_created = 1;
const unsafeResult = gate.evaluate({ evidence: unsafeScope, one_record_pilot_proof: oneRecordProof });
assert.equal(unsafeResult.decision, "NO_GO");
assert.ok(Array.from(unsafeResult.blocking_reasons).includes("expansion_scope_contract_missing_or_invalid"));

for (const field of [
  "normal_chat_persistence_open", "automatic_backfill_open", "backend_sync_open",
  "backend_persistent_write_open", "broad_canonical_write_open", "projection_store_write_open",
  "meta_write_open", "remote_write_open", "automatic_activation_open", "batch_activation_open"
]) {
  const value = clone(fullyReproved);
  value[field] = true;
  const result = gate.evaluate({ evidence: value, one_record_pilot_proof: oneRecordProof });
  assert.equal(result.decision, "NO_GO", `${field} must fail closed`);
  assert.ok(Array.from(result.blocking_reasons).includes("expansion_authority_leak_observation_missing"));
}

assert.doesNotMatch(source, /localStorage\.|sessionStorage\.|indexedDB\.|fetch\(|XMLHttpRequest|saveChamber|setItem\(|removeItem\(/u);
assert.match(source, /current_one_record_pilot_max_records: 1/u);
assert.match(source, /current_one_record_pilot_budget_may_change: false/u);
assert.match(source, /separate_activation_pr_required: true/u);
assert.match(source, /fresh_post_activation_production_proof_required: true/u);
console.log("aha-v2-controlled-write-expansion-gate.test.cjs: OK");
