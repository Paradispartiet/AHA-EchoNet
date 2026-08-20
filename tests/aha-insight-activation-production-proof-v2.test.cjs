const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const dir = path.resolve("tests/fixtures/semantic-live-reviewed-v2/controlled-activation-production-v1");
const proof = JSON.parse(fs.readFileSync(path.join(dir, "proof.json"), "utf8"));
const provenance = JSON.parse(fs.readFileSync(path.join(dir, "provenance.json"), "utf8"));

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

assert.equal(proof.schema, "aha_insight_synthesis_v2_controlled_activation_production_proof_v1");
assert.equal(proof.workflow_run_id, 32369823544);
assert.equal(proof.workflow_run_attempt, 1);
assert.equal(proof.expected_production_main, "ed1db452088232146702fabdf9f9543bb9f0d959");
assert.equal(proof.frontend.origin, "https://paradispartiet.github.io/AHA-EchoNet");
Object.entries(proof.frontend.assets).forEach(([file, evidence]) => {
  assert.equal(sha256File(file), evidence.sha256, `${file} must still match the deployed production asset`);
  assert.equal(evidence.fetch_attempts, 1);
});

assert.equal(proof.synthesis.endpoint, "https://aha-agent-7a3y.onrender.com/api/aha-agent/semantic-document");
assert.equal(proof.synthesis.model, "gpt-4.1-mini-2025-04-14");
assert.match(proof.synthesis.response_id, /^resp_[a-f0-9]+$/u);
assert.equal(proof.synthesis.candidate_count, 1);
assert.equal(proof.synthesis.eligible_count, 1);
assert.equal(proof.synthesis.selected_quality_score, 0.831667);

assert.deepEqual(proof.activation.chamber_ids_after_review, ["existing_production_proof"]);
assert.deepEqual(proof.activation.chamber_ids_after_promotion, ["existing_production_proof", proof.activation.canonical_insight_id]);
assert.deepEqual(proof.activation.sync_push, { ok: false, reason: "local_only_insight_activation_present" });
assert.deepEqual(proof.activation.sync_pull, { ok: false, reason: "local_only_insight_activation_present" });
assert.equal(proof.activation.repository_save_calls, 0);
assert.equal(proof.activation.repository_load_calls, 0);
assert.equal(proof.activation.rollback_status, "rolled_back");
assert.deepEqual(proof.activation.chamber_ids_after_rollback, ["existing_production_proof"]);
assert.equal(proof.activation.audit_event_count, 9);
assert.match(proof.activation.audit_tail_hash, /^[a-f0-9]{64}$/u);
assert.deepEqual(proof.activation.dispatched_actions, ["review_committed", "canonical_committed", "canonical_rolled_back"]);

assert.deepEqual(proof.policy, {
  automatic_canonical_write: false,
  backend_persistent_write: false,
  backend_sync: false,
  meta_write: false,
  normal_chat_activation: false,
  production_proof_passed: true
});

assert.equal(provenance.schema, "aha_insight_synthesis_v2_controlled_activation_provenance_v1");
assert.equal(provenance.production_main, proof.expected_production_main);
assert.equal(provenance.workflow_run_id, proof.workflow_run_id);
assert.equal(provenance.workflow_job_id, 96427555521);
assert.equal(provenance.artifact_id, 9406690486);
assert.equal(provenance.artifact_digest, "sha256:711124204415c7082987c79cd99e64000a68a001ff0d5db3d990272b2a12e305");
assert.equal(provenance.proof_file_digest, `sha256:${sha256File(path.join(dir, "proof.json"))}`);
assert.equal(provenance.temporary_pull_request, 834);
assert.equal(provenance.temporary_pull_request_disposition, "closed_without_merge");
assert.equal(provenance.deployment_context.github_pages_main, "deployed_and_hash_verified");

assert.equal(fs.existsSync(".github/workflows/TEMP-aha-insight-v2-activation-production-proof.yml"), false);
assert.equal(fs.existsSync("scripts/TEMP-aha-insight-v2-activation-production-proof.cjs"), false);

console.log("aha-insight-activation-production-proof-v2 passed: deployed review, one local Chamber write, sync block and exact rollback");
