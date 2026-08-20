// ahaProjectionArtifactQualityV2.js
// Product-level quality gates for V2 lists, paths and semantic mindmaps.
(function (global) {
  "use strict";

  const QUALITY_SCHEMA = "aha_projection_artifact_quality_v2";
  const QUALITY_VERSION = 2;

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function text(value) { return String(value == null ? "" : value).trim(); }
  function round(value) { return Number(Math.max(0, Math.min(1, Number(value) || 0)).toFixed(6)); }
  function unique(values) { return [...new Set(arr(values).filter(Boolean))]; }

  function evaluateList(list, context = {}) {
    const items = arr(list?.items);
    const refs = items.map((item) => text(item?.refId)).filter(Boolean);
    const insightById = new Map(arr(context.insights).map((insight) => [insight.id, insight]));
    const provenanceReady = refs.filter((id) => {
      const insight = insightById.get(id);
      return arr(insight?.provenance?.evidence).length > 0 || arr(insight?.provenance?.source_refs).length > 0;
    }).length;
    const basis = text(list?.meta?.semantic_basis);
    const reasons = [];
    if (items.length < 2) reasons.push("list_too_short");
    if (unique(refs).length !== refs.length) reasons.push("list_duplicate_reference");
    if (!basis) reasons.push("list_semantic_basis_missing");
    if (basis === "fallback_core") reasons.push("list_only_has_fallback_basis");
    if (refs.length && provenanceReady / refs.length < 0.75) reasons.push("list_provenance_coverage_low");
    const score = round(
      Math.min(1, items.length / 3) * 0.25
      + (basis && basis !== "fallback_core" ? 0.35 : 0)
      + (refs.length && unique(refs).length === refs.length ? 0.15 : 0)
      + (refs.length ? provenanceReady / refs.length : 0) * 0.25
    );
    return clone({ schema: QUALITY_SCHEMA, artifact_type: "list", artifact_id: list?.id || null, score, passed: reasons.length === 0 && score >= 0.7, reasons });
  }

  function evaluatePath(path, context = {}) {
    const steps = arr(path?.steps).slice().sort((a, b) => Number(a.order) - Number(b.order));
    const refs = steps.map((step) => text(step?.refId)).filter(Boolean);
    const stages = steps.map((step) => text(step?.meta?.stage)).filter(Boolean);
    const narratives = steps.filter((step) => text(step?.narrative).length >= 40).length;
    const outcomes = steps.filter((step) => text(step?.learningOutcome).length >= 20).length;
    const reasons = [];
    if (steps.length < 3) reasons.push("path_too_short_for_progression");
    if (unique(refs).length !== refs.length) reasons.push("path_duplicate_reference");
    if (steps.length && narratives !== steps.length) reasons.push("path_transition_missing");
    if (steps.length && outcomes !== steps.length) reasons.push("path_learning_outcome_missing");
    if (!stages.includes("orientation") || !stages.includes("synthesis")) reasons.push("path_progression_roles_missing");
    const score = round(
      Math.min(1, steps.length / 4) * 0.2
      + (steps.length ? narratives / steps.length : 0) * 0.25
      + (steps.length ? outcomes / steps.length : 0) * 0.2
      + (stages.includes("orientation") ? 0.15 : 0)
      + (stages.includes("synthesis") ? 0.2 : 0)
    );
    return clone({ schema: QUALITY_SCHEMA, artifact_type: "path", artifact_id: path?.id || null, score, passed: reasons.length === 0 && score >= 0.75, reasons });
  }

  function evaluateMindmap(mindmap) {
    const nodes = arr(mindmap?.nodes);
    const edges = arr(mindmap?.edges);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const roots = nodes.filter((node) => node.type === "theme" && node.meta?.root === true);
    const branches = edges.filter((edge) => edge.type === "theme_branch");
    const unresolved = edges.filter((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to));
    const invalidResonance = edges.filter((edge) => edge.type === "resonates_with" && edge.meta?.dedupe_eligible !== false);
    const reasons = [];
    if (nodes.length < 4) reasons.push("mindmap_too_small");
    if (roots.length !== 1) reasons.push("mindmap_root_invalid");
    if (branches.length < 2) reasons.push("mindmap_has_too_few_branches");
    if (branches.length > 12) reasons.push("mindmap_has_too_many_branches");
    if (unresolved.length) reasons.push("mindmap_unresolved_edge");
    if (invalidResonance.length) reasons.push("mindmap_resonance_semantics_invalid");
    const score = round(
      (nodes.length >= 4 ? 0.2 : 0)
      + (roots.length === 1 ? 0.25 : 0)
      + (branches.length >= 2 && branches.length <= 12 ? 0.25 : 0)
      + (!unresolved.length ? 0.15 : 0)
      + (!invalidResonance.length ? 0.15 : 0)
    );
    return clone({ schema: QUALITY_SCHEMA, artifact_type: "mindmap", artifact_id: mindmap?.meta?.projection_id || null, score, passed: reasons.length === 0 && score >= 0.8, reasons });
  }

  function evaluate(modelOrProjection = {}) {
    const surfaces = modelOrProjection.surfaces || modelOrProjection.projections || {};
    const context = { insights: arr(surfaces.insights), concepts: arr(surfaces.concepts) };
    return clone({
      schema: QUALITY_SCHEMA,
      version: QUALITY_VERSION,
      projection_id: modelOrProjection.projection_id || null,
      lists: arr(surfaces.lists).map((list) => evaluateList(list, context)),
      paths: arr(surfaces.paths).map((path) => evaluatePath(path, context)),
      mindmap: evaluateMindmap(surfaces.mindmap || {}),
      policy: { persistent_write: false, remote_write: false, automatic_acceptance: false }
    });
  }

  function filterReadModel(model) {
    if (model?.status !== "ready" || model?.validation?.valid !== true) return clone(model);
    const next = clone(model);
    const quality = evaluate(next);
    const passedLists = new Set(quality.lists.filter((entry) => entry.passed).map((entry) => entry.artifact_id));
    const passedPaths = new Set(quality.paths.filter((entry) => entry.passed).map((entry) => entry.artifact_id));
    next.surfaces.lists = arr(next.surfaces.lists).filter((item) => passedLists.has(item.id)).map((item) => ({ ...item, quality: quality.lists.find((entry) => entry.artifact_id === item.id) }));
    next.surfaces.paths = arr(next.surfaces.paths).filter((item) => passedPaths.has(item.id)).map((item) => ({ ...item, quality: quality.paths.find((entry) => entry.artifact_id === item.id) }));
    next.surfaces.mindmap = quality.mindmap.passed
      ? { ...next.surfaces.mindmap, quality: quality.mindmap }
      : { nodes: [], edges: [], read_only: true, quality: quality.mindmap, meta: { projection_id: next.projection_id, candidate_only: true } };
    next.artifact_quality = quality;
    return clone(next);
  }

  const api = Object.freeze({ QUALITY_SCHEMA, QUALITY_VERSION, evaluateList, evaluatePath, evaluateMindmap, evaluate, filterReadModel });
  global.AHAProjectionArtifactQualityV2 = api;
  global.AHAModuleApi?.register?.("projectionArtifactQualityV2", api, {
    version: QUALITY_VERSION,
    legacyGlobal: "AHAProjectionArtifactQualityV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
