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
  function normalize(value) {
    return text(value).toLocaleLowerCase("no").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
  }
  function overlap(left, right) {
    const a = new Set(arr(left).map(normalize).filter(Boolean));
    const b = new Set(arr(right).map(normalize).filter(Boolean));
    if (!a.size || !b.size) return 0;
    return [...a].filter((value) => b.has(value)).length / Math.min(a.size, b.size);
  }

  function evaluateList(list, context = {}) {
    const items = arr(list?.items);
    const refs = items.map((item) => text(item?.refId)).filter(Boolean);
    const insightById = new Map(arr(context.insights).map((insight) => [insight.id, insight]));
    const provenanceReady = refs.filter((id) => {
      const insight = insightById.get(id);
      return arr(insight?.provenance?.evidence).length > 0 || arr(insight?.provenance?.source_refs).length > 0;
    }).length;
    const basis = text(list?.meta?.semantic_basis);
    const basisLabel = normalize(list?.meta?.semantic_basis_label);
    const justified = items.filter((item) => {
      if (basis === "resonance") return list?.meta?.dedupe_eligible === false && items.length === 2;
      return arr(item?.meta?.concept_keys).map(normalize).includes(basisLabel);
    }).length;
    const redundantPairs = [];
    for (let left = 0; left < items.length; left += 1) for (let right = left + 1; right < items.length; right += 1) {
      const sameTitle = normalize(items[left]?.title) === normalize(items[right]?.title);
      const conceptOverlap = overlap(items[left]?.meta?.concept_keys, items[right]?.meta?.concept_keys);
      if (sameTitle || conceptOverlap === 1 && arr(items[left]?.meta?.concept_keys).length >= 3) redundantPairs.push([left, right]);
    }
    const reasons = [];
    if (items.length < 2) reasons.push("list_too_short");
    if (unique(refs).length !== refs.length) reasons.push("list_duplicate_reference");
    if (!basis) reasons.push("list_semantic_basis_missing");
    if (basis === "fallback_core") reasons.push("list_only_has_fallback_basis");
    if (items.length && justified !== items.length) reasons.push("list_membership_not_semantically_justified");
    if (redundantPairs.length) reasons.push("list_semantic_redundancy_high");
    if (refs.length && provenanceReady / refs.length < 0.75) reasons.push("list_provenance_coverage_low");
    const score = round(
      Math.min(1, items.length / 3) * 0.25
      + (basis && basis !== "fallback_core" ? 0.2 : 0)
      + (items.length ? justified / items.length : 0) * 0.2
      + (!redundantPairs.length ? 0.1 : 0)
      + (refs.length && unique(refs).length === refs.length ? 0.1 : 0)
      + (refs.length ? provenanceReady / refs.length : 0) * 0.15
    );
    return clone({ schema: QUALITY_SCHEMA, artifact_type: "list", artifact_id: list?.id || null, score, passed: reasons.length === 0 && score >= 0.7, reasons });
  }

  function evaluatePath(path, context = {}) {
    const steps = arr(path?.steps).slice().sort((a, b) => Number(a.order) - Number(b.order));
    const stages = steps.map((step) => text(step?.meta?.stage)).filter(Boolean);
    const requiredStages = ["orientation", "claim_evidence", "tension_counterexample", "uncertainty", "synthesis_next_inquiry"];
    const insightIds = new Set(arr(context.insights).map((insight) => insight.id));
    const invalidRefs = steps.filter((step) => !text(step?.refId) || !insightIds.has(text(step?.refId)));
    const narratives = steps.filter((step) => text(step?.narrative).length >= 40).length;
    const outcomes = steps.filter((step) => text(step?.learningOutcome).length >= 20).length;
    const uniqueTransitions = unique(steps.map((step) => normalize(step?.narrative))).length;
    const reasons = [];
    if (steps.length !== requiredStages.length) reasons.push("path_must_have_five_stages");
    if (stages.join("|") !== requiredStages.join("|")) reasons.push("path_progression_sequence_invalid");
    if (invalidRefs.length) reasons.push("path_unresolved_reference");
    if (steps.length && narratives !== steps.length) reasons.push("path_transition_missing");
    if (steps.length && uniqueTransitions !== steps.length) reasons.push("path_transitions_not_distinct");
    if (steps.length && outcomes !== steps.length) reasons.push("path_learning_outcome_missing");
    const score = round(
      (steps.length === 5 ? 0.2 : 0)
      + (stages.join("|") === requiredStages.join("|") ? 0.25 : 0)
      + (steps.length ? narratives / steps.length : 0) * 0.25
      + (steps.length ? outcomes / steps.length : 0) * 0.2
      + (!invalidRefs.length && steps.length ? 0.1 : 0)
    );
    return clone({ schema: QUALITY_SCHEMA, artifact_type: "path", artifact_id: path?.id || null, score, passed: reasons.length === 0 && score >= 0.75, reasons });
  }

  function evaluateMindmap(mindmap) {
    const nodes = arr(mindmap?.nodes);
    const edges = arr(mindmap?.edges);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const roots = nodes.filter((node) => node.type === "theme" && node.meta?.root === true);
    const branches = edges.filter((edge) => edge.type === "theme_branch");
    const branchIds = new Set(branches.map((edge) => edge.to));
    const hierarchyEdges = edges.filter((edge) => edge.type === "supports_insight");
    const childCounts = [...branchIds].map((id) => hierarchyEdges.filter((edge) => edge.from === id).length);
    const emptyBranches = childCounts.filter((count) => count === 0).length;
    const maxChildren = Math.max(0, ...childCounts);
    const minChildren = childCounts.length ? Math.min(...childCounts) : 0;
    const excessiveHierarchyEdges = hierarchyEdges.length > nodes.filter((node) => node.type === "insight").length * 2;
    const unresolved = edges.filter((edge) => !nodeIds.has(edge.from) || !nodeIds.has(edge.to));
    const invalidResonance = edges.filter((edge) => edge.type === "resonates_with" && edge.meta?.dedupe_eligible !== false);
    const invalidEquivalence = nodes.filter((node) => node.type === "insight" && node.meta?.equivalence_collapsed === true && arr(node.meta?.member_ids).length < 2);
    const reasons = [];
    if (nodes.length < 4) reasons.push("mindmap_too_small");
    if (roots.length !== 1) reasons.push("mindmap_root_invalid");
    if (branches.length < 2) reasons.push("mindmap_has_too_few_branches");
    if (branches.length > 7) reasons.push("mindmap_has_too_many_branches");
    if (emptyBranches) reasons.push("mindmap_empty_branch");
    if (minChildren > 0 && maxChildren > Math.max(3, minChildren * 3)) reasons.push("mindmap_branch_balance_low");
    if (excessiveHierarchyEdges) reasons.push("mindmap_noise_edges_high");
    if (unresolved.length) reasons.push("mindmap_unresolved_edge");
    if (invalidResonance.length) reasons.push("mindmap_resonance_semantics_invalid");
    if (invalidEquivalence.length) reasons.push("mindmap_equivalence_semantics_invalid");
    const score = round(
      (nodes.length >= 4 ? 0.2 : 0)
      + (roots.length === 1 ? 0.25 : 0)
      + (branches.length >= 2 && branches.length <= 7 ? 0.2 : 0)
      + (!emptyBranches && !excessiveHierarchyEdges ? 0.15 : 0)
      + (!unresolved.length ? 0.1 : 0)
      + (!invalidResonance.length && !invalidEquivalence.length ? 0.1 : 0)
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
