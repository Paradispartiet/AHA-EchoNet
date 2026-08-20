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

// PR #834 is immutable historical proof. Lock the exact hashes it actually
// observed; never rewrite that fixture to claim it proved later operator code.
const historicalAssetHashes = {
  "insight-activation-v2.html": "e6ed518ff831308f25ebe05a0e1b7065696c73e67f66f942bf808f5ba2d1b34c",
  "js/ahaInsightActivationV2.js": "faf8cb91805241f524235c90f275c317f3a2a6a1b683fab61fc6b9e854a28e63",
  "js/ahaInsightActivationOperatorV2.js": "22625621dda992c4f66ddd7b1b30b9b40a09c675b34d0fc0d18ee35943372713",
  "js/ahaInsightQualityGateV2.js": "6040849c09c7c29c3848bd113e627218cea886bb3cc6492324c5e981e65490c2",
  "js/insightsChamber.js": "8068ed184559bef7795c967d437cd46462f39061aa0d5ca524e0c7de4fd26a7b",
  "js/ahaChamberSync.js": "89224ed58e40f17e78131bb5810f5bb65a93f40c561eac4c7d322ddafcead97b"
};
assert.deepEqual(Object.keys(proof.frontend.assets).sort(), Object.keys(historicalAssetHashes).sort());
Object.entries(historicalAssetHashes).forEach(([file, sha256]) => {
  assert.equal(proof.frontend.assets[file].sha256, sha256, `${file} historical proof hash must remain immutable`);
  assert.equal(proof.frontend.assets[file].fetch_attempts, 1);
});

// The write controller and its safety dependencies are intentionally unchanged
// by the new production-gated pilot operator and must still match live #834.
for (const file of [
  "js/ahaInsightActivationV2.js",
  "js/ahaInsightQualityGateV2.js",
  "js/insightsChamber.js",
  "js/ahaChamberSync.js"
]) {
  assert.equal(
    sha256File(file),
    historicalAssetHashes[file],
    `${file} must still match the historically production-proven activation path`
  );
}

// The operator HTML/adapter are deliberately changed by the separate pilot
// activation PR. Their old #834 hashes remain historical evidence only; the
// new versions require their own post-merge GitHub Pages + browser proof.
for (const file of ["insight-activation-v2.html", "js/ahaInsightActivationOperatorV2.js"]) {
  assert.notEqual(
    sha256File(file),
    historicalAssetHashes[file],
    `${file} is intentionally outside the old #834 asset proof and must receive new live proof`
  );
}
const activationDoc = fs.readFileSync("docs/AHA_INSIGHT_ENGINE_V2_CONTROLLED_WRITE_PILOT_ACTIVATION_2026-08-20.md", "utf8");
assert.match(activationDoc, /not considered production-proven merely because repo CI is green/);
assert.match(activationDoc, /temporary workflow must be closed without merge/);
assert.match(activationDoc, /production page without operator intent remains closed/);
assert.match(activationDoc, /post-rollback second activation attempt remains blocked/);

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

console.log("aha-insight-activation-production-proof-v2 passed: immutable #834 proof retained; unchanged controller/safety assets still match; new pilot operator requires separate live proof");
