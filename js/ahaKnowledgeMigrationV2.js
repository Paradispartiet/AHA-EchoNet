// ahaKnowledgeMigrationV2.js
// AHA V2 block 9: controlled, idempotent and reversible legacy knowledge backfill.
//
// This module is deliberately NOT wired to Chamber, Lists, Paths, Mindmap,
// localStorage, repositories, canonical storage, Chat persistence or remote
// backends. The only executable write contract is a caller-supplied adapter
// whose scope must be exactly `v2_backfill_staging`. Product stores are never a
// valid target here.

(function (global) {
  "use strict";

  const MIGRATION_SCHEMA = "aha_knowledge_migration_v2";
  const CANDIDATE_SCHEMA = "aha_v2_backfill_candidate";
  const REFERENCE_SCHEMA = "aha_v2_reference_rewrite_candidate";
  const MIGRATION_VERSION = 2;
  const ADAPTER_SCOPE = "v2_backfill_staging";
  const TARGET_KINDS = Object.freeze(["v2_backfill_candidate", "v2_reference_rewrite_candidate"]);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function normalize(value) {
    return text(value)
      .toLocaleLowerCase("no")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s:_-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== "object") return value;
    const output = {};
    Object.keys(value).sort().forEach((key) => {
      if (value[key] !== undefined) output[key] = stableValue(value[key]);
    });
    return output;
  }

  function stableStringify(value) {
    return JSON.stringify(stableValue(value));
  }

  function hash(value) {
    let state = 2166136261;
    const input = String(value || "");
    for (let index = 0; index < input.length; index += 1) {
      state ^= input.charCodeAt(index);
      state = Math.imul(state, 16777619);
    }
    return (state >>> 0).toString(16).padStart(8, "0");
  }

  function stableHash(value) {
    return hash(typeof value === "string" ? value : stableStringify(value));
  }

  function saturationApi() {
    return global.AHAInsightSaturationV2 || null;
  }

  function legacyInsightText(record) {
    const candidate = record?.candidate && typeof record.candidate === "object" ? record.candidate : {};
    return text(
      candidate.insight
      || record?.insight
      || record?.summary
      || record?.claim
      || record?.content
      || record?.text
      || record?.title
      || record?.activation_v2?.insight
    );
  }

  function sourceId(record, index) {
    const explicit = text(
      record?.id
      || record?.insight_id
      || record?.canonical_insight_id
      || record?.candidate_signature
      || record?.legacy_id
    );
    if (explicit) return explicit;
    return `legacy_insight_${index}_${stableHash(record)}`;
  }

  function targetIdFor(sourceKind, id) {
    return `backfill_v2_${hash(`${sourceKind}:${id}`)}`;
  }

  function operationIdFor(kind, id) {
    return `migration_op_v2_${hash(`${kind}:${id}`)}`;
  }

  function trustFrom(record) {
    const saturation = saturationApi();
    if (!saturation?.describeReadiness) {
      return {
        ready: false,
        quality_ready: false,
        quality_score: null,
        provenance_ready: false,
        causal_status: "unknown",
        blocking_reasons: ["insight_saturation_v2_unavailable"]
      };
    }
    const readiness = saturation.describeReadiness(record);
    return {
      ready: readiness.ready === true,
      quality_ready: readiness.quality_ready === true,
      quality_score: readiness.quality_score == null ? null : Number(readiness.quality_score),
      provenance_ready: readiness.provenance_ready === true,
      causal_status: readiness.causal_status || "unknown",
      blocking_reasons: arr(readiness.blocking_reasons).map(String).sort()
    };
  }

  function legacyFingerprint(record, id) {
    return stableHash({
      source_kind: "insight",
      source_id: id,
      payload: record
    });
  }

  function existingStagedRecords(input) {
    return [
      ...arr(input.existing_v2),
      ...arr(input.existing_staged),
      ...arr(input.existing_backfill_candidates)
    ].filter((record) => record && typeof record === "object");
  }

  function indexExisting(records) {
    const byLegacy = new Map();
    records.forEach((record) => {
      const legacy = record.legacy || record.migration?.legacy || {};
      const kind = text(legacy.source_kind || legacy.kind);
      const id = text(legacy.source_id || legacy.id);
      const fingerprint = text(legacy.fingerprint || record.migration?.legacy_fingerprint);
      if (!kind || !id || !fingerprint) return;
      const key = `${kind}:${id}`;
      if (!byLegacy.has(key)) byLegacy.set(key, []);
      byLegacy.get(key).push({ record, fingerprint });
    });
    return byLegacy;
  }

  function inspectLegacyInsights(input) {
    const saturation = saturationApi();
    if (!saturation?.describeReadiness) {
      return {
        blocked: true,
        blocking_reasons: ["insight_saturation_v2_unavailable"],
        analyses: []
      };
    }

    const legacyInsights = arr(input.legacy_insights || input.insights || input.chamber?.insights);
    const existingIndex = indexExisting(existingStagedRecords(input));
    const analyses = legacyInsights.map((record, index) => {
      const id = sourceId(record, index);
      const content = legacyInsightText(record);
      const fingerprint = legacyFingerprint(record, id);
      const trust = trustFrom(record);
      const existing = existingIndex.get(`insight:${id}`) || [];
      const exactExisting = existing.find((entry) => entry.fingerprint === fingerprint) || null;
      const conflictingExisting = existing.find((entry) => entry.fingerprint !== fingerprint) || null;
      const targetId = targetIdFor("insight", id);

      let classification = "needs_semantic_enrichment";
      let action = "stage_enrichment_candidate";
      let reason = "legacy_record_not_v2_trust_ready";
      if (!content) {
        classification = "invalid";
        action = "skip_invalid";
        reason = "legacy_insight_text_missing";
      } else if (conflictingExisting) {
        classification = "conflict";
        action = "block_conflict";
        reason = "existing_backfill_candidate_has_different_legacy_fingerprint";
      } else if (exactExisting) {
        classification = "already_staged";
        action = "already_migrated";
        reason = "exact_legacy_fingerprint_already_staged";
      } else if (trust.ready) {
        classification = "v2_ready";
        action = "stage_trusted_candidate";
        reason = "legacy_record_already_satisfies_v2_trust_contract";
      }

      return {
        index,
        source_kind: "insight",
        source_id: id,
        fingerprint,
        target_id: targetId,
        classification,
        action,
        reason,
        content,
        trust,
        record: clone(record)
      };
    });

    return { blocked: false, blocking_reasons: [], analyses };
  }

  function containerId(container, index, surface) {
    return text(container?.id || container?.list_id || container?.path_id || container?.mindmap_id)
      || `${surface}_${index}_${stableHash(container)}`;
  }

  function refValue(value) {
    return text(value?.refId || value?.ref_id || value?.insight_id || value?.insightId);
  }

  function collectReferenceUsages(input, sourceToTarget) {
    const usages = [];
    function add(surface, container, containerIndex, location, entry) {
      const legacyRef = refValue(entry);
      if (!legacyRef || !sourceToTarget.has(legacyRef)) return;
      const containerIdentifier = containerId(container, containerIndex, surface);
      const targetRef = sourceToTarget.get(legacyRef);
      const usageKey = `${surface}:${containerIdentifier}:${location}:${legacyRef}:${targetRef}`;
      usages.push({
        usage_key: usageKey,
        surface,
        container_id: containerIdentifier,
        location,
        legacy_ref_id: legacyRef,
        staging_ref_id: targetRef
      });
    }

    arr(input.legacy_lists || input.lists).forEach((list, listIndex) => {
      arr(list?.items).forEach((item, itemIndex) => add("lists", list, listIndex, `items[${itemIndex}]`, item));
    });
    arr(input.legacy_paths || input.paths).forEach((path, pathIndex) => {
      arr(path?.steps).forEach((step, stepIndex) => add("paths", path, pathIndex, `steps[${stepIndex}]`, step));
    });
    arr(input.legacy_mindmaps || input.mindmaps).forEach((mindmap, mindmapIndex) => {
      arr(mindmap?.nodes).forEach((node, nodeIndex) => add("mindmap", mindmap, mindmapIndex, `nodes[${nodeIndex}]`, node));
      arr(mindmap?.payload?.nodes).forEach((node, nodeIndex) => add("mindmap", mindmap, mindmapIndex, `payload.nodes[${nodeIndex}]`, node));
    });

    const byKey = new Map();
    usages.forEach((usage) => byKey.set(usage.usage_key, usage));
    return [...byKey.values()].sort((a, b) => a.usage_key.localeCompare(b.usage_key));
  }

  function candidatePayload(analysis, migrationId) {
    const trusted = analysis.classification === "v2_ready";
    return {
      schema: CANDIDATE_SCHEMA,
      version: MIGRATION_VERSION,
      id: analysis.target_id,
      status: trusted ? "ready_for_v2_projection_review" : "needs_semantic_enrichment",
      legacy: {
        source_kind: analysis.source_kind,
        source_id: analysis.source_id,
        fingerprint: analysis.fingerprint
      },
      trust: {
        eligible_as_v2_input: analysis.trust.ready === true,
        authoritative_for_product: false,
        quality_ready: analysis.trust.quality_ready === true,
        quality_score: analysis.trust.quality_score,
        provenance_ready: analysis.trust.provenance_ready === true,
        causal_status: analysis.trust.causal_status,
        blocking_reasons: [...analysis.trust.blocking_reasons]
      },
      content_preview: {
        insight: analysis.content
      },
      legacy_payload: clone(analysis.record),
      migration: {
        schema: MIGRATION_SCHEMA,
        migration_id: migrationId,
        action: analysis.action,
        staging_only: true,
        product_write_authority: false
      }
    };
  }

  function referencePayload(usage, migrationId) {
    return {
      schema: REFERENCE_SCHEMA,
      version: MIGRATION_VERSION,
      id: `reference_v2_${hash(usage.usage_key)}`,
      surface: usage.surface,
      container_id: usage.container_id,
      location: usage.location,
      legacy_ref_id: usage.legacy_ref_id,
      staging_ref_id: usage.staging_ref_id,
      authoritative_for_product: false,
      apply_to_product_store: false,
      migration: {
        schema: MIGRATION_SCHEMA,
        migration_id: migrationId,
        staging_only: true,
        product_reference_rewrite_authority: false
      }
    };
  }

  function makePutOperation(targetKind, targetId, payload, intent) {
    return {
      operation_id: operationIdFor(targetKind, targetId),
      action: "put",
      intent,
      target_kind: targetKind,
      target_id: targetId,
      payload_hash: stableHash(payload),
      payload: clone(payload)
    };
  }

  function validatePlan(plan) {
    const errors = [];
    if (plan?.schema !== MIGRATION_SCHEMA || plan?.version !== MIGRATION_VERSION) errors.push("invalid_migration_schema");
    const seenOperations = new Set();
    const seenTargets = new Set();
    arr(plan?.operations).forEach((operation) => {
      if (!TARGET_KINDS.includes(operation.target_kind)) errors.push(`invalid_target_kind:${operation.target_kind}`);
      if (operation.action !== "put") errors.push(`invalid_operation_action:${operation.operation_id}`);
      if (!operation.operation_id) errors.push("operation_id_missing");
      if (seenOperations.has(operation.operation_id)) errors.push(`duplicate_operation_id:${operation.operation_id}`);
      seenOperations.add(operation.operation_id);
      const targetKey = `${operation.target_kind}:${operation.target_id}`;
      if (seenTargets.has(targetKey)) errors.push(`duplicate_target:${targetKey}`);
      seenTargets.add(targetKey);
      if (operation.payload_hash !== stableHash(operation.payload)) errors.push(`payload_hash_mismatch:${operation.operation_id}`);
      if (operation.target_kind === "v2_backfill_candidate" && operation.payload?.trust?.authoritative_for_product !== false) {
        errors.push(`product_authority_must_remain_false:${operation.operation_id}`);
      }
      if (operation.target_kind === "v2_reference_rewrite_candidate" && operation.payload?.apply_to_product_store !== false) {
        errors.push(`reference_write_must_remain_false:${operation.operation_id}`);
      }
    });
    return { valid: errors.length === 0, errors: [...new Set(errors)].sort() };
  }

  function policy() {
    return {
      production_gate_authority: false,
      production_adapter_wired: false,
      product_store_write_authority: false,
      chamber_write: false,
      canonical_write: false,
      lists_write: false,
      paths_write: false,
      mindmap_write: false,
      meta_write: false,
      normal_chat_persistence_open: false,
      product_reference_rewrite_authority: false,
      staging_apply_requires_explicit_authorization: true,
      staging_adapter_scope: ADAPTER_SCOPE,
      dry_run_default: true
    };
  }

  function plan(input = {}) {
    const inspected = inspectLegacyInsights(input);
    if (inspected.blocked) {
      return clone({
        schema: MIGRATION_SCHEMA,
        version: MIGRATION_VERSION,
        mode: "dry_run",
        status: "blocked",
        migration_id: null,
        blocking_reasons: inspected.blocking_reasons,
        counts: {
          legacy_insight_count: arr(input.legacy_insights || input.insights || input.chamber?.insights).length,
          trusted_candidate_count: 0,
          enrichment_candidate_count: 0,
          already_staged_count: 0,
          invalid_skip_count: 0,
          conflict_count: 0,
          reference_candidate_count: 0,
          planned_write_count: 0
        },
        inventory: [],
        reference_map: {},
        reference_rewrites: [],
        operations: [],
        rollback_manifest: [],
        validation: { valid: false, errors: ["migration_planner_dependency_blocked"] },
        policy: policy()
      });
    }

    const analyses = inspected.analyses;
    const sourceToTarget = new Map();
    analyses.filter((entry) => entry.classification !== "invalid" && entry.classification !== "conflict")
      .forEach((entry) => sourceToTarget.set(entry.source_id, entry.target_id));
    const references = collectReferenceUsages(input, sourceToTarget);
    const migrationSeed = stableStringify({
      sources: analyses.map((entry) => ({
        source_kind: entry.source_kind,
        source_id: entry.source_id,
        fingerprint: entry.fingerprint,
        classification: entry.classification,
        action: entry.action
      })).sort((a, b) => `${a.source_kind}:${a.source_id}`.localeCompare(`${b.source_kind}:${b.source_id}`)),
      references: references.map((entry) => entry.usage_key).sort()
    });
    const migrationId = `migration_v2_${hash(migrationSeed)}`;
    const operations = [];

    analyses.forEach((analysis) => {
      if (!["v2_ready", "needs_semantic_enrichment"].includes(analysis.classification)) return;
      const payload = candidatePayload(analysis, migrationId);
      operations.push(makePutOperation("v2_backfill_candidate", analysis.target_id, payload, analysis.action));
    });
    references.forEach((reference) => {
      const payload = referencePayload(reference, migrationId);
      operations.push(makePutOperation("v2_reference_rewrite_candidate", payload.id, payload, "stage_reference_rewrite_candidate"));
    });
    operations.sort((a, b) => a.operation_id.localeCompare(b.operation_id));

    const conflicts = analyses.filter((entry) => entry.classification === "conflict");
    const validation = validatePlan({ schema: MIGRATION_SCHEMA, version: MIGRATION_VERSION, operations });
    const status = conflicts.length || !validation.valid
      ? "blocked"
      : analyses.some((entry) => entry.classification === "invalid")
        ? "ready_with_skips"
        : "ready";
    const blockingReasons = [];
    conflicts.forEach((entry) => blockingReasons.push(`${entry.reason}:${entry.source_id}`));
    if (!validation.valid) blockingReasons.push("migration_plan_integrity_failed");

    const referenceMap = {};
    [...sourceToTarget.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([source, target]) => {
      referenceMap[source] = target;
    });

    return clone({
      schema: MIGRATION_SCHEMA,
      version: MIGRATION_VERSION,
      mode: "dry_run",
      status,
      migration_id: migrationId,
      blocking_reasons: blockingReasons.sort(),
      counts: {
        legacy_insight_count: analyses.length,
        trusted_candidate_count: analyses.filter((entry) => entry.classification === "v2_ready").length,
        enrichment_candidate_count: analyses.filter((entry) => entry.classification === "needs_semantic_enrichment").length,
        already_staged_count: analyses.filter((entry) => entry.classification === "already_staged").length,
        invalid_skip_count: analyses.filter((entry) => entry.classification === "invalid").length,
        conflict_count: conflicts.length,
        reference_candidate_count: references.length,
        planned_write_count: operations.length
      },
      inventory: analyses.map((entry) => ({
        source_kind: entry.source_kind,
        source_id: entry.source_id,
        fingerprint: entry.fingerprint,
        target_id: entry.target_id,
        classification: entry.classification,
        action: entry.action,
        reason: entry.reason,
        trust: clone(entry.trust)
      })).sort((a, b) => `${a.source_kind}:${a.source_id}`.localeCompare(`${b.source_kind}:${b.source_id}`)),
      reference_map: referenceMap,
      reference_rewrites: references,
      operations,
      rollback_manifest: operations.map((operation) => ({
        operation_id: operation.operation_id,
        target_kind: operation.target_kind,
        target_id: operation.target_id,
        rollback_action: "remove_if_exact_payload_hash_matches",
        payload_hash: operation.payload_hash
      })),
      validation,
      policy: policy()
    });
  }

  function adapterReady(adapter) {
    return Boolean(
      adapter
      && adapter.scope === ADAPTER_SCOPE
      && typeof adapter.get === "function"
      && typeof adapter.put === "function"
      && typeof adapter.remove === "function"
    );
  }

  async function rollbackAppliedJournal(journal, adapter) {
    const reversed = arr(journal).slice().reverse();
    let rolledBack = 0;
    for (const entry of reversed) {
      if (entry.status !== "applied") continue;
      const current = await Promise.resolve(adapter.get(entry.target_kind, entry.target_id));
      if (entry.after_hash && stableHash(current) !== entry.after_hash) {
        return { ok: false, rolled_back_count: rolledBack, conflict: `rollback_current_state_changed:${entry.operation_id}` };
      }
      if (entry.before == null) await Promise.resolve(adapter.remove(entry.target_kind, entry.target_id));
      else await Promise.resolve(adapter.put(entry.target_kind, entry.target_id, clone(entry.before)));
      rolledBack += 1;
    }
    return { ok: true, rolled_back_count: rolledBack, conflict: null };
  }

  async function execute(planInput, adapter, options = {}) {
    const migrationPlan = clone(planInput);
    const mode = options.mode === "apply" ? "apply" : "dry_run";
    if (mode === "dry_run") {
      return clone({
        schema: "aha_knowledge_migration_execution_v2",
        version: MIGRATION_VERSION,
        mode: "dry_run",
        status: migrationPlan?.status === "blocked" ? "blocked" : "previewed",
        migration_id: migrationPlan?.migration_id || null,
        write_count: 0,
        no_op_count: 0,
        planned_write_count: arr(migrationPlan?.operations).length,
        journal: [],
        rollback_token: null,
        policy: policy()
      });
    }

    const preconditionErrors = [];
    if (migrationPlan?.schema !== MIGRATION_SCHEMA || migrationPlan?.version !== MIGRATION_VERSION) preconditionErrors.push("invalid_migration_plan");
    if (migrationPlan?.status === "blocked") preconditionErrors.push("migration_plan_blocked");
    const validation = validatePlan(migrationPlan || {});
    if (!validation.valid) preconditionErrors.push("migration_plan_validation_failed");
    if (options.explicit_authorization !== true) preconditionErrors.push("explicit_staging_authorization_required");
    if (!adapterReady(adapter)) preconditionErrors.push("v2_backfill_staging_adapter_required");
    if (preconditionErrors.length) {
      return clone({
        schema: "aha_knowledge_migration_execution_v2",
        version: MIGRATION_VERSION,
        mode: "apply",
        status: "blocked",
        migration_id: migrationPlan?.migration_id || null,
        blocking_reasons: [...new Set(preconditionErrors)].sort(),
        write_count: 0,
        no_op_count: 0,
        journal: [],
        rollback_token: null,
        policy: policy()
      });
    }

    const journal = [];
    let writeCount = 0;
    let noOpCount = 0;
    try {
      for (const operation of migrationPlan.operations) {
        const before = await Promise.resolve(adapter.get(operation.target_kind, operation.target_id));
        if (before != null) {
          if (stableHash(before) === operation.payload_hash) {
            journal.push({
              operation_id: operation.operation_id,
              target_kind: operation.target_kind,
              target_id: operation.target_id,
              status: "already_applied",
              before: clone(before),
              before_hash: stableHash(before),
              after_hash: operation.payload_hash
            });
            noOpCount += 1;
            continue;
          }
          throw new Error(`staging_target_conflict:${operation.target_kind}:${operation.target_id}`);
        }
        await Promise.resolve(adapter.put(operation.target_kind, operation.target_id, clone(operation.payload)));
        journal.push({
          operation_id: operation.operation_id,
          target_kind: operation.target_kind,
          target_id: operation.target_id,
          status: "applied",
          before: null,
          before_hash: null,
          after_hash: operation.payload_hash
        });
        writeCount += 1;
      }
    } catch (error) {
      const rollbackResult = await rollbackAppliedJournal(journal, adapter);
      return clone({
        schema: "aha_knowledge_migration_execution_v2",
        version: MIGRATION_VERSION,
        mode: "apply",
        status: rollbackResult.ok ? "failed_rolled_back" : "failed_manual_review_required",
        migration_id: migrationPlan.migration_id,
        error: text(error?.message || error),
        write_count: writeCount,
        no_op_count: noOpCount,
        auto_rollback: rollbackResult,
        journal,
        rollback_token: null,
        policy: policy()
      });
    }

    const rollbackToken = `rollback_v2_${stableHash({
      migration_id: migrationPlan.migration_id,
      journal: journal.filter((entry) => entry.status === "applied").map((entry) => ({
        operation_id: entry.operation_id,
        target_kind: entry.target_kind,
        target_id: entry.target_id,
        after_hash: entry.after_hash
      }))
    })}`;
    return clone({
      schema: "aha_knowledge_migration_execution_v2",
      version: MIGRATION_VERSION,
      mode: "apply",
      status: "applied",
      migration_id: migrationPlan.migration_id,
      write_count: writeCount,
      no_op_count: noOpCount,
      journal,
      rollback_token: rollbackToken,
      policy: policy()
    });
  }

  async function rollback(executionInput, adapter, options = {}) {
    const execution = clone(executionInput);
    const blockingReasons = [];
    if (execution?.schema !== "aha_knowledge_migration_execution_v2" || execution?.version !== MIGRATION_VERSION) blockingReasons.push("invalid_migration_execution");
    if (execution?.status !== "applied") blockingReasons.push("only_applied_execution_can_rollback");
    if (!execution?.rollback_token) blockingReasons.push("rollback_token_missing");
    if (options.explicit_authorization !== true) blockingReasons.push("explicit_rollback_authorization_required");
    if (!adapterReady(adapter)) blockingReasons.push("v2_backfill_staging_adapter_required");
    if (blockingReasons.length) {
      return clone({
        schema: "aha_knowledge_migration_rollback_v2",
        version: MIGRATION_VERSION,
        status: "blocked",
        migration_id: execution?.migration_id || null,
        blocking_reasons: [...new Set(blockingReasons)].sort(),
        rolled_back_count: 0,
        no_op_count: 0,
        policy: policy()
      });
    }

    const applied = arr(execution.journal).filter((entry) => entry.status === "applied");
    const expectedToken = `rollback_v2_${stableHash({
      migration_id: execution.migration_id,
      journal: applied.map((entry) => ({
        operation_id: entry.operation_id,
        target_kind: entry.target_kind,
        target_id: entry.target_id,
        after_hash: entry.after_hash
      }))
    })}`;
    if (expectedToken !== execution.rollback_token) {
      return clone({
        schema: "aha_knowledge_migration_rollback_v2",
        version: MIGRATION_VERSION,
        status: "blocked",
        migration_id: execution.migration_id,
        blocking_reasons: ["rollback_token_mismatch"],
        rolled_back_count: 0,
        no_op_count: 0,
        policy: policy()
      });
    }

    const preflight = [];
    let noOpCount = 0;
    for (const entry of applied) {
      const current = await Promise.resolve(adapter.get(entry.target_kind, entry.target_id));
      if (current == null && entry.before == null) {
        preflight.push({ entry, current: null, action: "already_absent" });
        noOpCount += 1;
        continue;
      }
      if (stableHash(current) !== entry.after_hash) {
        return clone({
          schema: "aha_knowledge_migration_rollback_v2",
          version: MIGRATION_VERSION,
          status: "manual_review_required",
          migration_id: execution.migration_id,
          blocking_reasons: [`rollback_current_state_changed:${entry.operation_id}`],
          rolled_back_count: 0,
          no_op_count: 0,
          policy: policy()
        });
      }
      preflight.push({ entry, current, action: entry.before == null ? "remove" : "restore" });
    }

    let rolledBack = 0;
    for (const step of preflight.slice().reverse()) {
      if (step.action === "already_absent") continue;
      if (step.action === "remove") await Promise.resolve(adapter.remove(step.entry.target_kind, step.entry.target_id));
      else await Promise.resolve(adapter.put(step.entry.target_kind, step.entry.target_id, clone(step.entry.before)));
      rolledBack += 1;
    }
    return clone({
      schema: "aha_knowledge_migration_rollback_v2",
      version: MIGRATION_VERSION,
      status: "rollback_complete",
      migration_id: execution.migration_id,
      rolled_back_count: rolledBack,
      no_op_count: noOpCount,
      policy: policy()
    });
  }

  const api = Object.freeze({
    MIGRATION_SCHEMA,
    CANDIDATE_SCHEMA,
    REFERENCE_SCHEMA,
    MIGRATION_VERSION,
    ADAPTER_SCOPE,
    TARGET_KINDS,
    plan,
    validatePlan,
    execute,
    rollback,
    stableHash
  });
  global.AHAKnowledgeMigrationV2 = api;
  global.AHAModuleApi?.register?.("knowledgeMigrationV2", api, {
    version: MIGRATION_VERSION,
    legacyGlobal: "AHAKnowledgeMigrationV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
