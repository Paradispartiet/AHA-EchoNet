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

assert.equal(result.schema, "aha_v2_production_write_gate_v1");
assert.equal(result.mode, "decision_only");
assert.equal(result.decision, "NO_GO");
assert.equal(result.eligible_for_controlled_write_pilot, false);
assert.equal(result.eligible_for_normal_chat_persistence, false);
assert.equal(result.eligible_for_automatic_backfill, false);
assert.deepEqual(Array.from(result.blocking_reasons), [
  "authority_leak_observation_missing",
  "deployment_not_proven_at_current_main",
  "live_readonly_chat_proof_missing",
  "migration_dry_run_review_missing",
  "no_write_observation_missing",
  "production_rollback_not_ready",
  "staging_apply_rollback_production_proof_missing"
]);
assert.equal(result.checks.filter((check) => check.passed).length, 5);
assert.equal(result.checks.filter((check) => !check.passed).length, 7);
assert.equal(result.evidence.main_commit_sha, current.main_commit_sha);
assert.equal(result.evidence.deployed_commit_sha, "");
assert.equal(JSON.stringify(current), currentBefore, "gate evaluation must not mutate evidence");
for (const [key, value] of Object.entries(result.policy)) {
  if (key === "gate_is_decision_only" || key === "controlled_write_pilot_requires_separate_activation_pr") assert.equal(value, true, `${key} must stay true`);
  else assert.equal(value, false, `${key} must stay false`);
}

// A complete evidence package makes only a separate controlled pilot eligible;
// it still must never open normal Chat persistence or automatic backfill.
const complete = {
  ...current,
  deployed_commit_sha: current.main_commit_sha,
  deployment_commit_matches_main: true,
  migration_dry_run_reviewed: true,
  staging_apply_rollback_production_proof: true,
  live_readonly_chat_proof: true,
  live_readonly_chat_sample_count: 3,
  no_persistence_write_observed: true,
  no_authority_leak_observed: true,
  production_rollback_ready: true
};
const green = api.evaluate(complete);
assert.equal(green.decision, "CONTROLLED_WRITE_PILOT_ELIGIBLE");
assert.equal(green.eligible_for_controlled_write_pilot, true);
assert.equal(green.eligible_for_normal_chat_persistence, false);
assert.equal(green.eligible_for_automatic_backfill, false);
assert.deepEqual(Array.from(green.blocking_reasons), []);
assert.ok(green.next_action.includes("separate explicit activation PR"));
assert.equal(green.policy.gate_may_execute_writes, false);
assert.equal(green.policy.normal_chat_persistence_open, false);
assert.equal(green.policy.automatic_legacy_backfill_open, false);
assert.equal(green.policy.broad_canonical_write_open, false);

// Every production requirement is independently fail-closed.
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
  const candidate = { ...complete, [field]: value };
  const evaluated = api.evaluate(candidate);
  assert.equal(evaluated.decision, "NO_GO", `${field} must close gate`);
  assert.ok(evaluated.blocking_reasons.includes(blocker), `${field} must report ${blocker}`);
  assert.equal(evaluated.eligible_for_controlled_write_pilot, false);
  assert.equal(evaluated.eligible_for_normal_chat_persistence, false);
}

// Deployment parity requires exact SHA equality, not only an operator boolean.
const wrongDeploy = api.evaluate({
  ...complete,
  deployed_commit_sha: "different_sha",
  deployment_commit_matches_main: true
});
assert.equal(wrongDeploy.decision, "NO_GO");
assert.ok(wrongDeploy.blocking_reasons.includes("deployment_not_proven_at_current_main"));

// Deterministic evaluation of the same evidence.
assert.deepEqual(api.evaluate(current), result);
assert.deepEqual(api.evaluate(complete), green);

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
