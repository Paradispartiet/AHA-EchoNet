const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const fixtureDir = path.resolve("tests/fixtures/semantic-live-reviewed-v2/post-stability-two-round-v1");
const proof = {
  provenance: JSON.parse(fs.readFileSync(path.join(fixtureDir, "provenance.json"), "utf8")),
  summary: JSON.parse(fs.readFileSync(path.join(fixtureDir, "summary.json"), "utf8"))
};

const context = { window: null, globalThis: null, console };
context.window = context;
context.globalThis = context;
vm.runInNewContext(fs.readFileSync("js/ahaInsightActivationV2.js", "utf8"), context, { filename: "js/ahaInsightActivationV2.js" });
const api = context.AHAInsightActivationV2;

assert.ok(api);
assert.equal(api.ACTIVATION_SCHEMA, "aha_insight_activation_v2");
assert.equal(api.REVIEW_STORAGE_KEY, "aha_insight_review_queue_v2");
assert.equal(api.AUDIT_STORAGE_KEY, "aha_insight_activation_audit_v2");
assert.equal(api.validateProof(proof), true);

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function makeStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    values
  };
}

const sourceText = "Et prosjekt brukte én felles mal for alle rapporter. Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur. Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken.";
const sourceHash = sha256(sourceText);
const candidate = {
  insight: "Delvis standardisering kan bevare sammenlignbarhet samtidig som ulike saker får nødvendig fleksibilitet.",
  type: "tension",
  abstraction: "Kobler ulempen ved én fast struktur med løsningen der noen felt er faste og andre valgfrie.",
  evidence: [
    { quote: "Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur.", role: "supports", spans: [{ anchor_id: "ev_2", start_offset: 56, end_offset: 146 }] },
    { quote: "Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken.", role: "supports", spans: [{ anchor_id: "ev_3", start_offset: 147, end_offset: sourceText.length }] }
  ],
  why_it_matters: "Prinsippet kan brukes når et system må kombinere en felles kjerne med lokal tilpasning.",
  confidence: "high",
  uncertainty: "",
  causal_status: "not_causal"
};
const decision = {
  candidate_index: 0,
  type: "tension",
  confidence: "high",
  causal_status: "not_causal",
  eligible_for_insight_review: true,
  blocking_reasons: [],
  metrics: { quality_score: 0.82, causal_discipline_score: 1, evidence_sentence_count: 2 }
};
const shadow = {
  schema: "aha_insight_synthesis_shadow_v2",
  version: 2,
  source_event_id: "src_activation",
  source_text_hash: sourceHash,
  deterministic_document_id: "sem_activation",
  semantic_model_response_id: "resp_semantic_activation",
  synthesis_model: "gpt-4.1-mini-2025-04-14",
  synthesis_response_id: "resp_synthesis_activation",
  semantic_context: { concepts: [{ label: "standardisering" }, { label: "fleksibilitet" }] },
  candidates: [candidate],
  policy: {
    production_gate_authority: false,
    synthesis_allowed: false,
    canonical_write: false,
    chamber_write: false,
    persistent_write: false,
    meta_write: false
  }
};
const gate = {
  schema: "aha_insight_quality_gate_v2",
  version: 2,
  valid: true,
  source_event_id: "src_activation",
  source_text_hash: sourceHash,
  decisions: [decision],
  gate: {
    production_gate_authority: false,
    synthesis_allowed: false,
    canonical_write: false,
    chamber_write: false,
    persistent_write: false,
    meta_write: false
  }
};

function makeEngine() {
  let next = 0;
  return {
    createEmptyChamber: () => ({ insights: [] }),
    createSignalFromMessage: (text, subjectId, themeId, candidateContext) => ({
      id: `signal_${++next}`,
      timestamp: "2026-08-20T12:00:00.000Z",
      text,
      subject_id: subjectId,
      theme_id: themeId,
      ...candidateContext
    }),
    addSignalToChamberWithMeta: (chamber, signal) => {
      const insight = {
        id: `generated_${next}`,
        subject_id: signal.subject_id,
        theme_id: signal.theme_id,
        source_event_ids: [signal.source_event_id],
        title: signal.candidate_title,
        summary: signal.candidate_summary,
        status: "suggested",
        concepts: signal.candidate_concepts.map((label) => ({ label }))
      };
      chamber.insights.push(insight);
      return { action: "created", insight_id: insight.id };
    }
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => error?.code === code);
}

