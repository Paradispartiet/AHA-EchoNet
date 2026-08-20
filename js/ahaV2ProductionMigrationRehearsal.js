// ahaV2ProductionMigrationRehearsal.js
// Operator-only production-like rehearsal for V2 block-9 legacy migration.
//
// The rehearsal uses only an adapter scoped to `v2_backfill_staging`. It proves
// dry-run, first apply, idempotent second apply and exact rollback without
// writing to Chamber, Lists, Paths, Mindmap, Meta, canonical storage or remote
// backends. A live evidence result is production-gate eligible only when the
// adapter is the isolated IndexedDB staging driver.

(function (global) {
  "use strict";

  const REHEARSAL_SCHEMA = "aha_v2_production_migration_rehearsal_v1";
  const EVIDENCE_SCHEMA = "aha_v2_production_migration_rehearsal_evidence_v1";
  const VERSION = 1;
  const REQUIRED_SCOPE = "v2_backfill_staging";

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function migrationApi() {
    return global.AHAKnowledgeMigrationV2 || null;
  }

  function policy() {
    return {
      operator_only: true,
      product_write_authority: false,
      chamber_write: false,
      canonical_write: false,
      lists_write: false,
      paths_write: false,
      mindmap_write: false,
      meta_write: false,
      normal_chat_persistence_open: false,
      remote_write: false,
      staging_scope_only: true,
      live_gate_evidence_requires_indexeddb_staging: true
    };
  }

  function summarizePlan(plan) {
    return {
      migration_id: plan?.migration_id || null,
      status: plan?.status || "blocked",
      validation_valid: plan?.validation?.valid === true,
      legacy_insight_count: Number(plan?.counts?.legacy_insight_count) || 0,
      trusted_candidate_count: Number(plan?.counts?.trusted_candidate_count) || 0,
      enrichment_candidate_count: Number(plan?.counts?.enrichment_candidate_count) || 0,
      already_staged_count: Number(plan?.counts?.already_staged_count) || 0,
      invalid_skip_count: Number(plan?.counts?.invalid_skip_count) || 0,
      conflict_count: Number(plan?.counts?.conflict_count) || 0,
      reference_candidate_count: Number(plan?.counts?.reference_candidate_count) || 0,
      planned_write_count: Number(plan?.counts?.planned_write_count) || 0,
      blocking_reasons: arr(plan?.blocking_reasons).map(String).sort()
    };
  }

  function adapterReady(adapter) {
    return Boolean(
      adapter
      && adapter.scope === REQUIRED_SCOPE
      && typeof adapter.get === "function"
      && typeof adapter.put === "function"
      && typeof adapter.remove === "function"
      && typeof adapter.count === "function"
    );
  }

  function inputFingerprint(input) {
    const api = migrationApi();
    return api?.stableHash ? api.stableHash(input) : null;
  }

  async function preview(input = {}, adapter = null) {
    const api = migrationApi();
    if (!api?.plan || !api?.execute) {
      return clone({
        schema: REHEARSAL_SCHEMA,
        version: VERSION,
        mode: "dry_run",
        status: "blocked",
        blocking_reasons: ["knowledge_migration_v2_unavailable"],
        plan: null,
        dry_run: null,
        operator_review_required: true,
        policy: policy()
      });
    }

    const sourceBefore = clone(input);
    const fingerprintBefore = inputFingerprint(sourceBefore);
    const plan = api.plan(sourceBefore);
    const dryRun = await api.execute(plan, adapter, { mode: "dry_run" });
    const fingerprintAfter = inputFingerprint(sourceBefore);
    const summary = summarizePlan(plan);
    const blocked = plan.status === "blocked" || plan.validation?.valid !== true || dryRun.status === "blocked";

    return clone({
      schema: REHEARSAL_SCHEMA,
      version: VERSION,
      mode: "dry_run",
      status: blocked ? "blocked" : "review_required",
      blocking_reasons: blocked ? [...new Set([...(plan.blocking_reasons || []), "dry_run_not_ready"])].sort() : [],
      input_fingerprint: fingerprintBefore,
      input_unchanged: fingerprintBefore != null && fingerprintBefore === fingerprintAfter,
      plan: summary,
      dry_run: {
        status: dryRun.status,
        write_count: Number(dryRun.write_count) || 0,
        planned_write_count: Number(dryRun.planned_write_count) || 0,
        rollback_token_present: Boolean(dryRun.rollback_token)
      },
      operator_review_required: true,
      operator_review_fields: [
        "trusted_candidate_count",
        "enrichment_candidate_count",
        "invalid_skip_count",
        "conflict_count",
        "reference_candidate_count",
        "planned_write_count"
      ],
      policy: policy()
    });
  }

  async function rehearse(input = {}, adapter, options = {}) {
    const api = migrationApi();
    const blocking = [];
    if (!api?.plan || !api?.execute || !api?.rollback) blocking.push("knowledge_migration_v2_unavailable");
    if (!adapterReady(adapter)) blocking.push("isolated_staging_adapter_required");
    if (options.dry_run_reviewed !== true) blocking.push("operator_dry_run_review_required");
    if (options.explicit_authorization !== true) blocking.push("explicit_rehearsal_authorization_required");
    if (blocking.length) {
      return clone({
        schema: EVIDENCE_SCHEMA,
        version: VERSION,
        status: "blocked",
        blocking_reasons: [...new Set(blocking)].sort(),
        migration_dry_run_reviewed: options.dry_run_reviewed === true,
        staging_apply_rollback_production_proof: false,
        production_like_target: false,
        policy: policy()
      });
    }

    const source = clone(input);
    const beforeFingerprint = inputFingerprint(source);
    const preCount = Number(await Promise.resolve(adapter.count())) || 0;
    if (preCount !== 0) {
      return clone({
        schema: EVIDENCE_SCHEMA,
        version: VERSION,
        status: "blocked",
        blocking_reasons: ["staging_namespace_not_empty"],
        staging_count_before: preCount,
        migration_dry_run_reviewed: true,
        staging_apply_rollback_production_proof: false,
        production_like_target: adapter.driver === "indexeddb",
        policy: policy()
      });
    }

    const plan = api.plan(source);
    const summary = summarizePlan(plan);
    if (plan.status === "blocked" || plan.validation?.valid !== true) {
      return clone({
        schema: EVIDENCE_SCHEMA,
        version: VERSION,
        status: "blocked",
        blocking_reasons: [...new Set([...(plan.blocking_reasons || []), "migration_plan_not_ready"])].sort(),
        plan: summary,
        migration_dry_run_reviewed: true,
        staging_apply_rollback_production_proof: false,
        production_like_target: adapter.driver === "indexeddb",
        policy: policy()
      });
    }

    const dryRun = await api.execute(plan, adapter, { mode: "dry_run" });
    if (dryRun.status !== "previewed" || Number(dryRun.write_count) !== 0) {
      return clone({
        schema: EVIDENCE_SCHEMA,
        version: VERSION,
        status: "failed",
        blocking_reasons: ["dry_run_write_boundary_failed"],
        plan: summary,
        migration_dry_run_reviewed: true,
        staging_apply_rollback_production_proof: false,
        production_like_target: adapter.driver === "indexeddb",
        policy: policy()
      });
    }

    const applied = await api.execute(plan, adapter, { mode: "apply", explicit_authorization: true });
    if (applied.status !== "applied") {
      return clone({
        schema: EVIDENCE_SCHEMA,
        version: VERSION,
        status: "failed",
        blocking_reasons: ["first_staging_apply_failed"],
        plan: summary,
        apply_status: applied.status,
        auto_rollback: clone(applied.auto_rollback || null),
        migration_dry_run_reviewed: true,
        staging_apply_rollback_production_proof: false,
        production_like_target: adapter.driver === "indexeddb",
        policy: policy()
      });
    }

    const stagedAfterFirstApply = Number(await Promise.resolve(adapter.count())) || 0;
    const secondApply = await api.execute(plan, adapter, { mode: "apply", explicit_authorization: true });
    const idempotent = secondApply.status === "applied"
      && Number(secondApply.write_count) === 0
      && Number(secondApply.no_op_count) === summary.planned_write_count;

    const rollback = await api.rollback(applied, adapter, { explicit_authorization: true });
    const postCount = Number(await Promise.resolve(adapter.count())) || 0;
    const afterFingerprint = inputFingerprint(source);
    const inputUnchanged = beforeFingerprint != null && beforeFingerprint === afterFingerprint;
    const rollbackComplete = rollback.status === "rollback_complete"
      && Number(rollback.rolled_back_count) === summary.planned_write_count
      && postCount === 0;
    const productionLikeTarget = adapter.driver === "indexeddb";
    const proof = productionLikeTarget
      && inputUnchanged
      && stagedAfterFirstApply === summary.planned_write_count
      && idempotent
      && rollbackComplete;

    return clone({
      schema: EVIDENCE_SCHEMA,
      version: VERSION,
      status: proof ? "verified" : "failed",
      blocking_reasons: proof ? [] : [
        !productionLikeTarget ? "production_like_indexeddb_target_not_used" : null,
        !inputUnchanged ? "legacy_input_mutated" : null,
        stagedAfterFirstApply !== summary.planned_write_count ? "staging_count_after_apply_mismatch" : null,
        !idempotent ? "second_apply_not_idempotent" : null,
        !rollbackComplete ? "exact_rollback_not_proven" : null
      ].filter(Boolean).sort(),
      rehearsal_id: `v2_migration_rehearsal_${text(plan.migration_id || "unknown")}`,
      migration_id: plan.migration_id,
      adapter: {
        scope: adapter.scope,
        driver: adapter.driver || "unknown",
        namespace: adapter.namespace || null
      },
      plan: summary,
      dry_run: {
        status: dryRun.status,
        write_count: Number(dryRun.write_count) || 0,
        planned_write_count: Number(dryRun.planned_write_count) || 0
      },
      first_apply: {
        status: applied.status,
        write_count: Number(applied.write_count) || 0,
        no_op_count: Number(applied.no_op_count) || 0,
        staged_count_after: stagedAfterFirstApply,
        rollback_token_present: Boolean(applied.rollback_token)
      },
      second_apply: {
        status: secondApply.status,
        write_count: Number(secondApply.write_count) || 0,
        no_op_count: Number(secondApply.no_op_count) || 0,
        idempotent
      },
      rollback: {
        status: rollback.status,
        rolled_back_count: Number(rollback.rolled_back_count) || 0,
        no_op_count: Number(rollback.no_op_count) || 0,
        staging_count_after: postCount,
        exact: rollbackComplete
      },
      input_unchanged: inputUnchanged,
      production_like_target: productionLikeTarget,
      migration_dry_run_reviewed: true,
      staging_apply_rollback_production_proof: proof,
      no_product_write_authority: true,
      no_remote_write_authority: true,
      policy: policy()
    });
  }

  const api = Object.freeze({
    REHEARSAL_SCHEMA,
    EVIDENCE_SCHEMA,
    VERSION,
    REQUIRED_SCOPE,
    preview,
    rehearse
  });
  global.AHAV2ProductionMigrationRehearsal = api;
  global.AHAModuleApi?.register?.("v2ProductionMigrationRehearsal", api, {
    version: VERSION,
    legacyGlobal: "AHAV2ProductionMigrationRehearsal",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
