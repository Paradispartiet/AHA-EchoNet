// Explicit local materialization boundary for quality-gated V2 product previews.
// One call may write one artifact. It never calls repositories, sync or remote APIs.
(function (global) {
  "use strict";

  const MODULE_SCHEMA = "aha_projection_materializer_v2";
  const MODULE_VERSION = 2;
  const CREATED_BY = MODULE_SCHEMA;
  const STORES = Object.freeze({
    list: "aha_lists_v1",
    path: "aha_paths_v1",
    mindmap: "aha_concept_lists_v1"
  });
  const REQUIRED_CLOSED_READ_POLICY = Object.freeze([
    "product_surface_binding_authority",
    "product_store_write_authority",
    "automatic_projection_authority",
    "chamber_write",
    "canonical_write",
    "insights_write",
    "concepts_write",
    "lists_write",
    "paths_write",
    "mindmap_write",
    "meta_write",
    "persistent_write",
    "remote_write",
    "normal_chat_persistence_authority"
  ]);
  const POLICY = Object.freeze({
    explicit_user_action_required: true,
    one_artifact_per_call: true,
    local_write: true,
    automatic_write: false,
    remote_write: false,
    sync_write: false,
    chamber_write: false,
    meta_write: false
  });

  function arr(value) { return Array.isArray(value) ? value : []; }
  function text(value) { return String(value == null ? "" : value).trim(); }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function now() { return new Date().toISOString(); }

  function stableHash(value) {
    const input = text(value).toLocaleLowerCase("no");
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function recordFingerprint(record) {
    const comparable = clone(record);
    if (comparable?.meta) delete comparable.meta.materialization_rollback;
    return stableHash(JSON.stringify(comparable));
  }

  function blocked(reason, detail) {
    return { ok: false, reason, detail: detail || null, policy: POLICY };
  }

  function validateModel(model) {
    const errors = [];
    if (model?.schema !== "aha_projection_product_read_model_v2") errors.push("read_model_schema_invalid");
    if (model?.mode !== "read_only") errors.push("read_model_mode_invalid");
    if (model?.status !== "ready" || model?.validation?.valid !== true) errors.push("read_model_not_ready");
    if (!text(model?.projection_id)) errors.push("projection_id_missing");
    for (const key of ["analysis_id", "analysis_run_id", "source_id"]) {
      if (!text(model?.identity?.[key])) errors.push(`identity_missing:${key}`);
    }
    if (!/^[a-f0-9]{64}$/u.test(text(model?.identity?.source_sha256).toLowerCase())) errors.push("identity_source_sha256_invalid");
    if (!model?.surfaces || typeof model.surfaces !== "object") errors.push("surfaces_missing");
    for (const key of REQUIRED_CLOSED_READ_POLICY) {
      if (model?.policy?.[key] !== false) errors.push(`read_model_policy_not_closed:${key}`);
    }
    return { valid: errors.length === 0, errors: [...new Set(errors)].sort() };
  }

  function candidateFor(model, artifactType, artifactId) {
    if (artifactType === "list") return arr(model?.surfaces?.lists).find((item) => item.id === artifactId) || null;
    if (artifactType === "path") return arr(model?.surfaces?.paths).find((item) => item.id === artifactId) || null;
    if (artifactType === "mindmap") {
      const candidate = model?.surfaces?.mindmap;
      if (!["mindmap", model?.projection_id].includes(artifactId)) return null;
      return candidate && typeof candidate === "object" ? candidate : null;
    }
    return null;
  }

  function candidateQualityPassed(candidate, artifactType) {
    if (!candidate || candidate?.quality?.passed !== true) return false;
    if (artifactType === "list") {
      const items = arr(candidate.items);
      const manifest = arr(candidate?.meta?.member_ref_ids).map(text).filter(Boolean).sort().join("|");
      const refs = items.map((item) => text(item?.refId)).filter(Boolean).sort().join("|");
      return candidate?.meta?.semantic_shape === "thematic_membership_v2"
        && items.length >= 2
        && manifest === refs
        && items.every((item) => text(item?.membership_reason).length >= 40 && text(item?.membership_reason) === text(item?.meta?.membership_reason));
    }
    if (artifactType === "path") {
      const steps = arr(candidate.steps);
      return candidate?.meta?.semantic_shape === "ordered_inquiry_v2"
        && candidate?.meta?.stage_selection === "semantic_role_ranked_not_round_robin"
        && steps.length === 5
        && steps.every((step) => text(step?.meta?.semantic_role) === text(step?.meta?.stage) && text(step?.meta?.selection_reason));
    }
    if (artifactType === "mindmap") return candidate?.meta?.semantic_shape === "ranked_hierarchy_v2"
      && candidate?.meta?.branch_assignment === "one_primary_hierarchy_parent_per_insight"
      && arr(candidate.nodes).length >= 3 && arr(candidate.edges).length >= 2;
    return false;
  }

  function candidateBelongsToModel(candidate, artifactType, model) {
    if (candidate?.meta?.projection_id !== model?.projection_id) return false;
    if (["list", "path"].includes(artifactType) && candidate?.source !== "aha_semantic_v2") return false;
    const readOnly = artifactType === "mindmap" ? candidate?.read_only === true : candidate?.meta?.read_only === true;
    if (candidate?.meta?.candidate_only !== true || !readOnly) return false;
    return true;
  }

  function inlineSnapshot(item, model, artifactId) {
    return {
      inline: true,
      immutable: true,
      projection_id: model.projection_id,
      projection_artifact_id: artifactId,
      analysis_id: text(model?.identity?.analysis_id),
      analysis_run_id: text(model?.identity?.analysis_run_id),
      source_id: text(model?.identity?.source_id),
      source_sha256: text(model?.identity?.source_sha256).toLowerCase(),
      snapshot: {
        id: text(item?.refId || item?.id),
        title: text(item?.title) || "V2-innsikt",
        type: text(item?.type) || "insight",
        source: "aha_semantic_v2",
        member_ids: arr(item?.meta?.member_ids),
        quality_score: Number.isFinite(Number(item?.meta?.quality_score)) ? Number(item.meta.quality_score) : null
      }
    };
  }

  function baseMeta(model, artifactId, materializedAt, candidateMeta = {}) {
    return {
      createdBy: CREATED_BY,
      projection_id: model.projection_id,
      projection_artifact_id: artifactId,
      analysis_id: text(model?.identity?.analysis_id),
      analysis_run_id: text(model?.identity?.analysis_run_id),
      source_id: text(model?.identity?.source_id),
      source_sha256: text(model?.identity?.source_sha256).toLowerCase(),
      semantic_shape: text(candidateMeta?.semantic_shape),
      materializedAt,
      local_only: true,
      published_external: false,
      echonet_shared: false,
      sync_enabled: false,
      automation_enabled: false
    };
  }

  function listRecord(model, candidate, materializedAt) {
    return {
      id: `list_projection_${stableHash(`${model.projection_id}:${candidate.id}`)}`,
      title: text(candidate.title) || "V2-liste",
      type: text(candidate.type) || "concepts",
      description: text(candidate.description),
      status: "materialized_v2",
      createdAt: materializedAt,
      updatedAt: materializedAt,
      tags: [...new Set([...arr(candidate.tags), "AHA V2"])],
      items: arr(candidate.items).map((item, index) => ({
        id: `list_item_projection_${stableHash(`${candidate.id}:${item?.refId || item?.id || index}`)}`,
        title: text(item?.title) || `V2-innsikt ${index + 1}`,
        type: text(item?.type) || "insight",
        source: "aha_projection_v2",
        refId: text(item?.refId || item?.id),
        membership_reason: text(item?.membership_reason),
        addedAt: materializedAt,
        meta: {
          ...inlineSnapshot(item, model, candidate.id),
          membership_reason: text(item?.membership_reason),
          semantic_basis: text(item?.meta?.semantic_basis),
          semantic_basis_label: text(item?.meta?.semantic_basis_label)
        }
      })).filter((item) => item.refId),
      source: "aha_lists",
      local_only: true,
      published_external: false,
      echonet_shared: false,
      sync_enabled: false,
      meta: {
        ...baseMeta(model, candidate.id, materializedAt, candidate.meta),
        semantic_basis: text(candidate?.meta?.semantic_basis),
        semantic_basis_label: text(candidate?.meta?.semantic_basis_label),
        membership_rule: text(candidate?.meta?.membership_rule),
        member_ref_ids: arr(candidate?.meta?.member_ref_ids).map(text).filter(Boolean)
      },
      deletedAt: ""
    };
  }

  function pathRecord(model, candidate, materializedAt) {
    return {
      id: `path_projection_${stableHash(`${model.projection_id}:${candidate.id}`)}`,
      title: text(candidate.title) || "V2-læringssti",
      type: text(candidate.type) || "learning",
      mode: text(candidate.mode) || "learning",
      status: "materialized_v2",
      description: text(candidate.description),
      goal: text(candidate.goal),
      learningOutcome: text(candidate.learningOutcome),
      category: "learning",
      createdAt: materializedAt,
      updatedAt: materializedAt,
      tags: [...new Set([...arr(candidate.tags), "AHA V2"])],
      steps: arr(candidate.steps).map((step, index) => ({
        id: `path_step_projection_${stableHash(`${candidate.id}:${step?.id || step?.refId || index}:${index}`)}`,
        title: text(step?.title) || `Steg ${index + 1}`,
        type: text(step?.type) || "insight",
        source: "aha_projection_v2",
        refId: text(step?.refId || step?.id),
        order: Number.isFinite(Number(step?.order)) ? Number(step.order) : index,
        status: "planned",
        narrative: text(step?.narrative),
        learningOutcome: text(step?.learningOutcome),
        addedAt: materializedAt,
        meta: {
          ...inlineSnapshot(step, model, candidate.id),
          stage: text(step?.meta?.stage),
          semantic_role: text(step?.meta?.semantic_role),
          semantic_basis: text(step?.meta?.semantic_basis),
          selection_reason: text(step?.meta?.selection_reason),
          source_bound_narrative: step?.meta?.source_bound_narrative === true
        }
      })).filter((step) => step.refId),
      source: "aha_paths",
      local_only: true,
      published_external: false,
      echonet_shared: false,
      sync_enabled: false,
      meta: {
        ...baseMeta(model, candidate.id, materializedAt, candidate.meta),
        source_list_candidate_id: text(candidate?.meta?.source_list_candidate_id),
        stage_selection: text(candidate?.meta?.stage_selection)
      },
      deletedAt: ""
    };
  }

  function mindmapRecord(model, candidate, materializedAt) {
    const nodes = arr(candidate.nodes);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const artifactId = model.projection_id;
    return {
      id: `concept_list_projection_${stableHash(`${model.projection_id}:mindmap`)}`,
      title: text(nodeById.get(candidate?.meta?.root_id)?.title) || "V2 semantisk tankekart",
      description: "Lokalt materialisert begrepsgraf fra en kvalitetsgodkjent AHA V2-projeksjon.",
      terms: nodes.map((node, index) => ({
        id: `concept_term_projection_${stableHash(`${artifactId}:${node.id}`)}`,
        term: text(node.title) || `Node ${index + 1}`,
        definition: node.type === "concept" ? text(node?.meta?.branch_reason) || "Semantisk begrep" : (node.type === "theme" ? text(node?.meta?.central_idea) || "Hovedidé" : "Kvalitetsgodkjent innsikt"),
        relation: text(node.type) || "related_to",
        meta: {
          source_node_id: text(node.id),
          node_type: text(node.type),
          branch_reason: text(node?.meta?.branch_reason),
          primary_branch_id: text(node?.meta?.primary_branch_id),
          hierarchy_level: Number.isFinite(Number(node?.meta?.hierarchy_level)) ? Number(node.meta.hierarchy_level) : null
        }
      })),
      relations: arr(candidate.edges).map((edge, index) => {
        const from = nodeById.get(edge.from);
        const to = nodeById.get(edge.to);
        if (!from || !to) return null;
        return {
          id: `concept_relation_projection_${stableHash(`${artifactId}:${edge.id || index}`)}`,
          from: text(from.title),
          to: text(to.title),
          type: text(edge.type) || "related_to",
          label: text(edge.label || edge.type) || "relatert til",
          explanation: edge.type === "resonates_with" ? "Semantisk resonans; ikke ekvivalens eller deduplisering." : text(edge?.meta?.branch_reason) || "Relasjon fra AHA V2-projeksjonen.",
          meta: {
            source_edge_id: text(edge.id),
            semantic_basis: text(edge?.meta?.semantic_basis),
            hierarchy: edge?.meta?.hierarchy === true,
            dedupe_eligible: edge?.meta?.dedupe_eligible === false ? false : null
          }
        };
      }).filter(Boolean),
      references: [],
      createdAt: materializedAt,
      updatedAt: materializedAt,
      source: "aha_concept_lists",
      local_only: true,
      meta: {
        ...baseMeta(model, artifactId, materializedAt, candidate.meta),
        root_id: text(candidate?.meta?.root_id),
        branch_assignment: text(candidate?.meta?.branch_assignment),
        branch_count: Number(candidate?.meta?.branch_count) || 0,
        graph_snapshot: clone(candidate)
      },
      deletedAt: ""
    };
  }

  function readStore(storage, key) {
    const raw = storage?.getItem?.(key);
    if (raw === null || raw === undefined || raw === "") return { ok: true, records: [] };
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? { ok: true, records: parsed } : blocked("store_shape_invalid", key);
    } catch {
      return blocked("store_json_invalid", key);
    }
  }

  function materialize(options = {}) {
    if (options.user_confirmed !== true) return blocked("explicit_user_confirmation_required");
    const artifactType = text(options.artifact_type);
    const artifactId = text(options.artifact_id);
    if (!Object.prototype.hasOwnProperty.call(STORES, artifactType)) return blocked("artifact_type_invalid");
    if (!artifactId) return blocked("artifact_id_missing");
    const validation = validateModel(options.model);
    if (!validation.valid) return blocked("read_model_invalid", validation.errors);
    const candidate = candidateFor(options.model, artifactType, artifactId);
    if (!candidate) return blocked("artifact_not_found");
    if (!candidateBelongsToModel(candidate, artifactType, options.model)) return blocked("artifact_provenance_invalid");
    if (!candidateQualityPassed(candidate, artifactType)) return blocked("artifact_quality_failed");

    const storage = options.storage || global.localStorage;
    if (!storage?.getItem || !storage?.setItem) return blocked("local_storage_unavailable");
    const storeKey = STORES[artifactType];
    const store = readStore(storage, storeKey);
    if (!store.ok) return store;
    const existing = store.records.find((record) => !record?.deletedAt
      && record?.meta?.createdBy === CREATED_BY
      && record?.meta?.projection_id === options.model.projection_id
      && record?.meta?.projection_artifact_id === artifactId);
    if (existing) return { ok: true, existing: true, artifact: clone(existing), receipt: null, policy: POLICY };

    const materializedAt = now();
    const builder = { list: listRecord, path: pathRecord, mindmap: mindmapRecord }[artifactType];
    const record = builder(options.model, candidate, materializedAt);
    const priorIndex = store.records.findIndex((item) => item?.id === record.id);
    const priorRecord = priorIndex >= 0 ? clone(store.records[priorIndex]) : null;
    record.meta.materialization_rollback = {
      schema: "aha_projection_materialization_rollback_v2",
      artifact_type: artifactType,
      artifact_id: artifactId,
      projection_id: options.model.projection_id,
      store_key: storeKey,
      materialized_at: materializedAt,
      original_fingerprint: recordFingerprint(record),
      prior_record: priorRecord
    };
    const next = store.records.slice();
    if (priorIndex >= 0) next[priorIndex] = record;
    else next.unshift(record);
    storage.setItem(storeKey, JSON.stringify(next));
    const receipt = {
      schema: "aha_projection_materialization_receipt_v2",
      artifact_type: artifactType,
      artifact_id: artifactId,
      projection_id: options.model.projection_id,
      store_key: storeKey,
      record_id: record.id,
      materialized_at: materializedAt,
      record_fingerprint: recordFingerprint(record),
      prior_record: priorRecord
    };
    return { ok: true, existing: false, artifact: clone(record), receipt, policy: POLICY };
  }

  function undo(receipt, options = {}) {
    if (options.user_confirmed !== true) return blocked("explicit_user_confirmation_required");
    if (receipt?.schema !== "aha_projection_materialization_receipt_v2") return blocked("receipt_invalid");
    if (STORES[receipt.artifact_type] !== receipt.store_key) return blocked("receipt_store_invalid");
    const storage = options.storage || global.localStorage;
    const store = readStore(storage, receipt.store_key);
    if (!store.ok) return store;
    const index = store.records.findIndex((record) => record?.id === receipt.record_id);
    if (index < 0) return { ok: true, existing: false, undone: true, policy: POLICY };
    const current = store.records[index];
    if (current?.meta?.createdBy !== CREATED_BY
      || current?.meta?.projection_id !== receipt.projection_id
      || current?.meta?.projection_artifact_id !== receipt.artifact_id
      || recordFingerprint(current) !== receipt.record_fingerprint) {
      return blocked("artifact_modified_since_materialization");
    }
    const next = store.records.slice();
    if (receipt.prior_record) next[index] = clone(receipt.prior_record);
    else next.splice(index, 1);
    storage.setItem(receipt.store_key, JSON.stringify(next));
    return { ok: true, undone: true, record_id: receipt.record_id, policy: POLICY };
  }

  function materializedMatch(record, options) {
    return !record?.deletedAt
      && record?.meta?.createdBy === CREATED_BY
      && record?.meta?.projection_id === text(options.projection_id)
      && record?.meta?.projection_artifact_id === text(options.artifact_id);
  }

  function getMaterializationState(options = {}) {
    const artifactType = text(options.artifact_type);
    const storeKey = STORES[artifactType];
    if (!storeKey) return { state: "invalid", materialized: false, undo_available: false, reason: "artifact_type_invalid" };
    const store = readStore(options.storage || global.localStorage, storeKey);
    if (!store.ok) return { state: "invalid", materialized: false, undo_available: false, reason: store.reason };
    const record = store.records.find((item) => materializedMatch(item, options));
    if (!record) return { state: "absent", materialized: false, undo_available: false, record_id: null };
    const rollback = record?.meta?.materialization_rollback;
    const undoAvailable = rollback?.schema === "aha_projection_materialization_rollback_v2"
      && rollback.store_key === storeKey
      && rollback.artifact_type === artifactType
      && rollback.artifact_id === text(options.artifact_id)
      && rollback.projection_id === text(options.projection_id)
      && rollback.original_fingerprint === recordFingerprint(record);
    return {
      state: undoAvailable ? "unchanged" : "modified",
      materialized: true,
      undo_available: undoAvailable,
      record_id: text(record.id) || null
    };
  }

  function canUndoMaterialized(options = {}) {
    return getMaterializationState(options).undo_available === true;
  }

  function undoMaterialized(options = {}) {
    if (options.user_confirmed !== true) return blocked("explicit_user_confirmation_required");
    const artifactType = text(options.artifact_type);
    const storeKey = STORES[artifactType];
    if (!storeKey) return blocked("artifact_type_invalid");
    const storage = options.storage || global.localStorage;
    const store = readStore(storage, storeKey);
    if (!store.ok) return store;
    const index = store.records.findIndex((item) => materializedMatch(item, options));
    if (index < 0) return { ok: true, existing: false, undone: true, policy: POLICY };
    const current = store.records[index];
    const rollback = current?.meta?.materialization_rollback;
    if (rollback?.schema !== "aha_projection_materialization_rollback_v2"
      || rollback.store_key !== storeKey
      || rollback.artifact_type !== artifactType
      || rollback.artifact_id !== text(options.artifact_id)
      || rollback.projection_id !== text(options.projection_id)
      || rollback.original_fingerprint !== recordFingerprint(current)) {
      return blocked("artifact_modified_since_materialization");
    }
    const next = store.records.slice();
    if (rollback.prior_record) next[index] = clone(rollback.prior_record);
    else next.splice(index, 1);
    storage.setItem(storeKey, JSON.stringify(next));
    return { ok: true, undone: true, record_id: current.id, policy: POLICY };
  }

  const api = Object.freeze({ MODULE_SCHEMA, MODULE_VERSION, POLICY, STORES, validateModel, materialize, undo, getMaterializationState, canUndoMaterialized, undoMaterialized });
  global.AHAProjectionMaterializerV2 = api;
  global.AHAModuleApi?.register?.("projectionMaterializerV2", api, {
    version: MODULE_VERSION,
    legacyGlobal: "AHAProjectionMaterializerV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
