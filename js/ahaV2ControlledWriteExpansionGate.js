// ahaV2ControlledWriteExpansionGate.js
// Pure decision gate for any future expansion beyond the already production-
// verified one-record local Chamber pilot.
//
// This module never changes the current one-record budget, never prepares or
// approves an activation, and never writes to Chamber, backend, Meta or any
// product store. A green decision only permits a separate activation PR to be
// proposed for the exact scope contract that was evaluated.

(function (global) {
  "use strict";

  const GATE_SCHEMA = "aha_v2_controlled_write_expansion_gate_v1";
  const GATE_VERSION = 1;
  const SCOPE_SCHEMA = "aha_v2_controlled_write_expansion_scope_contract_v1";
  const DECISION_NO_GO = "NO_GO";
  const DECISION_ELIGIBLE = "BOUNDED_EXPANSION_PILOT_ELIGIBLE";
  const ONE_RECORD_PROOF_SCHEMA = "aha_v2_controlled_write_pilot_live_proof_v1";

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function bool(value) {
    return value === true;
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function integer(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : 0;
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function sha256Like(value) {
    return /^[a-f0-9]{64}$/u.test(text(value));
  }

  function policy() {
    return {
      gate_is_decision_only: true,
      gate_may_execute_writes: false,
      gate_may_prepare_activation: false,
      gate_may_approve_activation: false,
      current_one_record_pilot_max_records: 1,
      current_one_record_pilot_budget_may_change: false,
      expansion_runtime_open: false,
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
      separate_activation_pr_required: true,
      fresh_post_activation_production_proof_required: true
    };
  }

  function validateOneRecordPilotProof(proofInput) {
    const proof = proofInput && typeof proofInput === "object" ? proofInput : {};
    const blockers = [];
    if (proof.schema !== ONE_RECORD_PROOF_SCHEMA || proof.version !== 1) blockers.push("baseline_pilot_proof_schema_invalid");
    if (proof.status !== "production_verified" || proof.production_proof_passed !== true) blockers.push("baseline_pilot_not_production_verified");
    if (proof.pilot?.scope !== "single_local_chamber_insight" || Number(proof.pilot?.max_chamber_records_created) !== 1) blockers.push("baseline_pilot_scope_invalid");
    if (proof.pilot?.created_record_count_after_canonical !== 1 || proof.pilot?.created_record_count_after_rollback !== 1) blockers.push("baseline_pilot_budget_not_locked");
    if (proof.pilot?.second_activation_before_rollback_error !== "pilot_record_budget_exhausted" || proof.pilot?.reload_second_activation_error !== "pilot_record_budget_exhausted") blockers.push("baseline_pilot_second_write_not_blocked");
    if (proof.pilot?.rollback_status !== "rolled_back" || proof.pilot?.final_chamber_sentinel_preserved !== true) blockers.push("baseline_pilot_rollback_not_proven");
    if (Number(proof.pilot?.repository_save_calls) !== 0 || Number(proof.pilot?.repository_load_calls) !== 0) blockers.push("baseline_pilot_repository_access_detected");
    if (proof.operator_browser?.no_intent?.chat_request_count !== 0 || proof.operator_browser?.no_intent?.iframe_about_blank !== true) blockers.push("baseline_pilot_no_intent_boundary_invalid");
    if (proof.operator_browser?.exact_intent?.production_gate_decision !== "CONTROLLED_WRITE_PILOT_ELIGIBLE") blockers.push("baseline_pilot_gate_decision_invalid");
    Object.entries(proof.policy || {}).forEach(([name, value]) => {
      if (value !== false) blockers.push(`baseline_pilot_policy_open:${name}`);
    });
    return {
      valid: blockers.length === 0,
      blocking_reasons: [...new Set(blockers)].sort(),
      identity: {
        production_main: text(proof.expected_production_main),
        workflow_run_id: number(proof.proof_identity?.workflow_run_id) || null,
        artifact_id: number(proof.proof_identity?.artifact_id) || null,
        artifact_digest: text(proof.proof_identity?.artifact_digest)
      }
    };
  }

  function validateScopeContract(scopeInput) {
    const scope = scopeInput && typeof scopeInput === "object" ? scopeInput : {};
    const blockers = [];
    const maxRecords = integer(scope.max_chamber_records_created);
    if (scope.schema !== SCOPE_SCHEMA || scope.version !== 1) blockers.push("expansion_scope_schema_invalid");
    if (!text(scope.scope_id)) blockers.push("expansion_scope_id_missing");
    if (!sha256Like(scope.scope_fingerprint)) blockers.push("expansion_scope_fingerprint_invalid");
    if (scope.scope_kind !== "bounded_local_chamber_multi_record") blockers.push("expansion_scope_kind_invalid");
    if (maxRecords < 2) blockers.push("expansion_scope_not_larger_than_current_pilot");
    if (scope.activation_mode !== "manual_sequential") blockers.push("expansion_scope_activation_mode_invalid");
    if (scope.review_approval_per_record !== true) blockers.push("expansion_scope_review_approval_missing");
    if (scope.canonical_approval_per_record !== true) blockers.push("expansion_scope_canonical_approval_missing");
    if (scope.rollback_approval_per_record !== true) blockers.push("expansion_scope_rollback_approval_missing");
    if (scope.source_binding_per_record !== true) blockers.push("expansion_scope_source_binding_missing");
    if (scope.lifetime_budget_persists_after_rollback !== true) blockers.push("expansion_scope_budget_reopen_risk");
    if (scope.unrelated_chamber_records_preserved !== true) blockers.push("expansion_scope_unrelated_state_not_protected");
    if (scope.batch_activation !== false) blockers.push("expansion_scope_batch_activation_open");
    if (scope.automatic_activation !== false) blockers.push("expansion_scope_automatic_activation_open");
    return {
      valid: blockers.length === 0,
      blocking_reasons: blockers.sort(),
      max_records: maxRecords,
      scope_id: text(scope.scope_id),
      scope_fingerprint: text(scope.scope_fingerprint),
      scope: clone(scope)
    };
  }

  function authorityBoundaryClosed(evidence) {
    const fields = [
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
    return fields.every((field) => evidence?.[field] === false);
  }

  function checks(input = {}) {
    const evidence = input.evidence && typeof input.evidence === "object" ? input.evidence : {};
    const baseline = validateOneRecordPilotProof(input.one_record_pilot_proof);
    const scope = validateScopeContract(evidence.expansion_scope_contract);
    const maxRecords = scope.max_records;
    const canaryCount = integer(evidence.production_expansion_canary_count);

    return [
      {
        id: "one_record_pilot_production_verified",
        required: true,
        passed: baseline.valid && bool(evidence.one_record_pilot_proof_permanent),
        blocker: "one_record_pilot_proof_not_ready",
        observed: baseline.identity
      },
      {
        id: "expansion_scope_contract",
        required: true,
        passed: scope.valid,
        blocker: "expansion_scope_contract_missing_or_invalid",
        observed: { scope_id: scope.scope_id, max_records: maxRecords, scope_blockers: clone(scope.blocking_reasons) }
      },
      {
        id: "multi_record_rollback_rehearsal",
        required: true,
        passed: bool(evidence.multi_record_rollback_rehearsal_proven) && bool(evidence.rollback_each_record_exactly_bound) && bool(evidence.unrelated_chamber_records_preserved),
        blocker: "multi_record_rollback_proof_missing"
      },
      {
        id: "partial_failure_compensation",
        required: true,
        passed: bool(evidence.partial_failure_compensation_proven) && bool(evidence.compensation_restores_exact_pre_run_state),
        blocker: "partial_failure_compensation_proof_missing"
      },
      {
        id: "idempotent_multi_record_replay",
        required: true,
        passed: bool(evidence.idempotent_multi_record_replay_proven) && bool(evidence.identical_replay_write_count_zero),
        blocker: "idempotent_multi_record_replay_proof_missing"
      },
      {
        id: "state_drift_fail_closed",
        required: true,
        passed: bool(evidence.multi_record_state_drift_fail_closed_proven),
        blocker: "multi_record_state_drift_proof_missing"
      },
      {
        id: "production_expansion_canaries",
        required: true,
        passed: bool(evidence.production_expansion_canary_proof) && maxRecords >= 2 && canaryCount >= maxRecords && bool(evidence.production_canary_coverage_complete),
        blocker: "expansion_production_canary_proof_missing",
        observed: { canary_count: canaryCount, max_records: maxRecords }
      },
      {
        id: "deployment_commit_matches_candidate_main",
        required: true,
        passed: bool(evidence.deployment_commit_matches_candidate_main) && Boolean(text(evidence.candidate_main_commit_sha)) && text(evidence.candidate_main_commit_sha) === text(evidence.deployed_commit_sha),
        blocker: "expansion_deploy_parity_missing",
        observed: { candidate_main_commit_sha: text(evidence.candidate_main_commit_sha), deployed_commit_sha: text(evidence.deployed_commit_sha) }
      },
      {
        id: "no_unexpected_persistence_write",
        required: true,
        passed: bool(evidence.no_unexpected_persistence_write_observed),
        blocker: "expansion_no_write_observation_missing"
      },
      {
        id: "no_authority_leak",
        required: true,
        passed: bool(evidence.no_authority_leak_observed) && authorityBoundaryClosed(evidence),
        blocker: "expansion_authority_leak_observation_missing"
      },
      {
        id: "proof_redaction",
        required: true,
        passed: bool(evidence.production_evidence_redacted) && evidence.raw_source_text_in_evidence === false && evidence.raw_evidence_quotes_in_evidence === false && evidence.signatures_in_evidence === false,
        blocker: "expansion_proof_redaction_missing"
      },
      {
        id: "current_pilot_boundary_unchanged",
        required: true,
        passed: bool(evidence.current_one_record_pilot_budget_unchanged) && number(evidence.current_one_record_pilot_max_records) === 1 && bool(evidence.separate_activation_pr_required) && bool(evidence.fresh_post_activation_production_proof_required),
        blocker: "current_pilot_boundary_not_preserved"
      }
    ];
  }

  function evaluate(input = {}) {
    const evidence = clone(input.evidence) || {};
    const evaluatedChecks = checks({ evidence, one_record_pilot_proof: input.one_record_pilot_proof });
    const blockers = evaluatedChecks.filter((check) => check.required && !check.passed).map((check) => check.blocker).sort();
    const decision = blockers.length ? DECISION_NO_GO : DECISION_ELIGIBLE;
    const scope = validateScopeContract(evidence.expansion_scope_contract);
    const seed = JSON.stringify({
      schema: GATE_SCHEMA,
      evidence_id: text(evidence.evidence_id),
      scope_id: scope.scope_id,
      scope_fingerprint: scope.scope_fingerprint,
      checks: evaluatedChecks.map((check) => [check.id, check.passed])
    });
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return clone({
      schema: GATE_SCHEMA,
      version: GATE_VERSION,
      mode: "decision_only",
      gate_id: `v2_expansion_gate_${(hash >>> 0).toString(16).padStart(8, "0")}`,
      decision,
      eligible_for_bounded_expansion_pilot: decision === DECISION_ELIGIBLE,
      eligible_for_expansion_activation: false,
      eligible_for_normal_chat_persistence: false,
      blocking_reasons: blockers,
      checks: evaluatedChecks,
      evaluated_scope: {
        scope_id: scope.scope_id,
        scope_fingerprint: scope.scope_fingerprint,
        max_chamber_records_created: scope.max_records || null
      },
      evidence: {
        evidence_id: text(evidence.evidence_id),
        observed_at: text(evidence.observed_at),
        source: text(evidence.source || "operator_review")
      },
      next_action: blockers.length
        ? "Collect the missing bounded-expansion evidence; keep the current one-record pilot unchanged."
        : "A separate explicit activation PR may propose only the evaluated bounded scope; the current one-record pilot remains unchanged until that PR is merged and freshly production-proven.",
      policy: policy()
    });
  }

  const api = Object.freeze({
    GATE_SCHEMA,
    GATE_VERSION,
    SCOPE_SCHEMA,
    DECISION_NO_GO,
    DECISION_ELIGIBLE,
    validateOneRecordPilotProof,
    validateScopeContract,
    checks,
    evaluate,
    policy
  });
  global.AHAV2ControlledWriteExpansionGate = api;
  global.AHAModuleApi?.register?.("v2ControlledWriteExpansionGate", api, {
    version: GATE_VERSION,
    legacyGlobal: "AHAV2ControlledWriteExpansionGate",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