async function run() {
  const storage = makeStorage({
    [api.CHAMBER_STORAGE_KEY]: JSON.stringify({ insights: [{ id: "existing_insight", title: "Bevar meg" }] })
  });
  const events = [];
  let currentSourceText = sourceText;
  let id = 0;
  const runtime = {
    getLastSynthesisShadow: () => clone(shadow),
    getLastGateEvaluation: () => clone(gate)
  };
  const controller = api.create({
    storage,
    now: () => `2026-08-20T12:00:${String(id).padStart(2, "0")}.000Z`,
    nowMs: () => 1000,
    randomId: () => `id_${++id}`,
    sha256Hex: sha256,
    getRuntime: () => runtime,
    getProof: () => clone(proof),
    getSourceEvent: () => ({ id: "src_activation", text: currentSourceText }),
    getEngine: makeEngine,
    createEvent: (detail) => ({ type: "aha:insight-activation-v2", detail }),
    dispatchEvent: (event) => events.push(event)
  });

  assert.deepEqual(controller.getStatus(), {
    schema: "aha_insight_activation_v2",
    review_count: 0,
    canonical_count: 0,
    rolled_back_count: 0,
    local_review_queue_write: true,
    bounded_local_chamber_write: true,
    automatic_canonical_write: false,
    backend_persistent_write: false,
    backend_sync: false,
    meta_write: false
  });

  const rejectedRequest = await controller.prepareReview({ candidate_index: 0 });
  await expectCode(controller.approveReview({ request_id: rejectedRequest.request_id, approval: "feil" }), "activation_approval_mismatch");
  await expectCode(controller.approveReview({ request_id: rejectedRequest.request_id, approval: rejectedRequest.approval_phrase }), "activation_approval_request_invalid");
  assert.equal(controller.listReviews().length, 0);

  const reviewRequest = await controller.prepareReview({ candidate_index: 0 });
  const review = await controller.approveReview({ request_id: reviewRequest.request_id, approval: reviewRequest.approval_phrase });
  assert.equal(review.status, "reviewed");
  assert.equal(review.candidate_signature, reviewRequest.candidate_signature);
  assert.equal(controller.listReviews().length, 1);
  assert.deepEqual(JSON.parse(storage.getItem(api.CHAMBER_STORAGE_KEY)).insights.map((item) => item.id), ["existing_insight"]);

  await expectCode(controller.prepareReview({ candidate_index: 0 }), "activation_candidate_already_reviewed");

  const staleRequest = await controller.prepareCanonical({ review_id: review.id });
  currentSourceText += " Endret.";
  await expectCode(controller.approveCanonical({ request_id: staleRequest.request_id, approval: staleRequest.approval_phrase }), "activation_source_stale");
  assert.deepEqual(JSON.parse(storage.getItem(api.CHAMBER_STORAGE_KEY)).insights.map((item) => item.id), ["existing_insight"]);
  currentSourceText = sourceText;

  const canonicalRequest = await controller.prepareCanonical({ review_id: review.id });
  const promoted = await controller.approveCanonical({ request_id: canonicalRequest.request_id, approval: canonicalRequest.approval_phrase });
  assert.equal(promoted.review.status, "canonical_promoted");
  assert.equal(promoted.insight.activation_v2.backend_sync_allowed, false);
  assert.equal(promoted.insight.activation_v2.meta_write_allowed, false);
  let chamber = JSON.parse(storage.getItem(api.CHAMBER_STORAGE_KEY));
  assert.deepEqual(chamber.insights.map((item) => item.id), ["existing_insight", promoted.insight.id]);
  assert.equal(controller.getStatus().canonical_count, 1);

  const tamperedRollback = controller.prepareRollback({ review_id: review.id });
  chamber.insights[1].activation_v2.why_it_matters = "Manipulert";
  storage.setItem(api.CHAMBER_STORAGE_KEY, JSON.stringify(chamber));
  await expectCode(controller.approveRollback({ request_id: tamperedRollback.request_id, approval: tamperedRollback.approval_phrase }), "activation_rollback_target_modified");
  chamber.insights[1] = clone(promoted.insight);
  storage.setItem(api.CHAMBER_STORAGE_KEY, JSON.stringify(chamber));

  const rollbackRequest = controller.prepareRollback({ review_id: review.id });
  const rolledBack = await controller.approveRollback({ request_id: rollbackRequest.request_id, approval: rollbackRequest.approval_phrase });
  assert.equal(rolledBack.status, "rolled_back");
  chamber = JSON.parse(storage.getItem(api.CHAMBER_STORAGE_KEY));
  assert.deepEqual(chamber.insights.map((item) => item.id), ["existing_insight"]);
  assert.equal(controller.getStatus().rolled_back_count, 1);
  assert.deepEqual(events.map((event) => event.detail.action), ["review_committed", "canonical_committed", "canonical_rolled_back"]);

  const serializedAudit = JSON.stringify(controller.getAudit());
  assert.equal(serializedAudit.includes(sourceText), false);
  assert.equal(serializedAudit.includes(candidate.insight), false);
  assert.match(serializedAudit, /approve_review/);
  assert.match(serializedAudit, /approve_canonical/);
  assert.match(serializedAudit, /approve_rollback/);

  const auditLog = JSON.parse(storage.getItem(api.AUDIT_STORAGE_KEY));
  auditLog.events[0].outcome = "tampered";
  storage.setItem(api.AUDIT_STORAGE_KEY, JSON.stringify(auditLog));
  assert.throws(() => controller.getAudit(), (error) => error?.code === "activation_audit_integrity_failed");

  const badProof = clone(proof);
  badProof.summary.stable_all_six_match = false;
  const blocked = api.create({
    storage: makeStorage(),
    randomId: () => "blocked",
    sha256Hex: sha256,
    getRuntime: () => runtime,
    getProof: () => badProof,
    getSourceEvent: () => ({ id: "src_activation", text: sourceText })
  });
  await expectCode(blocked.prepareReview({ candidate_index: 0 }), "activation_proof_stability_failed");

  const changedShadow = clone(shadow);
  changedShadow.policy.chamber_write = true;
  const unsafeRuntime = {
    getLastSynthesisShadow: () => clone(changedShadow),
    getLastGateEvaluation: () => clone(gate)
  };
  const unsafe = api.create({
    storage: makeStorage(),
    randomId: () => "unsafe",
    sha256Hex: sha256,
    getRuntime: () => unsafeRuntime,
    getProof: () => proof,
    getSourceEvent: () => ({ id: "src_activation", text: sourceText })
  });
  await expectCode(unsafe.prepareReview({ candidate_index: 0 }), "activation_shadow_policy_invalid:chamber_write");

  const compensatingStorage = makeStorage({
    [api.CHAMBER_STORAGE_KEY]: JSON.stringify({ insights: [{ id: "existing_compensation" }] })
  });
  const originalSetItem = compensatingStorage.setItem;
  let auditWrites = 0;
  compensatingStorage.setItem = (key, value) => {
    if (key === api.AUDIT_STORAGE_KEY && ++auditWrites === 3) throw new Error("simulated_audit_commit_failure");
    originalSetItem(key, value);
  };
  let compensationId = 0;
  const compensating = api.create({
    storage: compensatingStorage,
    now: () => "2026-08-20T13:00:00.000Z",
    nowMs: () => 2000,
    randomId: () => `comp_${++compensationId}`,
    sha256Hex: sha256,
    getRuntime: () => runtime,
    getProof: () => proof,
    getSourceEvent: () => ({ id: "src_activation", text: sourceText }),
    getEngine: makeEngine
  });
  const compensatingRequest = await compensating.prepareReview({ candidate_index: 0 });
  await assert.rejects(
    compensating.approveReview({ request_id: compensatingRequest.request_id, approval: compensatingRequest.approval_phrase }),
    /simulated_audit_commit_failure/
  );
  assert.equal(compensating.listReviews().length, 0);
  assert.deepEqual(JSON.parse(compensatingStorage.getItem(api.CHAMBER_STORAGE_KEY)).insights.map((item) => item.id), ["existing_compensation"]);
  assert.equal(compensating.getAudit().at(-1).outcome, "failed");

  console.log("aha-insight-activation-v2 passed: two approvals, audit, stale-source block and exact rollback");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
