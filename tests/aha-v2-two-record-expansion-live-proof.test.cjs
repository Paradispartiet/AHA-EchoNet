const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");

const proof = JSON.parse(fs.readFileSync("ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json", "utf8"));

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

assert.equal(proof.schema, "aha_v2_two_record_expansion_live_proof_v1");
assert.equal(proof.version, 1);
assert.equal(proof.status, "production_evidence_verified");
assert.equal(proof.expected_production_main, "2a0c6e0b19d92681cc4a51bd46efc3e2b824fc8c");
assert.equal(proof.proof_identity.temporary_pull_request, 860);
assert.equal(proof.proof_identity.temporary_pull_request_disposition, "closed_without_merge");
assert.equal(proof.proof_identity.workflow_run_id, 32415006998);
assert.equal(proof.proof_identity.workflow_run_attempt, 1);
assert.equal(proof.proof_identity.workflow_job_id, 96574038093);
assert.equal(proof.proof_identity.artifact_id, 9423564833);
assert.equal(proof.proof_identity.artifact_digest, "sha256:a2a30b3e0380345dddf346f090780fda4cec5c7497865cf91878b61622d504d6");
assert.equal(proof.proof_identity.probe_head, "b022c357f6b637a1fbf36025a164fcc848d5006b");

assert.equal(proof.deployment.authority, "github_pages");
assert.equal(proof.deployment.origin, "https://paradispartiet.github.io/AHA-EchoNet");
assert.equal(proof.deployment.pages_commit, proof.expected_production_main);
assert.equal(proof.deployment.pages_status, "built");
assert.equal(proof.deployment.matched_attempt, 1);
assert.equal(proof.deployment.product_diff_count, 0);
assert.equal(proof.deployment.all_assets_match, true);
assert.equal(proof.deployment.assets.length, 5);
for (const asset of proof.deployment.assets) {
  assert.equal(asset.match, true, `${asset.path} must be deployment-matched`);
  assert.equal(sha256File(asset.path), asset.sha256, `${asset.path} must retain the production-proved bytes`);
}

assert.equal(proof.scope.scope_id, "bounded_local_chamber_two_record_candidate_v1");
assert.equal(proof.scope.max_chamber_records_created, 2);
assert.equal(proof.scope.candidate_only, true);
assert.equal(proof.scope.activation_authority, false);

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
assert.equal(proof.canaries.state_drift_status, "manual_review_required");
assert.equal(proof.canaries.state_drift_rolled_back_count, 0);
assert.equal(proof.canaries.unrelated_sentinel_preserved, true);

assert.equal(proof.browser_boundary.local_storage_unchanged, true);
assert.equal(proof.browser_boundary.session_storage_unchanged, true);
assert.equal(proof.browser_boundary.indexeddb_unchanged, true);
assert.equal(proof.browser_boundary.unexpected_write_request_count, 0);
assert.equal(proof.browser_boundary.page_error_count, 0);
assert.equal(proof.browser_boundary.console_error_count, 0);

assert.equal(proof.decision.expansion_gate_decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
assert.equal(proof.decision.eligible_for_expansion_activation, false);
assert.equal(proof.decision.current_one_record_pilot_max_records, 1);
assert.equal(proof.decision.current_one_record_pilot_budget_may_change, false);

assert.equal(proof.policy.rehearsal_write_authorities_all_false, true);
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

assert.equal(proof.redaction.raw_source_text_in_evidence, false);
assert.equal(proof.redaction.raw_evidence_quotes_in_evidence, false);
assert.equal(proof.redaction.signatures_in_evidence, false);
assert.equal(proof.redaction.user_production_data_modified, false);

assert.equal(fs.existsSync(".github/workflows/TEMP-aha-v2-two-record-expansion-live-proof.yml"), false);
assert.equal(fs.existsSync("scripts/TEMP-aha-v2-two-record-expansion-live-proof.cjs"), false);

console.log("aha-v2-two-record-expansion-live-proof.test.cjs: OK");
