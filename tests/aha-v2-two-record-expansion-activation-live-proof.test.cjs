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
assert.equal(proof.status, "production_activation_verified");
assert.equal(proof.expected_production_main, "4b74504a25a4b41585c3c62280a7ec275356d4b6");

assert.equal(proof.proof_identity.temporary_pull_request, 863);
assert.equal(proof.proof_identity.temporary_pull_request_disposition, "closed_without_merge");
assert.equal(proof.proof_identity.workflow_run_id, 32416552359);
assert.equal(proof.proof_identity.workflow_run_attempt, 1);
assert.equal(proof.proof_identity.workflow_job_id, 96578895412);
assert.equal(proof.proof_identity.artifact_id, 9424127989);
assert.equal(proof.proof_identity.artifact_digest, "sha256:bd9c046d754d3266504abfff026ed575bf03beccc804cbf129448fbfe400f0a0");
assert.equal(proof.proof_identity.temporary_branch_head, "f0ac1dc915b2246bff5284f491e1b3fd9e910b2b");
assert.equal(proof.proof_identity.workflow_execution_sha, "41c8dba90f808f32e277d0904ff9385a3da504b7");
assert.equal(proof.proof_identity.product_diff_count, 0);
assert.equal(proof.proof_identity.temp_file_count, 2);

assert.equal(proof.deployment.authority, "github_pages");
assert.equal(proof.deployment.origin, "https://paradispartiet.github.io/AHA-EchoNet");
assert.equal(proof.deployment.pages_commit, proof.expected_production_main);
assert.equal(proof.deployment.pages_status, "built");
assert.equal(proof.deployment.matched_attempt, 1);
assert.equal(proof.deployment.all_assets_match, true);
assert.equal(proof.deployment.assets.length, 12);
for (const asset of proof.deployment.assets) {
  assert.equal(asset.match, true, `${asset.path} must be deployment-matched`);
  assert.equal(sha256File(asset.path), asset.sha256, `${asset.path} must retain the production-proved bytes`);
}

assert.equal(proof.operator.no_intent.closed, true);
assert.equal(proof.operator.no_intent.iframe_about_blank, true);
assert.equal(proof.operator.no_intent.chat_request_count, 0);
assert.equal(proof.operator.no_intent.all_buttons_disabled, true);
assert.equal(proof.operator.no_intent.unexpected_write_request_count, 0);
assert.equal(proof.operator.no_intent.page_error_count, 0);
assert.equal(proof.operator.no_intent.console_error_count, 0);
assert.equal(proof.operator.exact_intent.authorized, true);
assert.equal(proof.operator.exact_intent.gate_decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
assert.equal(proof.operator.exact_intent.iframe_ready, true);
assert.ok(proof.operator.exact_intent.chat_request_count >= 1);
assert.equal(proof.operator.exact_intent.unexpected_write_request_count, 0);
assert.equal(proof.operator.exact_intent.page_error_count, 0);
assert.equal(proof.operator.exact_intent.console_error_count, 0);

assert.equal(proof.activation.scope_id, "bounded_local_chamber_two_record_candidate_v1");
assert.equal(proof.activation.max_chamber_records_created, 2);
assert.equal(proof.activation.activation_mode, "manual_sequential");
assert.equal(proof.activation.selected_records.length, 2);
assert.deepEqual(proof.activation.selected_records.map((item) => item.ordinal), [1, 2]);
assert.deepEqual(proof.activation.selected_records.map((item) => item.fixture), [
  "standardization-flexibility-v1.json",
  "constraints-creativity-v1.json"
]);
for (const record of proof.activation.selected_records) {
  assert.equal(record.model, "gpt-4.1-mini-2025-04-14");
  assert.ok(record.quality_score >= 0.8);
  assert.equal(record.review_changed_chamber, false);
  assert.equal(record.source_binding_verified, true);
}
assert.equal(proof.activation.selected_records[0].created_record_count, 1);
assert.equal(proof.activation.selected_records[0].remaining_record_budget, 1);
assert.equal(proof.activation.selected_records[1].created_record_count, 2);
assert.equal(proof.activation.selected_records[1].remaining_record_budget, 0);
assert.equal(proof.activation.distinct_sources, true);
assert.equal(proof.activation.distinct_candidate_signatures, true);
assert.equal(proof.activation.created_record_count, 2);
assert.equal(proof.activation.third_write_error, "expansion_record_budget_exhausted");
assert.equal(proof.activation.repository_save_calls, 0);
assert.equal(proof.activation.repository_load_calls, 0);
assert.equal(proof.activation.sync_push.ok, false);
assert.equal(proof.activation.sync_push.reason, "local_only_insight_activation_present");
assert.equal(proof.activation.sync_pull.ok, false);
assert.equal(proof.activation.sync_pull.reason, "local_only_insight_activation_present");
assert.equal(proof.activation.rollback_second_status, "rolled_back");
assert.equal(proof.activation.rollback_second_preserved_first_record, true);
assert.equal(proof.activation.rollback_first_status, "rolled_back");
assert.equal(proof.activation.final_chamber_only_sentinel, true);
assert.equal(proof.activation.unrelated_sentinel_preserved, true);
assert.equal(proof.activation.lifetime_count_after_rollbacks, 2);
assert.equal(proof.activation.fresh_wrapper_third_write_error, "expansion_record_budget_exhausted");
assert.equal(proof.activation.audit_event_count, 18);
assert.equal(proof.activation.all_broader_authorities_false, true);

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

assert.equal(proof.redaction.raw_source_text_in_evidence, false);
assert.equal(proof.redaction.raw_evidence_quotes_in_evidence, false);
assert.equal(proof.redaction.candidate_signatures_in_evidence, false);
assert.equal(proof.redaction.canonical_signatures_in_evidence, false);
assert.equal(proof.redaction.user_production_data_modified, false);
assert.equal(proof.redaction.in_memory_chamber_fixture_only, true);

assert.equal(fs.existsSync(".github/workflows/TEMP-aha-v2-two-record-expansion-activation-live-proof.yml"), false);
assert.equal(fs.existsSync("scripts/TEMP-aha-v2-two-record-expansion-activation-live-proof.cjs"), false);

console.log("aha-v2-two-record-expansion-activation-live-proof.test.cjs: OK");
