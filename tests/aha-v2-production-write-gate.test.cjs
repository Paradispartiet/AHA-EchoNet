const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaV2ProductionWriteGate.js", "utf8"), context, { filename: "js/ahaV2ProductionWriteGate.js" });

const api = context.AHAV2ProductionWriteGate;
assert.ok(api);
assert.equal(api.GATE_SCHEMA, "aha_v2_production_write_gate_v1");

const current = JSON.parse(fs.readFileSync("ops/evidence/aha-v2-production-write-gate-current-v1.json", "utf8"));
const currentBefore = JSON.stringify(current);
const result = api.evaluate(current);

// Current permanent evidence is now fully green for a separate bounded pilot.
assert.equal(result.schema, "aha_v2_production_write_gate_v1");
assert.equal(result.mode, "decision_only");
assert.equal(result.decision, "CONTROLLED_WRITE_PILOT_ELIGIBLE");
assert.equal(result.eligible_for_controlled_write_pilot, true);
assert.equal(result.eligible_for_normal_chat_persistence, false);
assert.equal(result.eligible_for_automatic_backfill, false);
assert.deepEqual(Array.from(result.blocking_reasons), []);
assert.equal(result.checks.length, 12);
assert.equal(result.checks.filter((check) => check.passed).length, 12);
assert.equal(result.checks.filter((check) => !check.passed).length, 0);
assert.ok(result.next_action.includes("separate explicit activation PR"));
assert.equal(result.evidence.main_commit_sha, current.main_commit_sha);
assert.equal(result.evidence.deployed_commit_sha, current.deployed_commit_sha);
assert.equal(current.deployed_commit_sha, current.main_commit_sha, "proven production runtime cut must match deployed GitHub Pages commit exactly");
assert.equal(current.main_commit_sha, "497fa06eee5c910fce146281c2703a4c76fb0081");
assert.equal(current.deployment_commit_matches_main, true);
assert.equal(current.migration_rehearsal_operator_surface_merged, true);
assert.equal(current.migration_dry_run_reviewed, true);
assert.equal(current.staging_apply_rollback_production_proof, true);
assert.equal(current.live_readonly_chat_proof, true);
assert.equal(current.live_readonly_chat_sample_count, 3);
assert.equal(current.no_persistence_write_observed, true);
assert.equal(current.no_authority_leak_observed, true);
assert.equal(current.production_rollback_ready, true);
assert.equal(current.decision_expected, "CONTROLLED_WRITE_PILOT_ELIGIBLE");
assert.equal(current.permanent_live_proof_file, "ops/evidence/aha-v2-live-production-proof-2026-08-20.json");

assert.equal(current.deployment_observation.proof_authority, "github_pages_main");
assert.equal(current.deployment_observation.pages_commit, current.main_commit_sha);
assert.equal(current.deployment_observation.pages_status, "built");
assert.equal(current.deployment_observation.pages_probe_pull_request, 852);
assert.equal(current.deployment_observation.pages_probe_pull_request_disposition, "closed_without_merge");
assert.equal(current.deployment_observation.pages_probe_temp_head_sha, "4eacd1cbe75d99a4fa64a0bad2f2192295bcb8b7");
assert.equal(current.deployment_observation.pages_probe_product_diff_count, 0);
assert.equal(current.deployment_observation.pages_probe_workflow_run_id, 32396576869);
assert.equal(current.deployment_observation.pages_probe_job_id, 96514684814);
assert.equal(current.deployment_observation.pages_probe_artifact_id, 9416895737);
assert.equal(current.deployment_observation.pages_probe_artifact_digest, "sha256:3863d04353f6ca9b7b7eccf7c44004d6021548f945fbc22afccf12d0799902f9");
assert.equal(current.deployment_observation.runtime_asset_count, 11);
assert.equal(current.deployment_observation.runtime_assets_all_match, true);
assert.equal(current.deployment_observation.first_probe_attempt_matched, true);
assert.equal(current.deployment_observation.vercel_used_as_proof_authority, false);

assert.equal(current.live_production_proof.workflow_run_id, 32396576869);
assert.equal(current.live_production_proof.artifact_id, 9416895737);
assert.equal(current.live_production_proof.representative_fixture_only, true);
assert.equal(current.live_production_proof.user_production_data_modified, false);
assert.equal(current.live_production_proof.migration.planned_write_count, 2);
assert.equal(current.live_production_proof.migration.first_apply_write_count, 2);
assert.equal(current.live_production_proof.migration.second_apply_write_count, 0);
assert.equal(current.live_production_proof.migration.second_apply_idempotent, true);
assert.equal(current.live_production_proof.migration.rollback_count, 2);
assert.equal(current.live_production_proof.migration.staging_count_after_rollback, 0);
assert.equal(current.live_production_proof.migration.exact_rollback, true);
assert.equal(current.live_production_proof.migration.chamber_unchanged, true);
assert.equal(current.live_production_proof.chat.sample_count, 3);
assert.equal(current.live_production_proof.chat.response_count, 3);
assert.equal(current.live_production_proof.chat.reply_present_count, 3);
assert.equal(current.live_production_proof.chat.v2_context_used_count, 3);
assert.equal(current.live_production_proof.chat.minimum_quality_score, 0.93);
assert.equal(current.live_production_proof.chat.all_authority_flags_false, true);
assert.equal(current.live_production_proof.chat.save_new_insights, false);
assert.equal(current.live_production_proof.chat.use_existing_memory, true);
assert.equal(current.live_production_proof.chat.local_storage_unchanged, true);
assert.equal(current.live_production_proof.chat.indexeddb_unchanged, true);
assert.equal(current.live_production_proof.chat.unexpected_browser_write_request_count, 0);
assert.equal(current.live_production_proof.chat.raw_activation_payload_in_memory_context, false);
assert.equal(current.live_production_proof.chat.raw_evidence_in_request, false);
assert.equal(current.live_production_proof.chat.raw_candidate_signature_in_request, false);

