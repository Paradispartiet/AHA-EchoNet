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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeActivationApi(initialReviews = [], options = {}) {
  const reviews = clone(initialReviews);
  const audit = [];
  const reviewRequests = new Map();
  const canonicalRequests = new Map();
  const rollbackRequests = new Map();
  let reviewOrdinal = 0;
  let canonicalOrdinal = 0;
  let rollbackOrdinal = 0;

  function signature(candidateIndex, ordinal) {
    if (typeof options.signatureFactory === "function") return options.signatureFactory(candidateIndex, ordinal);
    const n = ((candidateIndex + ordinal) % 15) + 1;
    return n.toString(16).repeat(64);
  }

  return {
    _reviews: reviews,
    create() {
      return {
        async prepareReview({ candidate_index }) {
          reviewOrdinal += 1;
          const requestId = `req-review-${reviewOrdinal}`;
          const reviewId = `review-${reviewOrdinal}`;
          const candidateSignature = signature(candidate_index, reviewOrdinal);
          reviewRequests.set(requestId, { reviewId, candidateIndex: candidate_index, candidateSignature });
          audit.push(`prepare_review:${reviewId}`);
          return {
            request_id: requestId,
            approval_phrase: `GODKJENN REVIEW ${reviewOrdinal}`,
            review_id: reviewId,
            candidate_index,
            candidate_signature: candidateSignature
          };
        },
        async approveReview({ request_id }) {
          const pending = reviewRequests.get(request_id);
          reviewRequests.delete(request_id);
          assert.ok(pending, "review request must exist");
          const review = {
            id: pending.reviewId,
            status: "reviewed",
            candidate_index: pending.candidateIndex,
            candidate_signature: pending.candidateSignature,
            source_event_id: `source-${pending.reviewId}`,
            source_text_hash: "d".repeat(64),
            canonical_insight_id: null,
            canonical_signature: null
          };
          reviews.push(review);
          audit.push(`review_committed:${review.id}`);
          return clone(review);
        },
        async prepareCanonical({ review_id }) {
          const review = reviews.find((item) => item.id === review_id);
          assert.equal(review?.status, "reviewed");
          canonicalOrdinal += 1;
          const requestId = `req-canonical-${canonicalOrdinal}`;
          canonicalRequests.set(requestId, review_id);
          audit.push(`prepare_canonical:${review_id}`);
          return { request_id: requestId, approval_phrase: `GODKJENN CANONICAL ${canonicalOrdinal}`, review_id };
        },
        async approveCanonical({ request_id }) {
          const reviewId = canonicalRequests.get(request_id);
          canonicalRequests.delete(request_id);
          const review = reviews.find((item) => item.id === reviewId);
          assert.equal(review?.status, "reviewed");
          review.status = "canonical_promoted";
          review.canonical_insight_id = `ins-${review.id}`;
          review.canonical_signature = "e".repeat(64);
          audit.push(`canonical_committed:${review.id}`);
          return { review: clone(review), insight: { id: review.canonical_insight_id } };
        },
        prepareRollback({ review_id }) {
          const review = reviews.find((item) => item.id === review_id);
          assert.equal(review?.status, "canonical_promoted");
          rollbackOrdinal += 1;
          const requestId = `req-rollback-${rollbackOrdinal}`;
          rollbackRequests.set(requestId, review_id);
          audit.push(`prepare_rollback:${review_id}`);
          return {
            request_id: requestId,
            approval_phrase: `GODKJENN ROLLBACK ${rollbackOrdinal}`,
            review_id,
            canonical_insight_id: review.canonical_insight_id
          };
        },
        async approveRollback({ request_id }) {
          const reviewId = rollbackRequests.get(request_id);
          rollbackRequests.delete(request_id);
          const review = reviews.find((item) => item.id === reviewId);
          assert.equal(review?.status, "canonical_promoted");
          review.status = "rolled_back";
          audit.push(`canonical_rolled_back:${review.id}`);
          return clone(review);
        },
        listReviews: () => clone(reviews),
        getAudit: () => audit.slice()
      };
    }
  };
}

const input = {
  operatorIntent: api.OPERATOR_INTENT,
  expansionEvidence,
  oneRecordPilotProof,
  expansionLiveProof,
  scopeContract
};

