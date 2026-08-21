// ahaProjectionRuntimeSourceV2.js
// Explicit read boundary for product previews. Reads existing local knowledge,
// never mutates it, and rebuilds the validated V2 read model on demand.
(function (global) {
  "use strict";

  const MODULE_SCHEMA = "aha_projection_runtime_source_v2";
  const MODULE_VERSION = 2;
  const STORAGE_KEYS = Object.freeze({
    chamber: "aha_insight_chamber_v1",
    activeAnalysis: "aha_chat_auto_outputs_v1",
    lists: "aha_lists_v1",
    paths: "aha_paths_v1"
  });

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function arr(value) { return Array.isArray(value) ? value : []; }

  function read(key, fallback) {
    try {
      const raw = global.localStorage?.getItem?.(key);
      if (raw == null) return clone(fallback);
      const parsed = JSON.parse(raw);
      return parsed == null ? clone(fallback) : parsed;
    } catch {
      return clone(fallback);
    }
  }

  function text(value) { return String(value == null ? "" : value).trim(); }

  function activeIdentity() {
    const cache = read(STORAGE_KEYS.activeAnalysis, null);
    if (!cache || typeof cache !== "object") return null;
    const payload = cache.payload && typeof cache.payload === "object" ? cache.payload : cache;
    const canonical = payload.canonicalAnalysis && typeof payload.canonicalAnalysis === "object" ? payload.canonicalAnalysis : {};
    const identity = {
      analysis_id: text(cache.analysisId || cache.analysisRunId || cache.runId || canonical.analysisId || canonical.analysisRunId || canonical.runId),
      source_hash: text(cache.sourceHash || cache.sourceTextHash || canonical.sourceHash || canonical.sourceTextHash),
      source_id: text(cache.sourceId || payload.sourceId || canonical.sourceId)
    };
    return identity.analysis_id || identity.source_hash || identity.source_id ? identity : null;
  }

  function collectIdentityValues(insight) {
    const values = { analysis_ids: new Set(), source_hashes: new Set(), source_ids: new Set() };
    const sources = [insight, insight?.analysis_trace, insight?.provenance, insight?.activation_v2];
    arr(insight?.analysis_provenance).forEach((entry) => sources.push(entry));
    arr(insight?.candidate_provenance).forEach((entry) => sources.push(entry));
    sources.filter((entry) => entry && typeof entry === "object").forEach((entry) => {
      [entry.analysisId, entry.analysisRunId, entry.runId, entry.analysis_id, entry.analysis_run_id].map(text).filter(Boolean).forEach((value) => values.analysis_ids.add(value));
      [entry.sourceHash, entry.sourceTextHash, entry.normalizedSourceHash, entry.source_hash, entry.source_text_hash].map(text).filter(Boolean).forEach((value) => values.source_hashes.add(value));
      [entry.sourceId, entry.source_id, entry.source_event_id].map(text).filter(Boolean).forEach((value) => values.source_ids.add(value));
    });
    return values;
  }

  function matchesActiveAnalysis(insight, identity) {
    if (!identity) return false;
    const values = collectIdentityValues(insight);
    if (identity.analysis_id && values.analysis_ids.has(identity.analysis_id)) return true;
    if (identity.source_hash && values.source_hashes.has(identity.source_hash)) return true;
    if (identity.source_id && values.source_ids.has(identity.source_id)) return true;
    return false;
  }

  function snapshot() {
    const chamber = read(STORAGE_KEYS.chamber, { insights: [] });
    const identity = activeIdentity();
    return clone({
      active_analysis: identity,
      legacy_insights: arr(chamber?.insights).filter((insight) => matchesActiveAnalysis(insight, identity)),
      legacy_lists: arr(read(STORAGE_KEYS.lists, [])),
      legacy_paths: arr(read(STORAGE_KEYS.paths, [])),
      legacy_mindmaps: []
    });
  }

  function build() {
    const builder = global.AHAProjectionProductReadModelV2;
    if (!builder?.build) {
      return {
        schema: "aha_projection_product_read_model_v2",
        version: 2,
        mode: "read_only",
        status: "blocked",
        blocking_reasons: ["projection_product_read_model_v2_unavailable"],
        surfaces: { insights: [], concepts: [], lists: [], paths: [], mindmap: { nodes: [], edges: [], read_only: true } },
        validation: { valid: false, errors: ["runtime_source_dependency_unavailable"] },
        policy: { persistent_write: false, remote_write: false }
      };
    }
    const input = snapshot();
    if (!input.active_analysis) return blocked("active_analysis_unavailable");
    if (!input.legacy_insights.length) return blocked("active_analysis_has_no_projection_ready_insights");
    const model = builder.build(input);
    if (model?.status === "ready" || model?.status === "ready_with_exclusions") {
      model.active_analysis = clone(input.active_analysis);
    }
    return model;
  }

  function blocked(reason) {
    return {
      schema: "aha_projection_product_read_model_v2",
      version: 2,
      mode: "read_only",
      status: "blocked",
      blocking_reasons: [reason],
      surfaces: { insights: [], concepts: [], lists: [], paths: [], mindmap: { nodes: [], edges: [], read_only: true } },
      validation: { valid: false, errors: [reason] },
      policy: { persistent_write: false, remote_write: false }
    };
  }

  function surface(name) {
    const model = build();
    if (model.status !== "ready" || model.validation?.valid !== true) return null;
    return clone(model.surfaces?.[name] ?? null);
  }

  const api = Object.freeze({ MODULE_SCHEMA, MODULE_VERSION, STORAGE_KEYS, activeIdentity, matchesActiveAnalysis, snapshot, build, surface });
  global.AHAProjectionRuntimeSourceV2 = api;
  global.AHAModuleApi?.register?.("projectionRuntimeSourceV2", api, {
    version: MODULE_VERSION,
    legacyGlobal: "AHAProjectionRuntimeSourceV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
