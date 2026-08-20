// ahaMetaQualityV2.js
// Quality-aware, read-only Meta overlay for AHA V2 block 7.
//
// This module does not replace MetaInsightsEngine and does not write anywhere.
// It constrains V2 Meta reasoning to review-ready insights, treats resonance as
// an informative connection rather than duplicate support, and explicitly
// ignores legacy quantity-based saturation as V2 authority.

(function (global) {
  "use strict";

  const META_SCHEMA = "aha_meta_quality_view_v2";

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function round(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Number(Math.max(0, Math.min(1, number)).toFixed(6));
  }

  function saturationApi() {
    return global.AHAInsightSaturationV2 || null;
  }

  function itemId(item, readiness) {
    return readiness?.id || String(item?.id || item?.insight_id || item?.candidate_signature || "unknown");
  }

  function extractConcepts(item) {
    const candidate = item?.candidate && typeof item.candidate === "object" ? item.candidate : item || {};
    const sources = [
      item?.semantic_concepts,
      item?.concepts,
      item?.semantic_context?.concepts,
      item?.activation_v2?.concepts,
      candidate?.semantic_concepts,
      candidate?.concepts
    ];
    const values = [];
    sources.forEach((source) => safeArray(source).forEach((entry) => {
      const raw = typeof entry === "string"
        ? entry
        : entry?.key || entry?.label || entry?.name || entry?.concept || entry?.text || "";
      const key = String(raw || "").trim().toLowerCase();
      if (key) values.push(key);
    }));
    return [...new Set(values)].sort();
  }

  function dominantConcepts(items, limit = 8) {
    const counts = new Map();
    safeArray(items).forEach((item) => {
      extractConcepts(item).forEach((key) => counts.set(key, (counts.get(key) || 0) + 1));
    });
    return [...counts.entries()]
      .map(([key, insight_count]) => ({ key, insight_count }))
      .sort((a, b) => (b.insight_count - a.insight_count) || a.key.localeCompare(b.key))
      .slice(0, limit);
  }

  function confidenceFor({ trustedCount, totalCount, meanQuality, saturation }) {
    if (!trustedCount) return { level: "blocked", score: 0 };
    const coverage = trustedCount / Math.max(1, totalCount);
    const sample = Math.min(1, trustedCount / 6);
    const saturationReady = saturation?.ready_for_meta === true ? 1 : 0.75;
    const score = round(meanQuality * coverage * sample * saturationReady);
    let level = "low";
    if (score >= 0.72 && trustedCount >= 6) level = "high";
    else if (score >= 0.45 && trustedCount >= 3) level = "medium";
    return { level, score };
  }

  function summaryFor(view) {
    const quality = view.quality || {};
    const saturation = view.saturation || {};
    if (view.status === "blocked") {
      return "V2 Meta har ikke nok kvalitetsgodkjent og kildebundet grunnlag til å trekke meta-konklusjoner.";
    }
    if (saturation.state === "saturated") {
      return `V2 Meta bygger på ${quality.trusted_count} kvalitetsgodkjente innsikter. Nytt materiale gjentar i stor grad allerede verifisert kunnskap, så resonance og integrasjon bør prioriteres fremfor flere like innsikter.`;
    }
    if (saturation.state === "approaching_saturation") {
      return `V2 Meta bygger på ${quality.trusted_count} kvalitetsgodkjente innsikter. Feltet nærmer seg semantisk metning, men nye resonance-koblinger og tydelig distinkte innsikter har fortsatt verdi.`;
    }
    return `V2 Meta bygger på ${quality.trusted_count} kvalitetsgodkjente innsikter og behandler bare disse som autoritativt grunnlag for meta-mønstre.`;
  }

  function build(input = {}) {
    const saturation = input.saturation || input.saturation_v2 || null;
    const v2Insights = safeArray(input.v2_insights || input.insights);
    const legacyProfile = input.meta_profile || input.profile || null;
    const saturationModule = saturationApi();
    const blockingReasons = [];

    if (!saturationModule?.describeReadiness) blockingReasons.push("insight_saturation_v2_unavailable");
    if (!saturation || saturation.schema !== "aha_insight_saturation_v2") blockingReasons.push("valid_saturation_v2_required");

    const readiness = saturationModule?.describeReadiness
      ? v2Insights.map((item) => saturationModule.describeReadiness(item))
      : v2Insights.map((item) => ({ id: itemId(item), ready: false, quality_score: null, blocking_reasons: ["insight_saturation_v2_unavailable"] }));
    const trusted = v2Insights.filter((_, index) => readiness[index]?.ready === true);
    const blocked = v2Insights
      .map((item, index) => ({ item, readiness: readiness[index] }))
      .filter(({ readiness: entry }) => entry?.ready !== true)
      .map(({ item, readiness: entry }) => ({
        id: itemId(item, entry),
        quality_score: entry?.quality_score ?? null,
        blocking_reasons: safeArray(entry?.blocking_reasons)
      }));
    const qualityScores = readiness
      .filter((entry) => entry?.ready === true && Number.isFinite(Number(entry.quality_score)))
      .map((entry) => Number(entry.quality_score));
    const meanQuality = qualityScores.length
      ? qualityScores.reduce((sum, value) => sum + value, 0) / qualityScores.length
      : 0;
    const trustedIds = trusted.map((item, index) => {
      const originalIndex = v2Insights.indexOf(item);
      return itemId(item, readiness[originalIndex >= 0 ? originalIndex : index]);
    });
    const roleById = new Map(safeArray(saturation?.candidate_roles).map((entry) => [entry.id, entry]));
    const resonanceLinks = safeArray(saturation?.candidate_roles)
      .filter((entry) => entry.role === "resonant_novel")
      .map((entry) => ({
        insight_id: entry.id,
        pair_id: entry.relation_pair_id,
        confidence: entry.relation_confidence,
        role: "resonance",
        duplicate_support: false
      }));
    const equivalentLinks = safeArray(saturation?.candidate_roles)
      .filter((entry) => entry.role === "verified_equivalent_existing" || entry.role === "verified_equivalent_batch")
      .map((entry) => ({
        insight_id: entry.id,
        pair_id: entry.relation_pair_id,
        confidence: entry.relation_confidence,
        role: "equivalence",
        duplicate_support: true
      }));

    const quality = {
      total_count: v2Insights.length,
      trusted_count: trusted.length,
      blocked_count: blocked.length,
      trusted_coverage: round(trusted.length / Math.max(1, v2Insights.length)),
      mean_quality_score: round(meanQuality),
      trusted_insight_ids: trustedIds,
      blocked_insights: blocked
    };
    const confidence = confidenceFor({
      trustedCount: trusted.length,
      totalCount: v2Insights.length,
      meanQuality,
      saturation
    });

    if (trusted.length < 2) blockingReasons.push("insufficient_trusted_insights_for_meta");
    if (saturation?.ready_for_meta !== true) blockingReasons.push("saturation_context_not_meta_ready");
    const status = blockingReasons.some((reason) => reason === "insight_saturation_v2_unavailable" || reason === "valid_saturation_v2_required" || reason === "insufficient_trusted_insights_for_meta")
      ? "blocked"
      : saturation?.ready_for_meta === true ? "ready" : "limited";

    const trustedInsightRoles = trustedIds.map((id) => ({
      id,
      role: roleById.get(id)?.role || "trusted_existing",
      quality_score: readiness.find((entry) => entry?.id === id)?.quality_score ?? null
    }));

    const result = {
      schema: META_SCHEMA,
      version: 2,
      mode: "shadow",
      status,
      blocking_reasons: [...new Set(blockingReasons)].sort(),
      meta_confidence: confidence,
      quality,
      saturation: saturation?.schema === "aha_insight_saturation_v2"
        ? {
            state: saturation.state,
            ready_for_meta: saturation.ready_for_meta === true,
            guidance: saturation.guidance,
            metrics: clone(saturation.metrics || {})
          }
        : { state: "unavailable", ready_for_meta: false, guidance: "no_saturation_action", metrics: {} },
      semantic_basis: {
        trusted_insights: trustedInsightRoles,
        dominant_concepts: dominantConcepts(trusted),
        resonance_links: resonanceLinks,
        equivalence_links: equivalentLinks,
        rules: {
          resonance_is_duplicate_support: false,
          equivalence_requires_verified_dedupe_eligibility: true,
          blocked_insights_can_drive_meta_claims: false
        }
      },
      legacy_context: legacyProfile
        ? {
            available: true,
            subject_id: legacyProfile.subject_id || null,
            legacy_meta_readiness: legacyProfile.meta_insight?.readiness || null,
            legacy_avg_saturation: legacyProfile.global?.avg_saturation ?? null,
            authoritative_for_v2_quality: false,
            authoritative_for_v2_saturation: false
          }
        : {
            available: false,
            subject_id: null,
            legacy_meta_readiness: null,
            legacy_avg_saturation: null,
            authoritative_for_v2_quality: false,
            authoritative_for_v2_saturation: false
          },
      policy: {
        production_gate_authority: false,
        meta_write: false,
        chamber_write: false,
        canonical_write: false,
        projection_write: false,
        persistent_write: false,
        legacy_meta_behavior_changed: false
      }
    };
    result.summary = summaryFor(result);
    return clone(result);
  }

  function buildFromMetaEngine(input = {}) {
    const engine = global.MetaInsightsEngine;
    if (!engine?.buildUserMetaProfile) {
      const result = build({
        meta_profile: null,
        v2_insights: input.v2_insights || input.insights,
        saturation: input.saturation || input.saturation_v2
      });
      result.status = "blocked";
      result.blocking_reasons = [...new Set([...(result.blocking_reasons || []), "meta_insights_engine_unavailable"])].sort();
      result.summary = summaryFor(result);
      return clone(result);
    }
    const profile = engine.buildUserMetaProfile(input.chamber, input.subject_id || input.subjectId);
    return build({
      meta_profile: profile,
      v2_insights: input.v2_insights || input.insights,
      saturation: input.saturation || input.saturation_v2
    });
  }

  const api = Object.freeze({
    META_SCHEMA,
    build,
    buildFromMetaEngine
  });
  global.AHAMetaQualityV2 = api;
  global.AHAModuleApi?.register?.("metaQualityV2", api, {
    version: 2,
    legacyGlobal: "AHAMetaQualityV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
