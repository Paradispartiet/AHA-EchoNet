// ahaInsightRelationClassifierV2.js
// Pure semantic relation layer for AHA V2 block 6.
//
// It distinguishes semantic equivalence from resonance without mutating inputs
// or writing to Chamber, Meta, persistence, projections, canonical storage or
// any remote backend. Equivalence is a semantic judgment; dedupe eligibility is
// a stricter, fail-closed decision that additionally requires reviewed quality,
// provenance and resolved causal status on both sides.

(function (global) {
  "use strict";

  const RELATION_SCHEMA = "aha_insight_relation_classification_v2";
  const RELATIONS = Object.freeze(["equivalent", "resonant", "distinct", "uncertain"]);
  const MIN_QUALITY_SCORE = 0.55;
  const EQUIVALENCE_THRESHOLD = 0.72;
  const RESONANCE_THRESHOLD = 0.30;

  const STOPWORDS = new Set([
    "og", "i", "på", "til", "av", "for", "med", "som", "det", "den", "de", "et", "en", "er", "var", "ble", "blir",
    "kan", "kunne", "skal", "har", "hadde", "om", "at", "fra", "når", "etter", "før", "mellom", "samtidig", "også",
    "the", "a", "an", "and", "or", "of", "to", "in", "for", "with", "that", "this", "is", "are", "was", "were", "can"
  ]);
  const NEGATION = /\b(?:ikke|aldri|ingen|intet|verken|uten|not|never|no|without)\b/iu;
  const DIRECTION_UP = /\b(?:øker|økte|økt|stiger|styrker|forsterker|mer|increase|increases|increased|raises|strengthens|more)\b/iu;
  const DIRECTION_DOWN = /\b(?:reduserer|reduserte|redusert|senker|svekker|mindre|decrease|decreases|decreased|reduces|weakens|less)\b/iu;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function round(value) {
    return Number(Math.max(0, Math.min(1, Number(value) || 0)).toFixed(6));
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function contentTokens(value) {
    return normalize(value)
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOPWORDS.has(token));
  }

  function setJaccard(left, right) {
    const a = new Set(left);
    const b = new Set(right);
    if (!a.size || !b.size) return 0;
    let intersection = 0;
    a.forEach((value) => { if (b.has(value)) intersection += 1; });
    const union = new Set([...a, ...b]).size;
    return union ? intersection / union : 0;
  }

  function setContainment(left, right) {
    const a = new Set(left);
    const b = new Set(right);
    if (!a.size || !b.size) return 0;
    let intersection = 0;
    a.forEach((value) => { if (b.has(value)) intersection += 1; });
    return intersection / Math.min(a.size, b.size);
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function unwrapCandidate(item) {
    if (item?.candidate && typeof item.candidate === "object") return item.candidate;
    return item && typeof item === "object" ? item : {};
  }

  function extractText(item) {
    const candidate = unwrapCandidate(item);
    const values = [
      candidate.insight,
      item?.insight,
      item?.summary,
      item?.claim,
      item?.content,
      item?.text,
      item?.title,
      item?.activation_v2?.insight
    ];
    return String(values.find((value) => String(value || "").trim()) || "").trim();
  }

  function conceptLabel(value) {
    if (typeof value === "string") return normalize(value);
    if (!value || typeof value !== "object") return "";
    return normalize(value.label || value.name || value.concept || value.text || value.id || "");
  }

  function extractConcepts(item) {
    const candidate = unwrapCandidate(item);
    const sources = [
      item?.semantic_concepts,
      item?.concepts,
      item?.semantic_context?.concepts,
      item?.semantic?.concepts,
      candidate.concepts,
      candidate.semantic_concepts,
      item?.activation_v2?.concepts
    ];
    const values = [];
    sources.forEach((source) => safeArray(source).forEach((entry) => {
      const label = conceptLabel(entry);
      if (label) values.push(label);
    }));
    return [...new Set(values)].sort();
  }

  function collectSourceRefs(value, refs) {
    if (!value || typeof value !== "object") return;
    ["source_event_id", "source_id", "sourceId", "source_text_hash", "url", "uri"].forEach((field) => {
      const normalized = normalize(value[field]);
      if (normalized) refs.add(`${field}:${normalized}`);
    });
    safeArray(value.source_ids).forEach((entry) => {
      const normalized = normalize(entry);
      if (normalized) refs.add(`source_id:${normalized}`);
    });
    safeArray(value.sources).forEach((entry) => {
      if (typeof entry === "string") {
        const normalized = normalize(entry);
        if (normalized) refs.add(`source:${normalized}`);
      } else collectSourceRefs(entry, refs);
    });
  }

  function extractProvenance(item) {
    const candidate = unwrapCandidate(item);
    const activation = item?.activation_v2 || {};
    const evidence = [
      ...safeArray(candidate.evidence),
      ...safeArray(item?.evidence),
      ...safeArray(activation.evidence)
    ];
    const evidenceKeys = evidence.map((entry) => normalize(entry?.quote || entry?.text || entry?.source || entry)).filter(Boolean);
    const sourceRefs = new Set();
    collectSourceRefs(item, sourceRefs);
    collectSourceRefs(candidate, sourceRefs);
    collectSourceRefs(item?.provenance, sourceRefs);
    collectSourceRefs(activation, sourceRefs);
    return {
      evidence_count: evidenceKeys.length,
      evidence_keys: [...new Set(evidenceKeys)].sort(),
      source_refs: [...sourceRefs].sort(),
      ready: evidenceKeys.length >= 2 || (sourceRefs.size >= 2 && Boolean(activation.source_event_id || item?.source_event_id))
    };
  }

  function numberOrNull(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function extractQuality(item) {
    const activation = item?.activation_v2 || {};
    const decision = item?.gate_decision || item?.quality_decision || item?.quality_gate_decision || item?.decision || item?.quality?.decision || null;
    const scores = [
      decision?.metrics?.quality_score,
      item?.gate_metrics?.quality_score,
      item?.quality?.quality_score,
      item?.quality_score,
      activation?.gate_metrics?.quality_score
    ].map(numberOrNull).filter((value) => value != null);
    const score = scores.length ? Math.max(...scores) : null;
    const reviewed = decision?.eligible_for_insight_review === true
      || item?.eligible_for_insight_review === true
      || ((item?.status === "reviewed" || item?.status === "canonical_promoted") && item?.gate_decision?.eligible_for_insight_review === true)
      || (activation?.schema === "aha_insight_activation_v2" && Boolean(activation?.production_proof));
    return {
      reviewed,
      score: score == null ? null : round(score),
      ready: reviewed === true && score != null && score >= MIN_QUALITY_SCORE
    };
  }

  function normalizeCausalStatus(value) {
    if (value === true) return "causal";
    if (value === false) return "not_causal";
    const normalized = normalize(value).replace(/-/g, "_").replace(/\s+/g, "_");
    if (["causal", "explicit_causal", "causal_explicit", "supported_causal"].includes(normalized)) return "causal";
    if (["not_causal", "non_causal", "noncausal", "descriptive"].includes(normalized)) return "not_causal";
    if (["uncertain", "ambiguous", "mixed", "unknown"].includes(normalized)) return "uncertain";
    return "unknown";
  }

  function extractCausalStatus(item) {
    const candidate = unwrapCandidate(item);
    return normalizeCausalStatus(
      candidate.causal_status
      ?? candidate.causalStatus
      ?? item?.causal_status
      ?? item?.causalStatus
      ?? item?.activation_v2?.causal_status
      ?? item?.causality?.status
    );
  }

  function extractType(item) {
    const candidate = unwrapCandidate(item);
    return normalize(candidate.type || item?.type || item?.functional_type || item?.activation_v2?.type || "");
  }

  function extractSignature(item) {
    return String(item?.candidate_signature || item?.activation_v2?.candidate_signature || item?.canonical_signature || "").trim();
  }

  function directionOf(text) {
    const up = DIRECTION_UP.test(text);
    const down = DIRECTION_DOWN.test(text);
    if (up && down) return "mixed";
    if (up) return "up";
    if (down) return "down";
    return "neutral";
  }

  function descriptor(item) {
    const text = extractText(item);
    const concepts = extractConcepts(item);
    const signature = extractSignature(item);
    const explicitId = String(item?.id || item?.insight_id || item?.canonical_insight_id || item?.review_id || "").trim();
    const fingerprint = hashString(`${normalize(text)}|${concepts.join("|")}|${signature}`);
    const id = explicitId || (signature ? `signature:${signature}` : `fingerprint:${fingerprint}`);
    return {
      id,
      sort_key: `${id}|${fingerprint}`,
      text,
      normalized_text: normalize(text),
      tokens: contentTokens(text),
      concepts,
      provenance: extractProvenance(item),
      quality: extractQuality(item),
      causal_status: extractCausalStatus(item),
      type: extractType(item),
      signature,
      negated: NEGATION.test(text),
      direction: directionOf(text)
    };
  }

  function semanticFeatures(left, right) {
    const textJaccard = setJaccard(left.tokens, right.tokens);
    const textContainment = setContainment(left.tokens, right.tokens);
    const conceptJaccard = setJaccard(left.concepts, right.concepts);
    const conceptOverlapCount = left.concepts.filter((value) => right.concepts.includes(value)).length;
    const provenanceRefs = setJaccard(left.provenance.source_refs, right.provenance.source_refs);
    const evidenceOverlap = setJaccard(left.provenance.evidence_keys, right.provenance.evidence_keys);
    const exactText = Boolean(left.normalized_text && left.normalized_text === right.normalized_text);
    const sameSignature = Boolean(left.signature && left.signature === right.signature);
    const causalConflict = (left.causal_status === "causal" && right.causal_status === "not_causal")
      || (left.causal_status === "not_causal" && right.causal_status === "causal");
    const causalResolved = ["causal", "not_causal"].includes(left.causal_status)
      && ["causal", "not_causal"].includes(right.causal_status);
    const polarityConflict = left.negated !== right.negated;
    const directionConflict = (left.direction === "up" && right.direction === "down")
      || (left.direction === "down" && right.direction === "up");
    const typeMatch = Boolean(left.type && right.type && left.type === right.type);

    let semanticScore = Math.max(
      textJaccard,
      textContainment * 0.62 + conceptJaccard * 0.38,
      conceptJaccard * 0.58 + textJaccard * 0.42
    );
    if (!left.concepts.length || !right.concepts.length) semanticScore = Math.max(textJaccard, textContainment * 0.82);
    if (exactText) semanticScore = 1;
    if (sameSignature) semanticScore = 1;

    return {
      semantic_score: round(semanticScore),
      text_jaccard: round(textJaccard),
      text_containment: round(textContainment),
      concept_jaccard: round(conceptJaccard),
      concept_overlap_count: conceptOverlapCount,
      provenance_overlap: round(Math.max(provenanceRefs, evidenceOverlap)),
      exact_text: exactText,
      same_candidate_signature: sameSignature,
      type_match: typeMatch,
      causal_resolved: causalResolved,
      causal_conflict: causalConflict,
      polarity_conflict: polarityConflict,
      direction_conflict: directionConflict
    };
  }

  function classifyPair(leftInput, rightInput, options = {}) {
    const descriptors = [descriptor(leftInput), descriptor(rightInput)].sort((a, b) => a.sort_key.localeCompare(b.sort_key));
    const [left, right] = descriptors;
    const features = semanticFeatures(left, right);
    const equivalenceThreshold = numberOrNull(options.equivalence_threshold) ?? EQUIVALENCE_THRESHOLD;
    const resonanceThreshold = numberOrNull(options.resonance_threshold) ?? RESONANCE_THRESHOLD;
    const reasons = [];

    if (!left.text || !right.text) reasons.push("relation_text_missing");
    if (features.causal_conflict) reasons.push("equivalence_blocked_causal_conflict");
    if (features.polarity_conflict) reasons.push("equivalence_blocked_polarity_conflict");
    if (features.direction_conflict) reasons.push("equivalence_blocked_direction_conflict");

    const hardEquivalenceBlock = features.causal_conflict || features.polarity_conflict || features.direction_conflict;
    let relation = "distinct";
    if (!left.text || !right.text) relation = "uncertain";
    else if (features.semantic_score >= equivalenceThreshold && !hardEquivalenceBlock) relation = "equivalent";
    else if (features.semantic_score >= resonanceThreshold || (hardEquivalenceBlock && features.semantic_score >= 0.22)) relation = "resonant";

    const dedupeReasons = [];
    if (relation !== "equivalent") dedupeReasons.push("dedupe_requires_equivalence");
    if (!left.quality.ready) dedupeReasons.push("left_quality_not_ready");
    if (!right.quality.ready) dedupeReasons.push("right_quality_not_ready");
    if (!left.provenance.ready) dedupeReasons.push("left_provenance_not_ready");
    if (!right.provenance.ready) dedupeReasons.push("right_provenance_not_ready");
    if (!features.causal_resolved) dedupeReasons.push("causal_status_unresolved");
    if (hardEquivalenceBlock) dedupeReasons.push("semantic_conflict_blocks_dedupe");
    const dedupeEligible = dedupeReasons.length === 0;

    if (relation === "equivalent" && !dedupeEligible) reasons.push("equivalence_not_dedupe_ready");
    if (relation === "resonant") reasons.push("resonance_preserves_distinct_insights");
    if (relation === "distinct") reasons.push("semantic_overlap_below_resonance_threshold");

    const pairSeed = [left.sort_key, right.sort_key].sort().join("||");
    const confidence = relation === "equivalent"
      ? features.semantic_score
      : relation === "resonant"
        ? round(Math.max(features.semantic_score, 1 - Math.abs(features.semantic_score - 0.5)))
        : relation === "distinct"
          ? round(1 - features.semantic_score)
          : 0;

    return clone({
      schema: RELATION_SCHEMA,
      version: 2,
      mode: "shadow",
      pair_id: `relation_v2_${hashString(pairSeed)}`,
      left_id: left.id,
      right_id: right.id,
      relation,
      confidence,
      dedupe_eligible: dedupeEligible,
      reasons: [...new Set(reasons)].sort(),
      dedupe_blocking_reasons: [...new Set(dedupeReasons)].sort(),
      features,
      left: {
        quality_ready: left.quality.ready,
        quality_score: left.quality.score,
        provenance_ready: left.provenance.ready,
        causal_status: left.causal_status,
        type: left.type || null
      },
      right: {
        quality_ready: right.quality.ready,
        quality_score: right.quality.score,
        provenance_ready: right.provenance.ready,
        causal_status: right.causal_status,
        type: right.type || null
      },
      policy: {
        production_gate_authority: false,
        dedupe_write: false,
        canonical_write: false,
        chamber_write: false,
        meta_write: false,
        projection_write: false,
        persistent_write: false
      }
    });
  }

  function classifySet(itemsInput, options = {}) {
    const items = safeArray(itemsInput);
    const nodes = items.map((item, index) => ({ index, descriptor: descriptor(item) }));
    const pairs = [];
    for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
        pairs.push(classifyPair(items[leftIndex], items[rightIndex], options));
      }
    }

    const parent = nodes.map((_, index) => index);
    function find(index) {
      let current = index;
      while (parent[current] !== current) {
        parent[current] = parent[parent[current]];
        current = parent[current];
      }
      return current;
    }
    function union(leftIndex, rightIndex) {
      const leftRoot = find(leftIndex);
      const rightRoot = find(rightIndex);
      if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
    }

    const idToIndices = new Map();
    nodes.forEach((node) => {
      const bucket = idToIndices.get(node.descriptor.id) || [];
      bucket.push(node.index);
      idToIndices.set(node.descriptor.id, bucket);
    });
    pairs.filter((pair) => pair.relation === "equivalent" && pair.dedupe_eligible).forEach((pair) => {
      const leftIndices = idToIndices.get(pair.left_id) || [];
      const rightIndices = idToIndices.get(pair.right_id) || [];
      if (leftIndices.length && rightIndices.length) union(leftIndices[0], rightIndices[0]);
    });

    const groups = new Map();
    nodes.forEach((node) => {
      const rootIndex = find(node.index);
      const bucket = groups.get(rootIndex) || [];
      bucket.push(node.descriptor.id);
      groups.set(rootIndex, bucket);
    });
    const equivalenceGroups = [...groups.values()]
      .map((memberIds) => [...new Set(memberIds)].sort())
      .filter((memberIds) => memberIds.length > 1)
      .map((memberIds) => ({
        group_id: `equivalence_v2_${hashString(memberIds.join("||"))}`,
        member_ids: memberIds,
        dedupe_eligible: true
      }))
      .sort((a, b) => a.group_id.localeCompare(b.group_id));

    const resonanceEdges = pairs
      .filter((pair) => pair.relation === "resonant")
      .map((pair) => ({
        pair_id: pair.pair_id,
        left_id: pair.left_id,
        right_id: pair.right_id,
        confidence: pair.confidence,
        dedupe_eligible: false
      }));

    return clone({
      schema: RELATION_SCHEMA,
      version: 2,
      mode: "shadow",
      item_count: items.length,
      pair_count: pairs.length,
      equivalent_pair_count: pairs.filter((pair) => pair.relation === "equivalent").length,
      dedupe_eligible_pair_count: pairs.filter((pair) => pair.dedupe_eligible).length,
      resonance_pair_count: resonanceEdges.length,
      pairs,
      equivalence_groups: equivalenceGroups,
      resonance_edges: resonanceEdges,
      policy: {
        production_gate_authority: false,
        dedupe_write: false,
        canonical_write: false,
        chamber_write: false,
        meta_write: false,
        projection_write: false,
        persistent_write: false
      }
    });
  }

  const api = Object.freeze({
    RELATION_SCHEMA,
    RELATIONS,
    MIN_QUALITY_SCORE,
    EQUIVALENCE_THRESHOLD,
    RESONANCE_THRESHOLD,
    classifyPair,
    classifySet
  });
  global.AHAInsightRelationClassifierV2 = api;
  global.AHAModuleApi?.register?.("insightRelationClassifierV2", api, {
    version: 2,
    legacyGlobal: "AHAInsightRelationClassifierV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
