const assert = require("assert");
const fs = require("fs");

const proofPath = "ops/evidence/aha-v2-two-record-expansion-activation-live-proof-v1.json";
const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));

assert.equal(proof.schema, "aha_v2_two_record_expansion_activation_live_proof_v1");
assert.equal(proof.version, 1);
assert.equal(proof.status, "production_activation_verified");
assert.equal(proof.proof_revision, "corrected_v2");
assert.equal(proof.expected_production_main, "b42917de4ec4fa30fbab8c68b2dc3e25c663743d");

assert.equal(proof.proof_identity.temporary_pull_request, 876);
assert.equal(proof.proof_identity.temporary_pull_request_disposition, "closed_without_merge");
assert.equal(proof.proof_identity.permanentization_pull_request, 878);
assert.equal(proof.proof_identity.workflow_run_id, 32436619989);
assert.equal(proof.proof_identity.workflow_run_attempt, 1);
assert.equal(proof.proof_identity.workflow_job_id, 96639013827);
assert.equal(proof.proof_identity.artifact_id, 9430975409);
assert.equal(
  proof.proof_identity.artifact_digest,
  "sha256:cc87613837c7d118d385ad2cd9cda829a682da174e8f5a2fe7c28bf578422f8a"
);
assert.equal(proof.proof_identity.probe_head, "0c8f2226c02e2e3f81d19acaf1c9d80e94890527");
assert.equal(proof.proof_identity.product_diff_count, 0);
assert.equal(proof.proof_identity.temp_file_count, 2);
assert.equal(proof.proof_identity.execution_source, "captured_hash_verified_deployed_bytes");

assert.equal(proof.deployment.authority, "github_pages");
assert.equal(proof.deployment.pages_commit, proof.expected_production_main);
assert.equal(proof.deployment.pages_status, "built");
assert.equal(proof.deployment.matched_attempt, 1);
assert.equal(proof.deployment.all_assets_match, true);
assert.equal(proof.deployment.asset_count, 20);
assert.equal(proof.deployment.assets.length, 20);
assert.equal(new Set(proof.deployment.assets.map((asset) => asset.path)).size, 20);
for (const asset of proof.deployment.assets) {
  assert.equal(asset.match, true, `${asset.path} must match exact deployed proof main`);
  assert.match(asset.sha256, /^[a-f0-9]{64}$/u, `${asset.path} must have SHA-256`);
}
for (const requiredPath of [
  "insight-expansion-v2.html",
  "chat.html",
  "js/ahaInsightExpansionOperatorV2.js",
  "js/ahaInsightActivationV2.js",
  "js/ahaV2ControlledWriteExpansionActivation.js",
  "js/ahaV2ControlledWriteExpansionGate.js",
  "js/insightsChamber.js",
  "js/ahaChamberSync.js",
  "ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json",
  "ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json",
  "ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json",
  "ops/contracts/aha-v2-controlled-write-expansion-scope-two-record-v1.json"
]) assert.ok(proof.deployment.assets.some((asset) => asset.path === requiredPath), `missing bound asset ${requiredPath}`);

assert.equal(proof.execution_binding.exact_deployed_bytes_used, true);
assert.equal(proof.execution_binding.mode, "captured_hash_verified_deployed_bytes");
assert.equal(proof.execution_binding.executed_vm_asset_count, 12);
assert.equal(proof.execution_binding.operator_routed_asset_count, 20);
assert.equal(proof.execution_binding.operator_and_vm_bound_to_same_capture_set, true);
assert.equal(proof.execution_binding.rehash_before_execution, true);

