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
assert.equal(proof.status, "production_evidence_verified");
assert.equal(proof.proof_revision, "corrected_v2");
assert.equal(proof.expected_production_main, "cc82b9a4b3cab6fdd62472f62facb025fbea4b75");

assert.equal(proof.proof_identity.temporary_pull_request, 867);
assert.equal(proof.proof_identity.temporary_pull_request_disposition, "closed_without_merge");
assert.equal(proof.proof_identity.workflow_run_id, 32421978733);
assert.equal(proof.proof_identity.workflow_run_attempt, 1);
assert.equal(proof.proof_identity.workflow_job_id, 96595761534);
assert.equal(proof.proof_identity.artifact_id, 9426036702);
assert.equal(proof.proof_identity.artifact_digest, "sha256:86051351653dd468180d4a91d5df07ebb51635baf9ff14ab31cf6d2fde82de41");
assert.equal(proof.proof_identity.probe_head, "84e1f101079591968150832c902b01b1c9d08c8a");
assert.equal(proof.proof_identity.product_diff_count, 0);
assert.equal(proof.proof_identity.temp_file_count, 2);
assert.equal(proof.proof_identity.execution_source, "hash_verified_deployed_asset_copies");

assert.equal(proof.deployment.authority, "github_pages");
assert.equal(proof.deployment.pages_commit, proof.expected_production_main);
assert.equal(proof.deployment.pages_status, "built");
assert.equal(proof.deployment.matched_attempt, 1);
assert.equal(proof.deployment.all_assets_match, true);
assert.equal(proof.deployment.assets.length, 5);
for (const asset of proof.deployment.assets) {
  assert.equal(asset.match, true, `${asset.path} must be deployment-matched`);
  assert.equal(sha256File(asset.path), asset.sha256, `${asset.path} must retain corrected proof bytes`);
}

assert.equal(proof.scope.scope_id, "bounded_local_chamber_two_record_candidate_v1");
assert.equal(proof.scope.max_chamber_records_created, 2);
assert.equal(proof.scope.candidate_only, true);
assert.equal(proof.scope.activation_authority, false);
assert.equal(proof.scope.immutable_scope_mutation_blocked, true);
assert.equal(proof.scope.immutable_scope_error, "expansion_rehearsal_scope_not_committed_candidate");

assert.equal(proof.canaries.count, 2);
assert.equal(proof.canaries.coverage_complete, true);
assert.equal(proof.canaries.first_apply_write_count, 2);
assert.equal(proof.canaries.identical_replay_write_count, 0);
assert.equal(proof.canaries.identical_replay_no_op_count, 2);
assert.equal(proof.canaries.rollback_status, "rolled_back");
assert.equal(proof.canaries.rollback_exact, true);
assert.equal(proof.canaries.rollback_count, 2);
assert.equal(proof.canaries.exact_pre_run_state_restored, true);
assert.equal(proof.canaries.partial_failure_compensation_status, "compensated");
assert.equal(proof.canaries.partial_failure_compensation_exact, true);
assert.equal(proof.canaries.rollback_remove_failure_status, "manual_review_required");
assert.equal(proof.canaries.rollback_remove_failure_rolled_back_count, 0);
assert.equal(proof.canaries.rollback_remove_failure_reason, "expansion_rehearsal_rollback_remove_failed");
assert.equal(proof.canaries.rollback_remove_failure_compensation_exact, true);
assert.equal(proof.canaries.rollback_remove_failure_state_restored, true);
assert.equal(proof.canaries.replay_failure_message, "synthetic_live_replay_get_failure");
assert.equal(proof.canaries.replay_failure_cleanup_status, "rolled_back");
assert.equal(proof.canaries.replay_failure_cleanup_exact, true);
assert.equal(proof.canaries.replay_failure_exact_pre_run_state_restored, true);
assert.equal(proof.canaries.state_drift_target_ordinal, 2);
assert.equal(proof.canaries.state_drift_status, "manual_review_required");
assert.equal(proof.canaries.state_drift_rolled_back_count, 0);
assert.equal(proof.canaries.earlier_record_preserved_on_later_drift, true);
assert.equal(proof.canaries.drifted_record_preserved, true);
assert.equal(proof.canaries.unrelated_sentinel_preserved, true);
assert.equal(proof.canaries.unrelated_sentinel_full_content_preserved, true);

