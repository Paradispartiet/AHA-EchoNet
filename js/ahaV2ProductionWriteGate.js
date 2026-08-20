// ahaV2ProductionWriteGate.js
// Explicit production decision gate for the post-9/9 Insight Engine V2 rollout.
//
// This module is pure and read-only. It never activates a write path. A fully
// green decision makes a *separate controlled write pilot* eligible; normal
// Chat persistence, automatic backfill and broad canonical writes remain closed
// until a later explicit activation PR consumes that decision.

(function (global) {
  "use strict";

  const GATE_SCHEMA = "aha_v2_production_write_gate_v1";
  const GATE_VERSION = 1;
  const DECISION_NO_GO = "NO_GO";
  const DECISION_CONTROLLED_PILOT = "CONTROLLED_WRITE_PILOT_ELIGIBLE";

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

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function policy() {
    return {
      gate_is_decision_only: true,
      gate_may_execute_writes: false,
      normal_chat_persistence_open: false,
      automatic_chamber_activation_open: false,
      automatic_legacy_backfill_open: false,
      broad_canonical_write_open: false,
      projection_store_write_open: false,
      meta_write_open: false,
      remote_write_open: false,
      controlled_write_pilot_requires_separate_activation_pr: true
    };
  }

  function checks(evidence = {}) {
    const qualityRounds = number(evidence.production_synthesis_rounds);
    const qualityF1 = number(evidence.production_synthesis_f1_min);
    return [
      {
        id: "v2_build_9_of_9",
        required: true,
        passed: bool(evidence.v2_build_9_of_9),
        blocker: "v2_build_not_complete"
      },
      {
        id: "production_synthesis_quality",
        required: true,
        passed: qualityRounds >= 2 && qualityF1 >= 0.95 && bool(evidence.production_synthesis_all_valid),
        blocker: "production_synthesis_quality_not_proven",
        observed: { rounds: qualityRounds, min_f1: qualityF1, all_valid: bool(evidence.production_synthesis_all_valid) }
      },
      {
        id: "trusted_readonly_integration_merged",
        required: true,
        passed: bool(evidence.trusted_readonly_integration_merged),
        blocker: "trusted_readonly_integration_not_merged"
      },
      {
        id: "chat_readonly_transport_merged",
        required: true,
        passed: bool(evidence.chat_readonly_transport_merged),
        blocker: "chat_readonly_transport_not_merged"
      },
      {
        id: "chat_readonly_runtime_merged",
        required: true,
        passed: bool(evidence.chat_readonly_runtime_merged),
        blocker: "chat_readonly_runtime_not_merged"
      },
      {
        id: "deployment_commit_matches_main",
        required: true,
        passed: bool(evidence.deployment_commit_matches_main) && Boolean(text(evidence.deployed_commit_sha)) && text(evidence.deployed_commit_sha) === text(evidence.main_commit_sha),
        blocker: "deployment_not_proven_at_current_main",
        observed: { main_commit_sha: text(evidence.main_commit_sha), deployed_commit_sha: text(evidence.deployed_commit_sha) }
      },
      {
        id: "migration_dry_run_reviewed",
        required: true,
        passed: bool(evidence.migration_dry_run_reviewed),
        blocker: "migration_dry_run_review_missing"
      },
      {
        id: "staging_apply_rollback_production_proof",
        required: true,
        passed: bool(evidence.staging_apply_rollback_production_proof),
        blocker: "staging_apply_rollback_production_proof_missing"
      },
      {
        id: "live_readonly_chat_proof",
        required: true,
        passed: bool(evidence.live_readonly_chat_proof) && number(evidence.live_readonly_chat_sample_count) >= 3,
        blocker: "live_readonly_chat_proof_missing",
        observed: { sample_count: number(evidence.live_readonly_chat_sample_count) }
      },
      {
        id: "no_persistence_write_observed",
        required: true,
        passed: bool(evidence.no_persistence_write_observed),
        blocker: "no_write_observation_missing"
      },
      {
        id: "no_authority_leak_observed",
        required: true,
        passed: bool(evidence.no_authority_leak_observed),
        blocker: "authority_leak_observation_missing"
      },
      {
        id: "production_rollback_ready",
        required: true,
        passed: bool(evidence.production_rollback_ready),
        blocker: "production_rollback_not_ready"
      }
    ];
  }

  function evaluate(evidence = {}) {
    const source = clone(evidence) || {};
    const evaluatedChecks = checks(source);
    const blockers = evaluatedChecks.filter((check) => check.required && !check.passed).map((check) => check.blocker).sort();
    const decision = blockers.length ? DECISION_NO_GO : DECISION_CONTROLLED_PILOT;
    const gateIdSeed = JSON.stringify({
      schema: GATE_SCHEMA,
      evidence_id: text(source.evidence_id),
      main_commit_sha: text(source.main_commit_sha),
      deployed_commit_sha: text(source.deployed_commit_sha),
      checks: evaluatedChecks.map((check) => [check.id, check.passed])
    });
    let hash = 2166136261;
    for (let index = 0; index < gateIdSeed.length; index += 1) {
      hash ^= gateIdSeed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const gateId = `v2_prod_gate_${(hash >>> 0).toString(16).padStart(8, "0")}`;

    return clone({
      schema: GATE_SCHEMA,
      version: GATE_VERSION,
      mode: "decision_only",
      gate_id: gateId,
      decision,
      eligible_for_controlled_write_pilot: decision === DECISION_CONTROLLED_PILOT,
      eligible_for_normal_chat_persistence: false,
      eligible_for_automatic_backfill: false,
      blocking_reasons: blockers,
      checks: evaluatedChecks,
      evidence: {
        evidence_id: text(source.evidence_id),
        observed_at: text(source.observed_at),
        main_commit_sha: text(source.main_commit_sha),
        deployed_commit_sha: text(source.deployed_commit_sha),
        source: text(source.source || "operator_review")
      },
      next_action: blockers.length
        ? "Collect the missing production evidence; do not activate V2 writes."
        : "A separate explicit activation PR may propose a bounded controlled write pilot; normal Chat persistence remains closed.",
      policy: policy()
    });
  }

  const api = Object.freeze({
    GATE_SCHEMA,
    GATE_VERSION,
    DECISION_NO_GO,
    DECISION_CONTROLLED_PILOT,
    checks,
    evaluate
  });
  global.AHAV2ProductionWriteGate = api;
  global.AHAModuleApi?.register?.("v2ProductionWriteGate", api, {
    version: GATE_VERSION,
    legacyGlobal: "AHAV2ProductionWriteGate",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
