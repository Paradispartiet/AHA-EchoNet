// ahaProjectionArtifactQualityV2.js
// Product-level quality gates and read-only usefulness refinement for V2 lists,
// paths and semantic mindmaps. Refinement may improve human-facing copy only
// from already source-bound insight text; it never changes semantic ids, refs,
// relation semantics, persistence state or write authority.
(function (global) {
  "use strict";

  const QUALITY_SCHEMA = "aha_projection_artifact_quality_v2";
  const QUALITY_VERSION = 2;
  const DISPLAY_REFINEMENT = "source_bound_usefulness_v2";
  const MAX_PRODUCT_TITLE = 120;

  const DISPLAY_STOPWORDS = new Set([
    "og", "i", "på", "av", "til", "er", "et", "en", "det", "som", "med", "for", "den", "de", "å", "om", "men", "at", "fra",
    "har", "blir", "ble", "kan", "skal", "eller", "ikke", "når", "etter", "før", "ved", "også", "dette", "seg", "sine", "sin", "sitt",
    "være", "var", "mens", "mot", "mellom", "bare", "både", "derfor", "likevel", "samtidig", "samme", "andre", "begge", "noen"
  ]);
  const LOW_INFORMATION_DISPLAY_TOKENS = new Set([
    "alene", "antall", "advarer", "beskriver", "dagen", "dager", "bedre", "derfor", "bade", "barnets", "bruker", "brukes", "steg",
    "byggets", "prosent", "andre", "begge", "gjor", "gjort", "avslorer", "samme", "noen", "felles", "valgfrie", "hyppig", "enkel",
    "effekten", "problemet", "tillitsvalgte", "malinger", "gruppene", "oppgavene", "innbyggerne", "reisende"
  ]);

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function text(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
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
  function displayTokens(value) {
    return normalize(value).split(/\s+/).filter((token) => token.length >= 4 && !DISPLAY_STOPWORDS.has(token));
  }
  function informativeTokens(value) {
    return displayTokens(value).filter((token) => !LOW_INFORMATION_DISPLAY_TOKENS.has(token) && !/^\d+(?:[.,]\d+)?$/u.test(token));
  }
  function isLowInformationLabel(value) {
    const normalized = normalize(value);
    if (!normalized) return true;
    const tokens = normalized.split(/\s+/).filter(Boolean);
    if (tokens.length > 1 && informativeTokens(normalized).length >= 1) return false;
    if (tokens.length === 1 && (tokens[0].length < 4 || LOW_INFORMATION_DISPLAY_TOKENS.has(tokens[0]) || DISPLAY_STOPWORDS.has(tokens[0]) || /^\d+(?:[.,]\d+)?$/u.test(tokens[0]))) return true;
    return informativeTokens(normalized).length === 0;
  }
  function compact(value, maxWords = 7, maxChars = 62) {
    const cleaned = text(value).replace(/[.!?]+$/u, "");
    if (!cleaned) return "";
    const words = cleaned.split(/\s+/).filter(Boolean);
    let result = words.slice(0, maxWords).join(" ");
    if (result.length > maxChars) result = result.slice(0, maxChars).replace(/\s+\S*$/u, "").trim() || result.slice(0, maxChars).trim();
    const truncated = words.length > maxWords || cleaned.length > result.length;
    return `${result}${truncated ? " …" : ""}`;
  }
  function capTitle(value) {
    const cleaned = text(value);
    if (cleaned.length <= MAX_PRODUCT_TITLE) return cleaned;
    const slice = cleaned.slice(0, MAX_PRODUCT_TITLE - 2).replace(/\s+\S*$/u, "").trim();
    return `${slice || cleaned.slice(0, MAX_PRODUCT_TITLE - 2).trim()} …`;
  }
  function insightText(insight) {
    return text(insight?.insight || insight?.summary || insight?.title || insight?.claim || insight?.content || insight?.text);
  }
  function insightMap(context = {}) {
    return new Map(arr(context.insights).map((insight) => [text(insight?.id), insight]).filter(([id]) => Boolean(id)));
  }
  function refIdsFromItems(items) {
    return unique(arr(items).map((item) => text(item?.refId)).filter(Boolean)).sort();
  }
  function refIdsFromPath(path) {
    return unique(arr(path?.steps).map((step) => text(step?.refId)).filter(Boolean)).sort();
  }
  function refSetKey(ids) { return arr(ids).slice().sort().join("||"); }
  function sourceThemeFromRefs(refIds, context = {}) {
    const byId = insightMap(context);
    const parts = arr(refIds).slice().sort().map((id) => ({ id, value: compact(insightText(byId.get(id)), 6, 50) })).filter((entry) => entry.value);
    const values = unique(parts.map((entry) => entry.value));
    if (!values.length) return "";
    if (values.length === 1) return values[0];
    return capTitle(`${values[0]} ↔ ${values[1]}`);
  }
  function sourceThemeFromItems(items, context = {}) {
    return sourceThemeFromRefs(refIdsFromItems(items), context);
  }
  function artifactPriority(artifact, type) {
    const basis = type === "path"
      ? text(arr(artifact?.steps)[0]?.meta?.semantic_basis)
      : text(artifact?.meta?.semantic_basis);
    if (basis === "resonance") return 0;
    if (basis === "shared_concept") return 1;
    if (basis === "fallback_core") return 3;
    return 2;
  }
  function dedupeByRefSet(items, type) {
    const selected = new Map();
    arr(items).forEach((item) => {
      const refs = type === "path" ? refIdsFromPath(item) : refIdsFromItems(item?.items);
      const key = refSetKey(refs) || `id:${text(item?.id)}`;
      const existing = selected.get(key);
      if (!existing) {
        selected.set(key, item);
        return;
      }
      const candidateRank = artifactPriority(item, type);
      const existingRank = artifactPriority(existing, type);
      if (candidateRank < existingRank || candidateRank === existingRank && text(item?.id).localeCompare(text(existing?.id)) < 0) selected.set(key, item);
    });
    return [...selected.values()].sort((left, right) => text(left?.id).localeCompare(text(right?.id)));
  }
  function containsSourceSignal(narrative, source) {
    const haystack = normalize(narrative);
    const strong = informativeTokens(source);
    const fallback = displayTokens(source);
    const candidates = strong.length ? strong : fallback;
    return candidates.some((token) => haystack.includes(token));
  }

  function refineList(list, context = {}) {
    const next = clone(list) || {};
    next.meta = { ...(next.meta || {}) };
    const basis = text(next.meta.semantic_basis);
    const basisLabel = text(next.meta.semantic_basis_label);
    const sourceTheme = sourceThemeFromItems(next.items, context);
    const weakAnchor = basis === "resonance" || isLowInformationLabel(basisLabel) || text(next.title).length > MAX_PRODUCT_TITLE;
    next.meta.original_title = next.meta.original_title || text(next.title);
    next.meta.display_refinement = DISPLAY_REFINEMENT;
    next.meta.display_theme = weakAnchor ? sourceTheme : (basisLabel || sourceTheme);
    next.meta.display_theme_source = weakAnchor ? "source_bound_insight_text" : "semantic_basis_label";
    if (weakAnchor && sourceTheme) {
      next.title = capTitle(`${basis === "resonance" ? "Sammenheng" : "Tema"}: ${sourceTheme}`);
      next.description = basis === "resonance"
        ? "To kildebundne innsikter med en semantisk resonans som bør undersøkes uten å behandles som duplikater."
        : "Kildebundne innsikter samlet rundt en mulig sammenheng; behold kildeteksten som grunnlag for videre vurdering.";
    } else {
      next.title = capTitle(next.title);
    }
    return next;
  }

  function stageNarrative(stage, refId, allRefIds, context = {}) {
    const byId = insightMap(context);
    const source = compact(insightText(byId.get(refId)), 10, 88);
    const otherRef = arr(allRefIds).find((id) => id !== refId) || refId;
    const other = compact(insightText(byId.get(otherRef)), 8, 72);
    const quote = source ? `«${source}»` : "den kildebundne innsikten";
    const otherQuote = other ? `«${other}»` : "den andre kildebundne innsikten";
    if (stage === "orientation") return `Start med ${quote}. Avgrens hva utsagnet faktisk sier, og kontroller hvilket kildebelegg som følger med før du går videre.`;
    if (stage === "claim_evidence") return `Undersøk ${quote}. Skill mellom det kilden dokumenterer, tolkningen analysen legger til og det som fortsatt mangler belegg.`;
    if (stage === "tension_counterexample") return `Sett ${quote} opp mot ${otherQuote}. Beskriv den viktigste spenningen, begrensningen eller et moteksempel som kan endre forståelsen.`;
    if (stage === "uncertainty") return `Test grensene for ${quote}. Noter hva utsagnet ikke kan avgjøre, hvilke antakelser som er usikre og hvilke alternative forklaringer som står åpne.`;
    return `Syntetiser det som fortsatt holder fra ${quote} og ${otherQuote}. Formuler deretter ett presist neste spørsmål som kan redusere den viktigste usikkerheten.`;
  }
  function stageOutcome(stage, theme) {
    const topic = compact(theme, 6, 56) || "sammenhengen";
    if (stage === "orientation") return `Kunne avgrense hva kilden faktisk sier om ${topic}.`;
    if (stage === "claim_evidence") return `Kunne koble en konkret påstand om ${topic} til kildebelegg uten å overdrive rekkevidden.`;
    if (stage === "tension_counterexample") return `Kunne forklare en dokumentert spenning i ${topic} og hva et moteksempel ville endret.`;
    if (stage === "uncertainty") return `Kunne skille dokumentert kunnskap om ${topic} fra antakelser og åpne spørsmål.`;
    return `Kunne formulere en kildeforankret syntese av ${topic} og ett gjennomførbart neste spørsmål.`;
  }
  function refinePath(path, context = {}) {
    const next = clone(path) || {};
    next.meta = { ...(next.meta || {}) };
    const refs = refIdsFromPath(next);
    const theme = sourceThemeFromRefs(refs, context);
    next.meta.original_title = next.meta.original_title || text(next.title);
    next.meta.display_refinement = DISPLAY_REFINEMENT;
    next.meta.display_theme = theme;
    next.meta.display_theme_source = "source_bound_insight_text";
    if (theme) {
      next.title = capTitle(`Undersøk: ${theme}`);
      next.description = `En kildebundet læringssti som undersøker forholdet mellom ${theme}.`;
      next.goal = `Forklar hva de kildebundne innsiktene sier, hvor de skiller lag og hva som fortsatt må undersøkes.`;
      next.learningOutcome = `Kunne bygge en kildeforankret forklaring, teste en spenning og formulere et begrunnet neste spørsmål.`;
    } else {
      next.title = capTitle(next.title);
    }
    next.steps = arr(next.steps).map((step) => {
      const refined = clone(step) || {};
      refined.meta = { ...(refined.meta || {}) };
      const stage = text(refined.meta.stage);
      refined.narrative = stageNarrative(stage, text(refined.refId), refs, context);
      refined.learningOutcome = stageOutcome(stage, theme);
      refined.meta.display_refinement = DISPLAY_REFINEMENT;
      refined.meta.source_bound_narrative = true;
      return refined;
    });
    return next;
  }

  function refineMindmap(mindmap, context = {}) {
    const next = clone(mindmap) || {};
    const nodes = arr(next.nodes);
    const edges = arr(next.edges);
    const nodeById = new Map(nodes.map((node) => [text(node?.id), node]));
    const insightNodes = nodes.filter((node) => node?.type === "insight");
    const sourceTheme = sourceThemeFromRefs(insightNodes.map((node) => text(node?.refId || node?.id)).filter(Boolean), context)
      || sourceThemeFromRefs(insightNodes.map((node) => text(node?.id)).filter(Boolean), { insights: insightNodes });

    nodes.forEach((node) => {
      node.meta = { ...(node.meta || {}) };
      const current = text(node.title || node.label);
      if (node.type === "theme" && node.meta.root === true) {
        const rootAnchor = current.replace(/:\s*semantisk oversikt.*$/iu, "");
        node.meta.original_title = node.meta.original_title || current;
        node.meta.display_refinement = DISPLAY_REFINEMENT;
        if ((!current || isLowInformationLabel(rootAnchor)) && sourceTheme) node.title = capTitle(`Oversikt: ${sourceTheme}`);
        else node.title = capTitle(current);
      }
      if (node.type === "concept") {
        const branchAnchor = current;
        node.meta.original_title = node.meta.original_title || current;
        node.meta.display_refinement = DISPLAY_REFINEMENT;
        if (!current || isLowInformationLabel(branchAnchor)) {
          const childIds = edges.filter((edge) => edge.type === "supports_insight" && text(edge.from) === text(node.id)).map((edge) => text(edge.to));
          const branchTheme = sourceThemeFromRefs(childIds, context)
            || childIds.map((id) => compact(text(nodeById.get(id)?.title), 6, 52)).filter(Boolean)[0];
          if (branchTheme) node.title = capTitle(`Spor: ${branchTheme}`);
        } else node.title = capTitle(current);
      }
    });
    next.nodes = nodes;
    next.edges = edges;
    next.meta = { ...(next.meta || {}), display_refinement: DISPLAY_REFINEMENT, display_theme_source: "source_bound_insight_text" };
    return next;
  }

  function refineReadModel(model) {
    if (model?.status !== "ready" || model?.validation?.valid !== true) return clone(model);
    const next = clone(model);
    const context = { insights: arr(next?.surfaces?.insights), concepts: arr(next?.surfaces?.concepts) };
    const refinedLists = arr(next?.surfaces?.lists).map((list) => refineList(list, context));
    const refinedPaths = arr(next?.surfaces?.paths).map((path) => refinePath(path, context));
    next.surfaces.lists = dedupeByRefSet(refinedLists, "list");
    next.surfaces.paths = dedupeByRefSet(refinedPaths, "path");
    next.surfaces.mindmap = refineMindmap(next?.surfaces?.mindmap || {}, context);
    return clone(next);
  }

  function evaluateList(list, context = {}) {
    const items = arr(list?.items);
    const refs = items.map((item) => text(item?.refId)).filter(Boolean);
    const byId = insightMap(context);
    const provenanceReady = refs.filter((id) => {
      const insight = byId.get(id);
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
    if (text(list?.title).length > MAX_PRODUCT_TITLE) reasons.push("list_title_too_long");
    if (basis === "shared_concept" && isLowInformationLabel(basisLabel) && text(list?.meta?.display_theme_source) !== "source_bound_insight_text") reasons.push("list_display_anchor_low_information");
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
    const byId = insightMap(context);
    const insightIds = new Set(arr(context.insights).map((insight) => text(insight?.id)).filter(Boolean));
    const invalidRefs = steps.filter((step) => !text(step?.refId) || !insightIds.has(text(step?.refId)));
    const narratives = steps.filter((step) => text(step?.narrative).length >= 40).length;
    const outcomes = steps.filter((step) => text(step?.learningOutcome).length >= 20).length;
    const uniqueTransitions = unique(steps.map((step) => normalize(step?.narrative))).length;
    const sourceBoundReady = steps.filter((step) => insightText(byId.get(text(step?.refId)))).length;
    const sourceBound = steps.filter((step) => {
      const source = insightText(byId.get(text(step?.refId)));
      return !source || containsSourceSignal(step?.narrative, source);
    }).length;
    const reasons = [];
    if (steps.length !== requiredStages.length) reasons.push("path_must_have_five_stages");
    if (stages.join("|") !== requiredStages.join("|")) reasons.push("path_progression_sequence_invalid");
    if (invalidRefs.length) reasons.push("path_unresolved_reference");
    if (steps.length && narratives !== steps.length) reasons.push("path_transition_missing");
    if (steps.length && uniqueTransitions !== steps.length) reasons.push("path_transitions_not_distinct");
    if (steps.length && outcomes !== steps.length) reasons.push("path_learning_outcome_missing");
    if (sourceBoundReady && sourceBound !== steps.length) reasons.push("path_transitions_not_source_bound");
    if (text(path?.title).length > MAX_PRODUCT_TITLE) reasons.push("path_title_too_long");
    const score = round(
      (steps.length === 5 ? 0.2 : 0)
      + (stages.join("|") === requiredStages.join("|") ? 0.25 : 0)
      + (steps.length ? narratives / steps.length : 0) * 0.2
      + (steps.length ? outcomes / steps.length : 0) * 0.15
      + (!invalidRefs.length && steps.length ? 0.1 : 0)
      + (sourceBoundReady ? sourceBound / Math.max(1, steps.length) : 1) * 0.1
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
    const missingRootTitle = roots.filter((node) => text(node?.title || node?.label).length < 4);
    const weakBranchTitles = nodes.filter((node) => branchIds.has(node.id) && text(node?.title || node?.label).length < 4);
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
    if (missingRootTitle.length) reasons.push("mindmap_root_title_missing");
    if (weakBranchTitles.length) reasons.push("mindmap_branch_title_missing");
    const score = round(
      (nodes.length >= 4 ? 0.15 : 0)
      + (roots.length === 1 ? 0.2 : 0)
      + (branches.length >= 2 && branches.length <= 7 ? 0.2 : 0)
      + (!emptyBranches && !excessiveHierarchyEdges ? 0.15 : 0)
      + (!unresolved.length ? 0.1 : 0)
      + (!invalidResonance.length && !invalidEquivalence.length ? 0.1 : 0)
      + (!missingRootTitle.length && !weakBranchTitles.length ? 0.1 : 0)
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
    const next = refineReadModel(model);
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

  const api = Object.freeze({
    QUALITY_SCHEMA,
    QUALITY_VERSION,
    DISPLAY_REFINEMENT,
    MAX_PRODUCT_TITLE,
    isLowInformationLabel,
    refineReadModel,
    evaluateList,
    evaluatePath,
    evaluateMindmap,
    evaluate,
    filterReadModel
  });
  global.AHAProjectionArtifactQualityV2 = api;
  global.AHAModuleApi?.register?.("projectionArtifactQualityV2", api, {
    version: QUALITY_VERSION,
    legacyGlobal: "AHAProjectionArtifactQualityV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);