assert.equal(proof.browser_boundary.local_storage_unchanged, true);
assert.equal(proof.browser_boundary.session_storage_unchanged, true);
assert.equal(proof.browser_boundary.indexeddb_unchanged, true);
assert.equal(proof.browser_boundary.indexeddb_content_digest_unchanged, true);
assert.equal(proof.browser_boundary.indexeddb_snapshot_mode, "stable_keys_values_sha256");
assert.equal(proof.browser_boundary.unexpected_request_count, 0);
assert.equal(proof.browser_boundary.unexpected_write_request_count, 0);
assert.equal(proof.browser_boundary.page_error_count, 0);
assert.equal(proof.browser_boundary.console_error_count, 0);

assert.equal(proof.decision.expansion_gate_decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
assert.equal(proof.decision.eligible_for_bounded_expansion_pilot, true);
assert.equal(proof.decision.eligible_for_expansion_activation, false);
assert.equal(proof.decision.current_one_record_pilot_max_records, 1);
assert.equal(proof.decision.current_one_record_pilot_budget_may_change, false);
assert.deepEqual(proof.decision.blocking_reasons, []);

assert.equal(proof.review_remediation.runtime_scope_binding_gap_closed, true);
assert.equal(proof.review_remediation.runtime_replay_cleanup_gap_closed, true);
assert.equal(proof.review_remediation.runtime_rollback_remove_compensation_gap_closed, true);
assert.equal(proof.review_remediation.indexeddb_content_digest_gap_closed, true);
assert.equal(proof.review_remediation.later_record_drift_probe_gap_closed, true);
assert.equal(proof.review_remediation.corrected_production_proof_complete, true);
assert.deepEqual(proof.review_remediation.resolved_runtime_review_threads, [
  "PRRT_kwDOQgS1AM6a8469",
  "PRRT_kwDOQgS1AM6a847D",
  "PRRT_kwDOQgS1AM6a847J"
]);
assert.deepEqual(proof.review_remediation.proof_review_threads_pending_resolution_after_permanentization, [
  "PRRT_kwDOQgS1AM6a88Mp",
  "PRRT_kwDOQgS1AM6a88Mx"
]);

assert.equal(proof.superseded_provenance.temporary_pull_request, 860);
assert.equal(proof.superseded_provenance.workflow_run_id, 32415006998);
assert.equal(proof.superseded_provenance.artifact_id, 9423564833);
assert.equal(proof.superseded_provenance.status, "superseded_invalidated_proof");

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
assert.equal(proof.policy.rehearsal_write_authorities_all_false, true);
assert.equal(proof.policy.separate_activation_pr_required, true);
assert.equal(proof.policy.fresh_post_activation_production_proof_required, true);
assert.equal(proof.redaction.user_production_data_modified, false);
assert.equal(proof.redaction.synthetic_rehearsal_records_only, true);

for (const file of [
  ".github/workflows/TEMP-aha-v2-two-record-expansion-live-proof.yml",
  "scripts/TEMP-aha-v2-two-record-expansion-live-proof.cjs",
  ".github/workflows/TEMP-aha-v2-two-record-expansion-live-proof-v2.yml",
  "scripts/TEMP-aha-v2-two-record-expansion-live-proof-v2.cjs"
]) assert.equal(fs.existsSync(file), false, `${file} must not be permanent`);

console.log("aha-v2-two-record-expansion-live-proof.test.cjs: corrected v2 production proof OK");
