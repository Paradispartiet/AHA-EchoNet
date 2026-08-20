// ahaProjectionRuntimeSourceV2.js
// Explicit read boundary for product previews. Reads existing local knowledge,
// never mutates it, and rebuilds the validated V2 read model on demand.
(function (global) {
  "use strict";

  const MODULE_SCHEMA = "aha_projection_runtime_source_v2";
  const MODULE_VERSION = 2;
  const STORAGE_KEYS = Object.freeze({
    chamber: "aha_insight_chamber_v1",
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

  function snapshot() {
    const chamber = read(STORAGE_KEYS.chamber, { insights: [] });
    return clone({
      legacy_insights: arr(chamber?.insights),
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
    return builder.build(snapshot());
  }

  function surface(name) {
    const model = build();
    if (model.status !== "ready" || model.validation?.valid !== true) return null;
    return clone(model.surfaces?.[name] ?? null);
  }

  const api = Object.freeze({ MODULE_SCHEMA, MODULE_VERSION, STORAGE_KEYS, snapshot, build, surface });
  global.AHAProjectionRuntimeSourceV2 = api;
  global.AHAModuleApi?.register?.("projectionRuntimeSourceV2", api, {
    version: MODULE_VERSION,
    legacyGlobal: "AHAProjectionRuntimeSourceV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
