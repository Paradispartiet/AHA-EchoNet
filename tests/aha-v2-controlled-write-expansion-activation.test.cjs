const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of [
  "js/ahaV2ControlledWriteExpansionGate.js",
  "js/ahaV2ControlledWriteExpansionActivation.js"
]) vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });

const api = context.AHAV2ControlledWriteExpansionActivation;
assert.ok(api);
assert.equal(api.ACTIVATION_SCHEMA, "aha_v2_controlled_write_expansion_activation_v1");
assert.equal(api.EXPANSION_ENABLED, true);
assert.equal(api.OPERATOR_INTENT, "bounded_local_chamber_two_record_candidate_v1");
assert.equal(api.MAX_RECORDS, 2);

const expansionEvidence = JSON.parse(fs.readFileSync("ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json", "utf8"));
const oneRecordPilotProof = JSON.parse(fs.readFileSync("ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json", "utf8"));
const expansionLiveProof = JSON.parse(fs.readFileSync("ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json", "utf8"));
const scopeContract = JSON.parse(fs.readFileSync("ops/contracts/aha-v2-controlled-write-expansion-scope-two-record-v1.json", "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));

const currentInput = {
  operatorIntent: api.OPERATOR_INTENT,
  expansionEvidence,
  oneRecordPilotProof,
  expansionLiveProof,
  scopeContract
};

// The real current repo state is intentionally NO_GO after post-merge review.
assert.equal(expansionEvidence.current_decision, "NO_GO");
assert.equal(expansionLiveProof.status, "invalidated_by_post_merge_review");
assert.throws(() => api.assessAuthorization(currentInput), /expansion_gate_not_green/);

let rawControllerCreated = false;
assert.throws(
  () => api.create(currentInput, {
    activationApi: {
      create() {
        rawControllerCreated = true;
        throw new Error("raw_controller_must_not_start");
      }
    }
  }),
  /expansion_gate_not_green/
);
assert.equal(rawControllerCreated, false, "NO_GO must block before raw activation controller creation");

// Build an in-memory hypothetical replacement proof to keep the activation
// implementation regression-testable without pretending current evidence is green.
const greenEvidence = clone(expansionEvidence);
for (const field of [
  "multi_record_rollback_rehearsal_proven",
  "rollback_each_record_exactly_bound",
  "partial_failure_compensation_proven",
  "compensation_restores_exact_pre_run_state",
  "idempotent_multi_record_replay_proven",
  "multi_record_state_drift_fail_closed_proven",
  "production_expansion_canary_proof",
  "production_canary_coverage_complete",
  "no_unexpected_persistence_write_observed"
]) greenEvidence[field] = true;

greenEvidence.current_decision = "BOUNDED_EXPANSION_PILOT_ELIGIBLE";
greenEvidence.expected_blockers = [];

const greenProof = clone(expansionLiveProof);
greenProof.status = "production_evidence_verified";
greenProof.canaries.coverage_complete = true;
greenProof.browser_boundary.indexeddb_unchanged = true;
greenProof.decision = clone(greenProof.decision_at_observation_time);

const greenInput = {
  operatorIntent: api.OPERATOR_INTENT,
  expansionEvidence: greenEvidence,
  oneRecordPilotProof,
  expansionLiveProof: greenProof,
  scopeContract
};

const authorization = api.assessAuthorization(greenInput);
assert.equal(authorization.authorized, true);
assert.equal(authorization.scope_id, "bounded_local_chamber_two_record_candidate_v1");
assert.equal(authorization.max_chamber_records_created, 2);
assert.equal(authorization.expansion_gate_decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
assert.equal(authorization.expansion_live_proof_status, "production_evidence_verified");

function makeActivationApi(initialReviews = []) {
  const reviews = clone(initialReviews);
  return {
    create() {
      return {
        listReviews: () => clone(reviews),
        getAudit: () => []
      };
    }
  };
}

let controller = api.create(greenInput, { activationApi: makeActivationApi() });
let status = controller.getStatus();
assert.equal(status.created_record_count, 0);
assert.equal(status.remaining_record_budget, 2);
assert.equal(status.may_prepare_review, true);

controller = api.create(greenInput, { activationApi: makeActivationApi([
  {
    id: "prior-one-record",
    status: "rolled_back",
    candidate_signature: "a".repeat(64),
    canonical_insight_id: "prior-insight"
  }
]) });
status = controller.getStatus();
assert.equal(status.created_record_count, 1);
assert.equal(status.remaining_record_budget, 1);

controller = api.create(greenInput, { activationApi: makeActivationApi([
  { id: "r1", status: "rolled_back", candidate_signature: "1".repeat(64), canonical_insight_id: "i1" },
  { id: "r2", status: "rolled_back", candidate_signature: "2".repeat(64), canonical_insight_id: "i2" }
]) });
status = controller.getStatus();
assert.equal(status.created_record_count, 2);
assert.equal(status.remaining_record_budget, 0);
assert.equal(status.expansion_budget_exhausted, true);

const corrupt = api.create(greenInput, { activationApi: makeActivationApi([
  { id: "r1", status: "rolled_back", candidate_signature: "1".repeat(64), canonical_insight_id: "i1" },
  { id: "r2", status: "rolled_back", candidate_signature: "2".repeat(64), canonical_insight_id: "i2" },
  { id: "r3", status: "rolled_back", candidate_signature: "3".repeat(64), canonical_insight_id: "i3" }
]) });
assert.throws(() => corrupt.getStatus(), /expansion_historical_record_count_exceeded/);

assert.throws(
  () => api.assessAuthorization({ ...greenInput, operatorIntent: "" }),
  /expansion_operator_intent_missing/
);
assert.throws(
  () => api.assessAuthorization({ ...greenInput, scopeContract: { ...scopeContract, max_chamber_records_created: 3 } }),
  /expansion_scope_contract_mismatch/
);
assert.throws(
  () => api.assessAuthorization({ ...greenInput, expansionLiveProof: { ...greenProof, status: "unverified" } }),
  /expansion_live_proof_invalid/
);
const widened = clone(greenEvidence);
widened.backend_persistent_write_open = true;
assert.throws(
  () => api.assessAuthorization({ ...greenInput, expansionEvidence: widened }),
  /expansion_gate_not_green/
);

const policy = api.policy();
assert.equal(policy.max_chamber_records_created, 2);
assert.equal(policy.activation_mode, "manual_sequential");
assert.equal(policy.lifetime_budget_persists_after_rollback, true);
for (const key of [
  "automatic_activation_open",
  "batch_activation_open",
  "normal_chat_persistence_open",
  "automatic_backfill_open",
  "backend_sync_open",
  "backend_persistent_write_open",
  "broad_canonical_write_open",
  "projection_store_write_open",
  "meta_write_open",
  "remote_write_open"
]) assert.equal(policy[key], false, `${key} must remain closed`);

const source = fs.readFileSync("js/ahaV2ControlledWriteExpansionActivation.js", "utf8");
assert.doesNotMatch(source, /localStorage\s*\./u);
assert.doesNotMatch(source, /sessionStorage\s*\./u);
assert.doesNotMatch(source, /indexedDB\s*\./u);
assert.doesNotMatch(source, /\bfetch\s*\(/u);
assert.doesNotMatch(source, /supabase\s*\./iu);

console.log("aha-v2-controlled-write-expansion-activation.test.cjs: current NO_GO blocks activation; hypothetical fresh green proof remains testable");
