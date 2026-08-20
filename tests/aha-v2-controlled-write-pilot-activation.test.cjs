const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of [
  "js/ahaV2ProductionWriteGate.js",
  "js/ahaV2ControlledWritePilotRollback.js",
  "js/ahaV2ControlledWritePilotActivation.js"
]) vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });

const api = context.AHAV2ControlledWritePilotActivation;
assert.ok(api);
assert.equal(api.ACTIVATION_SCHEMA, "aha_v2_controlled_write_pilot_activation_v1");
assert.equal(api.PILOT_ENABLED, true);
assert.equal(api.OPERATOR_INTENT, "single_local_chamber_insight_v1");

const productionEvidence = JSON.parse(fs.readFileSync("ops/evidence/aha-v2-production-write-gate-current-v1.json", "utf8"));
const rollbackProof = JSON.parse(fs.readFileSync("tests/fixtures/semantic-live-reviewed-v2/controlled-activation-production-v1/proof.json", "utf8"));
const rollbackProvenance = JSON.parse(fs.readFileSync("tests/fixtures/semantic-live-reviewed-v2/controlled-activation-production-v1/provenance.json", "utf8"));

function makeActivationApi(initialReviews = []) {
  const reviews = JSON.parse(JSON.stringify(initialReviews));
  const audit = [];
  return {
    create() {
      return {
        async prepareReview({ candidate_index }) {
          assert.equal(candidate_index, 0);
          audit.push("prepare_review");
          return { request_id: "req-review", approval_phrase: "GODKJENN REVIEW TEST", review_id: "review-1" };
        },
        async approveReview() {
          const review = { id: "review-1", status: "reviewed", canonical_insight_id: null, canonical_signature: null };
          reviews.push(review);
          audit.push("review_committed");
          return JSON.parse(JSON.stringify(review));
        },
        async prepareCanonical({ review_id }) {
          assert.equal(review_id, "review-1");
          audit.push("prepare_canonical");
          return { request_id: "req-canonical", approval_phrase: "GODKJENN CANONICAL TEST", review_id };
        },
        async approveCanonical() {
          const review = reviews.find((item) => item.id === "review-1");
          review.status = "canonical_promoted";
          review.canonical_insight_id = "ins-v2-one";
          review.canonical_signature = "a".repeat(64);
          audit.push("canonical_committed");
          return { review: JSON.parse(JSON.stringify(review)), insight: { id: "ins-v2-one" } };
        },
        prepareRollback({ review_id }) {
          assert.equal(review_id, "review-1");
          audit.push("prepare_rollback");
          return { request_id: "req-rollback", approval_phrase: "GODKJENN ROLLBACK TEST", review_id, canonical_insight_id: "ins-v2-one" };
        },
        async approveRollback() {
          const review = reviews.find((item) => item.id === "review-1");
          review.status = "rolled_back";
          audit.push("canonical_rolled_back");
          return JSON.parse(JSON.stringify(review));
        },
        listReviews: () => JSON.parse(JSON.stringify(reviews)),
        getAudit: () => audit.slice()
      };
    }
  };
}

const input = {
  operatorIntent: api.OPERATOR_INTENT,
  productionEvidence,
  rollbackProof,
  rollbackProvenance
};

const authorization = api.assessAuthorization(input);
assert.equal(authorization.authorized, true);
assert.equal(authorization.production_gate_decision, "CONTROLLED_WRITE_PILOT_ELIGIBLE");
assert.equal(authorization.rollback_status, "ready");
assert.equal(authorization.rollback_production_proof_live, true);
assert.equal(authorization.proposal.scope, "single_local_chamber_insight");
assert.equal(authorization.proposal.max_chamber_records_created, 1);

const controller = api.create(input, { activationApi: makeActivationApi() });
let status = controller.getStatus();
assert.equal(status.authorized, true);
assert.equal(status.phase, "available");
assert.equal(status.created_record_count, 0);
assert.equal(status.may_prepare_review, true);
assert.equal(status.may_prepare_canonical, false);
assert.equal(status.may_prepare_rollback, false);

