// ahaChatInsightPipeline.js
// Generering, normalisering og kvalitetsfiltrering av innsiktskandidater for AHA Chat.

(function (global) {
  "use strict";

  const FUNCTIONAL_TYPES = Object.freeze([
    "observation", "question", "task", "problem", "solution",
    "decision", "definition", "contradiction", "learning_point", "pattern", "memory", "principle"
  ]);
  const DEFAULT_FUNCTIONAL_TYPES = new Set(FUNCTIONAL_TYPES);

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

  async function generateAIInsightCandidates(text, context) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    const insightCandidatesUrl = buildAhaAgentUrl("insight-candidates");
    if (!insightCandidatesUrl) return [];

    const sentenceCount = splitIntoSentences(raw).length;
    const callerContext = context && typeof context === "object" && !Array.isArray(context) ? context : {};

    const body = {
      text: raw,
      context: {
        ...callerContext,
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
      format: "insight_candidates_v1"
    };

    try {
      const res = await fetch(insightCandidatesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const data = await res.json();
      const candidates = Array.isArray(data?.candidates) ? data.candidates : (Array.isArray(data) ? data : []);
      const normalized = candidates
        .map((candidate) => normalizeInsightCandidate(candidate))
        .filter(Boolean)
        .filter((candidate) => !isWeakInsightCandidate(candidate, raw));
      return reviewInsightCandidates(normalized, raw, { limit: 5 }).selected;
    } catch (err) {
      console.warn("AI insight-candidates utilgjengelig", err);
      return [];
    }
  }

  function normalizeInsightCandidate(candidate) {
    if (!candidate || typeof candidate !== "object") return null;
    const text = String(candidate.text || candidate.summary || "").replace(/\s+/g, " ").trim();
    if (!text) return null;
    const summary = String(candidate.summary || text).replace(/\s+/g, " ").trim();
    const title = String(candidate.title || summary.split(/[.!?…]/)[0] || "Innsikt").trim().slice(0, 120);
    if (!title || !summary) return null;

    const concepts = filterConceptLabels(normalizeCandidateConcepts(candidate.concepts || [], text)).slice(0, 8);
    const thinkers = normalizeSimpleStringList(candidate.thinkers, 5);
    const theories = normalizeSimpleStringList(candidate.theories, 5);
    const traditions = normalizeSimpleStringList(candidate.traditions, 5);
    const theoreticalLinks = normalizeTheoreticalLinks(candidate.theoretical_links, 5);
    const evidenceQuotes = normalizeSimpleStringList(candidate.evidence_quotes, 3);
    const uncertainty = normalizeUncertainty(candidate.uncertainty);
    const claimKind = normalizeClaimKind(candidate.claim_kind);

    return {
      title,
      summary: summary.length > 320 ? `${summary.slice(0, 317)}…` : summary,
      text,
      functional_type: normalizeFunctionalType(candidate.functional_type),
      concepts,
      thinkers,
      theories,
      traditions,
      theoretical_links: theoreticalLinks,
      evidence_quotes: evidenceQuotes,
      uncertainty,
      claim_kind: claimKind,
      why_it_matters: String(candidate.why_it_matters || "").replace(/\s+/g, " ").trim().slice(0, 280),
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

    if (!title || genericTitles.has(titleLower)) return true;
    if (!summary) return true;
    if (sourceStart && (summaryLower === sourceStart || sourceStart.startsWith(summaryLower) || summaryLower.startsWith(sourceStart))) return true;
    if (sourceStart && summaryLower.slice(0, 140) === sourceStart.slice(0, 140)) return true;
    if (!conceptWords.length && !hasTheory) return true;
    if (conceptWords.length > 0 && nonWeakConcepts.length === 0 && !hasTheory) return true;

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
      generateAIInsightCandidates,
      normalizeInsightCandidate,
      isWeakInsightCandidate,
      normalizeUncertainty,
      normalizeClaimKind,
      evidenceQuotesForCandidate,
      enrichInsightCandidate,
      reviewInsightCandidates,
      buildSemanticInsightCandidates,
      normalizeFunctionalType,
      normalizeCandidateConcepts,
      buildPlayCityFallbackCandidates,
      toCandidateObject,
      splitIntoSentences
    });
  }

  const publicApi = Object.freeze({ FUNCTIONAL_TYPES, create });
  global.AHAChatInsightPipeline = publicApi;
  global.AHAModuleApi?.register?.("chat.insightPipeline", publicApi, { version: 1, legacyGlobal: "AHAChatInsightPipeline", exports: Object.keys(publicApi) });
})(typeof window !== "undefined" ? window : globalThis);
