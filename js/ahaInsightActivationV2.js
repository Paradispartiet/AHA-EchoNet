// ahaInsightActivationV2.js
// Controlled, operator-only activation boundary for Insight Synthesis V2.
//
// The public synthesis endpoint and its quality gate remain shadow-only. This
// controller consumes an eligible in-memory shadow, requires the permanent
// two-round production proof, then enforces two distinct approvals:
//   1. add one candidate to a dedicated local review queue;
//   2. promote that reviewed candidate to the local Insight Chamber.
//
// It never calls backend sync, Supabase, Meta, or any remote write API.

(function (global) {
  "use strict";

  const ACTIVATION_SCHEMA = "aha_insight_activation_v2";
  const REVIEW_QUEUE_SCHEMA = "aha_insight_review_queue_v2";
  const AUDIT_SCHEMA = "aha_insight_activation_audit_v2";
  const REVIEW_STORAGE_KEY = "aha_insight_review_queue_v2";
  const AUDIT_STORAGE_KEY = "aha_insight_activation_audit_v2";
  const CHAMBER_STORAGE_KEY = "aha_insight_chamber_v1";
  const CHALLENGE_TTL_MS = 10 * 60 * 1000;
  const PROOF = Object.freeze({
    workflow_run_id: 32366046900,
    artifact_id: 9405381366,
    artifact_digest: "sha256:0284594f709bf224076f2a93e9d7cdb9c200d91c8bbc8aec92f7fc040337dbac",
    production_main: "02521a405c46294f40e7a9361564cde120e656a0",
    round_count: 2,
    valid_output_counts: Object.freeze([6, 6]),
    v2_f1: Object.freeze([1, 1])
  });

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }

  function fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }

  function parseStored(raw, fallback, schema) {
    if (!raw) return clone(fallback);
    let value;
    try { value = JSON.parse(raw); }
    catch { fail("activation_storage_invalid_json"); }
    if (!value || value.schema !== schema || !Array.isArray(value.items || value.events)) {
      fail("activation_storage_schema_invalid");
    }
    return value;
  }

  function validateProof(proof) {
    const provenance = proof?.provenance;
    const summary = proof?.summary;
    if (provenance?.schema !== "aha_insight_synthesis_v2_two_round_provenance_v1") fail("activation_proof_provenance_invalid");
    if (summary?.schema !== "aha_insight_synthesis_v2_delegation_postfix_live_gold_v1") fail("activation_proof_summary_invalid");
    if (provenance.workflow_run_id !== PROOF.workflow_run_id) fail("activation_proof_run_mismatch");
    if (provenance.artifact_id !== PROOF.artifact_id) fail("activation_proof_artifact_mismatch");
    if (provenance.artifact_digest !== PROOF.artifact_digest) fail("activation_proof_digest_mismatch");
    if (provenance.production_main !== PROOF.production_main) fail("activation_proof_main_mismatch");
    if (summary.round_count !== PROOF.round_count || summary.stable_all_six_match !== true || summary.all_rounds_six_valid !== true) {
      fail("activation_proof_stability_failed");
    }
    const rounds = safeArray(summary.rounds);
    if (rounds.length !== PROOF.round_count) fail("activation_proof_rounds_invalid");
    rounds.forEach((round, index) => {
      if (round.valid_output_count !== PROOF.valid_output_counts[index]) fail("activation_proof_valid_count_mismatch");
      if (round.v2_review?.f1 !== PROOF.v2_f1[index]) fail("activation_proof_f1_mismatch");
    });
    ["production_gate_authority", "synthesis_allowed", "canonical_write", "chamber_write", "meta_write", "persistent_write"]
      .forEach((field) => {
        if (summary[field] !== false) fail(`activation_proof_policy_invalid:${field}`);
      });
    return true;
  }

  function validateShadowAndGate(shadow, gate, candidateIndex) {
    if (shadow?.schema !== "aha_insight_synthesis_shadow_v2" || shadow.version !== 2) fail("activation_shadow_invalid");
    if (gate?.schema !== "aha_insight_quality_gate_v2" || gate.version !== 2 || gate.valid !== true) fail("activation_gate_invalid");
    if (!shadow.source_event_id || !shadow.source_text_hash) fail("activation_source_binding_missing");
    if (!/^[a-f0-9]{64}$/u.test(String(shadow.source_text_hash))) fail("activation_source_hash_invalid");
    if (gate.source_event_id !== shadow.source_event_id || gate.source_text_hash !== shadow.source_text_hash) fail("activation_gate_binding_mismatch");
    ["production_gate_authority", "synthesis_allowed", "canonical_write", "chamber_write", "persistent_write", "meta_write"]
      .forEach((field) => {
        if (shadow.policy?.[field] !== false) fail(`activation_shadow_policy_invalid:${field}`);
        if (gate.gate?.[field] !== false) fail(`activation_gate_policy_invalid:${field}`);
      });
    const candidate = safeArray(shadow.candidates)[candidateIndex];
    const decision = safeArray(gate.decisions).find((item) => item?.candidate_index === candidateIndex);
    if (!candidate || !decision) fail("activation_candidate_missing");
    if (decision.eligible_for_insight_review !== true || safeArray(decision.blocking_reasons).length) fail("activation_candidate_ineligible");
    if (!String(candidate.insight || "").trim() || safeArray(candidate.evidence).length < 2) fail("activation_candidate_content_invalid");
    return { candidate, decision };
  }

  function create(deps = {}) {
    const storage = deps.storage || global.localStorage;
    const now = typeof deps.now === "function" ? deps.now : () => new Date().toISOString();
    const nowMs = typeof deps.nowMs === "function" ? deps.nowMs : () => Date.now();
    const randomId = typeof deps.randomId === "function"
      ? deps.randomId
      : () => global.crypto?.randomUUID?.() || fail("activation_secure_id_unavailable");
    const sha256Hex = typeof deps.sha256Hex === "function"
      ? deps.sha256Hex
      : (value) => global.AHASemanticDocument?.sha256Hex?.(value) || fail("activation_hash_unavailable");
    const getRuntime = typeof deps.getRuntime === "function" ? deps.getRuntime : () => global.AHAInsightSynthesisV2Runtime;
    const getProof = typeof deps.getProof === "function" ? deps.getProof : () => global.AHA_INSIGHT_ACTIVATION_PROOF_V2;
    const getSourceEvent = typeof deps.getSourceEvent === "function"
      ? deps.getSourceEvent
      : (sourceEventId) => safeArray(global.AHASources?.loadSourceEvents?.()).find((item) => String(item?.id || "") === String(sourceEventId || ""));
    const getEngine = typeof deps.getEngine === "function" ? deps.getEngine : () => global.InsightsEngine;
    const createEvent = typeof deps.createEvent === "function"
      ? deps.createEvent
      : (detail) => new global.CustomEvent("aha:insight-activation-v2", { detail });
    const dispatchEvent = typeof deps.dispatchEvent === "function" ? deps.dispatchEvent : (event) => global.dispatchEvent?.(event);
    const chamberStorageKey = deps.chamberStorageKey || global.AHAChatChamberStore?.STORAGE_KEY || CHAMBER_STORAGE_KEY;
    const challenges = new Map();

    function requireStorage() {
      if (typeof storage?.getItem !== "function" || typeof storage?.setItem !== "function" || typeof storage?.removeItem !== "function") {
        fail("activation_storage_unavailable");
      }
    }

    function hashSync(value) {
      const digest = sha256Hex(value);
      if (typeof digest !== "string" || !/^[a-f0-9]{64}$/u.test(digest)) fail("activation_hash_invalid");
      return digest;
    }

    async function hashAsync(value) {
      const digest = await sha256Hex(value);
      if (typeof digest !== "string" || !/^[a-f0-9]{64}$/u.test(digest)) fail("activation_hash_invalid");
      return digest;
    }

    function readQueue() {
      requireStorage();
      return parseStored(storage.getItem(REVIEW_STORAGE_KEY), { schema: REVIEW_QUEUE_SCHEMA, version: 2, items: [] }, REVIEW_QUEUE_SCHEMA);
    }

    function readAudit() {
      requireStorage();
      const log = parseStored(storage.getItem(AUDIT_STORAGE_KEY), { schema: AUDIT_SCHEMA, version: 2, events: [] }, AUDIT_SCHEMA);
      let previousHash = null;
      log.events.forEach((event) => {
        const storedHash = event?.event_hash;
        const hashInput = clone(event);
        delete hashInput.event_hash;
        if (event?.previous_event_hash !== previousHash || hashSync(stableStringify(hashInput)) !== storedHash) {
          fail("activation_audit_integrity_failed");
        }
        previousHash = storedHash;
      });
      return log;
    }

    function writeVerified(key, value) {
      const serialized = JSON.stringify(value);
      storage.setItem(key, serialized);
      if (storage.getItem(key) !== serialized) fail("activation_storage_verification_failed");
    }

    function restoreRaw(key, raw) {
      if (raw == null) storage.removeItem(key);
      else storage.setItem(key, raw);
      if (storage.getItem(key) !== raw) fail("activation_compensation_failed");
    }

    function audit(action, outcome, fields = {}) {
      const log = readAudit();
      const event = {
        id: `audit_v2_${randomId()}`,
        at: now(),
        action,
        outcome,
        review_id: fields.review_id || null,
        source_event_id: fields.source_event_id || null,
        candidate_signature: fields.candidate_signature || null,
        canonical_insight_id: fields.canonical_insight_id || null,
        reason: fields.reason || null,
        previous_event_hash: log.events.at(-1)?.event_hash || null
      };
      event.event_hash = hashSync(stableStringify(event));
      log.events.push(event);
      writeVerified(AUDIT_STORAGE_KEY, log);
    }

    async function currentSourceBinding(sourceEventId, expectedHash) {
      const sourceEvent = getSourceEvent(sourceEventId);
      const sourceText = String(sourceEvent?.text || "");
      if (!sourceText) fail("activation_source_missing");
      const actualHash = await hashAsync(sourceText);
      if (actualHash !== expectedHash) fail("activation_source_stale");
      return { sourceEvent, sourceText };
    }

    async function candidateSignature(shadow, candidateIndex, candidate, decision) {
      return hashAsync(stableStringify({
        schema: ACTIVATION_SCHEMA,
        source_event_id: shadow.source_event_id,
        source_text_hash: shadow.source_text_hash,
        synthesis_response_id: shadow.synthesis_response_id,
        candidate_index: candidateIndex,
        candidate,
        decision
      }));
    }

    async function candidateSignatureFromReview(review) {
      return hashAsync(stableStringify({
        schema: ACTIVATION_SCHEMA,
        source_event_id: review.source_event_id,
        source_text_hash: review.source_text_hash,
        synthesis_response_id: review.synthesis_response_id,
        candidate_index: review.candidate_index,
        candidate: review.candidate,
        decision: review.gate_decision
      }));
    }

    function makeChallenge(kind, targetId, binding = {}) {
      const requestId = `request_v2_${randomId()}`;
      const nonce = String(randomId()).replace(/[^a-z0-9]/gi, "").slice(-8).toUpperCase();
      const word = kind === "review" ? "REVIEW" : kind === "canonical" ? "CANONICAL" : "ROLLBACK";
      const phrase = `GODKJENN ${word} ${nonce}`;
      challenges.set(requestId, {
        kind,
        target_id: targetId,
        phrase,
        expires_at_ms: nowMs() + CHALLENGE_TTL_MS,
        binding: clone(binding)
      });
      return { request_id: requestId, approval_phrase: phrase, expires_in_seconds: CHALLENGE_TTL_MS / 1000 };
    }

    function consumeChallenge(requestId, approval, kind) {
      const challenge = challenges.get(requestId);
      challenges.delete(requestId);
      function reject(code) {
        try {
          audit(`approve_${kind}`, "failed", {
            review_id: challenge?.target_id || null,
            source_event_id: challenge?.binding?.source_event_id || null,
            reason: code
          });
        } catch {}
        fail(code);
      }
      if (!challenge || challenge.kind !== kind) reject("activation_approval_request_invalid");
      if (nowMs() > challenge.expires_at_ms) reject("activation_approval_expired");
      if (String(approval || "") !== challenge.phrase) reject("activation_approval_mismatch");
      return challenge;
    }

    async function prepareReview({ candidate_index = 0 } = {}) {
      validateProof(getProof());
      const runtime = getRuntime();
      const shadow = runtime?.getLastSynthesisShadow?.();
      const gate = runtime?.getLastGateEvaluation?.();
      const { candidate, decision } = validateShadowAndGate(shadow, gate, candidate_index);
      await currentSourceBinding(shadow.source_event_id, shadow.source_text_hash);
      const signature = await candidateSignature(shadow, candidate_index, candidate, decision);
      const queue = readQueue();
      if (queue.items.some((item) => item.candidate_signature === signature && item.status !== "rolled_back")) {
        fail("activation_candidate_already_reviewed");
      }
      const reviewId = `review_v2_${randomId()}`;
      const challenge = makeChallenge("review", reviewId, {
        source_event_id: shadow.source_event_id,
        source_text_hash: shadow.source_text_hash,
        candidate_index,
        candidate_signature: signature,
        synthesis_response_id: shadow.synthesis_response_id
      });
      audit("prepare_review", "ready", {
        review_id: reviewId,
        source_event_id: shadow.source_event_id,
        candidate_signature: signature
      });
      return clone({
        ...challenge,
        review_id: reviewId,
        candidate_index,
        candidate_signature: signature,
        candidate,
        gate_metrics: decision.metrics
      });
    }

    async function approveReview({ request_id, approval } = {}) {
      const challenge = consumeChallenge(request_id, approval, "review");
      const beforeQueue = storage.getItem(REVIEW_STORAGE_KEY);
      const beforeAudit = storage.getItem(AUDIT_STORAGE_KEY);
      try {
        audit("approve_review", "requested", {
          review_id: challenge.target_id,
          source_event_id: challenge.binding.source_event_id,
          candidate_signature: challenge.binding.candidate_signature
        });
        const runtime = getRuntime();
        const shadow = runtime?.getLastSynthesisShadow?.();
        const gate = runtime?.getLastGateEvaluation?.();
        validateProof(getProof());
        const candidateIndex = challenge.binding.candidate_index;
        const { candidate, decision } = validateShadowAndGate(shadow, gate, candidateIndex);
        await currentSourceBinding(challenge.binding.source_event_id, challenge.binding.source_text_hash);
        const signature = await candidateSignature(shadow, candidateIndex, candidate, decision);
        if (signature !== challenge.binding.candidate_signature) fail("activation_candidate_changed");
        const queue = readQueue();
        if (queue.items.some((item) => item.id === challenge.target_id || (item.candidate_signature === signature && item.status !== "rolled_back"))) {
          fail("activation_candidate_already_reviewed");
        }
        const review = {
          schema: ACTIVATION_SCHEMA,
          version: 2,
          id: challenge.target_id,
          status: "reviewed",
          reviewed_at: now(),
          source_event_id: shadow.source_event_id,
          source_text_hash: shadow.source_text_hash,
          deterministic_document_id: shadow.deterministic_document_id || null,
          semantic_model_response_id: shadow.semantic_model_response_id || null,
          synthesis_model: shadow.synthesis_model || null,
          synthesis_response_id: shadow.synthesis_response_id || null,
          candidate_index: candidateIndex,
          candidate_signature: signature,
          candidate: clone(candidate),
          semantic_concepts: safeArray(shadow.semantic_context?.concepts).map((item) => String(item?.label || "")).filter(Boolean).slice(0, 12),
          gate_decision: clone(decision),
          gate_metrics: clone(decision.metrics),
          proof: clone(PROOF),
          canonical_insight_id: null,
          canonical_signature: null
        };
        queue.items.push(review);
        writeVerified(REVIEW_STORAGE_KEY, queue);
        audit("approve_review", "committed", {
          review_id: review.id,
          source_event_id: review.source_event_id,
          candidate_signature: signature
        });
        dispatchEvent(createEvent({ action: "review_committed", review_id: review.id, source_event_id: review.source_event_id }));
        return clone(review);
      } catch (error) {
        restoreRaw(REVIEW_STORAGE_KEY, beforeQueue);
        restoreRaw(AUDIT_STORAGE_KEY, beforeAudit);
        try { audit("approve_review", "failed", { review_id: challenge.target_id, reason: error.code || error.message }); } catch {}
        throw error;
      }
    }

    async function prepareCanonical({ review_id } = {}) {
      const queue = readQueue();
      const review = queue.items.find((item) => item.id === review_id);
      if (!review || review.status !== "reviewed" || review.canonical_insight_id) fail("activation_review_not_promotable");
      validateProof(getProof());
      await currentSourceBinding(review.source_event_id, review.source_text_hash);
      if (await candidateSignatureFromReview(review) !== review.candidate_signature) fail("activation_review_integrity_failed");
      const challenge = makeChallenge("canonical", review.id, {
        candidate_signature: review.candidate_signature,
        source_event_id: review.source_event_id,
        source_text_hash: review.source_text_hash
      });
      audit("prepare_canonical", "ready", {
        review_id: review.id,
        source_event_id: review.source_event_id,
        candidate_signature: review.candidate_signature
      });
      return clone({ ...challenge, review_id: review.id, candidate_signature: review.candidate_signature });
    }

    function loadChamber() {
      const raw = storage.getItem(chamberStorageKey);
      if (!raw) return { insights: [] };
      let chamber;
      try { chamber = JSON.parse(raw); } catch { fail("activation_chamber_invalid_json"); }
      if (!chamber || typeof chamber !== "object" || !Array.isArray(chamber.insights)) fail("activation_chamber_invalid");
      return chamber;
    }

    async function buildCanonicalInsight(review) {
      const engine = getEngine();
      if (!engine?.createEmptyChamber || !engine?.createSignalFromMessage || !engine?.addSignalToChamberWithMeta) {
        fail("activation_insights_engine_unavailable");
      }
      const typeMap = { principle: "principle", mechanism: "pattern", pattern: "pattern", tension: "contradiction", consequence: "principle", generalization: "principle" };
      const title = String(review.candidate.insight || "").split(/[.!?]/)[0].trim().slice(0, 120);
      const signal = engine.createSignalFromMessage(
        review.candidate.insight,
        "sub_laring",
        "semantic_insight_v2",
        {
          source_event_id: review.source_event_id,
          candidate_title: title,
          candidate_summary: review.candidate.insight,
          candidate_functional_type: typeMap[review.candidate.type] || "principle",
          candidate_concepts: review.semantic_concepts
        }
      );
      const isolated = engine.createEmptyChamber();
      const result = engine.addSignalToChamberWithMeta(isolated, signal);
      const insight = isolated.insights.find((item) => item.id === result?.insight_id) || isolated.insights[0];
      if (!insight) fail("activation_canonical_build_failed");
      insight.id = `ins_v2_${review.id.slice("review_v2_".length)}`;
      insight.status = "suggested";
      insight.activation_v2 = {
        schema: ACTIVATION_SCHEMA,
        review_id: review.id,
        candidate_signature: review.candidate_signature,
        source_event_id: review.source_event_id,
        source_text_hash: review.source_text_hash,
        synthesis_model: review.synthesis_model,
        synthesis_response_id: review.synthesis_response_id,
        candidate_index: review.candidate_index,
        type: review.candidate.type,
        abstraction: review.candidate.abstraction,
        evidence: clone(review.candidate.evidence),
        why_it_matters: review.candidate.why_it_matters,
        confidence: review.candidate.confidence,
        uncertainty: review.candidate.uncertainty,
        causal_status: review.candidate.causal_status,
        gate_metrics: clone(review.gate_metrics),
        production_proof: clone(PROOF),
        backend_sync_allowed: false,
        meta_write_allowed: false
      };
      const signature = await hashAsync(stableStringify(insight));
      insight.activation_v2.canonical_signature = signature;
      return { insight, signature };
    }

    async function approveCanonical({ request_id, approval } = {}) {
      const challenge = consumeChallenge(request_id, approval, "canonical");
      const beforeQueue = storage.getItem(REVIEW_STORAGE_KEY);
      const beforeAudit = storage.getItem(AUDIT_STORAGE_KEY);
      const beforeChamber = storage.getItem(chamberStorageKey);
      try {
        audit("approve_canonical", "requested", {
          review_id: challenge.target_id,
          source_event_id: challenge.binding.source_event_id,
          candidate_signature: challenge.binding.candidate_signature
        });
        validateProof(getProof());
        const queue = readQueue();
        const review = queue.items.find((item) => item.id === challenge.target_id);
        if (!review || review.status !== "reviewed" || review.canonical_insight_id) fail("activation_review_not_promotable");
        if (review.candidate_signature !== challenge.binding.candidate_signature) fail("activation_review_changed");
        if (await candidateSignatureFromReview(review) !== review.candidate_signature) fail("activation_review_integrity_failed");
        await currentSourceBinding(review.source_event_id, review.source_text_hash);
        const { insight, signature } = await buildCanonicalInsight(review);
        const chamber = loadChamber();
        if (chamber.insights.some((item) => item?.id === insight.id || item?.activation_v2?.review_id === review.id)) {
          fail("activation_canonical_duplicate");
        }
        chamber.insights.push(insight);
        chamber._local_updated_at = now();
        writeVerified(chamberStorageKey, chamber);
        review.status = "canonical_promoted";
        review.canonical_promoted_at = now();
        review.canonical_insight_id = insight.id;
        review.canonical_signature = signature;
        writeVerified(REVIEW_STORAGE_KEY, queue);
        audit("approve_canonical", "committed", {
          review_id: review.id,
          source_event_id: review.source_event_id,
          candidate_signature: review.candidate_signature,
          canonical_insight_id: insight.id
        });
        dispatchEvent(createEvent({ action: "canonical_committed", review_id: review.id, canonical_insight_id: insight.id }));
        return clone({ review, insight });
      } catch (error) {
        restoreRaw(chamberStorageKey, beforeChamber);
        restoreRaw(REVIEW_STORAGE_KEY, beforeQueue);
        restoreRaw(AUDIT_STORAGE_KEY, beforeAudit);
        try { audit("approve_canonical", "failed", { review_id: challenge.target_id, reason: error.code || error.message }); } catch {}
        throw error;
      }
    }

    function prepareRollback({ review_id } = {}) {
      const queue = readQueue();
      const review = queue.items.find((item) => item.id === review_id);
      if (!review || review.status !== "canonical_promoted" || !review.canonical_insight_id || !review.canonical_signature) {
        fail("activation_review_not_rollbackable");
      }
      const challenge = makeChallenge("rollback", review.id, {
        canonical_insight_id: review.canonical_insight_id,
        canonical_signature: review.canonical_signature
      });
      audit("prepare_rollback", "ready", {
        review_id: review.id,
        source_event_id: review.source_event_id,
        canonical_insight_id: review.canonical_insight_id
      });
      return clone({ ...challenge, review_id: review.id, canonical_insight_id: review.canonical_insight_id });
    }

    async function approveRollback({ request_id, approval } = {}) {
      const challenge = consumeChallenge(request_id, approval, "rollback");
      const beforeQueue = storage.getItem(REVIEW_STORAGE_KEY);
      const beforeAudit = storage.getItem(AUDIT_STORAGE_KEY);
      const beforeChamber = storage.getItem(chamberStorageKey);
      try {
        audit("approve_rollback", "requested", { review_id: challenge.target_id, canonical_insight_id: challenge.binding.canonical_insight_id });
        const queue = readQueue();
        const review = queue.items.find((item) => item.id === challenge.target_id);
        if (!review || review.status !== "canonical_promoted") fail("activation_review_not_rollbackable");
        if (review.canonical_insight_id !== challenge.binding.canonical_insight_id || review.canonical_signature !== challenge.binding.canonical_signature) {
          fail("activation_rollback_binding_changed");
        }
        const chamber = loadChamber();
        const index = chamber.insights.findIndex((item) => item?.id === review.canonical_insight_id);
        const insight = chamber.insights[index];
        if (index < 0 || insight?.activation_v2?.review_id !== review.id || insight?.activation_v2?.canonical_signature !== review.canonical_signature) {
          fail("activation_rollback_target_mismatch");
        }
        const insightForSignature = clone(insight);
        delete insightForSignature.activation_v2.canonical_signature;
        if (await hashAsync(stableStringify(insightForSignature)) !== review.canonical_signature) fail("activation_rollback_target_modified");
        chamber.insights.splice(index, 1);
        chamber._local_updated_at = now();
        writeVerified(chamberStorageKey, chamber);
        review.status = "rolled_back";
        review.rolled_back_at = now();
        writeVerified(REVIEW_STORAGE_KEY, queue);
        audit("approve_rollback", "committed", { review_id: review.id, canonical_insight_id: review.canonical_insight_id });
        dispatchEvent(createEvent({ action: "canonical_rolled_back", review_id: review.id, canonical_insight_id: review.canonical_insight_id }));
        return clone(review);
      } catch (error) {
        restoreRaw(chamberStorageKey, beforeChamber);
        restoreRaw(REVIEW_STORAGE_KEY, beforeQueue);
        restoreRaw(AUDIT_STORAGE_KEY, beforeAudit);
        try { audit("approve_rollback", "failed", { review_id: challenge.target_id, reason: error.code || error.message }); } catch {}
        throw error;
      }
    }

    function getStatus() {
      const items = readQueue().items;
      return {
        schema: ACTIVATION_SCHEMA,
        review_count: items.filter((item) => item.status === "reviewed").length,
        canonical_count: items.filter((item) => item.status === "canonical_promoted").length,
        rolled_back_count: items.filter((item) => item.status === "rolled_back").length,
        local_review_queue_write: true,
        bounded_local_chamber_write: true,
        automatic_canonical_write: false,
        backend_persistent_write: false,
        backend_sync: false,
        meta_write: false
      };
    }

    return Object.freeze({
      prepareReview,
      approveReview,
      prepareCanonical,
      approveCanonical,
      prepareRollback,
      approveRollback,
      listReviews: () => clone(readQueue().items),
      getAudit: () => clone(readAudit().events),
      getStatus
    });
  }

  const api = Object.freeze({
    ACTIVATION_SCHEMA,
    REVIEW_QUEUE_SCHEMA,
    AUDIT_SCHEMA,
    REVIEW_STORAGE_KEY,
    AUDIT_STORAGE_KEY,
    CHAMBER_STORAGE_KEY,
    PROOF,
    validateProof,
    create
  });
  global.AHAInsightActivationV2 = api;
  global.AHAModuleApi?.register?.("insightActivationV2", api, {
    version: 2,
    legacyGlobal: "AHAInsightActivationV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
