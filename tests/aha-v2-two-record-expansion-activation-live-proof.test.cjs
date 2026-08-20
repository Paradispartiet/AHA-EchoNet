const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");

const proofPath = "ops/evidence/aha-v2-two-record-expansion-activation-live-proof-v1.json";
const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

assert.equal(proof.schema, "aha_v2_two_record_expansion_activation_live_proof_v1");
assert.equal(proof.version, 1);
assert.equal(proof.status, "invalidated_by_upstream_gate_review");
assert.equal(proof.expected_production_main, "4b74504a25a4b41585c3c62280a7ec275356d4b6");
assert.equal(proof.proof_identity.temporary_pull_request, 863);
assert.equal(proof.proof_identity.temporary_pull_request_disposition, "closed_without_merge");
assert.equal(proof.proof_identity.permanentization_pull_request, 864);
assert.equal(proof.proof_identity.workflow_run_id, 32416552359);
assert.equal(proof.proof_identity.workflow_job_id, 96578895412);
assert.equal(proof.proof_identity.artifact_id, 9424127989);
assert.equal(proof.proof_identity.artifact_digest, "sha256:bd9c046d754d3266504abfff026ed575bf03beccc804cbf129448fbfe400f0a0");
assert.equal(proof.proof_identity.product_diff_count, 0);
assert.equal(proof.proof_identity.temp_file_count, 2);

assert.equal(proof.deployment.authority, "github_pages");
assert.equal(proof.deployment.pages_commit, proof.expected_production_main);
assert.equal(proof.deployment.pages_status, "built");
assert.equal(proof.deployment.all_assets_match_at_observation_time, true);
assert.equal(proof.deployment.assets.length, 12);
for (const asset of proof.deployment.assets) {
  assert.equal(asset.match, true, `${asset.path} was matched at historical observation time`);
  assert.match(asset.sha256, /^[a-f0-9]{64}$/u);
}

// The downstream #863 proof depended on two upstream bytes that are now
// intentionally different after post-merge invalidation/hardening.
for (const path of [
  "ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json",
  "ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json"
]) {
  const historical = proof.deployment.assets.find((asset) => asset.path === path);
  assert.ok(historical, `historical asset missing: ${path}`);
  assert.notEqual(
    sha256File(path),
    historical.sha256,
    `${path} must differ from the bytes that authorized the invalidated #863 observation`
  );
}

assert.equal(proof.operator_observation.no_intent.closed, true);
assert.equal(proof.operator_observation.no_intent.iframe_about_blank, true);
assert.equal(proof.operator_observation.no_intent.chat_request_count, 0);
assert.equal(proof.operator_observation.no_intent.unexpected_write_request_count, 0);
assert.equal(proof.operator_observation.exact_intent.authorized_at_observation_time, true);
assert.equal(proof.operator_observation.exact_intent.gate_decision_at_observation_time, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");

assert.equal(proof.activation_observation.scope_id, "bounded_local_chamber_two_record_candidate_v1");
assert.equal(proof.activation_observation.max_chamber_records_created, 2);
assert.equal(proof.activation_observation.activation_mode, "manual_sequential");
assert.equal(proof.activation_observation.selected_records.length, 2);
assert.equal(proof.activation_observation.created_record_count, 2);
assert.equal(proof.activation_observation.third_write_error, "expansion_record_budget_exhausted");
assert.equal(proof.activation_observation.repository_save_calls, 0);
assert.equal(proof.activation_observation.repository_load_calls, 0);
assert.equal(proof.activation_observation.rollback_second_status, "rolled_back");
assert.equal(proof.activation_observation.rollback_second_preserved_first_record, true);
assert.equal(proof.activation_observation.rollback_first_status, "rolled_back");
assert.equal(proof.activation_observation.final_chamber_only_sentinel, true);
assert.equal(proof.activation_observation.unrelated_sentinel_preserved, true);
assert.equal(proof.activation_observation.lifetime_count_after_rollbacks, 2);
assert.equal(proof.activation_observation.fresh_wrapper_third_write_error, "expansion_record_budget_exhausted");
assert.equal(proof.activation_observation.all_broader_authorities_false, true);

assert.equal(proof.review_invalidation.current_activation_authority_usable, false);
assert.equal(proof.review_invalidation.upstream_expansion_gate_invalidated, true);
assert.equal(proof.review_invalidation.depends_on_invalidated_two_record_proof, true);
assert.equal(proof.review_invalidation.historical_gate_evidence_bytes_are_current, false);
assert.equal(proof.review_invalidation.historical_two_record_proof_bytes_are_current, false);
assert.equal(proof.review_invalidation.fresh_corrected_gate_proof_required, true);
assert.equal(proof.review_invalidation.fresh_post_gate_activation_proof_required, true);

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

assert.equal(proof.redaction.user_production_data_modified, false);
assert.equal(proof.redaction.in_memory_chamber_fixture_only, true);
assert.equal(fs.existsSync(".github/workflows/TEMP-aha-v2-two-record-expansion-activation-live-proof.yml"), false);
assert.equal(fs.existsSync("scripts/TEMP-aha-v2-two-record-expansion-activation-live-proof.cjs"), false);

console.log("aha-v2-two-record-expansion-activation-live-proof.test.cjs: historical #863 proof retained but current authority invalidated");