const authorization = api.assessAuthorization(input);
assert.equal(authorization.authorized, true);
assert.equal(authorization.scope_id, "bounded_local_chamber_two_record_candidate_v1");
assert.equal(authorization.max_chamber_records_created, 2);
assert.equal(authorization.expansion_gate_decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
assert.equal(authorization.expansion_live_proof_status, "production_evidence_verified");

(async () => {
  const activationApi = makeActivationApi();
  const controller = api.create(input, { activationApi });

  let status = controller.getStatus();
  assert.equal(status.phase, "available");
  assert.equal(status.created_record_count, 0);
  assert.equal(status.remaining_record_budget, 2);
  assert.equal(status.may_prepare_review, true);
  assert.equal(status.may_prepare_canonical, false);
  assert.equal(status.may_prepare_rollback, false);

  const reviewReq1 = await controller.prepareReview({ candidate_index: 0 });
  const review1 = await controller.approveReview({ request_id: reviewReq1.request_id, approval: reviewReq1.approval_phrase });
  status = controller.getStatus();
  assert.equal(status.phase, "review_committed");
  assert.equal(status.active_review_id, review1.id);
  assert.equal(status.created_record_count, 0);
  assert.equal(status.may_prepare_review, false);
  assert.equal(status.may_prepare_canonical, true);
  await assert.rejects(() => controller.prepareReview({ candidate_index: 1 }), /expansion_activation_already_in_progress/);

  const canonicalReq1 = await controller.prepareCanonical({ review_id: review1.id });
  const canonical1 = await controller.approveCanonical({ request_id: canonicalReq1.request_id, approval: canonicalReq1.approval_phrase });
  assert.equal(canonical1.insight.id, `ins-${review1.id}`);
  status = controller.getStatus();
  assert.equal(status.created_record_count, 1);
  assert.equal(status.remaining_record_budget, 1);
  assert.equal(status.may_prepare_review, true);
  assert.equal(status.may_prepare_rollback, true);
  assert.ok(status.promoted_review_ids.includes(review1.id));

  const reviewReq2 = await controller.prepareReview({ candidate_index: 1 });
  const review2 = await controller.approveReview({ request_id: reviewReq2.request_id, approval: reviewReq2.approval_phrase });
  const canonicalReq2 = await controller.prepareCanonical({ review_id: review2.id });
  const canonical2 = await controller.approveCanonical({ request_id: canonicalReq2.request_id, approval: canonicalReq2.approval_phrase });
  assert.equal(canonical2.insight.id, `ins-${review2.id}`);

  status = controller.getStatus();
  assert.equal(status.created_record_count, 2);
  assert.equal(status.remaining_record_budget, 0);
  assert.equal(status.expansion_budget_exhausted, true);
  assert.equal(status.may_prepare_review, false);
  assert.deepEqual(status.promoted_review_ids.sort(), [review1.id, review2.id].sort());
  await assert.rejects(() => controller.prepareReview({ candidate_index: 2 }), /expansion_record_budget_exhausted/);

  const rollbackReq2 = controller.prepareRollback({ review_id: review2.id });
  await controller.approveRollback({ request_id: rollbackReq2.request_id, approval: rollbackReq2.approval_phrase });
  status = controller.getStatus();
  assert.equal(status.created_record_count, 2, "rollback must not replenish the two-record lifetime budget");
  assert.ok(status.promoted_review_ids.includes(review1.id), "rollback of record 2 must not alter record 1");
  assert.ok(status.rolled_back_review_ids.includes(review2.id));
  await assert.rejects(() => controller.prepareReview({ candidate_index: 2 }), /expansion_record_budget_exhausted/);

  const rollbackReq1 = controller.prepareRollback({ review_id: review1.id });
  await controller.approveRollback({ request_id: rollbackReq1.request_id, approval: rollbackReq1.approval_phrase });
  status = controller.getStatus();
  assert.equal(status.phase, "budget_exhausted");
  assert.equal(status.created_record_count, 2);
  assert.equal(status.expansion_complete, true);
  assert.equal(status.may_prepare_rollback, false);

  const fresh = api.create(input, { activationApi });
  const freshStatus = fresh.getStatus();
  assert.equal(freshStatus.created_record_count, 2);
  assert.equal(freshStatus.remaining_record_budget, 0);
  await assert.rejects(() => fresh.prepareReview({ candidate_index: 0 }), /expansion_record_budget_exhausted/);

  const priorOneRecord = makeActivationApi([
    {
      id: "prior-one-record",
      status: "rolled_back",
      candidate_signature: "a".repeat(64),
      canonical_insight_id: "prior-insight",
      canonical_signature: "b".repeat(64)
    }
  ]);
  const oneSlotLeft = api.create(input, { activationApi: priorOneRecord });
  assert.equal(oneSlotLeft.getStatus().remaining_record_budget, 1);
  const priorReq = await oneSlotLeft.prepareReview({ candidate_index: 4 });
  const priorReview = await oneSlotLeft.approveReview({ request_id: priorReq.request_id, approval: priorReq.approval_phrase });
  const priorCanonicalReq = await oneSlotLeft.prepareCanonical({ review_id: priorReview.id });
  await oneSlotLeft.approveCanonical({ request_id: priorCanonicalReq.request_id, approval: priorCanonicalReq.approval_phrase });
  assert.equal(oneSlotLeft.getStatus().created_record_count, 2);
  await assert.rejects(() => oneSlotLeft.prepareReview({ candidate_index: 5 }), /expansion_record_budget_exhausted/);

  const duplicateSignature = "c".repeat(64);
  const duplicateApi = makeActivationApi([
    {
      id: "prior-duplicate",
      status: "rolled_back",
      candidate_signature: duplicateSignature,
      canonical_insight_id: "prior-duplicate-insight",
      canonical_signature: "f".repeat(64)
    }
  ], {
    signatureFactory: () => duplicateSignature
  });
  const duplicateController = api.create(input, { activationApi: duplicateApi });
  await assert.rejects(() => duplicateController.prepareReview({ candidate_index: 0 }), /expansion_candidate_already_consumed/);
  assert.equal(duplicateApi._reviews.length, 1, "duplicate candidate must be blocked before a review write");

  assert.throws(
    () => api.create({ ...input, operatorIntent: "" }, { activationApi: makeActivationApi() }),
    /expansion_operator_intent_missing/
  );
  assert.throws(
    () => api.create({ ...input, expansionEvidence: { ...expansionEvidence, no_unexpected_persistence_write_observed: false } }, { activationApi: makeActivationApi() }),
    /expansion_gate_not_green/
  );
  assert.throws(
    () => api.create({ ...input, scopeContract: { ...scopeContract, max_chamber_records_created: 3 } }, { activationApi: makeActivationApi() }),
    /expansion_scope_contract_mismatch/
  );
  assert.throws(
    () => api.create({ ...input, expansionLiveProof: { ...expansionLiveProof, status: "unverified" } }, { activationApi: makeActivationApi() }),
    /expansion_live_proof_invalid/
  );

  const corruptHistory = makeActivationApi([
    { id: "r1", status: "rolled_back", candidate_signature: "1".repeat(64), canonical_insight_id: "i1" },
    { id: "r2", status: "rolled_back", candidate_signature: "2".repeat(64), canonical_insight_id: "i2" },
    { id: "r3", status: "rolled_back", candidate_signature: "3".repeat(64), canonical_insight_id: "i3" }
  ]);
  const corrupt = api.create(input, { activationApi: corruptHistory });
  assert.throws(() => corrupt.getStatus(), /expansion_historical_record_count_exceeded/);

  const policy = api.policy();
  assert.equal(policy.expansion_enabled, true);
  assert.equal(policy.max_chamber_records_created, 2);
  assert.equal(policy.activation_mode, "manual_sequential");
  assert.equal(policy.source_binding_per_record, true);
  assert.equal(policy.lifetime_budget_persists_after_rollback, true);
  assert.equal(policy.duplicate_candidate_consumes_second_slot, false);
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
  assert.doesNotMatch(source, /normal_chat_persistence_open:\s*true/u);
  assert.doesNotMatch(source, /backend_persistent_write_open:\s*true/u);

  console.log("aha-v2-controlled-write-expansion-activation.test.cjs: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
