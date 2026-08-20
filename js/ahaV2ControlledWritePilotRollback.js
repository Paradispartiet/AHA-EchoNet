// ahaV2ControlledWritePilotRollback.js
// Pure readiness contract for the only V2 controlled-write pilot currently
// eligible to be proposed: one operator-approved, local-only Chamber insight
// using the already production-proven AHAInsightActivationV2 rollback path.
//
// This module never prepares, approves, executes or rolls back an activation.
// It only verifies that a proposed pilot is exactly bounded by the permanent
// production proof from PR #833/#834. Any broader write authority fails closed.

(function (global) {
  "use strict";

  const CONTRACT_SCHEMA = "aha_v2_controlled_write_pilot_rollback_contract_v1";
  const CONTRACT_VERSION = 1;
  const PROOF_SCHEMA = "aha_insight_synthesis_v2_controlled_activation_production_proof_v1";
  const PROVENANCE_SCHEMA = "aha_insight_synthesis_v2_controlled_activation_provenance_v1";

  const LOCKED_PROOF = Object.freeze({
    workflow_run_id: 32369823544,
    workflow_job_id: 96427555521,
    artifact_id: 9406690486,
    artifact_digest: "sha256:711124204415c7082987c79cd99e64000a68a001ff0d5db3d990272b2a12e305",
    production_main: "ed1db452088232146702fabdf9f9543bb9f0d959",
    frontend_origin: "https://paradispartiet.github.io/AHA-EchoNet",
    temporary_pull_request: 834
  });

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function exactArray(left, right) {
    const a = arr(left).map(String);
    const b = arr(right).map(String);
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }

  function defaultPilotProposal() {
    return clone({
      schema: "aha_v2_controlled_write_pilot_proposal_v1",
      version: 1,
      scope: "single_local_chamber_insight",
      activation_controller_schema: "aha_insight_activation_v2",
      max_chamber_records_created: 1,
      batch_activation: false,
      automatic_activation: false,
      review_approval_required: true,
      canonical_approval_required: true,
      rollback_approval_required: true,
      approval_challenges_single_use: true,
      rollback_target_binding: [
        "canonical_insight_id",
        "review_id",
        "canonical_signature",
        "recalculated_canonical_signature"
      ],
      state_drift_behavior: "fail_closed",
      unrelated_chamber_records_preserved: true,
      backend_sync_allowed: false,
      backend_persistent_write_allowed: false,
      meta_write_allowed: false,
      remote_write_allowed: false,
      normal_chat_persistence_allowed: false,
      automatic_backfill_allowed: false,
      projection_store_write_allowed: false
    });
  }

  function policy() {
    return {
      gate_is_readiness_only: true,
      may_prepare_activation: false,
      may_approve_activation: false,
      may_execute_rollback: false,
      normal_chat_persistence_open: false,
      automatic_activation_open: false,
      automatic_backfill_open: false,
      backend_persistent_write_open: false,
      broad_canonical_write_open: false,
      projection_store_write_open: false,
      meta_write_open: false,
      remote_write_open: false,
      separate_activation_pr_required: true
    };
  }

  function validateProposal(input) {
    const proposal = input && typeof input === "object" ? input : {};
    const expected = defaultPilotProposal();
    const blockers = [];

    const scalarFields = [
      "schema",
      "version",
      "scope",
      "activation_controller_schema",
      "max_chamber_records_created",
      "batch_activation",
      "automatic_activation",
      "review_approval_required",
      "canonical_approval_required",
      "rollback_approval_required",
      "approval_challenges_single_use",
      "state_drift_behavior",
      "unrelated_chamber_records_preserved",
      "backend_sync_allowed",
      "backend_persistent_write_allowed",
      "meta_write_allowed",
      "remote_write_allowed",
      "normal_chat_persistence_allowed",
      "automatic_backfill_allowed",
      "projection_store_write_allowed"
    ];
    scalarFields.forEach((field) => {
      if (proposal[field] !== expected[field]) blockers.push(`pilot_contract_mismatch:${field}`);
    });
    if (!exactArray(proposal.rollback_target_binding, expected.rollback_target_binding)) {
      blockers.push("pilot_contract_mismatch:rollback_target_binding");
    }

    return {
      valid: blockers.length === 0,
      blocking_reasons: blockers.sort(),
      proposal: clone(proposal)
    };
  }

  function validateProductionProof(proofInput, provenanceInput) {
    const proof = proofInput && typeof proofInput === "object" ? proofInput : {};
    const provenance = provenanceInput && typeof provenanceInput === "object" ? provenanceInput : {};
    const blockers = [];

    if (proof.schema !== PROOF_SCHEMA || proof.version !== 1) blockers.push("rollback_proof_schema_invalid");
    if (proof.workflow_run_id !== LOCKED_PROOF.workflow_run_id || proof.workflow_run_attempt !== 1) blockers.push("rollback_proof_workflow_mismatch");
    if (proof.expected_production_main !== LOCKED_PROOF.production_main) blockers.push("rollback_proof_main_mismatch");
    if (proof.frontend?.origin !== LOCKED_PROOF.frontend_origin) blockers.push("rollback_proof_frontend_mismatch");

    const activation = proof.activation || {};
    const afterReview = arr(activation.chamber_ids_after_review).map(String);
    const afterPromotion = arr(activation.chamber_ids_after_promotion).map(String);
    const afterRollback = arr(activation.chamber_ids_after_rollback).map(String);
    const canonicalId = text(activation.canonical_insight_id);

    if (!canonicalId) blockers.push("rollback_proof_canonical_id_missing");
    if (!exactArray(afterReview, afterRollback)) blockers.push("rollback_proof_unrelated_state_not_restored");
    if (afterPromotion.length !== afterReview.length + 1 || !afterPromotion.includes(canonicalId) || afterReview.includes(canonicalId)) {
      blockers.push("rollback_proof_single_record_boundary_failed");
    }
    if (activation.rollback_status !== "rolled_back") blockers.push("rollback_proof_status_failed");
    if (Number(activation.repository_save_calls) !== 0 || Number(activation.repository_load_calls) !== 0) blockers.push("rollback_proof_repository_access_detected");
    if (activation.sync_push?.ok !== false || activation.sync_push?.reason !== "local_only_insight_activation_present") blockers.push("rollback_proof_sync_push_not_blocked");
    if (activation.sync_pull?.ok !== false || activation.sync_pull?.reason !== "local_only_insight_activation_present") blockers.push("rollback_proof_sync_pull_not_blocked");
    if (Number(activation.audit_event_count) !== 9 || !/^[a-f0-9]{64}$/u.test(text(activation.audit_tail_hash))) blockers.push("rollback_proof_audit_invalid");
    if (!exactArray(activation.dispatched_actions, ["review_committed", "canonical_committed", "canonical_rolled_back"])) blockers.push("rollback_proof_action_sequence_invalid");

    const proofPolicy = proof.policy || {};
    ["automatic_canonical_write", "backend_persistent_write", "backend_sync", "meta_write", "normal_chat_activation"]
      .forEach((field) => {
        if (proofPolicy[field] !== false) blockers.push(`rollback_proof_policy_invalid:${field}`);
      });
    if (proofPolicy.production_proof_passed !== true) blockers.push("rollback_proof_not_marked_passed");

    if (provenance.schema !== PROVENANCE_SCHEMA || provenance.version !== 1) blockers.push("rollback_provenance_schema_invalid");
    if (provenance.production_main !== LOCKED_PROOF.production_main) blockers.push("rollback_provenance_main_mismatch");
    if (provenance.workflow_run_id !== LOCKED_PROOF.workflow_run_id || provenance.workflow_job_id !== LOCKED_PROOF.workflow_job_id) blockers.push("rollback_provenance_workflow_mismatch");
    if (provenance.artifact_id !== LOCKED_PROOF.artifact_id || provenance.artifact_digest !== LOCKED_PROOF.artifact_digest) blockers.push("rollback_provenance_artifact_mismatch");
    if (provenance.temporary_pull_request !== LOCKED_PROOF.temporary_pull_request || provenance.temporary_pull_request_disposition !== "closed_without_merge") blockers.push("rollback_provenance_temp_probe_invalid");
    if (provenance.deployment_context?.github_pages_main !== "deployed_and_hash_verified") blockers.push("rollback_provenance_deployment_not_verified");

    return {
      valid: blockers.length === 0,
      blocking_reasons: [...new Set(blockers)].sort(),
      proof_identity: {
        workflow_run_id: proof.workflow_run_id || null,
        production_main: proof.expected_production_main || null,
        frontend_origin: proof.frontend?.origin || null,
        canonical_insight_id: canonicalId || null,
        rollback_status: activation.rollback_status || null,
        artifact_id: provenance.artifact_id || null,
        artifact_digest: provenance.artifact_digest || null
      }
    };
  }

  function assess(input = {}) {
    const proposal = validateProposal(input.proposal || defaultPilotProposal());
    const productionProof = validateProductionProof(input.proof, input.provenance);
    const blockers = [...proposal.blocking_reasons, ...productionProof.blocking_reasons];
    const ready = blockers.length === 0;

    return clone({
      schema: CONTRACT_SCHEMA,
      version: CONTRACT_VERSION,
      mode: "readiness_only",
      status: ready ? "ready" : "blocked",
      production_rollback_ready: ready,
      eligible_for_controlled_write_pilot_activation: false,
      blocking_reasons: [...new Set(blockers)].sort(),
      pilot: proposal.proposal,
      proof: productionProof.proof_identity,
      rollback_contract: {
        controller: "AHAInsightActivationV2",
        prepare_method: "prepareRollback",
        approve_method: "approveRollback",
        approval_required: true,
        exact_target_binding_required: true,
        state_drift_fails_closed: true,
        unrelated_chamber_records_preserved: true,
        backend_sync_blocked_while_record_present: true,
        production_proof_live: productionProof.valid
      },
      next_action: ready
        ? "Keep rollback ready; require a separate production-gate decision and explicit activation PR before any controlled write pilot."
        : "Do not propose a write pilot until the locked rollback proof and exact single-record pilot contract validate.",
      policy: policy()
    });
  }

  const api = Object.freeze({
    CONTRACT_SCHEMA,
    CONTRACT_VERSION,
    PROOF_SCHEMA,
    PROVENANCE_SCHEMA,
    LOCKED_PROOF,
    defaultPilotProposal,
    validateProposal,
    validateProductionProof,
    assess
  });
  global.AHAV2ControlledWritePilotRollback = api;
  global.AHAModuleApi?.register?.("v2ControlledWritePilotRollback", api, {
    version: CONTRACT_VERSION,
    legacyGlobal: "AHAV2ControlledWritePilotRollback",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
