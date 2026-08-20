// ahaV2ControlledWritePilotActivation.js
// Explicit activation authority for the single-record local V2 write pilot.
//
// This module does not create a new persistence path. It authorizes and wraps
// the already production-proven AHAInsightActivationV2 controller only when:
//   1. the permanent production decision gate is fully green;
//   2. the locked one-record rollback proof is still valid;
//   3. the operator explicitly opts into this pilot;
//   4. the pilot has never created more than one Chamber record.
//
// Once any review has ever received a canonical_insight_id, the pilot's single
// record budget is permanently consumed. Exact rollback does not reopen it.

(function (global) {
  "use strict";

  const ACTIVATION_SCHEMA = "aha_v2_controlled_write_pilot_activation_v1";
  const ACTIVATION_VERSION = 1;
  const OPERATOR_INTENT = "single_local_chamber_insight_v1";
  const PILOT_ENABLED = true;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  function fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }

  function policy() {
    return {
      pilot_enabled: PILOT_ENABLED,
      pilot_scope: "single_local_chamber_insight",
      pilot_may_prepare_manual_review: true,
      pilot_may_create_local_chamber_record: true,
      pilot_may_execute_exact_rollback: true,
      max_chamber_records_created: 1,
      automatic_activation_open: false,
      batch_activation_open: false,
      normal_chat_persistence_open: false,
      automatic_backfill_open: false,
      backend_sync_open: false,
      backend_persistent_write_open: false,
      broad_canonical_write_open: false,
      projection_store_write_open: false,
      meta_write_open: false,
      remote_write_open: false,
      review_approval_required: true,
      canonical_approval_required: true,
      rollback_approval_required: true,
      approval_challenges_single_use: true
    };
  }

  function assessAuthorization(input = {}, deps = {}) {
    const productionGateApi = deps.productionGateApi || global.AHAV2ProductionWriteGate;
    const rollbackApi = deps.rollbackApi || global.AHAV2ControlledWritePilotRollback;
    if (!PILOT_ENABLED) fail("pilot_kill_switch_closed");
    if (input.operatorIntent !== OPERATOR_INTENT) fail("pilot_operator_intent_missing");
    if (typeof productionGateApi?.evaluate !== "function") fail("pilot_production_gate_unavailable");
    if (typeof rollbackApi?.assess !== "function" || typeof rollbackApi?.defaultPilotProposal !== "function") {
      fail("pilot_rollback_gate_unavailable");
    }

    const productionGate = productionGateApi.evaluate(input.productionEvidence || {});
    if (
      productionGate.decision !== "CONTROLLED_WRITE_PILOT_ELIGIBLE" ||
      productionGate.eligible_for_controlled_write_pilot !== true ||
      arr(productionGate.blocking_reasons).length !== 0 ||
      arr(productionGate.checks).length !== 12 ||
      arr(productionGate.checks).some((check) => check?.required && check?.passed !== true)
    ) fail("pilot_production_gate_not_green");

    const proposal = rollbackApi.defaultPilotProposal();
    const rollback = rollbackApi.assess({
      proposal,
      proof: input.rollbackProof,
      provenance: input.rollbackProvenance
    });
    if (
      rollback.status !== "ready" ||
      rollback.production_rollback_ready !== true ||
      arr(rollback.blocking_reasons).length !== 0 ||
      rollback.rollback_contract?.production_proof_live !== true
    ) fail("pilot_rollback_not_ready");

    const expected = policy();
    if (
      proposal.scope !== expected.pilot_scope ||
      proposal.max_chamber_records_created !== expected.max_chamber_records_created ||
      proposal.batch_activation !== false ||
      proposal.automatic_activation !== false ||
      proposal.backend_sync_allowed !== false ||
      proposal.backend_persistent_write_allowed !== false ||
      proposal.meta_write_allowed !== false ||
      proposal.remote_write_allowed !== false ||
      proposal.normal_chat_persistence_allowed !== false ||
      proposal.automatic_backfill_allowed !== false ||
      proposal.projection_store_write_allowed !== false
    ) fail("pilot_contract_widened");

    return clone({
      schema: ACTIVATION_SCHEMA,
      version: ACTIVATION_VERSION,
      authorized: true,
      production_gate_id: productionGate.gate_id,
      production_gate_decision: productionGate.decision,
      rollback_status: rollback.status,
      rollback_production_proof_live: rollback.rollback_contract.production_proof_live,
      proposal,
      policy: expected
    });
  }

  function create(input = {}, deps = {}) {
    const activationApi = deps.activationApi || global.AHAInsightActivationV2;
    if (typeof activationApi?.create !== "function") fail("pilot_activation_controller_unavailable");
    const authorization = assessAuthorization(input, deps);
    const controller = activationApi.create(deps.activationDeps || {});
    const policySnapshot = policy();

    function reviews() {
      const items = controller?.listReviews?.();
      if (!Array.isArray(items)) fail("pilot_review_queue_unavailable");
      return items;
    }

    function inspect() {
      const items = reviews();
      const historicalCanonical = items.filter((item) => String(item?.canonical_insight_id || "").trim());
      const activeReviewed = items.filter((item) => item?.status === "reviewed" && !item?.canonical_insight_id);
      const promoted = items.filter((item) => item?.status === "canonical_promoted" && item?.canonical_insight_id);
      const rolledBack = items.filter((item) => item?.status === "rolled_back" && item?.canonical_insight_id);

      if (historicalCanonical.length > 1) fail("pilot_historical_record_count_exceeded");
      if (activeReviewed.length > 1 || promoted.length > 1) fail("pilot_parallel_activation_detected");
      if (activeReviewed.length && historicalCanonical.length) fail("pilot_parallel_activation_detected");

      const createdRecordCount = historicalCanonical.length;
      const phase = promoted.length
        ? "canonical_promoted"
        : rolledBack.length
          ? "rolled_back_complete"
          : activeReviewed.length
            ? "review_committed"
            : createdRecordCount
              ? "consumed"
              : "available";
      const current = promoted[0] || rolledBack[0] || activeReviewed[0] || historicalCanonical[0] || null;

      return {
        phase,
        created_record_count: createdRecordCount,
        review_id: current?.id || null,
        canonical_insight_id: current?.canonical_insight_id || null,
        may_prepare_review: phase === "available",
        may_prepare_canonical: phase === "review_committed",
        may_prepare_rollback: phase === "canonical_promoted",
        pilot_complete: phase === "rolled_back_complete" || phase === "consumed"
      };
    }

    function requireFreshBudget() {
      const state = inspect();
      if (state.created_record_count >= 1) fail("pilot_record_budget_exhausted");
      if (state.phase !== "available") fail("pilot_activation_already_in_progress");
      return state;
    }

    function requireReview(reviewId) {
      const state = inspect();
      if (state.created_record_count >= 1) fail("pilot_record_budget_exhausted");
      if (state.phase !== "review_committed" || !reviewId || state.review_id !== reviewId) fail("pilot_review_binding_invalid");
      return state;
    }

    function requirePromoted(reviewId) {
      const state = inspect();
      if (state.phase !== "canonical_promoted" || !reviewId || state.review_id !== reviewId || state.created_record_count !== 1) {
        fail("pilot_rollback_binding_invalid");
      }
      return state;
    }

    async function prepareReview(options = {}) {
      const candidateIndex = options.candidate_index == null ? 0 : Number(options.candidate_index);
      if (candidateIndex !== 0) fail("pilot_candidate_index_out_of_scope");
      requireFreshBudget();
      return controller.prepareReview({ candidate_index: 0 });
    }

    async function approveReview(args = {}) {
      requireFreshBudget();
      const review = await controller.approveReview(args);
      const state = inspect();
      if (state.phase !== "review_committed" || state.review_id !== review?.id || state.created_record_count !== 0) {
        fail("pilot_review_commit_boundary_failed");
      }
      return review;
    }

    async function prepareCanonical({ review_id } = {}) {
      requireReview(review_id);
      return controller.prepareCanonical({ review_id });
    }

    async function approveCanonical(args = {}) {
      const pending = inspect();
      if (pending.phase !== "review_committed" || !pending.review_id) fail("pilot_review_binding_invalid");
      const result = await controller.approveCanonical(args);
      const state = inspect();
      if (
        state.phase !== "canonical_promoted" ||
        state.created_record_count !== 1 ||
        state.review_id !== pending.review_id ||
        state.canonical_insight_id !== result?.insight?.id
      ) fail("pilot_single_record_boundary_failed");
      return result;
    }

    function prepareRollback({ review_id } = {}) {
      requirePromoted(review_id);
      return controller.prepareRollback({ review_id });
    }

    async function approveRollback(args = {}) {
      const before = inspect();
      requirePromoted(before.review_id);
      const review = await controller.approveRollback(args);
      const after = inspect();
      if (
        after.phase !== "rolled_back_complete" ||
        after.created_record_count !== 1 ||
        after.review_id !== before.review_id ||
        after.canonical_insight_id !== before.canonical_insight_id
      ) fail("pilot_exact_rollback_boundary_failed");
      return review;
    }

    function getStatus() {
      return clone({
        schema: ACTIVATION_SCHEMA,
        version: ACTIVATION_VERSION,
        authorized: true,
        ...inspect(),
        production_gate_id: authorization.production_gate_id,
        production_gate_decision: authorization.production_gate_decision,
        rollback_status: authorization.rollback_status,
        policy: policySnapshot
      });
    }

    return Object.freeze({
      prepareReview,
      approveReview,
      prepareCanonical,
      approveCanonical,
      prepareRollback,
      approveRollback,
      getStatus,
      listReviews: () => clone(reviews()),
      getAudit: () => clone(controller?.getAudit?.() || []),
      authorization: () => clone(authorization)
    });
  }

  const api = Object.freeze({
    ACTIVATION_SCHEMA,
    ACTIVATION_VERSION,
    OPERATOR_INTENT,
    PILOT_ENABLED,
    policy,
    assessAuthorization,
    create
  });
  global.AHAV2ControlledWritePilotActivation = api;
  global.AHAModuleApi?.register?.("v2ControlledWritePilotActivation", api, {
    version: ACTIVATION_VERSION,
    legacyGlobal: "AHAV2ControlledWritePilotActivation",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
