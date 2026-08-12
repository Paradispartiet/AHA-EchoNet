// ahaFagverkRuntime.js
// Browser-side grounding against the reviewed, runtime-active History Go Fagverk artifacts.
(function (global) {
  "use strict";

  const ACTIVE_MANIFEST_URL = "data/integrations/history-go-fagverk-release.runtime-active.json";
  const TOKEN_RE = /[a-zæøå0-9]+/gi;
  const STOPWORDS = new Set([
    "og", "i", "på", "av", "for", "til", "med", "som", "er", "en", "et", "den", "det", "de",
    "fra", "eller", "om", "kan", "skal", "må", "ved", "etter", "mellom", "gjennom", "ikke", "også",
    "blir", "ble", "har", "hadde", "sin", "sine", "dette", "disse", "hvordan", "hva", "hvilke"
  ]);

  let runtimePromise = null;
  let lastResult = null;

  function normalize(value) {
    return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function allTokens(value) {
    return new Set((normalize(value).match(TOKEN_RE) || []).map(normalize));
  }

  function contentTokens(value) {
    return new Set([...allTokens(value)].filter((token) => token.length > 2 && !STOPWORDS.has(token)));
  }

  function termPresent(message, tokens, term) {
    const normalizedTerm = normalize(term);
    if (!normalizedTerm) return false;
    if (normalizedTerm.includes(" ") || normalizedTerm.includes("-")) return message.includes(normalizedTerm);
    return tokens.has(normalizedTerm);
  }

  async function fetchJson(url) {
    const response = await global.fetch(url, { cache: "no-store" });
    if (!response?.ok) throw new Error(`Fagverk runtime fetch failed: ${url} (${response?.status || "unknown"})`);
    return response.json();
  }

  async function loadRuntime() {
    if (runtimePromise) return runtimePromise;
    runtimePromise = (async () => {
      const active = await fetchJson(ACTIVE_MANIFEST_URL);
      if (active?.schema !== "aha_history_go_fagverk_runtime_active_v2") throw new Error("Unsupported Fagverk runtime manifest");
      const entries = [];
      const policies = {};
      for (const [subjectId, config] of Object.entries(active.active_subjects || {})) {
        const corpus = await fetchJson(String(config?.corpus_path || ""));
        if (corpus?.schema !== "aha_history_go_fagverk_runtime_subject_corpus_v1") throw new Error(`${subjectId}: invalid runtime corpus schema`);
        if (corpus.subject_id !== subjectId || corpus.source_ref !== config.source_commit || corpus.corpus_sha256 !== config.corpus_sha256) {
          throw new Error(`${subjectId}: runtime corpus identity mismatch`);
        }
        if ((corpus.entries || []).length !== Number(config.chapter_count)) throw new Error(`${subjectId}: runtime chapter count mismatch`);
        entries.push(...(corpus.entries || []));
        if (config.policy_path) {
          const policy = await fetchJson(String(config.policy_path));
          if (policy?.schema !== "aha_history_go_fagverk_runtime_subject_policy_v1") throw new Error(`${subjectId}: invalid runtime policy schema`);
          if (policy.subject_id !== subjectId || policy.source_ref !== config.source_commit || policy.corpus_sha256 !== config.corpus_sha256) {
            throw new Error(`${subjectId}: runtime policy identity mismatch`);
          }
          policies[subjectId] = policy;
        }
      }
      if (entries.length !== Number(active.effective_entry_count)) throw new Error("Effective Fagverk runtime entry count mismatch");
      return { active, entries, policies };
    })().catch((error) => {
      runtimePromise = null;
      throw error;
    });
    return runtimePromise;
  }

  function policyScore(message, entry, policy) {
    const tokens = allTokens(message);
    const policyByTerm = new Map((policy.terms || []).map((item) => [normalize(item?.term), item]));
    const nonScoring = new Set((policy.global_non_scoring_terms || []).map(normalize));
    const rule = policy.chapter_rules?.[entry.chapter_id] || {};
    const weights = policy.default_weights || {};
    const candidates = new Map();
    const decisive = policy.policy_rules?.candidate_title_concept_support_terms !== "non_decisive_review_context_only";

    if (decisive) {
      [["title_terms", Number(weights.title_term || 5)], ["concept_terms", Number(weights.concept_term || 3)], ["support_terms", Number(weights.support_term || 1.5)]].forEach(([group, weight]) => {
        (entry[group] || []).forEach((rawTerm) => {
          const term = normalize(rawTerm);
          const current = candidates.get(term);
          if (term && (!current || weight > current.weight)) candidates.set(term, { group, weight });
        });
      });
    }
    (rule.supplemental_evidence_terms || []).forEach((item) => {
      const term = normalize(item?.term);
      const weight = Number(item?.weight || 0);
      const current = candidates.get(term);
      if (term && weight > 0 && (!current || weight > current.weight)) candidates.set(term, { group: "supplemental_evidence_terms", weight });
    });

    const contributions = [];
    for (const [term, candidate] of candidates) {
      if (!termPresent(message, tokens, term)) continue;
      const policyTerm = policyByTerm.get(term);
      const multiplier = nonScoring.has(term) ? 0 : (policyTerm ? Number(policyTerm.multiplier || 0) : 1);
      const contribution = candidate.weight * multiplier;
      if (contribution > 0) contributions.push({ term, contribution, group: candidate.group });
    }

    const threshold = policy.thresholds || {};
    const minimumReviewed = Number(threshold.minimum_reviewed_evidence_terms || 0);
    const reviewedCount = contributions.filter((item) => item.group === "supplemental_evidence_terms").length;
    const domainGate = policy.domain_gate || {};
    const domainEligible = domainGate.required !== true || (domainGate.terms || []).some((term) => termPresent(message, tokens, normalize(term)));
    const temporalGate = policy.temporal_gate || {};
    let yearMatched = false;
    if (temporalGate.required === true) {
      try { yearMatched = new RegExp(String(temporalGate.year_pattern || "\\b(?:1[0-9]{3}|20[0-9]{2})\\b")).test(message); } catch (_) { yearMatched = false; }
    }
    const temporalEligible = temporalGate.required !== true || yearMatched || (temporalGate.terms || []).some((term) => termPresent(message, tokens, normalize(term)));
    const anchors = (rule.required_anchor_terms || []).map(normalize).filter(Boolean);
    const anchorEligible = !anchors.length || anchors.some((term) => termPresent(message, tokens, term));
    const reviewedEligible = reviewedCount >= minimumReviewed;
    contributions.sort((a, b) => b.contribution - a.contribution || a.term.localeCompare(b.term, "nb"));
    return {
      eligible: domainEligible && temporalEligible && anchorEligible && reviewedEligible,
      score: Number(contributions.reduce((sum, item) => sum + item.contribution, 0).toFixed(3)),
      matched_terms: contributions.map((item) => item.term),
      minimum_score: Number(threshold.minimum_score || 6),
      minimum_terms: Number(threshold.minimum_terms || 2),
      ambiguity_margin: Number(threshold.ambiguity_margin || 3)
    };
  }

  function genericScore(message, entry) {
    const tokens = contentTokens(message);
    const seen = new Set();
    const contributions = [];
    [["title_terms", 5], ["concept_terms", 3], ["support_terms", 1.5]].forEach(([group, weight]) => {
      (entry[group] || []).forEach((rawTerm) => {
        const term = normalize(rawTerm);
        if (!term || seen.has(term) || !termPresent(message, tokens, term)) return;
        seen.add(term);
        contributions.push({ term, contribution: weight + (term.includes(" ") ? 1 : 0), group });
      });
    });
    if (contributions.length === 1 && !contributions[0].term.includes(" ")) contributions[0].contribution *= 0.35;
    contributions.sort((a, b) => b.contribution - a.contribution || a.term.localeCompare(b.term, "nb"));
    return {
      eligible: true,
      score: Number(contributions.reduce((sum, item) => sum + item.contribution, 0).toFixed(3)),
      matched_terms: contributions.map((item) => item.term),
      minimum_score: 8,
      minimum_terms: 2,
      ambiguity_margin: 3
    };
  }

  function passes(match) {
    return match.score >= match.minimum_score && match.matched_terms.length >= match.minimum_terms;
  }

  async function groundText(text) {
    const message = normalize(text);
    if (message.length < 24) return { status: "unsupported", reason: "source_too_short", matches: [] };
    const runtime = await loadRuntime();
    const matches = [];
    for (const entry of runtime.entries) {
      const policy = runtime.policies[entry.subject_id];
      const scored = policy ? policyScore(message, entry, policy) : genericScore(message, entry);
      if (!scored.eligible || scored.score <= 0) continue;
      matches.push({
        subject_id: String(entry.subject_id || ""),
        chapter_id: String(entry.chapter_id || ""),
        primary_domain_id: String(entry.primary_domain_id || entry.chapter_id || ""),
        title: String(entry.title || entry.chapter_id || ""),
        source_path: String(entry.source_path || ""),
        ...scored
      });
    }
    matches.sort((a, b) => b.score - a.score || a.subject_id.localeCompare(b.subject_id, "nb") || a.chapter_id.localeCompare(b.chapter_id, "nb"));
    if (!matches.length) return { status: "unsupported", reason: "no_fagverk_evidence", matches: [] };
    const top = matches[0];
    const second = matches[1];
    if (!passes(top)) return { status: "unsupported", reason: "insufficient_fagverk_evidence", matches: matches.slice(0, 3) };
    if (second && passes(second) && (top.score - second.score) < top.ambiguity_margin) {
      return { status: "ambiguous", reason: "multiple_chapters_close", matches: matches.slice(0, 3) };
    }
    const related = matches.slice(1).filter((item) => passes(item) && item.subject_id !== top.subject_id).slice(0, 2);
    return { status: "grounded", reason: "chapter_evidence_threshold_met", match: top, related_matches: related, matches: matches.slice(0, 3) };
  }

  function toSubjectMatches(grounding) {
    if (grounding?.status !== "grounded" || !grounding.match) return [];
    return [grounding.match, ...(grounding.related_matches || [])].map((match) => ({
      id: match.chapter_id,
      emne_id: match.chapter_id,
      chapter_id: match.chapter_id,
      subject_id: match.subject_id,
      subject_label: match.subject_id.charAt(0).toUpperCase() + match.subject_id.slice(1),
      title: match.title,
      primary_domain_id: match.primary_domain_id,
      score: match.score,
      matched_terms: [...(match.matched_terms || [])],
      source: "historygo_fagverk_runtime_active"
    }));
  }

  async function matchText(text) {
    const grounding = await groundText(text);
    lastResult = grounding;
    return toSubjectMatches(grounding);
  }

  function installSubjectEngineBridge() {
    const engine = global.AHASubjectEngine;
    if (!engine || typeof engine.matchText !== "function" || engine.__fagverkRuntimeInstalled) return false;
    const fallback = engine.matchText.bind(engine);
    engine.matchText = async function (text, options) {
      try {
        const grounding = await groundText(text);
        lastResult = grounding;
        const matches = toSubjectMatches(grounding);
        if (matches.length) return matches;
        if (grounding.status === "ambiguous") return [];
      } catch (error) {
        console.warn("AHA Fagverk runtime grounding feilet; bruker lokal Subject Engine-fallback.", error);
      }
      return fallback(text, options);
    };
    engine.__fagverkRuntimeInstalled = true;
    return true;
  }

  const api = { loadRuntime, groundText, matchText, toSubjectMatches, installSubjectEngineBridge, getLastResult: () => lastResult, _test: { normalize, allTokens, contentTokens, termPresent, policyScore, genericScore, passes } };
  global.AHAFagverkRuntime = api;
  installSubjectEngineBridge();

  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
