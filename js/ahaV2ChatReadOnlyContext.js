// ahaV2ChatReadOnlyContext.js
// Builds bounded, relevant, non-authoritative Chat context from the post-9/9
// V2 read-only integration gate. This module never persists, activates or
// rewrites knowledge and never treats V2 projections as current-user claims.

(function (global) {
  "use strict";

  const CONTEXT_SCHEMA = "aha_v2_chat_readonly_context_v1";
  const CONTEXT_VERSION = 1;
  const MAX_INSIGHTS = 6;
  const MAX_CONCEPTS = 12;
  const MAX_RESONANCE_EDGES = 8;
  const MIN_RELEVANCE = 0.08;
  const STOPWORDS = new Set([
    "det", "den", "der", "som", "for", "med", "til", "fra", "ikke", "eller", "og", "i", "på", "av", "en", "et", "å", "er", "har", "kan", "skal", "vil",
    "the", "and", "this", "that", "with", "from", "are", "was", "were", "have", "has"
  ]);

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
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(value) {
    return normalize(value).split(/\s+/).filter((token) => token.length > 2 && !STOPWORDS.has(token));
  }

  function integrationApi() {
    return global.AHAV2ProductIntegrationGate || null;
  }

  function migrationApi() {
    return global.AHAKnowledgeMigrationV2 || null;
  }

  function policy() {
    return {
      authoritative_for_chat: false,
      current_user_claim_authority: false,
      production_gate_authority: false,
      activation_authority: false,
      chamber_write: false,
      canonical_write: false,
      meta_write: false,
      persistent_write: false,
      remote_write: false,
      normal_chat_persistence_authority: false
    };
  }

  function unavailable(reason, integration = null) {
    return clone({
      schema: CONTEXT_SCHEMA,
      version: CONTEXT_VERSION,
      mode: "read_only",
      used: false,
      reason,
      gate_id: integration?.gate_id || null,
      projection_id: integration?.projection?.projection_id || null,
      source_hash: null,
      insights: [],
      concepts: [],
      resonance_edges: [],
      usage_rules: [
        "context_is_non_authoritative",
        "use_only_when_relevant_to_current_message",
        "do_not_treat_as_current_user_claim",
        "do_not_persist_from_context"
      ],
      policy: policy()
    });
  }

  function insightSearchText(insight, conceptById) {
    const concepts = arr(insight?.concept_ids).map((id) => conceptById.get(id)?.label || conceptById.get(id)?.key || "");
    return [insight?.title, insight?.summary, insight?.insight, ...arr(insight?.concept_keys), ...concepts].filter(Boolean).join(" ");
  }

  function score(insight, sourceTokens, conceptById) {
    const source = new Set(sourceTokens);
    const candidateTokens = tokens(insightSearchText(insight, conceptById));
    if (!source.size || !candidateTokens.length) return 0;
    const candidate = new Set(candidateTokens);
    let overlap = 0;
    candidate.forEach((token) => { if (source.has(token)) overlap += 1; });
    const containment = overlap / Math.max(1, Math.min(source.size, candidate.size));
    const jaccard = overlap / Math.max(1, new Set([...source, ...candidate]).size);
    return Number(Math.max(containment * 0.75 + jaccard * 0.25, overlap / Math.max(8, Math.min(source.size, candidate.size))).toFixed(6));
  }

  function compactInsight(insight, relevance) {
    return {
      id: text(insight?.id),
      title: text(insight?.title),
      summary: text(insight?.summary || insight?.insight).slice(0, 600),
      type: text(insight?.type || "insight"),
      causal_status: text(insight?.causal_status || "unknown"),
      relevance,
      quality_score: Number(insight?.quality?.mean_score || insight?.quality?.representative_score || 0) || 0,
      concept_ids: arr(insight?.concept_ids).map(text).filter(Boolean),
      concept_keys: arr(insight?.concept_keys).map(text).filter(Boolean),
      source_refs: arr(insight?.provenance?.source_refs).slice(0, 8).map((entry) => ({
        field: text(entry?.field),
        value: text(entry?.value).slice(0, 240)
      })).filter((entry) => entry.field && entry.value),
      member_ids: arr(insight?.member_ids).map(text).filter(Boolean),
      equivalence_collapsed: insight?.equivalence_collapsed === true
    };
  }

  function build(input = {}, options = {}) {
    const integrationGate = integrationApi();
    const migration = migrationApi();
    if (!integrationGate?.preview || !migration?.stableHash) return unavailable("v2_integration_dependencies_unavailable");

    const sourceText = text(input.source_text || input.sourceText || input.message);
    if (!sourceText) return unavailable("source_text_missing");
    if (options.memory_allowed === false || input.memory_allowed === false) return unavailable("existing_memory_not_allowed");
    if (options.persistence_disabled !== true && input.persistence_disabled !== true) return unavailable("persistence_must_be_disabled_for_v2_chat_gate");

    const integration = input.integration?.schema === "aha_v2_product_integration_gate_v1"
      ? clone(input.integration)
      : integrationGate.preview({
        chamber: input.chamber,
        legacy_insights: input.legacy_insights,
        legacy_lists: input.legacy_lists,
        legacy_paths: input.legacy_paths,
        legacy_mindmaps: input.legacy_mindmaps,
        existing_staged: input.existing_staged
      });

    if (!integration || integration.status === "blocked" || integration.validation?.valid !== true) {
      return unavailable("v2_integration_gate_not_ready", integration);
    }
    if (integration.policy?.normal_chat_persistence_authority !== false || integration.policy?.product_surface_binding_authority !== false) {
      return unavailable("v2_integration_policy_not_read_only", integration);
    }

    const projectedInsights = arr(integration?.adapters?.insights);
    const projectedConcepts = arr(integration?.adapters?.concepts);
    const conceptById = new Map(projectedConcepts.map((concept) => [concept.id, concept]));
    const sourceTokens = tokens(sourceText);
    const ranked = projectedInsights
      .map((insight) => ({ insight, relevance: score(insight, sourceTokens, conceptById) }))
      .filter((entry) => entry.relevance >= (Number(options.min_relevance) || MIN_RELEVANCE))
      .sort((a, b) => b.relevance - a.relevance || (Number(b.insight?.quality?.mean_score) || 0) - (Number(a.insight?.quality?.mean_score) || 0) || String(a.insight?.id).localeCompare(String(b.insight?.id)))
      .slice(0, Math.min(MAX_INSIGHTS, Number(options.max_insights) || MAX_INSIGHTS));

    if (!ranked.length) return unavailable("no_relevant_v2_context", integration);

    const selected = ranked.map(({ insight, relevance }) => compactInsight(insight, relevance));
    const selectedIds = new Set(selected.map((insight) => insight.id));
    const selectedConceptIds = new Set(selected.flatMap((insight) => insight.concept_ids));
    const concepts = projectedConcepts
      .filter((concept) => selectedConceptIds.has(concept.id))
      .map((concept) => ({
        id: text(concept.id),
        key: text(concept.key),
        label: text(concept.label),
        insight_ids: arr(concept.insight_ids).filter((id) => selectedIds.has(id))
      }))
      .filter((concept) => concept.id && concept.insight_ids.length)
      .slice(0, MAX_CONCEPTS);
    const resonanceEdges = arr(integration?.projection?.core?.resonance_edges)
      .filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to))
      .slice(0, MAX_RESONANCE_EDGES)
      .map((edge) => ({
        id: text(edge.id),
        from: text(edge.from),
        to: text(edge.to),
        confidence: Number(edge.confidence) || 0,
        dedupe_eligible: false
      }));

    return clone({
      schema: CONTEXT_SCHEMA,
      version: CONTEXT_VERSION,
      mode: "read_only",
      used: true,
      reason: "relevant_v2_projection_context",
      gate_id: integration.gate_id,
      projection_id: integration.projection?.projection_id || integration.adapters?.projection_id || null,
      source_hash: migration.stableHash(sourceText),
      insights: selected,
      concepts,
      resonance_edges: resonanceEdges,
      exclusions_count: arr(integration.exclusions).length,
      deferred_reference_count: arr(integration.deferred_reference_rewrites).length,
      usage_rules: [
        "context_is_non_authoritative",
        "use_only_when_relevant_to_current_message",
        "prefer_current_user_message_on_conflict",
        "do_not_treat_as_current_user_claim",
        "do_not_create_memory_or_persistence_from_context",
        "preserve_uncertainty_and_causal_status"
      ],
      policy: policy()
    });
  }

  const api = Object.freeze({
    CONTEXT_SCHEMA,
    CONTEXT_VERSION,
    MAX_INSIGHTS,
    MAX_CONCEPTS,
    MIN_RELEVANCE,
    build
  });
  global.AHAV2ChatReadOnlyContext = api;
  global.AHAModuleApi?.register?.("v2ChatReadOnlyContext", api, {
    version: CONTEXT_VERSION,
    legacyGlobal: "AHAV2ChatReadOnlyContext",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
