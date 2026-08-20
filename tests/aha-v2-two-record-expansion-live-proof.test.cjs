const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");

const proofPath = "ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json";
const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

assert.equal(proof.schema, "aha_v2_two_record_expansion_live_proof_v1");
assert.equal(proof.version, 1);
assert.equal(proof.status, "invalidated_by_post_merge_review");
assert.equal(proof.expected_production_main, "2a0c6e0b19d92681cc4a51bd46efc3e2b824fc8c");
assert.equal(proof.proof_identity.temporary_pull_request, 860);
assert.equal(proof.proof_identity.temporary_pull_request_disposition, "closed_without_merge");
assert.equal(proof.proof_identity.workflow_run_id, 32415006998);
assert.equal(proof.proof_identity.workflow_job_id, 96574038093);
assert.equal(proof.proof_identity.artifact_id, 9423564833);
assert.equal(proof.proof_identity.artifact_digest, "sha256:a2a30b3e0380345dddf346f090780fda4cec5c7497865cf91878b61622d504d6");

// Preserve the exact historical observation without treating it as current
// authority. The deployed bytes did match the old candidate at observation time.
assert.equal(proof.deployment.authority, "github_pages");
assert.equal(proof.deployment.pages_commit, proof.expected_production_main);
assert.equal(proof.deployment.pages_status, "built");
assert.equal(proof.deployment.product_diff_count, 0);
assert.equal(proof.deployment.all_assets_match_at_observation_time, true);
assert.equal(proof.deployment.assets.length, 5);
for (const asset of proof.deployment.assets) {
  assert.equal(asset.match, true, `${asset.path} was deployment-matched at observation time`);
  assert.match(asset.sha256, /^[a-f0-9]{64}$/u);
}

// The hardened rehearsal must no longer match the historical #860 runtime hash.
const rehearsalAsset = proof.deployment.assets.find((asset) => asset.path === "js/ahaV2ControlledWriteExpansionRehearsal.js");
assert.ok(rehearsalAsset, "historical rehearsal asset must be recorded");
assert.notEqual(
  sha256File(rehearsalAsset.path),
  rehearsalAsset.sha256,
  "hardened rehearsal runtime must differ from the invalidated production-proof bytes"
);

assert.equal(proof.scope.scope_id, "bounded_local_chamber_two_record_candidate_v1");
assert.equal(proof.scope.max_chamber_records_created, 2);
assert.equal(proof.scope.candidate_only, true);
assert.equal(proof.scope.activation_authority, false);

// These are historical observations only; review showed they were insufficient
// to support a current green expansion decision.
assert.equal(proof.canaries.count, 2);
assert.equal(proof.canaries.coverage_complete_at_observation_time, true);
assert.equal(proof.canaries.first_apply_write_count, 2);
assert.equal(proof.canaries.identical_replay_write_count, 0);
assert.equal(proof.canaries.rollback_status, "rolled_back");
assert.equal(proof.canaries.partial_failure_compensation_status, "compensated");
assert.equal(proof.canaries.state_drift_status, "manual_review_required");
assert.equal(proof.canaries.state_drift_rolled_back_count, 0);
assert.equal(proof.canaries.unrelated_sentinel_preserved, true);

assert.equal(proof.browser_boundary.local_storage_unchanged, true);
assert.equal(proof.browser_boundary.session_storage_unchanged, true);
assert.equal(proof.browser_boundary.indexeddb_unchanged_claimed, true);
assert.equal(proof.browser_boundary.indexeddb_content_digest_proven, false);
assert.equal(proof.browser_boundary.unexpected_write_request_count, 0);

assert.equal(proof.decision_at_observation_time.expansion_gate_decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
assert.equal(proof.decision_at_observation_time.eligible_for_expansion_activation, false);
assert.equal(proof.decision_at_observation_time.current_one_record_pilot_max_records, 1);

assert.equal(proof.review_invalidation.current_gate_usable, false);
assert.equal(proof.review_invalidation.fresh_corrected_production_proof_required, true);
assert.equal(proof.review_invalidation.runtime_scope_binding_gap, true);
assert.equal(proof.review_invalidation.runtime_replay_cleanup_gap, true);
assert.equal(proof.review_invalidation.runtime_rollback_remove_compensation_gap, true);
assert.equal(proof.review_invalidation.indexeddb_content_digest_missing, true);
assert.equal(proof.review_invalidation.later_record_drift_probe_missing, true);
assert.equal(proof.review_invalidation.review_threads.length, 5);

[
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
].forEach((field) => assert.equal(proof.policy[field], false, `${field} must remain closed`));
assert.equal(proof.policy.separate_activation_pr_required, true);
assert.equal(proof.policy.fresh_post_activation_production_proof_required, true);
assert.equal(proof.redaction.user_production_data_modified, false);

assert.equal(fs.existsSync(".github/workflows/TEMP-aha-v2-two-record-expansion-live-proof.yml"), false);
assert.equal(fs.existsSync("scripts/TEMP-aha-v2-two-record-expansion-live-proof.cjs"), false);

console.log("aha-v2-two-record-expansion-live-proof.test.cjs: invalidated proof correctly fails closed");
