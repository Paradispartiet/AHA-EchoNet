const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaV2ControlledWritePilotRollback.js", "utf8"), context);
const api = context.AHAV2ControlledWritePilotRollback;

const proof = JSON.parse(fs.readFileSync(
  "tests/fixtures/semantic-live-reviewed-v2/controlled-activation-production-v1/proof.json",
  "utf8"
));
const provenance = JSON.parse(fs.readFileSync(
  "tests/fixtures/semantic-live-reviewed-v2/controlled-activation-production-v1/provenance.json",
  "utf8"
));
const evidence = JSON.parse(fs.readFileSync(
  "ops/evidence/aha-v2-controlled-write-pilot-rollback-v1.json",
  "utf8"
));
const assessed = api.assess({ proof, provenance, proposal: api.defaultPilotProposal() });

assert.equal(assessed.status, "ready");
assert.equal(assessed.production_rollback_ready, true);
assert.equal(assessed.eligible_for_controlled_write_pilot_activation, false);
assert.equal(evidence.status, "ready");
assert.equal(evidence.production_rollback_ready, true);
assert.equal(evidence.eligible_for_controlled_write_pilot_activation, false);
assert.equal(evidence.pilot_scope, assessed.pilot.scope);
assert.equal(evidence.max_chamber_records_created, assessed.pilot.max_chamber_records_created);
assert.equal(evidence.activation_controller, assessed.rollback_contract.controller);
assert.equal(evidence.activation_controller_schema, assessed.pilot.activation_controller_schema);
assert.equal(evidence.rollback_prepare_method, assessed.rollback_contract.prepare_method);
assert.equal(evidence.rollback_approve_method, assessed.rollback_contract.approve_method);
assert.deepEqual(evidence.rollback_exact_target_binding, Array.from(assessed.pilot.rollback_target_binding));
assert.equal(evidence.state_drift_behavior, assessed.pilot.state_drift_behavior);
assert.equal(evidence.unrelated_chamber_records_preserved, assessed.pilot.unrelated_chamber_records_preserved);
assert.equal(evidence.backend_sync_allowed, false);
assert.equal(evidence.backend_persistent_write_allowed, false);
assert.equal(evidence.meta_write_allowed, false);
assert.equal(evidence.remote_write_allowed, false);
assert.equal(evidence.normal_chat_persistence_allowed, false);
assert.equal(evidence.automatic_backfill_allowed, false);
assert.equal(evidence.projection_store_write_allowed, false);
assert.equal(evidence.production_proof.workflow_run_id, assessed.proof.workflow_run_id);
assert.equal(evidence.production_proof.workflow_job_id, api.LOCKED_PROOF.workflow_job_id);
assert.equal(evidence.production_proof.artifact_id, assessed.proof.artifact_id);
assert.equal(evidence.production_proof.artifact_digest, assessed.proof.artifact_digest);
assert.equal(evidence.production_proof.production_main, assessed.proof.production_main);
assert.equal(evidence.production_proof.frontend_origin, assessed.proof.frontend_origin);
assert.equal(evidence.production_proof.rollback_status, assessed.proof.rollback_status);
assert.equal(evidence.production_proof.repository_save_calls, 0);
assert.equal(evidence.production_proof.repository_load_calls, 0);
assert.equal(evidence.production_proof.sync_push_reason, "local_only_insight_activation_present");
assert.equal(evidence.production_proof.sync_pull_reason, "local_only_insight_activation_present");
assert.equal(evidence.production_proof.github_pages_main, "deployed_and_hash_verified");
assert.equal(evidence.production_proof.temporary_probe_pr, 834);
assert.equal(evidence.production_proof.temporary_probe_disposition, "closed_without_merge");
assert.equal(evidence.decision_boundary.readiness_only, true);
assert.equal(evidence.decision_boundary.may_prepare_activation, false);
assert.equal(evidence.decision_boundary.may_approve_activation, false);
assert.equal(evidence.decision_boundary.may_execute_rollback, false);
assert.equal(evidence.decision_boundary.separate_activation_pr_required, true);

console.log("aha-v2-controlled-write-pilot-rollback-evidence.test.cjs: OK");
