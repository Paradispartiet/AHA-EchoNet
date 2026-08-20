const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaV2ControlledWritePilotRollback.js", "utf8"), context, {
  filename: "js/ahaV2ControlledWritePilotRollback.js"
});

const api = context.AHAV2ControlledWritePilotRollback;
assert.ok(api);
assert.equal(api.CONTRACT_SCHEMA, "aha_v2_controlled_write_pilot_rollback_contract_v1");

const proof = JSON.parse(fs.readFileSync(
  "tests/fixtures/semantic-live-reviewed-v2/controlled-activation-production-v1/proof.json",
  "utf8"
));
const provenance = JSON.parse(fs.readFileSync(
  "tests/fixtures/semantic-live-reviewed-v2/controlled-activation-production-v1/provenance.json",
  "utf8"
));

const proposal = api.defaultPilotProposal();
const proposalBefore = JSON.stringify(proposal);
const proofBefore = JSON.stringify(proof);
const provenanceBefore = JSON.stringify(provenance);
const result = api.assess({ proof, provenance, proposal });

assert.equal(result.status, "ready", JSON.stringify(result));
assert.equal(result.mode, "readiness_only");
assert.equal(result.production_rollback_ready, true);
assert.equal(result.eligible_for_controlled_write_pilot_activation, false);
assert.deepEqual(Array.from(result.blocking_reasons), []);
assert.equal(result.pilot.scope, "single_local_chamber_insight");
assert.equal(result.pilot.max_chamber_records_created, 1);
assert.equal(result.pilot.batch_activation, false);
assert.equal(result.pilot.automatic_activation, false);
assert.equal(result.pilot.review_approval_required, true);
assert.equal(result.pilot.canonical_approval_required, true);
assert.equal(result.pilot.rollback_approval_required, true);
assert.equal(result.pilot.backend_sync_allowed, false);
assert.equal(result.pilot.backend_persistent_write_allowed, false);
assert.equal(result.pilot.meta_write_allowed, false);
assert.equal(result.pilot.remote_write_allowed, false);
assert.equal(result.pilot.normal_chat_persistence_allowed, false);
assert.equal(result.pilot.automatic_backfill_allowed, false);
assert.equal(result.pilot.projection_store_write_allowed, false);
assert.deepEqual(Array.from(result.pilot.rollback_target_binding), [
  "canonical_insight_id",
  "review_id",
  "canonical_signature",
  "recalculated_canonical_signature"
]);

assert.equal(result.proof.workflow_run_id, 32369823544);
assert.equal(result.proof.production_main, "ed1db452088232146702fabdf9f9543bb9f0d959");
assert.equal(result.proof.frontend_origin, "https://paradispartiet.github.io/AHA-EchoNet");
assert.equal(result.proof.rollback_status, "rolled_back");
assert.equal(result.proof.artifact_id, 9406690486);
assert.equal(result.proof.artifact_digest, "sha256:711124204415c7082987c79cd99e64000a68a001ff0d5db3d990272b2a12e305");
assert.equal(result.rollback_contract.controller, "AHAInsightActivationV2");
assert.equal(result.rollback_contract.prepare_method, "prepareRollback");
assert.equal(result.rollback_contract.approve_method, "approveRollback");
assert.equal(result.rollback_contract.approval_required, true);
assert.equal(result.rollback_contract.exact_target_binding_required, true);
assert.equal(result.rollback_contract.state_drift_fails_closed, true);
assert.equal(result.rollback_contract.unrelated_chamber_records_preserved, true);
assert.equal(result.rollback_contract.backend_sync_blocked_while_record_present, true);
assert.equal(result.rollback_contract.production_proof_live, true);

for (const [key, value] of Object.entries(result.policy)) {
  if (key === "gate_is_readiness_only" || key === "separate_activation_pr_required") {
    assert.equal(value, true, `${key} must stay true`);
  } else {
    assert.equal(value, false, `${key} must stay false`);
  }
}

assert.equal(JSON.stringify(proposal), proposalBefore, "proposal must remain immutable");
assert.equal(JSON.stringify(proof), proofBefore, "proof must remain immutable");
assert.equal(JSON.stringify(provenance), provenanceBefore, "provenance must remain immutable");
assert.deepEqual(api.assess({ proof, provenance, proposal }), result, "readiness must be deterministic");

