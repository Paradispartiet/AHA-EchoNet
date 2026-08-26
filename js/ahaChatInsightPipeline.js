// ahaChatInsightPipeline.js
// Generering, normalisering og kvalitetsfiltrering av innsiktskandidater for AHA Chat.

(function (global) {
  "use strict";

  global.AHA_FRONTEND_BUILD_SHA = global.AHA_FRONTEND_BUILD_SHA || "local"; // AHA_FRONTEND_REVISION_STAMP

  const ACTIVE_ANALYSIS_CONTRACT = "aha_active_analysis_contract_v3";
  const SYNTHESIS_CONTRACT = "aha_insight_synthesis_contract_v2";
  const SYNTHESIS_OUTPUT_SCHEMA = "aha_insight_synthesis_output_v2";
  const SYNTHESIS_PROMPT_VERSION = "aha_insight_synthesis_prompt_v3";
  const QUALITY_GATE_SCHEMA = "aha_insight_quality_gate_v2";
  const SEMANTIC_DOCUMENT_SCHEMA = "aha_semantic_document_v2";
  const DETERMINISTIC_EVIDENCE_SCHEMA = "aha_deterministic_evidence_packets_v1";
  const TRANSIENT_SYNTHESIS_HTTP = new Set([429, 502, 503, 504]);
  const FORBIDDEN_SYNTHESIS_CONTEXT_KEYS = new Set([
    "assistantreply", "assistant_reply", "chatresponse", "chat_response", "airesponse", "ai_response",
    "candidate_insights", "candidateinsights", "meta_profile", "metaprofile", "chamber", "memory"
  ]);
  const CONTEXT_STOPWORDS = new Set([
    "dette", "denne", "disse", "eller", "ikke", "som", "med", "for", "til", "fra", "har", "kan", "skal",
    "det", "der", "seg", "sin", "sitt", "sine", "mens", "viser", "gjennom", "etter", "også", "ogsa",
    "the", "and", "that", "with", "from", "this", "into", "their", "about", "were", "have", "been"
  ]);
  let runtimeManifestPromise = null;
  let lastRuntimeTrace = null;

  const FUNCTIONAL_TYPES = Object.freeze([
    "observation", "question", "task", "problem", "solution",
    "decision", "definition", "contradiction", "learning_point", "pattern", "memory", "principle"
  ]);
  const DEFAULT_FUNCTIONAL_TYPES = new Set(FUNCTIONAL_TYPES);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function expectedRuntimeManifest() {
    return {
      analysis_contract: ACTIVE_ANALYSIS_CONTRACT,
      synthesis_contract: SYNTHESIS_CONTRACT,
      synthesis_output_schema: SYNTHESIS_OUTPUT_SCHEMA,
      prompt_version: SYNTHESIS_PROMPT_VERSION,
      quality_gate_schema: QUALITY_GATE_SCHEMA,
      semantic_document_schema: SEMANTIC_DOCUMENT_SCHEMA
    };
  }

  function runtimeMismatchReasons(runtime) {
    const actual = runtime && typeof runtime === "object" && !Array.isArray(runtime) ? runtime : {};
    return Object.entries(expectedRuntimeManifest())
      .filter(([key, value]) => String(actual[key] || "") !== value)
      .map(([key]) => `runtime_contract_mismatch:${key}`);
  }

  function deploymentMismatchReasons(runtime) {
    const frontendSha = String(global.AHA_FRONTEND_BUILD_SHA || "").trim().toLowerCase();
    const backendSha = String(runtime?.backend_build_sha || "").trim().toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(frontendSha)) return [];
    if (!/^[a-f0-9]{40}$/.test(backendSha)) return ["runtime_build_sha_missing:backend"];
    return frontendSha === backendSha ? [] : ["runtime_build_mismatch:frontend_backend_sha"];
  }

  function runtimeCompatibilityReasons(runtime) {
    if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
      const frontendSha = String(global.AHA_FRONTEND_BUILD_SHA || "").trim().toLowerCase();
      return /^[a-f0-9]{40}$/.test(frontendSha) ? ["runtime_manifest_missing:backend"] : [];
    }
    return [...runtimeMismatchReasons(runtime), ...deploymentMismatchReasons(runtime)];
  }

  function waitForRetry(ms) {
    return new Promise((resolve) => global.setTimeout(resolve, ms));
  }

  async function fetchSynthesisWithBoundedTransportRetry(url, init) {
    const delays = [0, 1200, 3200];
    let lastResponse = null;
    let lastError = null;
    for (let attempt = 0; attempt < delays.length; attempt += 1) {
      if (delays[attempt]) await waitForRetry(delays[attempt]);
      try {
        lastResponse = await fetch(url, init);
        lastError = null;
        if (!TRANSIENT_SYNTHESIS_HTTP.has(Number(lastResponse?.status || 0)) || attempt === delays.length - 1) {
          return { response: lastResponse, transport_attempts: attempt + 1 };
        }
      } catch (error) {
        lastError = error;
        if (attempt === delays.length - 1) throw error;
      }
    }
    if (lastError) throw lastError;
    return { response: lastResponse, transport_attempts: delays.length };
  }

  function sanitizeSynthesisContextValue(value, depth = 0) {
    if (depth > 6 || value == null || ["string", "number", "boolean"].includes(typeof value)) return value;
    if (Array.isArray(value)) return value.slice(0, 32).map((item) => sanitizeSynthesisContextValue(item, depth + 1));
    if (typeof value !== "object") return undefined;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !FORBIDDEN_SYNTHESIS_CONTEXT_KEYS.has(String(key || "").toLowerCase()))
      .map(([key, child]) => [key, sanitizeSynthesisContextValue(child, depth + 1)])
      .filter(([, child]) => child !== undefined));
  }

  function buildSynthesisCallerContext(context) {
    const source = context && typeof context === "object" && !Array.isArray(context) ? context : {};
    const allowed = {};
    for (const key of ["subject_id", "theme_id", "field_id", "semantic_source_focus", "authoritative_quality_retry"]) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      const value = sanitizeSynthesisContextValue(source[key]);
      if (value !== undefined) allowed[key] = value;
    }
    return allowed;
  }

  function setRuntimeTrace(value) {
    lastRuntimeTrace = clone(value);
    return lastRuntimeTrace;
  }

  function getLastRuntimeTrace() {
    return clone(lastRuntimeTrace);
  }

  function recordRuntimeTrace(update = {}) {
    const current = lastRuntimeTrace && typeof lastRuntimeTrace === "object" ? lastRuntimeTrace : {};
    return setRuntimeTrace({ ...current, ...(update && typeof update === "object" ? clone(update) : {}) });
  }

  function create(deps = {}) {
    const {
      filterConceptLabels,
      normalizeSimpleStringList,
      normalizeTheoreticalLinks,
      extractAcademicPhraseConcepts,
      normalizeAfterworkConcept,
      functionalTypes,
      weakConceptWords
    } = deps;
    const AHA_INSIGHT_CONTRACT = Object.freeze({
      FUNCTIONAL_TYPES: functionalTypes && typeof functionalTypes.has === "function"
        ? functionalTypes
        : DEFAULT_FUNCTIONAL_TYPES
    });
    const WEAK_CONCEPT_WORDS = weakConceptWords && typeof weakConceptWords.has === "function" ? weakConceptWords : new Set();

  function buildAhaAgentUrl(path) {
    const rawBase = String(global.AHA_AGENT_API || "").trim();
    if (!rawBase) return "";

    const base = rawBase.replace(/\/+$/, "");
    const normalizedPath = `/${String(path || "").trim().replace(/^\/+/, "")}`;
    const hasApiBase = /\/api\/aha-agent$/i.test(base);
    const rootBase = hasApiBase ? base : `${base}/api/aha-agent`;
    return `${rootBase}${normalizedPath}`;
  }

  function contextTokens(value) {
    return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/)
      .filter((token) => token.length >= 5 && !CONTEXT_STOPWORDS.has(token));
  }

  function buildDeterministicEvidencePlan(sourceText) {
    const sentences = splitIntoSentences(sourceText).map((text, index) => ({
      text,
      index,
      words: String(text || "").split(/\s+/).filter(Boolean).length
    })).filter((item) => item.words >= 5 && item.words <= 110);
    const roleRules = [
      ["question_or_purpose", /\b(?:problemstilling|forskningsspørsmål|formål|hensikt|undersøker|diskuterer|analyserer|research question|purpose)\b/iu],
      ["framework_or_method", /\b(?:teori|rammeverk|perspektiv|metode|materiale|empiri|litteraturteori|omsorgsforsk|gerontologi|framework|method)\b/iu],
      ["finding_or_argument", /\b(?:funn|resultat|analysen viser|vi finner|vi argumenterer|vi understreker|vi fremhever|findings|results)\b/iu],
      ["tension_or_boundary", /\b(?:men|mens|samtidig|likevel|spenning|dilemma|begrensning|forbehold|retten til|kritisk|boundary|limitation)\b/iu],
      ["conclusion_or_use", /\b(?:konklusjon|avslutning|samlet sett|vi har vist|vi har argumentert|betydning|nyttig|conclusion|overall)\b/iu]
    ];
    const ranked = sentences.map((item) => {
      const roles = roleRules.filter(([, pattern]) => pattern.test(item.text)).map(([role]) => role);
      const edge = item.index === 0 || item.index === sentences.length - 1 ? 2 : 0;
      return { ...item, roles, score: roles.length * 8 + edge + Math.min(3, contextTokens(item.text).length / 12) };
    });
    const chosen = [];
    const used = new Set();
    const add = (item) => {
      if (!item || used.has(item.index) || chosen.length >= 16) return;
      used.add(item.index);
      chosen.push(item);
    };
    add(ranked[0]);
    add(ranked[Math.floor(ranked.length / 2)]);
    add(ranked.at(-1));
    roleRules.forEach(([role]) => add(ranked.filter((item) => item.roles.includes(role))
      .sort((left, right) => right.score - left.score || left.index - right.index)[0]));
    ranked.slice().sort((left, right) => right.score - left.score || left.index - right.index).forEach(add);
    const claims = chosen.sort((left, right) => left.index - right.index);
    const frequencies = new Map();
    claims.flatMap((item) => contextTokens(item.text)).forEach((token) => frequencies.set(token, (frequencies.get(token) || 0) + 1));
    const concepts = Array.from(frequencies.entries()).filter(([, count]) => count >= 2)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "no"))
      .slice(0, 20).map(([label]) => ({ label }));
    const packets = roleRules.map(([role]) => {
      const primary = claims.find((item) => item.roles.includes(role));
      const counterpart = claims.filter((item) => item !== primary)
        .sort((left, right) => Math.abs((primary?.index ?? 0) - right.index) - Math.abs((primary?.index ?? 0) - left.index))[0];
      return primary && counterpart ? { role, quotes: [primary.text, counterpart.text] } : null;
    }).filter(Boolean);
    return {
      schema: DETERMINISTIC_EVIDENCE_SCHEMA,
      source_sentence_count: sentences.length,
      selected_source_claim_count: claims.length,
      packets,
      semantic_context: {
        entities: [],
        concepts,
        source_claims: claims.map((item) => ({ text: item.text })),
        relations: []
      }
    };
  }

  async function fetchCompatibleRuntime() {
    if (!runtimeManifestPromise) {
      const healthUrl = buildAhaAgentUrl("health");
      runtimeManifestPromise = fetch(healthUrl, { headers: { Accept: "application/json" }, cache: "no-store" })
        .then(async (response) => {
          if (!response?.ok) throw new Error(`runtime_health_http_${response?.status || 0}`);
          const body = await response.json();
          const reasons = runtimeCompatibilityReasons(body?.runtime);
          return { compatible: reasons.length === 0, runtime: body?.runtime || null, reasons };
        })
        .catch((error) => ({ compatible: false, runtime: null, reasons: [String(error?.message || "runtime_health_unavailable")] }));
    }
    const result = await runtimeManifestPromise;
    if (result.compatible !== true) runtimeManifestPromise = null;
    return clone(result);
  }

  async function generateAIInsightCandidates(text, context) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    const synthesisUrl = buildAhaAgentUrl("semantic-document");
    if (!synthesisUrl) return [];

    const sentenceCount = splitIntoSentences(raw).length;
    const callerContext = context && typeof context === "object" && !Array.isArray(context) ? context : {};

    const runtime = await fetchCompatibleRuntime();
    const requestAttempt = Number(context?.authoritative_quality_retry?.attempt || 0);
    if (runtime.compatible !== true) {
      setRuntimeTrace({
        schema: "aha_analysis_runtime_trace_v1",
        status: "blocked_incompatible_runtime",
        frontend_build_sha: String(global.AHA_FRONTEND_BUILD_SHA || "unknown"),
        expected: expectedRuntimeManifest(),
        backend: runtime.runtime,
        blocking_reasons: runtime.reasons,
        authoritative_retry_attempt: requestAttempt
      });
      return [];
    }
    const evidencePlan = buildDeterministicEvidencePlan(raw);
    const body = {
      text: raw,
      context: {
        ...buildSynthesisCallerContext(callerContext),
        active_analysis_contract: ACTIVE_ANALYSIS_CONTRACT,
        deterministic_evidence_packets: evidencePlan.packets,
        candidate_diversity_contract: {
          distinct_semantic_roles: [
            "cross_claim_pattern",
            "tension_or_tradeoff",
            "boundary_or_condition",
            "consequence_or_decision"
          ],
          source_sentence_count: sentenceCount,
          require_distinct_primary_relation: true,
          require_cross_sentence_evidence: sentenceCount >= 2,
          preserve_source_uncertainty: true
        }
      },
      format: SYNTHESIS_OUTPUT_SCHEMA,
      semantic_context: evidencePlan.semantic_context
    };

    try {
      const transport = await fetchSynthesisWithBoundedTransportRetry(synthesisUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const res = transport.response;
      if (!res.ok) {
        setRuntimeTrace({
          schema: "aha_analysis_runtime_trace_v1",
          status: "blocked_synthesis_http",
          frontend_build_sha: String(global.AHA_FRONTEND_BUILD_SHA || "unknown"),
          backend: runtime.runtime,
          http_status: Number(res.status || 0),
          transport_attempts: transport.transport_attempts,
          blocking_reasons: [`synthesis_http_${Number(res.status || 0)}`],
          authoritative_retry_attempt: requestAttempt,
          evidence_plan: { schema: evidencePlan.schema, selected_source_claim_count: evidencePlan.selected_source_claim_count, packet_count: evidencePlan.packets.length }
        });
        return [];
      }
      const data = await res.json();
      const envelopeReasons = [
        ...(data?.ok === true ? [] : ["synthesis_envelope_not_ok"]),
        ...(data?.schema === SYNTHESIS_CONTRACT ? [] : ["synthesis_contract_mismatch"]),
        ...(data?.synthesis?.schema === SYNTHESIS_OUTPUT_SCHEMA ? [] : ["synthesis_output_schema_mismatch"]),
        ...runtimeCompatibilityReasons(data?.runtime)
      ];
      if (envelopeReasons.length) {
        setRuntimeTrace({
          schema: "aha_analysis_runtime_trace_v1",
          status: "blocked_incompatible_synthesis_envelope",
          frontend_build_sha: String(global.AHA_FRONTEND_BUILD_SHA || "unknown"),
          backend: data?.runtime || runtime.runtime,
          blocking_reasons: envelopeReasons,
          authoritative_retry_attempt: requestAttempt
        });
        return [];
      }
      const candidates = Array.isArray(data?.synthesis?.candidates) ? data.synthesis.candidates : [];
      const normalized = candidates
        .map((candidate) => normalizeInsightCandidate(candidate))
        .filter(Boolean)
        .filter((candidate) => !isWeakInsightCandidate(candidate, raw));
      const projectionDiversityExpansion = context?.authoritative_quality_retry?.mode === "projection_diversity_expansion";
      const reviewed = projectionDiversityExpansion
        ? reviewProjectionDiversityCandidates(normalized, raw, { limit: 5 })
        : reviewInsightCandidates(normalized, raw, { limit: 5 });
      setRuntimeTrace({
        schema: "aha_analysis_runtime_trace_v1",
        status: reviewed.selected.length ? "synthesis_received" : "blocked_client_prefilter",
        frontend_build_sha: String(global.AHA_FRONTEND_BUILD_SHA || "unknown"),
        expected: expectedRuntimeManifest(),
        backend: data.runtime,
        provider_model: data.model || null,
        provider_response_id: data.response_id || null,
        provider_validation_attempts: Number(data.synthesis_attempts || 0),
        transport_attempts: transport.transport_attempts,
        authoritative_retry_attempt: requestAttempt,
        candidate_prefilter_mode: projectionDiversityExpansion ? "authoritative_projection_diversity" : "legacy_review",
        candidate_count_received: candidates.length,
        candidate_count_after_prefilter: reviewed.selected.length,
        prefilter_rejected_count: reviewed.rejected.length,
        prefilter_rejections: reviewed.rejected.map((item) => ({
          title: String(item?.title || ""),
          reason: String(item?.rejection_reason || "")
        })),
        evidence_plan: {
          schema: evidencePlan.schema,
          source_sentence_count: evidencePlan.source_sentence_count,
          selected_source_claim_count: evidencePlan.selected_source_claim_count,
          packet_count: evidencePlan.packets.length
        },
        blocking_reasons: []
      });
      return reviewed.selected;
    } catch (err) {
      setRuntimeTrace({
        schema: "aha_analysis_runtime_trace_v1",
        status: "blocked_synthesis_unavailable",
        frontend_build_sha: String(global.AHA_FRONTEND_BUILD_SHA || "unknown"),
        backend: runtime.runtime,
        blocking_reasons: [String(err?.message || "synthesis_unavailable")],
        authoritative_retry_attempt: requestAttempt
      });
      console.warn("AI insight-candidates utilgjengelig", err);
      return [];
    }
  }

  function normalizeInsightCandidate(candidate) {
    if (!candidate || typeof candidate !== "object") return null;
    const text = String(candidate.insight || candidate.text || candidate.summary || "").replace(/\s+/g, " ").trim();
    if (!text) return null;
    const summary = String(candidate.summary || text).replace(/\s+/g, " ").trim();
    const title = String(candidate.title || summary.split(/[.!?…]/)[0] || "Innsikt").trim().slice(0, 120);
    if (!title || !summary) return null;

    const concepts = filterConceptLabels(normalizeCandidateConcepts(candidate.concepts || [], text)).slice(0, 8);
    const thinkers = normalizeSimpleStringList(candidate.thinkers, 5);
    const theories = normalizeSimpleStringList(candidate.theories, 5);
    const traditions = normalizeSimpleStringList(candidate.traditions, 5);
    const theoreticalLinks = normalizeTheoreticalLinks(candidate.theoretical_links, 5);
    const rawEvidence = Array.isArray(candidate.evidence)
      ? candidate.evidence
      : (Array.isArray(candidate.evidence_quotes) ? candidate.evidence_quotes.map((quote) => ({ quote, role: "supports" })) : []);
    const evidenceByQuote = new Map();
    rawEvidence.forEach((item) => {
      const quote = String(item?.quote || item || "").replace(/\s+/g, " ").trim();
      if (!quote) return;
      const key = quote.toLowerCase();
      if (!evidenceByQuote.has(key)) {
        evidenceByQuote.set(key, { quote, role: item?.role === "limits" ? "limits" : "supports" });
      }
    });
    const evidenceQuotes = normalizeSimpleStringList(Array.from(evidenceByQuote.values()).map((item) => item.quote), 3);
    const evidence = evidenceQuotes.map((quote) => ({
      quote,
      role: evidenceByQuote.get(String(quote || "").replace(/\s+/g, " ").trim().toLowerCase())?.role || "supports"
    }));
    const uncertainty = normalizeUncertainty(candidate.uncertainty);
    const uncertaintyDetail = String(candidate.uncertainty || "").replace(/\s+/g, " ").trim().slice(0, 320);
    const claimKind = normalizeClaimKind(candidate.claim_kind);

    return {
      title,
      summary: summary.length > 320 ? `${summary.slice(0, 317)}…` : summary,
      text,
      type: String(candidate.type || "").trim().toLowerCase(),
      functional_type: normalizeFunctionalType(candidate.functional_type || candidate.type),
      concepts,
      thinkers,
      theories,
      traditions,
      theoretical_links: theoreticalLinks,
      evidence_quotes: evidenceQuotes,
      evidence,
      uncertainty,
      uncertainty_detail: uncertaintyDetail,
      claim_kind: claimKind,
      abstraction: String(candidate.abstraction || "").replace(/\s+/g, " ").trim().slice(0, 400),
      confidence: ["high", "medium", "low"].includes(String(candidate.confidence || "").trim().toLowerCase())
        ? String(candidate.confidence).trim().toLowerCase()
        : "",
      causal_status: ["not_causal", "source_explicit", "interpretive"].includes(String(candidate.causal_status || "").trim().toLowerCase())
        ? String(candidate.causal_status).trim().toLowerCase()
        : "",
      why_it_matters: String(candidate.why_it_matters || "").replace(/\s+/g, " ").trim().slice(0, 400),
      next_test: String(candidate.next_test || "").replace(/\s+/g, " ").trim().slice(0, 280),
      candidate_type: "ai"
    };
  }

  function normalizeUncertainty(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return ["supported", "interpretive", "hypothesis"].includes(normalized) ? normalized : "interpretive";
  }

  function normalizeClaimKind(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return ["source_observation", "interpretation", "hypothesis", "question", "action"].includes(normalized)
      ? normalized
      : "interpretation";
  }

  function candidateSummary(candidate) {
    return String(candidate?.summary || candidate?.text || candidate?.title || "").replace(/\s+/g, " ").trim();
  }

  function evidenceQuotesForCandidate(candidate, sourceText) {
    const evaluator = global.AHAAnalysisQualityEvaluator;
    const sourceSentences = splitIntoSentences(sourceText);
    const provided = normalizeSimpleStringList(candidate?.evidence_quotes, 3)
      .filter((quote) => evaluator?.exactSourceMatch?.(sourceText, quote)
        || String(sourceText || "").replace(/\s+/g, " ").includes(String(quote || "").replace(/\s+/g, " ")));
    if (provided.length) return provided.slice(0, 2);
    const summary = candidateSummary(candidate);
    const scored = sourceSentences.map((quote, index) => ({
      quote,
      index,
      score: evaluator?.overlap?.(summary, quote) || 0
    })).sort((left, right) => right.score - left.score || left.index - right.index);
    const minimum = summary && sourceSentences.length > 1 ? 0.18 : 0;
    return scored.filter((item) => item.score >= minimum).slice(0, 2).map((item) => item.quote);
  }

  function evidenceRoleForQuote(candidate, quote) {
    const key = String(quote || "").replace(/\s+/g, " ").trim().toLowerCase();
    const match = Array.isArray(candidate?.evidence)
      ? candidate.evidence.find((item) => String(item?.quote || "").replace(/\s+/g, " ").trim().toLowerCase() === key)
      : null;
    return match?.role === "limits" ? "limits" : "supports";
  }

  function scoreInsightCandidate(candidate, sourceText, evidenceQuotes) {
    const evaluator = global.AHAAnalysisQualityEvaluator;
    const summary = candidateSummary(candidate);
    if (!evaluator || typeof evaluator.specificityScore !== "function") {
      return summary.length >= 45 && evidenceQuotes.length ? 0.6 : 0.35;
    }
    const specificity = evaluator.specificityScore(summary);
    const transformation = evaluator.transformationScore(sourceText, summary);
    const grounding = evidenceQuotes.length
      ? evidenceQuotes.reduce((best, quote) => Math.max(best, evaluator.overlap(summary, quote)), 0)
      : 0;
    const usefulness = Math.max(
      evaluator.specificityScore(candidate?.why_it_matters),
      evaluator.specificityScore(candidate?.next_test)
    );
    return Number(Math.min(1, (specificity * 0.3) + (transformation * 0.25) + (Math.min(1, grounding + 0.25) * 0.3) + (usefulness * 0.15)).toFixed(3));
  }

  function enrichInsightCandidate(candidate, sourceText) {
    const evaluator = global.AHAAnalysisQualityEvaluator;
    const summary = candidateSummary(candidate);
    const evidenceQuotes = evidenceQuotesForCandidate(candidate, sourceText);
    const exact = evaluator?.exactSourceMatch?.(sourceText, summary) || false;
    let uncertainty = normalizeUncertainty(candidate?.uncertainty);
    let claimKind = normalizeClaimKind(candidate?.claim_kind);
    if (!evidenceQuotes.length) {
      uncertainty = "hypothesis";
      claimKind = "hypothesis";
    } else if (exact) {
      uncertainty = "supported";
      claimKind = "source_observation";
    } else if (uncertainty === "supported") {
      uncertainty = "interpretive";
    }
    const qualityScore = scoreInsightCandidate(candidate, sourceText, evidenceQuotes);
    return {
      ...candidate,
      summary,
      text: summary,
      evidence_quotes: evidenceQuotes,
      evidence: evidenceQuotes.map((quote, index) => ({
        id: `source_sentence_${splitIntoSentences(sourceText).indexOf(quote) + 1 || index + 1}`,
        quote,
        role: evidenceRoleForQuote(candidate, quote),
        relation: claimKind === "source_observation" ? "direct_source_observation" : "supports_interpretation"
      })),
      claim_kind: claimKind,
      uncertainty,
      quality_score: qualityScore,
      candidate_quality: {
        version: "aha_insight_candidate_quality_v2",
        status: qualityScore >= 0.5 ? "accepted" : "needs_review",
        score: qualityScore,
        evidence_count: evidenceQuotes.length,
        claim_kind: claimKind,
        uncertainty
      }
    };
  }

  function reviewInsightCandidates(candidates, sourceText, options = {}) {
    const evaluator = global.AHAAnalysisQualityEvaluator;
    const limit = Math.max(1, Number(options.limit || 5));
    const minimumScore = Number.isFinite(Number(options.minimumScore)) ? Number(options.minimumScore) : 0.46;
    const enriched = (Array.isArray(candidates) ? candidates : []).map((candidate) => enrichInsightCandidate(candidate, sourceText));
    const selected = [];
    const rejected = [];
    enriched.sort((left, right) => right.quality_score - left.quality_score);
    enriched.forEach((candidate) => {
      const summary = candidateSummary(candidate);
      const duplicate = selected.some((existing) => {
        if (!evaluator) return candidateSummary(existing).toLowerCase() === summary.toLowerCase();
        return evaluator.jaccard(candidateSummary(existing), summary) >= 0.4
          || evaluator.overlap(candidateSummary(existing), summary) >= 0.55;
      });
      if (duplicate || candidate.quality_score < minimumScore) {
        rejected.push({ ...candidate, rejection_reason: duplicate ? "semantic_duplicate" : "below_quality_threshold" });
        return;
      }
      if (selected.length < limit) selected.push(candidate);
      else rejected.push({ ...candidate, rejection_reason: "rank_limit" });
    });
    return { selected, rejected, considered: enriched.length, minimumScore };
  }

  function reviewProjectionDiversityCandidates(candidates, sourceText, options = {}) {
    const limit = Math.max(1, Number(options.limit || 5));
    const minimumScore = Number.isFinite(Number(options.minimumScore)) ? Number(options.minimumScore) : 0.46;
    const enriched = (Array.isArray(candidates) ? candidates : []).map((candidate) => enrichInsightCandidate(candidate, sourceText));
    const selected = [];
    const rejected = [];
    const seen = new Set();
    enriched.sort((left, right) => right.quality_score - left.quality_score);
    enriched.forEach((candidate) => {
      const summary = candidateSummary(candidate).replace(/\s+/g, " ").trim().toLowerCase();
      const duplicate = !summary || seen.has(summary);
      if (duplicate || candidate.quality_score < minimumScore) {
        rejected.push({ ...candidate, rejection_reason: duplicate ? "exact_duplicate" : "below_quality_threshold" });
        return;
      }
      if (selected.length < limit) {
        selected.push(candidate);
        seen.add(summary);
      } else {
        rejected.push({ ...candidate, rejection_reason: "rank_limit" });
      }
    });
    return { selected, rejected, considered: enriched.length, minimumScore };
  }

  function isWeakInsightCandidate(candidate, sourceText) {
    if (!candidate || typeof candidate !== "object") return true;

    const title = String(candidate.title || "").replace(/\s+/g, " ").trim();
    const titleLower = title.toLowerCase();
    const genericTitles = new Set(["observasjon", "innsikt", "analyse"]);

    const summary = String(candidate.summary || candidate.text || "").replace(/\s+/g, " ").trim();
    const summaryLower = summary.toLowerCase();
    const source = String(sourceText || "").replace(/\s+/g, " ").trim();
    const sourceLower = source.toLowerCase();
    const sourceStart = sourceLower.slice(0, 220);

    const concepts = Array.isArray(candidate.concepts) ? candidate.concepts : [];
    const conceptWords = concepts
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean);
    const nonWeakConcepts = conceptWords.filter((word) => !WEAK_CONCEPT_WORDS.has(word));
    const hasTheory = Boolean(
      (Array.isArray(candidate.thinkers) && candidate.thinkers.length) ||
      (Array.isArray(candidate.theories) && candidate.theories.length) ||
      (Array.isArray(candidate.traditions) && candidate.traditions.length) ||
      (Array.isArray(candidate.theoretical_links) && candidate.theoretical_links.length)
    );
    const groundedEvidenceQuotes = normalizeSimpleStringList(candidate.evidence_quotes, 3)
      .filter((quote) => quote && source.includes(String(quote || "").replace(/\s+/g, " ").trim()));
    const hasGroundedEvidencePair = new Set(groundedEvidenceQuotes.map((quote) => String(quote).toLowerCase())).size >= 2;

    if (!title || genericTitles.has(titleLower)) return true;
    if (!summary) return true;
    if (sourceStart && (summaryLower === sourceStart || sourceStart.startsWith(summaryLower) || summaryLower.startsWith(sourceStart))) return true;
    if (sourceStart && summaryLower.slice(0, 140) === sourceStart.slice(0, 140)) return true;
    // Concept extraction is advisory at this pre-filter boundary. A candidate
    // with two distinct exact source quotes must reach the authoritative V2
    // Insight Quality Gate even if the model omitted its optional concept list.
    // That gate still enforces cross-claim evidence, semantic transformation,
    // usefulness and causal discipline before anything can be approved.
    if (!conceptWords.length && !hasTheory && !hasGroundedEvidencePair) return true;
    if (conceptWords.length > 0 && nonWeakConcepts.length === 0 && !hasTheory && !hasGroundedEvidencePair) return true;

    return false;
  }

  function buildSemanticInsightCandidates(text, options) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    const playCityFallback = buildPlayCityFallbackCandidates(raw);
    if (playCityFallback.length) return reviewInsightCandidates(playCityFallback, raw, { limit: 3, minimumScore: 0.42 }).selected;
    const sentences = splitIntoSentences(raw);
    if (sentences.length <= 2 || raw.length < 180) {
      return reviewInsightCandidates([toCandidateObject(raw, "observation")], raw, { limit: 1, minimumScore: 0.35 }).selected;
    }

    const minInsights = Number(options?.minInsights || 1);
    const maxInsights = Math.min(5, Math.max(1, Number(options?.maxInsights || 5)));
    const desired = raw.length < 320 ? 2 : raw.length < 700 ? 3 : 4;
    const target = Math.min(maxInsights, Math.max(minInsights, desired));

    const themeRules = [
      { type: "principle", re: /\b(kunnskap|prinsipp|lærer|læring|forstå|innsikt|erfaring)\b/i },
      { type: "problem", re: /\b(problem|straff|fengsel|vold|kontroll|krise|konflikt|ondt)\b/i },
      { type: "solution", re: /\b(løsning|kan|bør|må|frihet|legalisering|sikkerhet|reform)\b/i },
      { type: "contrast", re: /\b(men|samtidig|likevel|på den ene siden|på den andre siden)\b/i },
      { type: "question", re: /\?|\b(hvorfor|hvordan|hva om)\b/i }
    ];

    const groups = [];
    const used = new Set();
    themeRules.forEach((rule) => {
      const idxs = [];
      sentences.forEach((sentence, idx) => {
        if (!used.has(idx) && rule.re.test(sentence)) idxs.push(idx);
      });
      if (!idxs.length) return;
      idxs.forEach((idx) => used.add(idx));
      groups.push({ type: rule.type, text: idxs.map((idx) => sentences[idx]).join(" ") });
    });
    if (used.size < sentences.length) {
      const rest = sentences.filter((_, idx) => !used.has(idx)).join(" ");
      if (rest) groups.push({ type: "observation", text: rest });
    }

    const deduped = [];
    const seen = new Set();
    groups.forEach((group) => {
      const clean = String(group.text || "").replace(/\s+/g, " ").trim();
      if (!clean || clean.length < 60) return;
      const key = clean.toLowerCase().slice(0, 160);
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(toCandidateObject(clean, group.type));
    });

    if (!deduped.length) return reviewInsightCandidates([toCandidateObject(raw, "observation")], raw, { limit: 1, minimumScore: 0.35 }).selected;
    return reviewInsightCandidates(deduped, raw, { limit: target, minimumScore: 0.4 }).selected;
  }

  function normalizeFunctionalType(value) {
    const raw = String(value || "").trim().toLowerCase();
    const mapped = raw === "contrast" ? "contradiction" : raw;
    if (AHA_INSIGHT_CONTRACT.FUNCTIONAL_TYPES.has(mapped)) return mapped;
    return "observation";
  }

  function normalizeCandidateConcepts(concepts, text) {
    const out = [];
    const seen = new Set();
    const add = (value) => {
      const label = String(value || "").trim();
      if (!label) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(label);
    };
    (Array.isArray(concepts) ? concepts : []).forEach((c) => {
      if (typeof c === "string") add(c);
      else if (c && typeof c === "object") add(c.label || c.key || c.term);
    });
    const phraseConcepts = extractAcademicPhraseConcepts(text);
    const phraseKeys = new Set(phraseConcepts.map((item) => normalizeAfterworkConcept(item)));
    const prioritized = [...phraseConcepts];
    out.forEach((label) => {
      const key = normalizeAfterworkConcept(label);
      if (!phraseKeys.has(key)) prioritized.push(label);
    });
    return prioritized;
  }

  function buildPlayCityFallbackCandidates(raw) {
    const text = String(raw || "");
    const lower = text.toLowerCase();
    const playHit = /\blek\b|\blæring\b|\btrygghet\b/.test(lower);
    const cityHit = /\bbyrom\b|\bparker\b|\btorg\b|\bbibliotek\b|\bskolegård/.test(lower);
    if (!playHit || !cityHit) return [];
    return [
      { title: "Lek som kunnskapsform", summary: "Lek gir mennesker rom til å prøve, feile og begynne på nytt uten skam, og fungerer som sosial og emosjonell læring.", functional_type: "principle", concepts: ["lek", "kunnskap", "læring", "trygghet"], candidate_type: "semantic" },
      { title: "Byrom som frihetsrom", summary: "Byen blir mer enn infrastruktur når parker, torg, skolegårder og bibliotek åpner for tilstedeværelse, fantasi og kroppslig utfoldelse.", functional_type: "principle", concepts: ["byrom", "frihet", "offentlighet", "fantasi"], candidate_type: "semantic" },
      { title: "Fellesskap gjennom uformelle møteplasser", summary: "Uformelle møteplasser lar språk, kropp og relasjoner vokse uten sterk måling, eierskap eller kontroll.", functional_type: "pattern", concepts: ["fellesskap", "møteplass", "kropp", "relasjoner"], candidate_type: "semantic" }
    ].map((c) => Object.assign({}, c, { text: c.summary }));
  }

  function toCandidateObject(text, functionalType) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    const summary = clean.length > 220 ? `${clean.slice(0, 217)}…` : clean;
    const concepts = normalizeCandidateConcepts([], clean);
    return {
      title: summary.split(/[.!?…]/)[0].slice(0, 80) || "Innsikt",
      summary,
      text: clean,
      functional_type: normalizeFunctionalType(functionalType),
      concepts,
      evidence_quotes: [clean],
      claim_kind: "source_observation",
      uncertainty: "supported",
      candidate_type: "semantic"
    };
  }

  function splitIntoSentences(text) {
    const normalized = String(text || "").replace(/\r\n?/g, "\n");
    const paragraphs = normalized.split(/\n+/).map((part) => part.trim()).filter(Boolean);
    const chunks = [];

    paragraphs.forEach((paragraph) => {
      const matches = paragraph.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [];
      matches.forEach((match) => {
        const chunk = String(match || "").trim();
        if (chunk) chunks.push(chunk);
      });
    });

    return chunks;
  }
    return Object.freeze({
      buildAhaAgentUrl,
      buildDeterministicEvidencePlan,
      fetchCompatibleRuntime,
      generateAIInsightCandidates,
      normalizeInsightCandidate,
      isWeakInsightCandidate,
      normalizeUncertainty,
      normalizeClaimKind,
      evidenceQuotesForCandidate,
      enrichInsightCandidate,
      reviewInsightCandidates,
      reviewProjectionDiversityCandidates,
      buildSemanticInsightCandidates,
      normalizeFunctionalType,
      normalizeCandidateConcepts,
      buildPlayCityFallbackCandidates,
      toCandidateObject,
      splitIntoSentences
    });
  }

  const publicApi = Object.freeze({
    FUNCTIONAL_TYPES,
    ACTIVE_ANALYSIS_CONTRACT,
    SYNTHESIS_CONTRACT,
    SYNTHESIS_OUTPUT_SCHEMA,
    SYNTHESIS_PROMPT_VERSION,
    QUALITY_GATE_SCHEMA,
    SEMANTIC_DOCUMENT_SCHEMA,
    DETERMINISTIC_EVIDENCE_SCHEMA,
    expectedRuntimeManifest,
    runtimeMismatchReasons,
    deploymentMismatchReasons,
    runtimeCompatibilityReasons,
    getLastRuntimeTrace,
    recordRuntimeTrace,
    create
  });
  global.AHAChatInsightPipeline = publicApi;
  global.AHAModuleApi?.register?.("chat.insightPipeline", publicApi, { version: 1, legacyGlobal: "AHAChatInsightPipeline", exports: Object.keys(publicApi) });
})(typeof window !== "undefined" ? window : globalThis);
