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

  function blocked(reason, detail) {
    return { ok: false, reason, detail: detail || null, policy: POLICY };
  }

  function validateModel(model) {
    const errors = [];
    if (model?.schema !== "aha_projection_product_read_model_v2") errors.push("read_model_schema_invalid");
    if (model?.mode !== "read_only") errors.push("read_model_mode_invalid");
    if (model?.status !== "ready" || model?.validation?.valid !== true) errors.push("read_model_not_ready");
    if (!text(model?.projection_id)) errors.push("projection_id_missing");
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
    if (artifactType === "list") return arr(candidate.items).length >= 2;
    if (artifactType === "path") return arr(candidate.steps).length >= 3;
    if (artifactType === "mindmap") return arr(candidate.nodes).length >= 3 && arr(candidate.edges).length >= 2;
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

  function baseMeta(model, artifactId, materializedAt) {
    return {
      createdBy: CREATED_BY,
      projection_id: model.projection_id,
      projection_artifact_id: artifactId,
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
        addedAt: materializedAt,
        meta: inlineSnapshot(item, model, candidate.id)
      })).filter((item) => item.refId),
      source: "aha_lists",
      local_only: true,
      published_external: false,
      echonet_shared: false,
      sync_enabled: false,
      meta: baseMeta(model, candidate.id, materializedAt),
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
        id: `path_step_projection_${stableHash(`${candidate.id}:${step?.refId || step?.id || index}`)}`,
        title: text(step?.title) || `Steg ${index + 1}`,
        type: text(step?.type) || "insight",
        source: "aha_projection_v2",
        refId: text(step?.refId || step?.id),
        order: Number.isFinite(Number(step?.order)) ? Number(step.order) : index,
        status: "planned",
        narrative: text(step?.narrative),
        learningOutcome: text(step?.learningOutcome),
        addedAt: materializedAt,
        meta: { ...inlineSnapshot(step, model, candidate.id), stage: text(step?.meta?.stage) }
      })).filter((step) => step.refId),
      source: "aha_paths",
      local_only: true,
      published_external: false,
      echonet_shared: false,
      sync_enabled: false,
      meta: baseMeta(model, candidate.id, materializedAt),
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
        definition: node.type === "concept" ? "Semantisk begrep" : (node.type === "theme" ? "Hovedidé" : "Kvalitetsgodkjent innsikt"),
        relation: text(node.type) || "related_to"
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
          explanation: edge.type === "resonates_with" ? "Semantisk resonans; ikke ekvivalens eller deduplisering." : "Relasjon fra AHA V2-projeksjonen."
        };
      }).filter(Boolean),
      references: [],
      createdAt: materializedAt,
      updatedAt: materializedAt,
      source: "aha_concept_lists",
      local_only: true,
      meta: { ...baseMeta(model, artifactId, materializedAt), graph_snapshot: clone(candidate) },
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
      record_fingerprint: stableHash(JSON.stringify(record)),
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
      || stableHash(JSON.stringify(current)) !== receipt.record_fingerprint) {
      return blocked("artifact_modified_since_materialization");
    }
    const next = store.records.slice();
    if (receipt.prior_record) next[index] = clone(receipt.prior_record);
    else next.splice(index, 1);
    storage.setItem(receipt.store_key, JSON.stringify(next));
    return { ok: true, undone: true, record_id: receipt.record_id, policy: POLICY };
  }

  const api = Object.freeze({ MODULE_SCHEMA, MODULE_VERSION, POLICY, STORES, validateModel, materialize, undo });
  global.AHAProjectionMaterializerV2 = api;
  global.AHAModuleApi?.register?.("projectionMaterializerV2", api, {
    version: MODULE_VERSION,
    legacyGlobal: "AHAProjectionMaterializerV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