// The pilot must remain exactly one local record; every authority expansion fails closed.
const proposalFailures = [
  ["scope", "batch_local_chamber_insights"],
  ["max_chamber_records_created", 2],
  ["batch_activation", true],
  ["automatic_activation", true],
  ["review_approval_required", false],
  ["canonical_approval_required", false],
  ["rollback_approval_required", false],
  ["approval_challenges_single_use", false],
  ["state_drift_behavior", "overwrite"],
  ["unrelated_chamber_records_preserved", false],
  ["backend_sync_allowed", true],
  ["backend_persistent_write_allowed", true],
  ["meta_write_allowed", true],
  ["remote_write_allowed", true],
  ["normal_chat_persistence_allowed", true],
  ["automatic_backfill_allowed", true],
  ["projection_store_write_allowed", true]
];
for (const [field, value] of proposalFailures) {
  const changed = { ...proposal, [field]: value };
  const blocked = api.assess({ proof, provenance, proposal: changed });
  assert.equal(blocked.status, "blocked", `${field} must block rollback readiness`);
  assert.equal(blocked.production_rollback_ready, false);
  assert.equal(blocked.eligible_for_controlled_write_pilot_activation, false);
  assert.ok(blocked.blocking_reasons.includes(`pilot_contract_mismatch:${field}`));
}
const badBinding = {
  ...proposal,
  rollback_target_binding: ["canonical_insight_id", "review_id"]
};
const badBindingResult = api.assess({ proof, provenance, proposal: badBinding });
assert.equal(badBindingResult.status, "blocked");
assert.ok(badBindingResult.blocking_reasons.includes("pilot_contract_mismatch:rollback_target_binding"));

// Every critical property of the permanent live production proof is fail-closed.
function clone(value) { return JSON.parse(JSON.stringify(value)); }
const proofMutations = [
  (p) => { p.schema = "wrong"; },
  (p) => { p.workflow_run_id = 1; },
  (p) => { p.expected_production_main = "wrong"; },
  (p) => { p.frontend.origin = "https://wrong.invalid"; },
  (p) => { p.activation.canonical_insight_id = ""; },
  (p) => { p.activation.chamber_ids_after_rollback = ["different"]; },
  (p) => { p.activation.chamber_ids_after_promotion.push("unexpected_second_write"); },
  (p) => { p.activation.rollback_status = "failed"; },
  (p) => { p.activation.repository_save_calls = 1; },
  (p) => { p.activation.repository_load_calls = 1; },
  (p) => { p.activation.sync_push = { ok: true }; },
  (p) => { p.activation.sync_pull = { ok: true }; },
  (p) => { p.activation.audit_event_count = 8; },
  (p) => { p.activation.audit_tail_hash = "bad"; },
  (p) => { p.activation.dispatched_actions = ["review_committed", "canonical_committed"]; },
  (p) => { p.policy.backend_persistent_write = true; },
  (p) => { p.policy.production_proof_passed = false; }
];
for (const mutate of proofMutations) {
  const changed = clone(proof);
  mutate(changed);
  const blocked = api.assess({ proof: changed, provenance, proposal });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.production_rollback_ready, false);
}

const provenanceMutations = [
  (p) => { p.schema = "wrong"; },
  (p) => { p.production_main = "wrong"; },
  (p) => { p.workflow_run_id = 1; },
  (p) => { p.workflow_job_id = 1; },
  (p) => { p.artifact_id = 1; },
  (p) => { p.artifact_digest = "wrong"; },
  (p) => { p.temporary_pull_request = 999; },
  (p) => { p.temporary_pull_request_disposition = "merged"; },
  (p) => { p.deployment_context.github_pages_main = "unknown"; }
];
for (const mutate of provenanceMutations) {
  const changed = clone(provenance);
  mutate(changed);
  const blocked = api.assess({ proof, provenance: changed, proposal });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.production_rollback_ready, false);
}

// Lock the controller semantics the readiness contract depends on. This does not execute a write.
const controllerSource = fs.readFileSync("js/ahaInsightActivationV2.js", "utf8");
for (const pattern of [
  /function prepareRollback\(/,
  /async function approveRollback\(/,
  /activation_rollback_binding_changed/,
  /activation_rollback_target_mismatch/,
  /activation_rollback_target_modified/,
  /insightForSignature\.activation_v2\.canonical_signature/,
  /chamber\.insights\.splice\(index, 1\)/,
  /review\.status = "rolled_back"/,
  /restoreRaw\(chamberStorageKey, beforeChamber\)/,
  /backend_sync_allowed: false/,
  /meta_write_allowed: false/
]) assert.match(controllerSource, pattern);

// The readiness module itself must remain pure and unable to activate or roll back anything.
const source = fs.readFileSync("js/ahaV2ControlledWritePilotRollback.js", "utf8");
for (const [pattern, label] of [
  [/localStorage\s*\./, "localStorage"],
  [/AHARepository\s*\./, "repository"],
  [/supabase\s*\./i, "Supabase"],
  [/\bfetch\s*\(/, "fetch"],
  [/\.prepareReview\s*\(/, "review activation"],
  [/\.approveReview\s*\(/, "review approval"],
  [/\.prepareCanonical\s*\(/, "canonical preparation"],
  [/\.approveCanonical\s*\(/, "canonical approval"],
  [/\.prepareRollback\s*\(/, "rollback preparation"],
  [/\.approveRollback\s*\(/, "rollback execution"]
]) assert.equal(pattern.test(source), false, `readiness module must not contain ${label}`);

console.log("aha-v2-controlled-write-pilot-rollback.test.cjs: OK");