assert.equal(current.rollback_readiness.ready, true);
assert.equal(current.rollback_readiness.pilot_scope, "single_local_chamber_insight");
assert.equal(current.rollback_readiness.max_chamber_records_created, 1);
assert.equal(current.rollback_readiness.production_proof_workflow_run_id, 32369823544);
assert.equal(current.rollback_readiness.production_proof_artifact_id, 9406690486);
assert.equal(current.rollback_readiness.rollback_status, "rolled_back");
assert.equal(current.rollback_readiness.unrelated_chamber_record_preserved, true);
assert.equal(current.rollback_readiness.repository_save_calls, 0);
assert.equal(current.rollback_readiness.repository_load_calls, 0);
assert.equal(current.rollback_readiness.backend_sync_blocked_before_repository, true);
assert.equal(current.rollback_readiness.separate_activation_pr_required, true);
assert.equal(JSON.stringify(current), currentBefore, "gate evaluation must not mutate evidence");

// Even a fully green gate is decision-only. No broad write authority is opened.
for (const [key, value] of Object.entries(result.policy)) {
  if (key === "gate_is_decision_only" || key === "controlled_write_pilot_requires_separate_activation_pr") {
    assert.equal(value, true, `${key} must stay true`);
  } else {
    assert.equal(value, false, `${key} must stay false`);
  }
}
assert.equal(result.policy.gate_may_execute_writes, false);
assert.equal(result.policy.normal_chat_persistence_open, false);
assert.equal(result.policy.automatic_chamber_activation_open, false);
assert.equal(result.policy.automatic_legacy_backfill_open, false);
assert.equal(result.policy.broad_canonical_write_open, false);
assert.equal(result.policy.projection_store_write_open, false);
assert.equal(result.policy.meta_write_open, false);
assert.equal(result.policy.remote_write_open, false);

// Every production requirement independently fails closed from the green cut.
const failCases = [
  ["v2_build_9_of_9", false, "v2_build_not_complete"],
  ["production_synthesis_rounds", 1, "production_synthesis_quality_not_proven"],
  ["production_synthesis_f1_min", 0.8, "production_synthesis_quality_not_proven"],
  ["production_synthesis_all_valid", false, "production_synthesis_quality_not_proven"],
  ["trusted_readonly_integration_merged", false, "trusted_readonly_integration_not_merged"],
  ["chat_readonly_transport_merged", false, "chat_readonly_transport_not_merged"],
  ["chat_readonly_runtime_merged", false, "chat_readonly_runtime_not_merged"],
  ["deployment_commit_matches_main", false, "deployment_not_proven_at_current_main"],
  ["migration_dry_run_reviewed", false, "migration_dry_run_review_missing"],
  ["staging_apply_rollback_production_proof", false, "staging_apply_rollback_production_proof_missing"],
  ["live_readonly_chat_proof", false, "live_readonly_chat_proof_missing"],
  ["live_readonly_chat_sample_count", 2, "live_readonly_chat_proof_missing"],
  ["no_persistence_write_observed", false, "no_write_observation_missing"],
  ["no_authority_leak_observed", false, "authority_leak_observation_missing"],
  ["production_rollback_ready", false, "production_rollback_not_ready"]
];
for (const [field, value, blocker] of failCases) {
  const candidate = { ...current, [field]: value };
  const evaluated = api.evaluate(candidate);
  assert.equal(evaluated.decision, "NO_GO", `${field} must close gate`);
  assert.ok(evaluated.blocking_reasons.includes(blocker), `${field} must report ${blocker}`);
  assert.equal(evaluated.eligible_for_controlled_write_pilot, false);
  assert.equal(evaluated.eligible_for_normal_chat_persistence, false);
  assert.equal(evaluated.eligible_for_automatic_backfill, false);
}

// Deployment parity requires exact SHA equality, not only an operator boolean.
const wrongDeploy = api.evaluate({
  ...current,
  deployed_commit_sha: "different_sha",
  deployment_commit_matches_main: true
});
assert.equal(wrongDeploy.decision, "NO_GO");
assert.ok(wrongDeploy.blocking_reasons.includes("deployment_not_proven_at_current_main"));

// Deterministic evaluation of the same evidence.
assert.deepEqual(api.evaluate(current), result);

// The gate module itself must remain pure/no-write.
const source = fs.readFileSync("js/ahaV2ProductionWriteGate.js", "utf8");
for (const [pattern, label] of [
  [/localStorage\s*\./, "localStorage"],
  [/AHARepository\s*\./, "repository"],
  [/supabase\s*\./i, "Supabase"],
  [/\bfetch\s*\(/, "fetch"],
  [/\.execute\s*\(/, "execution"],
  [/\.rollback\s*\(/, "rollback"],
  [/normal_chat_persistence_open:\s*true/, "normal Chat persistence activation"],
  [/automatic_legacy_backfill_open:\s*true/, "automatic backfill activation"],
  [/broad_canonical_write_open:\s*true/, "broad canonical write activation"]
]) assert.equal(pattern.test(source), false, `production gate must not contain ${label}`);

console.log("aha-v2-production-write-gate.test.cjs: OK");