assert.equal(proof.operator_observation.no_intent.closed, true);
assert.equal(proof.operator_observation.no_intent.iframe_about_blank, true);
assert.equal(proof.operator_observation.no_intent.chat_request_count, 0);
assert.equal(proof.operator_observation.no_intent.all_buttons_disabled, true);
assert.equal(proof.operator_observation.no_intent.unexpected_write_request_count, 0);
assert.equal(proof.operator_observation.exact_intent.authorized, true);
assert.equal(proof.operator_observation.exact_intent.gate_decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
assert.equal(proof.operator_observation.exact_intent.iframe_ready, true);
assert.equal(proof.operator_observation.exact_intent.web_locks_available, true);
assert.equal(proof.operator_observation.exact_intent.chat_request_count, 1);
assert.equal(proof.operator_observation.exact_intent.unexpected_write_request_count, 0);

assert.equal(proof.activation_observation.scope_id, "bounded_local_chamber_two_record_candidate_v1");
assert.equal(proof.activation_observation.max_chamber_records_created, 2);
assert.equal(proof.activation_observation.activation_mode, "manual_sequential");
assert.equal(proof.activation_observation.selected_records.length, 2);
assert.equal(proof.activation_observation.distinct_sources, true);
assert.equal(proof.activation_observation.distinct_candidate_signatures, true);
for (const record of proof.activation_observation.selected_records) {
  assert.equal(record.review_changed_chamber, false);
  assert.equal(record.source_binding_verified, true);
  assert.ok(record.quality_score >= 0.8);
}
assert.equal(proof.activation_observation.created_record_count, 2);
assert.equal(proof.activation_observation.third_write_error, "expansion_record_budget_exhausted");
assert.equal(proof.activation_observation.repository_save_calls, 0);
assert.equal(proof.activation_observation.repository_load_calls, 0);
assert.deepEqual(proof.activation_observation.sync_push, { ok: false, reason: "local_only_insight_activation_present" });
assert.deepEqual(proof.activation_observation.sync_pull, { ok: false, reason: "local_only_insight_activation_present" });
assert.equal(proof.activation_observation.rollback_second_status, "rolled_back");
assert.equal(proof.activation_observation.rollback_second_full_sentinel_preserved, true);
assert.equal(proof.activation_observation.rollback_second_full_first_record_preserved, true);
assert.equal(proof.activation_observation.rollback_first_status, "rolled_back");
assert.equal(proof.activation_observation.rollback_first_full_sentinel_preserved, true);
assert.equal(proof.activation_observation.final_chamber_exact_pre_activation_business_state, true);
assert.equal(proof.activation_observation.final_chamber_only_local_updated_at_housekeeping_delta, true);
assert.equal(proof.activation_observation.lifetime_count_after_rollbacks, 2);
assert.equal(proof.activation_observation.fresh_wrapper_third_write_error, "expansion_record_budget_exhausted");
assert.equal(proof.activation_observation.rollback_lock.max_active, 1);
assert.deepEqual(proof.activation_observation.rollback_lock.names, [
  "aha-v2-controlled-write-expansion-rollback-v1",
  "aha-v2-controlled-write-expansion-rollback-v1"
]);
assert.deepEqual(proof.activation_observation.rollback_lock.modes, ["exclusive", "exclusive"]);
assert.equal(proof.activation_observation.all_broader_authorities_false, true);

assert.equal(proof.review_remediation.deployed_execution_byte_binding_gap_closed, true);
assert.equal(proof.review_remediation.unrelated_sentinel_full_content_check_gap_closed, true);
assert.equal(proof.review_remediation.cross_instance_rollback_serialization_proven, true);
assert.equal(proof.review_remediation.historical_activation_proof_superseded, true);
assert.deepEqual(proof.review_remediation.review_threads_eligible_for_resolution_after_permanentization, [
  "PRRT_kwDOQgS1AM6a9Pio",
  "PRRT_kwDOQgS1AM6a9Pis"
]);
assert.equal(proof.superseded_provenance.historical_temporary_pull_request, 863);
assert.equal(proof.superseded_provenance.historical_permanentization_pull_request, 864);
assert.equal(proof.superseded_provenance.historical_status_before_replacement, "invalidated_pending_corrected_activation_proof");
assert.deepEqual(proof.superseded_provenance.historical_review_gaps, [
  "deployed_execution_byte_binding_missing",
  "unrelated_sentinel_full_content_check_missing"
]);

assert.equal(proof.policy.scope_id, "bounded_local_chamber_two_record_candidate_v1");
assert.equal(proof.policy.max_chamber_records_created, 2);
assert.equal(proof.policy.activation_mode, "manual_sequential");
assert.equal(proof.policy.cross_instance_rollback_serialization_required, true);
assert.equal(proof.policy.cross_instance_rollback_serialization, "web_locks_exclusive");
for (const field of [
  "normal_chat_persistence_open",
  "automatic_activation_open",
  "batch_activation_open",
  "automatic_backfill_open",
  "backend_sync_open",
  "backend_persistent_write_open",
  "broad_canonical_write_open",
  "projection_store_write_open",
  "meta_write_open",
  "remote_write_open"
]) assert.equal(proof.policy[field], false, `${field} must remain closed`);

assert.equal(proof.separate_local_artifact_boundary.source_pull_request, 875);
assert.equal(proof.separate_local_artifact_boundary.explicit_user_action_required, true);
assert.equal(proof.separate_local_artifact_boundary.one_local_artifact_per_call, true);
assert.equal(proof.separate_local_artifact_boundary.projection_store_write_authority_inherited, false);
assert.equal(proof.separate_local_artifact_boundary.automatic_write_authority_inherited, false);
assert.equal(proof.separate_local_artifact_boundary.remote_or_sync_authority_inherited, false);

assert.equal(proof.redaction.raw_source_text_in_evidence, false);
assert.equal(proof.redaction.raw_evidence_quotes_in_evidence, false);
assert.equal(proof.redaction.candidate_signatures_in_evidence, false);
assert.equal(proof.redaction.canonical_signatures_in_evidence, false);
assert.equal(proof.redaction.user_production_data_modified, false);
assert.equal(proof.redaction.in_memory_chamber_fixture_only, true);

for (const file of [
  ".github/workflows/TEMP-aha-v2-two-record-expansion-activation-live-proof.yml",
  "scripts/TEMP-aha-v2-two-record-expansion-activation-live-proof.cjs",
  ".github/workflows/TEMP-aha-v2-two-record-expansion-activation-live-proof-v2.yml",
  "scripts/TEMP-aha-v2-two-record-expansion-activation-live-proof-v2.cjs"
]) assert.equal(fs.existsSync(file), false, `${file} must not be permanent`);

console.log("aha-v2-two-record-expansion-activation-live-proof.test.cjs: corrected activation proof is production-verified and bounded");
