// ahaV2ControlledWriteExpansionActivation.js
// Explicit activation authority for the exact two-record local V2 expansion.
//
// This module does not create a new persistence engine. It wraps the already
// production-proven AHAInsightActivationV2 controller only when the permanent
// expansion decision is 12/12 green for the exact two-record scope.
//
// Lifetime budget is shared with the existing controlled review history:
// every review that has ever received canonical_insight_id consumes one of the
// two total slots, including records later rolled back. A prior one-record pilot
// use therefore leaves at most one additional expansion slot.

(function (global) {
  "use strict";

  const ACTIVATION_SCHEMA = "aha_v2_controlled_write_expansion_activation_v1";
  const ACTIVATION_VERSION = 1;
  const OPERATOR_INTENT = "bounded_local_chamber_two_record_candidate_v1";
  const SCOPE_ID = OPERATOR_INTENT;
  const MAX_RECORDS = 2;
  const EXPANSION_ENABLED = true;

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
      expansion_enabled: EXPANSION_ENABLED,
      scope_id: SCOPE_ID,
      max_chamber_records_created: MAX_RECORDS,
      activation_mode: "manual_sequential",
      expansion_may_prepare_manual_review: true,
      expansion_may_create_local_chamber_record: true,
      expansion_may_execute_exact_rollback: true,
      review_approval_per_record: true,
      canonical_approval_per_record: true,
      rollback_approval_per_record: true,
      approval_challenges_single_use: true,
      source_binding_per_record: true,
      lifetime_budget_persists_after_rollback: true,
      duplicate_candidate_consumes_second_slot: false,
      unrelated_chamber_records_preserved: true,
      automatic_activation_open: false,
      batch_activation_open: false,
      normal_chat_persistence_open: false,
      automatic_backfill_open: false,
      backend_sync_open: false,
      backend_persistent_write_open: false,
      broad_canonical_write_open: false,
      projection_store_write_open: false,
      meta_write_open: false,
      remote_write_open: false
    };
  }

  function validateExpansionLiveProof(proof, scopeContract, expansionEvidence) {
    if (proof?.schema !== "aha_v2_two_record_expansion_live_proof_v1") fail("expansion_live_proof_invalid");
    if (proof.status !== "production_evidence_verified") fail("expansion_live_proof_invalid");
    if (proof.scope?.scope_id !== SCOPE_ID || proof.scope?.max_chamber_records_created !== MAX_RECORDS) {
      fail("expansion_live_proof_scope_mismatch");
    }
    if (proof.scope?.candidate_only !== true || proof.scope?.activation_authority !== false) {
      fail("expansion_live_proof_authority_invalid");
    }
    if (proof.canaries?.count !== MAX_RECORDS || proof.canaries?.coverage_complete !== true) fail("expansion_live_proof_canaries_incomplete");
    if (
      proof.canaries?.first_apply_write_count !== MAX_RECORDS ||
      proof.canaries?.identical_replay_write_count !== 0 ||
      proof.canaries?.identical_replay_no_op_count !== MAX_RECORDS ||
      proof.canaries?.rollback_status !== "rolled_back" ||
      proof.canaries?.rollback_exact !== true ||
      proof.canaries?.rollback_count !== MAX_RECORDS ||
      proof.canaries?.exact_pre_run_state_restored !== true ||
      proof.canaries?.partial_failure_compensation_status !== "compensated" ||
      proof.canaries?.partial_failure_compensation_exact !== true ||
      proof.canaries?.state_drift_status !== "manual_review_required" ||
      proof.canaries?.state_drift_rolled_back_count !== 0 ||
      proof.canaries?.unrelated_sentinel_preserved !== true
    ) fail("expansion_live_proof_rehearsal_invalid");
    if (
      proof.browser_boundary?.local_storage_unchanged !== true ||
      proof.browser_boundary?.session_storage_unchanged !== true ||
      proof.browser_boundary?.indexeddb_unchanged !== true ||
      proof.browser_boundary?.unexpected_write_request_count !== 0 ||
      proof.browser_boundary?.page_error_count !== 0 ||
      proof.browser_boundary?.console_error_count !== 0
    ) fail("expansion_live_proof_browser_boundary_invalid");
    if (
      proof.decision?.expansion_gate_decision !== "BOUNDED_EXPANSION_PILOT_ELIGIBLE" ||
      proof.decision?.eligible_for_expansion_activation !== false ||
      proof.decision?.current_one_record_pilot_max_records !== 1 ||
      proof.decision?.current_one_record_pilot_budget_may_change !== false
    ) fail("expansion_live_proof_decision_invalid");
    if (
      proof.redaction?.raw_source_text_in_evidence !== false ||
      proof.redaction?.raw_evidence_quotes_in_evidence !== false ||
      proof.redaction?.signatures_in_evidence !== false ||
      proof.redaction?.user_production_data_modified !== false
    ) fail("expansion_live_proof_redaction_invalid");

    const forbidden = [
      "normal_chat_persistence_open",
      "automatic_backfill_open",
      "backend_sync_open",
      "backend_persistent_write_open",
      "broad_canonical_write_open",
      "projection_store_write_open",
      "meta_write_open",
      "remote_write_open",
      "automatic_activation_open",
      "batch_activation_open"
    ];
    forbidden.forEach((field) => {
      if (proof.policy?.[field] !== false) fail(`expansion_live_proof_policy_invalid:${field}`);
    });

    if (scopeContract?.scope_id !== proof.scope.scope_id || scopeContract?.max_chamber_records_created !== proof.scope.max_chamber_records_created) {
      fail("expansion_scope_contract_mismatch");
    }
    if (
      expansionEvidence?.candidate_main_commit_sha !== proof.expected_production_main ||
      expansionEvidence?.deployed_commit_sha !== proof.expected_production_main ||
      expansionEvidence?.deployment_commit_matches_candidate_main !== true
    ) fail("expansion_live_proof_deployment_mismatch");
    return true;
  }

  function assessAuthorization(input = {}, deps = {}) {
    const gateApi = deps.expansionGateApi || global.AHAV2ControlledWriteExpansionGate;
    if (!EXPANSION_ENABLED) fail("expansion_kill_switch_closed");
    if (input.operatorIntent !== OPERATOR_INTENT) fail("expansion_operator_intent_missing");
    if (typeof gateApi?.evaluate !== "function" || typeof gateApi?.validateScopeContract !== "function") {
      fail("expansion_gate_unavailable");
    }

    const gateDecision = gateApi.evaluate({
      evidence: input.expansionEvidence,
      one_record_pilot_proof: input.oneRecordPilotProof
    });
    if (
      gateDecision.decision !== "BOUNDED_EXPANSION_PILOT_ELIGIBLE" ||
      gateDecision.eligible_for_bounded_expansion_pilot !== true ||
      gateDecision.eligible_for_expansion_activation !== false ||
      arr(gateDecision.blocking_reasons).length !== 0 ||
      arr(gateDecision.checks).length !== 12 ||
      arr(gateDecision.checks).some((check) => check?.required && check?.passed !== true)
    ) fail("expansion_gate_not_green");

    const scope = gateApi.validateScopeContract(input.scopeContract);
    if (!scope?.valid || arr(scope.blocking_reasons).length) fail("expansion_scope_contract_invalid");
    if (
      scope.scope_id !== SCOPE_ID ||
      scope.max_records !== MAX_RECORDS ||
      input.scopeContract?.scope_fingerprint !== input.expansionEvidence?.expansion_scope_contract?.scope_fingerprint ||
      input.scopeContract?.candidate_only !== true ||
      input.scopeContract?.activation_authority !== false ||
      input.scopeContract?.activation_mode !== "manual_sequential" ||
      input.scopeContract?.batch_activation !== false ||
      input.scopeContract?.automatic_activation !== false
    ) fail("expansion_scope_contract_mismatch");

    validateExpansionLiveProof(input.expansionLiveProof, input.scopeContract, input.expansionEvidence);

    const expected = policy();
    const forbidden = [
      "normal_chat_persistence_open",
      "automatic_backfill_open",
      "backend_sync_open",
      "backend_persistent_write_open",
      "broad_canonical_write_open",
      "projection_store_write_open",
      "meta_write_open",
      "remote_write_open",
      "automatic_activation_open",
      "batch_activation_open"
    ];
    forbidden.forEach((field) => {
      if (input.expansionEvidence?.[field] !== false || expected[field] !== false) fail("expansion_contract_widened");
    });

    return clone({
      schema: ACTIVATION_SCHEMA,
      version: ACTIVATION_VERSION,
      authorized: true,
      scope_id: SCOPE_ID,
      max_chamber_records_created: MAX_RECORDS,
      expansion_gate_id: gateDecision.gate_id,
      expansion_gate_decision: gateDecision.decision,
      expansion_live_proof_status: input.expansionLiveProof.status,
      policy: expected
    });
  }

  function create(input = {}, deps = {}) {
    const activationApi = deps.activationApi || global.AHAInsightActivationV2;
    if (typeof activationApi?.create !== "function") fail("expansion_activation_controller_unavailable");
    const authorization = assessAuthorization(input, deps);
    const controller = activationApi.create(deps.activationDeps || {});
    const policySnapshot = policy();
    const reviewRequestBindings = new Map();
    const rollbackRequestBindings = new Map();

    function reviews() {
      const items = controller?.listReviews?.();
      if (!Array.isArray(items)) fail("expansion_review_queue_unavailable");
      return items;
    }

    function inspect() {
      const items = reviews();
      const historicalCanonical = items.filter((item) => String(item?.canonical_insight_id || "").trim());
      const activeReviewed = items.filter((item) => item?.status === "reviewed" && !item?.canonical_insight_id);
      const promoted = items.filter((item) => item?.status === "canonical_promoted" && item?.canonical_insight_id);
      const rolledBack = items.filter((item) => item?.status === "rolled_back" && item?.canonical_insight_id);

      if (historicalCanonical.length > MAX_RECORDS) fail("expansion_historical_record_count_exceeded");
      if (activeReviewed.length > 1) fail("expansion_parallel_review_detected");
      if (activeReviewed.length && historicalCanonical.length >= MAX_RECORDS) fail("expansion_parallel_review_detected");

      const signatures = historicalCanonical.map((item) => String(item?.candidate_signature || "").trim()).filter(Boolean);
      if (new Set(signatures).size !== signatures.length) fail("expansion_duplicate_historical_candidate_detected");

      const createdRecordCount = historicalCanonical.length;
      const activeReview = activeReviewed[0] || null;
      const remaining = MAX_RECORDS - createdRecordCount;
      const phase = activeReview
        ? "review_committed"
        : remaining === 0
          ? (promoted.length ? "budget_exhausted_with_active_records" : "budget_exhausted")
          : createdRecordCount
            ? (promoted.length ? "available_with_promoted_records" : "available_after_prior_record")
            : "available";

      return {
        phase,
        created_record_count: createdRecordCount,
        remaining_record_budget: remaining,
        active_review_id: activeReview?.id || null,
        active_review_candidate_signature: activeReview?.candidate_signature || null,
        promoted_review_ids: promoted.map((item) => item.id),
        promoted_canonical_insight_ids: promoted.map((item) => item.canonical_insight_id),
        rolled_back_review_ids: rolledBack.map((item) => item.id),
        historical_candidate_signatures: signatures,
        may_prepare_review: remaining > 0 && !activeReview,
        may_prepare_canonical: !!activeReview,
        may_prepare_rollback: promoted.length > 0,
        expansion_budget_exhausted: remaining === 0,
        expansion_complete: remaining === 0 && promoted.length === 0 && !activeReview
      };
    }

    function requireReviewSlot() {
      const state = inspect();
      if (state.created_record_count >= MAX_RECORDS) fail("expansion_record_budget_exhausted");
      if (state.active_review_id) fail("expansion_activation_already_in_progress");
      return state;
    }

    function requireActiveReview(reviewId) {
      const state = inspect();
      if (!reviewId || state.active_review_id !== reviewId) fail("expansion_review_binding_invalid");
      if (state.created_record_count >= MAX_RECORDS) fail("expansion_record_budget_exhausted");
      return state;
    }

    function requirePromoted(reviewId) {
      const state = inspect();
      if (!reviewId || !state.promoted_review_ids.includes(reviewId)) fail("expansion_rollback_binding_invalid");
      return state;
    }

    async function prepareReview(options = {}) {
      const state = requireReviewSlot();
      const candidateIndex = options.candidate_index == null ? 0 : Number(options.candidate_index);
      if (!Number.isInteger(candidateIndex) || candidateIndex < 0) fail("expansion_candidate_index_invalid");
      const request = await controller.prepareReview({ candidate_index: candidateIndex });
      const signature = String(request?.candidate_signature || "").trim();
      if (!/^[a-f0-9]{64}$/u.test(signature)) fail("expansion_candidate_signature_invalid");
      if (state.historical_candidate_signatures.includes(signature)) fail("expansion_candidate_already_consumed");
      reviewRequestBindings.set(request.request_id, { candidate_signature: signature, candidate_index: candidateIndex });
      return request;
    }

    async function approveReview(args = {}) {
      const binding = reviewRequestBindings.get(args.request_id);
      reviewRequestBindings.delete(args.request_id);
      if (!binding) fail("expansion_review_request_unbound");
      const before = requireReviewSlot();
      if (before.historical_candidate_signatures.includes(binding.candidate_signature)) fail("expansion_candidate_already_consumed");
      const review = await controller.approveReview(args);
      if (
        review?.status !== "reviewed" ||
        review?.canonical_insight_id ||
        review?.candidate_signature !== binding.candidate_signature
      ) fail("expansion_review_commit_boundary_failed");
      const after = inspect();
      if (
        after.active_review_id !== review.id ||
        after.active_review_candidate_signature !== binding.candidate_signature ||
        after.created_record_count !== before.created_record_count
      ) fail("expansion_review_commit_boundary_failed");
      return review;
    }

    async function prepareCanonical({ review_id } = {}) {
      requireActiveReview(review_id);
      return controller.prepareCanonical({ review_id });
    }

    async function approveCanonical(args = {}) {
      const before = inspect();
      if (!before.active_review_id) fail("expansion_review_binding_invalid");
      const reviewId = before.active_review_id;
      const result = await controller.approveCanonical(args);
      const after = inspect();
      if (
        after.active_review_id ||
        after.created_record_count !== before.created_record_count + 1 ||
        after.created_record_count > MAX_RECORDS ||
        !after.promoted_review_ids.includes(reviewId) ||
        !result?.insight?.id
      ) fail("expansion_record_boundary_failed");
      return result;
    }

    function prepareRollback({ review_id } = {}) {
      requirePromoted(review_id);
      const request = controller.prepareRollback({ review_id });
      if (!request?.request_id) fail("expansion_rollback_request_invalid");
      rollbackRequestBindings.set(request.request_id, review_id);
      return request;
    }

    async function approveRollback(args = {}) {
      const reviewId = rollbackRequestBindings.get(args.request_id);
      rollbackRequestBindings.delete(args.request_id);
      if (!reviewId) fail("expansion_rollback_request_unbound");
      const before = requirePromoted(reviewId);
      const createdBefore = before.created_record_count;
      const promotedBefore = before.promoted_review_ids.slice();
      const review = await controller.approveRollback(args);
      const after = inspect();
      if (
        review?.id !== reviewId ||
        review?.status !== "rolled_back" ||
        after.created_record_count !== createdBefore ||
        after.promoted_review_ids.includes(reviewId) ||
        !after.rolled_back_review_ids.includes(reviewId)
      ) fail("expansion_exact_rollback_boundary_failed");
      promotedBefore.filter((id) => id !== reviewId).forEach((id) => {
        if (!after.promoted_review_ids.includes(id)) fail("expansion_unrelated_promoted_record_changed");
      });
      return review;
    }

    function getStatus() {
      return clone({
        schema: ACTIVATION_SCHEMA,
        version: ACTIVATION_VERSION,
        authorized: true,
        ...inspect(),
        scope_id: SCOPE_ID,
        max_chamber_records_created: MAX_RECORDS,
        expansion_gate_id: authorization.expansion_gate_id,
        expansion_gate_decision: authorization.expansion_gate_decision,
        expansion_live_proof_status: authorization.expansion_live_proof_status,
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
    SCOPE_ID,
    MAX_RECORDS,
    EXPANSION_ENABLED,
    policy,
    validateExpansionLiveProof,
    assessAuthorization,
    create
  });

  global.AHAV2ControlledWriteExpansionActivation = api;
  global.AHAModuleApi?.register?.("v2ControlledWriteExpansionActivation", api, {
    version: ACTIVATION_VERSION,
    legacyGlobal: "AHAV2ControlledWriteExpansionActivation",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
