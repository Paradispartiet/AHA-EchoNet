const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");

const evidencePath = "ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json";
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

assert.equal(evidence.schema, "aha_v2_controlled_write_pilot_live_proof_v1");
assert.equal(evidence.version, 1);
assert.equal(evidence.status, "production_verified");
assert.equal(evidence.production_proof_passed, true);
assert.equal(evidence.expected_production_main, "486c9f53096e381bc9aeb4e20521d3700633366d");
assert.equal(evidence.frontend_origin, "https://paradispartiet.github.io/AHA-EchoNet");

const identity = evidence.proof_identity;
assert.equal(identity.temporary_pull_request, 856);
assert.equal(identity.temporary_pull_request_disposition, "closed_without_merge");
assert.equal(identity.probe_head, "4664f40512148548d064ae1b1623b490c125d0b6");
assert.equal(identity.merge_base, evidence.expected_production_main);
assert.equal(identity.product_diff_count, 0);
assert.equal(identity.workflow_run_id, 32411347026);
assert.equal(identity.workflow_job_id, 96562241212);
assert.equal(identity.workflow_run_attempt, 1);
assert.equal(identity.artifact_id, 9422272974);
assert.equal(identity.artifact_name, "aha-v2-controlled-write-pilot-live-proof-32411347026");
assert.equal(identity.artifact_digest, "sha256:deb7f90b9151e867d71010bc909a7597c386716e62064264c171556d90e9f8fc");
assert.equal(identity.artifact_size_bytes, 4013);

assert.equal(evidence.deployment.github_pages_commit, evidence.expected_production_main);
assert.equal(evidence.deployment.github_pages_status, "built");
assert.equal(evidence.deployment.all_assets_match, true);
assert.equal(evidence.deployment.assets.length, 10);
for (const asset of evidence.deployment.assets) {
  assert.equal(asset.match, true, `${asset.path} must be marked as a production match`);
  assert.ok(fs.existsSync(asset.path), `${asset.path} must still exist`);
  assert.equal(sha256File(asset.path), asset.sha256, `${asset.path} changed after its live pilot proof; collect new production proof before accepting the change`);
}

const noIntent = evidence.operator_browser.no_intent;
assert.equal(noIntent.status_closed, true);
assert.equal(noIntent.iframe_about_blank, true);
assert.equal(noIntent.disabled_buttons, noIntent.button_count);
assert.equal(noIntent.chat_request_count, 0);
assert.equal(noIntent.unexpected_write_request_count, 0);
assert.equal(noIntent.page_error_count, 0);
assert.equal(noIntent.console_error_count, 0);
assert.match(noIntent.status_text, /Pilot lukket/u);
assert.equal(evidence.operator_browser.operator_asset_response.status, 200);
assert.equal(evidence.operator_browser.operator_asset_response.from_service_worker, false);
assert.equal(
  evidence.operator_browser.operator_asset_response.sha256,
  evidence.deployment.assets.find((asset) => asset.path === "js/ahaInsightActivationOperatorV2.js").sha256
);

const exactIntent = evidence.operator_browser.exact_intent;
assert.equal(exactIntent.authority_ready, true);
assert.equal(exactIntent.production_gate_decision, "CONTROLLED_WRITE_PILOT_ELIGIBLE");
assert.equal(exactIntent.rollback_status, "ready");
assert.equal(exactIntent.chat_request_count, 1);
assert.equal(exactIntent.iframe_ready, true);
assert.equal(exactIntent.unexpected_write_request_count, 0);
assert.equal(exactIntent.page_error_count, 0);

assert.equal(evidence.synthesis.endpoint, "https://aha-agent-7a3y.onrender.com/api/aha-agent/semantic-document");
assert.equal(evidence.synthesis.model, "gpt-4.1-mini-2025-04-14");
assert.equal(evidence.synthesis.candidate_count, 1);
assert.equal(evidence.synthesis.eligible_count, 1);
assert.equal(evidence.synthesis.selected_candidate_index, 0);
assert.equal(evidence.synthesis.selected_quality_score, 0.812283);

const pilot = evidence.pilot;
assert.equal(pilot.scope, "single_local_chamber_insight");
assert.equal(pilot.max_chamber_records_created, 1);
assert.equal(pilot.initial_phase, "available");
assert.equal(pilot.initial_created_record_count, 0);
assert.equal(pilot.review_chamber_unchanged, true);
assert.equal(pilot.review_id_present, true);
assert.equal(pilot.canonical_added_count, 1);
assert.equal(pilot.created_record_count_after_canonical, 1);
assert.equal(pilot.second_activation_before_rollback_error, "pilot_record_budget_exhausted");
assert.deepEqual(pilot.sync_push, { ok: false, reason: "local_only_insight_activation_present" });
assert.deepEqual(pilot.sync_pull, { ok: false, reason: "local_only_insight_activation_present" });
assert.equal(pilot.repository_save_calls, 0);
assert.equal(pilot.repository_load_calls, 0);
assert.equal(pilot.rollback_status, "rolled_back");
assert.equal(pilot.sentinel_preserved_after_rollback, true);
assert.equal(pilot.chamber_count_after_rollback, 1);
assert.equal(pilot.created_record_count_after_rollback, 1);
assert.equal(pilot.second_activation_after_rollback_error, "pilot_record_budget_exhausted");
assert.equal(pilot.reload_phase, "rolled_back_complete");
assert.equal(pilot.reload_created_record_count, 1);
assert.equal(pilot.reload_second_activation_error, "pilot_record_budget_exhausted");
assert.equal(pilot.audit_event_count, 9);
assert.equal(pilot.dispatched_action_count, 3);
assert.equal(pilot.browser_local_storage_only, true);
assert.equal(pilot.user_production_data_modified, false);
assert.equal(pilot.representative_fixture_only, true);
assert.equal(pilot.initial_chamber_sentinel_preserved, true);
assert.equal(pilot.final_chamber_sentinel_preserved, true);

for (const [name, value] of Object.entries(evidence.policy)) {
  assert.equal(value, false, `${name} must remain closed by the one-record pilot proof`);
}
for (const [name, value] of Object.entries(evidence.redaction)) {
  assert.equal(value, false, `${name} must remain absent from permanent evidence`);
}

const forbiddenTempFiles = [
  ".github/workflows/TEMP-aha-v2-controlled-write-pilot-live-proof-v2.yml",
  "scripts/TEMP-aha-v2-controlled-write-pilot-live-proof.cjs",
  "scripts/TEMP-aha-v2-operator-cache-diagnostic.cjs"
];
for (const file of forbiddenTempFiles) assert.equal(fs.existsSync(file), false, `${file} must never reach main`);

const activationDoc = fs.readFileSync("docs/AHA_INSIGHT_ENGINE_V2_CONTROLLED_WRITE_PILOT_ACTIVATION_2026-08-20.md", "utf8");
assert.match(activationDoc, /production-verified/u);
assert.match(activationDoc, /32411347026/u);
assert.match(activationDoc, /9422272974/u);
assert.match(activationDoc, /pilot_record_budget_exhausted/u);
assert.match(activationDoc, /Normal V2 persistence: CLOSED/u);

console.log("aha-v2-controlled-write-pilot-live-proof.test.cjs: OK");