(async () => {
  const reviewRequest = await controller.prepareReview({ candidate_index: 0 });
  assert.equal(reviewRequest.review_id, "review-1");
  const review = await controller.approveReview({ request_id: reviewRequest.request_id, approval: reviewRequest.approval_phrase });
  assert.equal(review.id, "review-1");

  status = controller.getStatus();
  assert.equal(status.phase, "review_committed");
  assert.equal(status.created_record_count, 0);
  assert.equal(status.may_prepare_review, false);
  assert.equal(status.may_prepare_canonical, true);

  const canonicalRequest = await controller.prepareCanonical({ review_id: review.id });
  const canonical = await controller.approveCanonical({ request_id: canonicalRequest.request_id, approval: canonicalRequest.approval_phrase });
  assert.equal(canonical.insight.id, "ins-v2-one");

  status = controller.getStatus();
  assert.equal(status.phase, "canonical_promoted");
  assert.equal(status.created_record_count, 1);
  assert.equal(status.may_prepare_review, false);
  assert.equal(status.may_prepare_canonical, false);
  assert.equal(status.may_prepare_rollback, true);

  const rollbackRequest = controller.prepareRollback({ review_id: review.id });
  await controller.approveRollback({ request_id: rollbackRequest.request_id, approval: rollbackRequest.approval_phrase });

  status = controller.getStatus();
  assert.equal(status.phase, "rolled_back_complete");
  assert.equal(status.created_record_count, 1, "rollback must not replenish the one-record pilot budget");
  assert.equal(status.pilot_complete, true);
  assert.equal(status.may_prepare_review, false);
  assert.equal(status.may_prepare_rollback, false);

  await assert.rejects(() => controller.prepareReview({ candidate_index: 0 }), /pilot_record_budget_exhausted/);

  const fresh = api.create(input, { activationApi: makeActivationApi() });
  await assert.rejects(() => fresh.prepareReview({ candidate_index: 1 }), /pilot_candidate_index_out_of_scope/);

  assert.throws(
    () => api.create({ ...input, operatorIntent: "" }, { activationApi: makeActivationApi() }),
    /pilot_operator_intent_missing/
  );
  assert.throws(
    () => api.create({ ...input, productionEvidence: { ...productionEvidence, no_persistence_write_observed: false } }, { activationApi: makeActivationApi() }),
    /pilot_production_gate_not_green/
  );
  assert.throws(
    () => api.create({ ...input, rollbackProvenance: { ...rollbackProvenance, artifact_id: -1 } }, { activationApi: makeActivationApi() }),
    /pilot_rollback_not_ready/
  );

  const doubleHistory = makeActivationApi([
    { id: "r-a", status: "rolled_back", canonical_insight_id: "i-a" },
    { id: "r-b", status: "rolled_back", canonical_insight_id: "i-b" }
  ]);
  const corrupt = api.create(input, { activationApi: doubleHistory });
  assert.throws(() => corrupt.getStatus(), /pilot_historical_record_count_exceeded/);

  const policy = api.policy();
  assert.equal(policy.pilot_enabled, true);
  assert.equal(policy.pilot_may_create_local_chamber_record, true);
  assert.equal(policy.pilot_may_execute_exact_rollback, true);
  assert.equal(policy.max_chamber_records_created, 1);
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

  const source = fs.readFileSync("js/ahaV2ControlledWritePilotActivation.js", "utf8");
  assert.doesNotMatch(source, /localStorage\s*\./);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /supabase\s*\./i);
  assert.doesNotMatch(source, /normal_chat_persistence_open:\s*true/);
  assert.doesNotMatch(source, /automatic_backfill_open:\s*true/);
  assert.doesNotMatch(source, /backend_persistent_write_open:\s*true/);

  console.log("aha-v2-controlled-write-pilot-activation.test.cjs: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
