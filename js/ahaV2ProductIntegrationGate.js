// ahaV2ProductIntegrationGate.js
// First post-build integration gate for AHA Insight Engine V2.
//
// This module composes block 9 migration inventory with block 8 projections in
// shadow/read-only mode. It deliberately does not execute migration writes and
// does not bind projections to product stores. Only trust-ready legacy insights
// may enter the shared projection core; enrichment/invalid/conflicting records
// remain review-only.

(function (global) {
  "use strict";

  const GATE_SCHEMA = "aha_v2_product_integration_gate_v1";
  const GATE_VERSION = 1;
  const READY_CLASSIFICATIONS = Object.freeze(["v2_ready", "already_staged"]);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function migrationApi() {
    return global.AHAKnowledgeMigrationV2 || null;
  }

  function projectionsApi() {
    return global.AHASemanticProjectionsV2 || null;
  }

  function legacyInsights(input) {
    return arr(input?.legacy_insights || input?.insights || input?.chamber?.insights);
  }

  function explicitSourceId(record) {
    return text(
      record?.id
      || record?.insight_id
      || record?.canonical_insight_id
      || record?.candidate_signature
      || record?.legacy_id
    );
  }

  function legacySourceId(record, index, migration) {
    const explicit = explicitSourceId(record);
    if (explicit) return explicit;
    return `legacy_insight_${index}_${migration.stableHash(record)}`;
  }

  function policy() {
    return {
      production_gate_authority: false,
      automatic_activation_authority: false,
      migration_apply_authority: false,
      product_surface_binding_authority: false,
      chamber_write: false,
      canonical_write: false,
      insights_write: false,
      concepts_write: false,
      lists_write: false,
      paths_write: false,
      mindmap_write: false,
      meta_write: false,
      persistent_write: false,
      remote_write: false,
      normal_chat_persistence_authority: false
    };
  }

  function blockedResult(reasons, migrationPlan = null) {
    return clone({
      schema: GATE_SCHEMA,
      version: GATE_VERSION,
      mode: "shadow",
      status: "blocked",
      gate_id: null,
      blocking_reasons: [...new Set(arr(reasons).map(String).filter(Boolean))].sort(),
      checks: {
        migration_dependency_ready: Boolean(migrationApi()?.plan),
        projections_dependency_ready: Boolean(projectionsApi()?.project),
        migration_plan_valid: false,
        trusted_only_projection: false,
        projection_valid: false,
        reference_boundary_valid: false,
        product_writes_closed: true,
        normal_chat_persistence_closed: true
      },
      migration: migrationPlan ? clone({
        migration_id: migrationPlan.migration_id,
        status: migrationPlan.status,
        counts: migrationPlan.counts,
        blocking_reasons: migrationPlan.blocking_reasons,
        validation: migrationPlan.validation,
        inventory: migrationPlan.inventory,
        reference_rewrites: migrationPlan.reference_rewrites
      }) : null,
      trusted_source_ids: [],
      exclusions: [],
      trusted_reference_rewrites: [],
      deferred_reference_rewrites: [],
      projection: null,
      adapters: null,
      policy: policy()
    });
  }

  function validate(result) {
    const errors = [];
    const migration = result?.migration || {};
    const projection = result?.projection || {};
    const trusted = new Set(arr(result?.trusted_source_ids));
    const excluded = new Set(arr(result?.exclusions).map((entry) => entry.source_id));

    if (!migration.migration_id) errors.push("migration_id_missing");
    if (migration.validation?.valid !== true) errors.push("migration_plan_invalid");
    if (projection.validation?.valid !== true) errors.push("projection_invalid");
    if (projection.mode !== "shadow") errors.push("projection_not_shadow");
    if (Number(projection.input_count || 0) !== trusted.size) errors.push("projection_input_count_mismatch");

    arr(projection?.projections?.insights).forEach((insight) => {
      arr(insight?.member_ids).forEach((id) => {
        if (!trusted.has(id)) errors.push(`projection_contains_non_trusted_source:${id}`);
        if (excluded.has(id)) errors.push(`projection_contains_excluded_source:${id}`);
      });
    });

    arr(result?.trusted_reference_rewrites).forEach((rewrite) => {
      if (!trusted.has(rewrite?.legacy_ref_id)) errors.push(`trusted_reference_not_trusted:${rewrite?.legacy_ref_id}`);
    });
    arr(result?.deferred_reference_rewrites).forEach((rewrite) => {
      if (trusted.has(rewrite?.legacy_ref_id)) errors.push(`trusted_reference_deferred:${rewrite?.legacy_ref_id}`);
    });

    const migrationPolicy = migration.policy || {};
    const projectionPolicy = projection.policy || {};
    for (const key of [
      "product_store_write_authority", "chamber_write", "canonical_write", "lists_write", "paths_write", "mindmap_write", "meta_write",
      "normal_chat_persistence_open"
    ]) {
      if (migrationPolicy[key] === true) errors.push(`migration_policy_open:${key}`);
    }
    for (const key of [
      "automatic_projection_authority", "chamber_write", "canonical_write", "insights_write", "concepts_write", "lists_write", "paths_write",
      "mindmap_write", "meta_write", "persistent_write", "remote_write"
    ]) {
      if (projectionPolicy[key] === true) errors.push(`projection_policy_open:${key}`);
    }
    Object.entries(policy()).forEach(([key, value]) => {
      if (value === false && result?.policy?.[key] !== false) errors.push(`gate_policy_open:${key}`);
    });

    return clone({ valid: errors.length === 0, errors: [...new Set(errors)].sort() });
  }

  function previewActiveBundle(input, projections) {
    const bundle = input?.analysis_bundle_v2;
    const identity = bundle?.identity || {};
    const records = arr(input?.approved_active_insights);
    const identityErrors = [];
    if (bundle?.schema !== "aha_analysis_bundle_v2" || bundle?.validation?.valid !== true) identityErrors.push("active_analysis_bundle_v2_invalid");
    if (!String(identity.analysis_id || "").trim()) identityErrors.push("active_analysis_id_missing");
    if (!String(identity.analysis_run_id || "").trim()) identityErrors.push("active_analysis_run_id_missing");
    if (!String(identity.source_id || "").trim()) identityErrors.push("active_source_id_missing");
    if (!/^[a-f0-9]{64}$/u.test(String(identity.source_sha256 || ""))) identityErrors.push("active_source_sha256_invalid");
    records.forEach((record) => {
      if (
        record?.analysis_id !== identity.analysis_id
        || record?.analysis_run_id !== identity.analysis_run_id
        || record?.source_id !== identity.source_id
        || record?.source_text_hash !== identity.source_sha256
      ) identityErrors.push(`active_bundle_record_identity_mismatch:${explicitSourceId(record) || "unknown"}`);
    });
    if (identityErrors.length) return blockedResult(identityErrors);
    if (!records.length) return blockedResult(["no_approved_active_bundle_insights"]);

    const projection = projections.project({ insights: records });
    if (projection.status === "blocked" || projection.validation?.valid !== true) {
      const blocked = blockedResult([
        "active_bundle_projection_not_ready",
        ...arr(projection.blocking_reasons),
        ...arr(projection.validation?.errors)
      ]);
      blocked.source_mode = "active_analysis_bundle_v2";
      blocked.projection = clone(projection);
      blocked.adapters = projections.adapters(projection);
      return clone(blocked);
    }

    const trustedSourceIds = [...new Set(arr(projection?.core?.insight_units).flatMap((unit) => arr(unit?.member_ids)).map(String).filter(Boolean))].sort();
    const exclusions = arr(projection.exclusions).map((entry) => ({
      source_id: String(entry?.id || ""),
      classification: "active_bundle_quality_excluded",
      action: "hold_back",
      reason: arr(entry?.readiness?.blocking_reasons).join(",") || "projection_readiness_failed",
      trust: clone(entry?.readiness || {})
    })).filter((entry) => entry.source_id).sort((a, b) => a.source_id.localeCompare(b.source_id));
    const migration = {
      migration_id: `active_bundle_${String(bundle.bundle_id || identity.analysis_id)}`,
      status: "not_applicable_active_analysis_bundle_v2",
      counts: {
        legacy_insight_count: 0,
        trusted_candidate_count: trustedSourceIds.length,
        enrichment_candidate_count: 0,
        already_staged_count: 0,
        invalid_skip_count: exclusions.length,
        conflict_count: 0,
        reference_candidate_count: 0,
        planned_write_count: 0
      },
      blocking_reasons: [],
      validation: { valid: true, errors: [] },
      inventory: [],
      reference_rewrites: [],
      policy: policy()
    };
    const result = {
      schema: GATE_SCHEMA,
      version: GATE_VERSION,
      mode: "shadow",
      source_mode: "active_analysis_bundle_v2",
      status: exclusions.length ? "shadow_ready_with_exclusions" : "shadow_ready",
      gate_id: `v2_active_bundle_gate_${String(projection.projection_id || "").replace(/[^a-zA-Z0-9_-]/g, "")}`,
      blocking_reasons: [],
      checks: {
        migration_dependency_ready: true,
        projections_dependency_ready: true,
        migration_plan_valid: true,
        trusted_only_projection: true,
        projection_valid: projection.validation.valid === true,
        reference_boundary_valid: true,
        product_writes_closed: true,
        normal_chat_persistence_closed: true
      },
      migration,
      trusted_source_ids: trustedSourceIds,
      exclusions,
      trusted_reference_rewrites: [],
      deferred_reference_rewrites: [],
      projection: clone(projection),
      adapters: projections.adapters(projection),
      policy: policy(),
      validation: { valid: false, errors: [] }
    };
    result.validation = validate(result);
    if (!result.validation.valid) {
      result.status = "blocked";
      result.blocking_reasons = ["active_bundle_product_integration_validation_failed"];
    }
    return clone(result);
  }

  function preview(input = {}) {
    const migration = migrationApi();
    const projections = projectionsApi();
    if (input?.analysis_bundle_v2 || input?.approved_active_insights) {
      if (!projections?.project || !projections?.adapters) return blockedResult(["semantic_projections_v2_unavailable"]);
      return previewActiveBundle(input, projections);
    }
    const missing = [];
    if (!migration?.plan || !migration?.stableHash) missing.push("knowledge_migration_v2_unavailable");
    if (!projections?.project || !projections?.adapters) missing.push("semantic_projections_v2_unavailable");
    if (missing.length) return blockedResult(missing);

    const migrationPlan = migration.plan(input);
    if (migrationPlan.status === "blocked" || migrationPlan.validation?.valid !== true) {
      return blockedResult([
        "migration_plan_not_ready",
        ...arr(migrationPlan.blocking_reasons),
        ...arr(migrationPlan.validation?.errors)
      ], migrationPlan);
    }

    const records = legacyInsights(input);
    const recordBySourceId = new Map();
    records.forEach((record, index) => {
      recordBySourceId.set(legacySourceId(record, index, migration), record);
    });

    const trustedInventory = arr(migrationPlan.inventory)
      .filter((entry) => READY_CLASSIFICATIONS.includes(entry.classification) && entry?.trust?.ready === true)
      .sort((a, b) => String(a.source_id).localeCompare(String(b.source_id)));
    const trustedSourceIds = trustedInventory.map((entry) => entry.source_id);
    const trustedSet = new Set(trustedSourceIds);
    const trustedRecords = trustedSourceIds.map((id) => recordBySourceId.get(id)).filter(Boolean);

    const exclusions = arr(migrationPlan.inventory)
      .filter((entry) => !trustedSet.has(entry.source_id))
      .map((entry) => ({
        source_id: entry.source_id,
        classification: entry.classification,
        action: entry.action,
        reason: entry.reason,
        trust: clone(entry.trust)
      }))
      .sort((a, b) => a.source_id.localeCompare(b.source_id));

    const missingTrustedRecords = trustedSourceIds.filter((id) => !recordBySourceId.has(id));
    if (missingTrustedRecords.length) {
      return blockedResult(missingTrustedRecords.map((id) => `trusted_legacy_record_missing:${id}`), migrationPlan);
    }
    if (!trustedRecords.length) {
      const blocked = blockedResult(["no_v2_ready_legacy_insights"], migrationPlan);
      blocked.exclusions = exclusions;
      blocked.deferred_reference_rewrites = clone(arr(migrationPlan.reference_rewrites));
      return clone(blocked);
    }

    const projection = projections.project({ insights: trustedRecords });
    if (projection.status === "blocked" || projection.validation?.valid !== true) {
      const blocked = blockedResult([
        "shared_projection_not_ready",
        ...arr(projection.blocking_reasons),
        ...arr(projection.validation?.errors)
      ], migrationPlan);
      blocked.trusted_source_ids = trustedSourceIds;
      blocked.exclusions = exclusions;
      blocked.projection = clone(projection);
      blocked.adapters = projections.adapters(projection);
      return clone(blocked);
    }

    const trustedReferenceRewrites = arr(migrationPlan.reference_rewrites)
      .filter((rewrite) => trustedSet.has(rewrite.legacy_ref_id))
      .sort((a, b) => String(a.usage_key).localeCompare(String(b.usage_key)));
    const deferredReferenceRewrites = arr(migrationPlan.reference_rewrites)
      .filter((rewrite) => !trustedSet.has(rewrite.legacy_ref_id))
      .sort((a, b) => String(a.usage_key).localeCompare(String(b.usage_key)));

    const gateSeed = {
      migration_id: migrationPlan.migration_id,
      projection_id: projection.projection_id,
      trusted_source_ids: trustedSourceIds,
      trusted_reference_usage_keys: trustedReferenceRewrites.map((entry) => entry.usage_key),
      deferred_reference_usage_keys: deferredReferenceRewrites.map((entry) => entry.usage_key)
    };
    const result = {
      schema: GATE_SCHEMA,
      version: GATE_VERSION,
      mode: "shadow",
      status: exclusions.length || deferredReferenceRewrites.length ? "shadow_ready_with_exclusions" : "shadow_ready",
      gate_id: `v2_integration_gate_${migration.stableHash(gateSeed)}`,
      blocking_reasons: [],
      checks: {
        migration_dependency_ready: true,
        projections_dependency_ready: true,
        migration_plan_valid: migrationPlan.validation.valid === true,
        trusted_only_projection: true,
        projection_valid: projection.validation.valid === true,
        reference_boundary_valid: true,
        product_writes_closed: true,
        normal_chat_persistence_closed: true
      },
      migration: {
        migration_id: migrationPlan.migration_id,
        status: migrationPlan.status,
        counts: clone(migrationPlan.counts),
        blocking_reasons: clone(migrationPlan.blocking_reasons),
        validation: clone(migrationPlan.validation),
        inventory: clone(migrationPlan.inventory),
        reference_rewrites: clone(migrationPlan.reference_rewrites),
        policy: clone(migrationPlan.policy)
      },
      trusted_source_ids: trustedSourceIds,
      exclusions,
      trusted_reference_rewrites: trustedReferenceRewrites,
      deferred_reference_rewrites: deferredReferenceRewrites,
      projection: clone(projection),
      adapters: projections.adapters(projection),
      policy: policy(),
      validation: { valid: false, errors: [] }
    };
    result.validation = validate(result);
    if (!result.validation.valid) {
      result.status = "blocked";
      result.blocking_reasons = ["v2_product_integration_gate_validation_failed"];
      result.checks.trusted_only_projection = false;
      result.checks.reference_boundary_valid = false;
    }
    return clone(result);
  }

  function surface(result, name) {
    const projections = projectionsApi();
    if (!projections?.SURFACES?.includes(name)) return null;
    return clone(result?.adapters?.[name] ?? null);
  }

  const api = Object.freeze({
    GATE_SCHEMA,
    GATE_VERSION,
    READY_CLASSIFICATIONS,
    preview,
    previewActiveBundle,
    validate,
    surface
  });
  global.AHAV2ProductIntegrationGate = api;
  global.AHAModuleApi?.register?.("v2ProductIntegrationGate", api, {
    version: GATE_VERSION,
    legacyGlobal: "AHAV2ProductIntegrationGate",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
