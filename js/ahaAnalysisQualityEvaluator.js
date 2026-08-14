// ahaAnalysisQualityEvaluator.js
// Deterministisk kvalitetskontrakt for synlige AHA-analyser.
//
// Modulen vurderer om output er kildebundet, spesifikk, forskjellig fra ren
// parafrase, handlingsrettet, ikke-repetitiv og ærlig om usikkerhet. Den gjør
// ingen nettverkskall og lagrer ingen brukerdata.

(function (global) {
  "use strict";

  const VERSION = "aha_analysis_quality_contract_v1";
  const STOP_WORDS = new Set([
    "og", "eller", "men", "som", "det", "den", "de", "et", "en", "til", "fra", "for", "med",
    "på", "av", "i", "om", "at", "er", "var", "blir", "ble", "kan", "skal", "vil", "har", "hadde",
    "dette", "disse", "der", "her", "hvordan", "hva", "hvorfor", "hvilken", "hvilke", "teksten",
    "analyse", "analysen", "tema", "viser", "peker", "handler", "fungerer", "gjennom", "mellom"
  ]);
  const GENERIC_PATTERNS = [
    /undersøk temaet videre/i,
    /forstå temaet/i,
    /se nærmere på/i,
    /lær mer om/i,
    /vurder dette nærmere/i,
    /temaet er viktig/i,
    /teksten handler om ulike perspektiver/i,
    /velg ett kildebundet neste steg/i
  ];
  const ACTION_VERBS = [
    "avgrens", "sammenlign", "kontroller", "knytt", "skill", "identifiser", "dokumenter", "forklar",
    "undersøk", "test", "mål", "angi", "legg", "formuler", "spor", "avklar", "vurder", "marker",
    "finn", "bygg", "prøv", "før", "kartlegg", "etterprøv"
  ];
  const THRESHOLDS = Object.freeze({
    sourceGrounding: 0.58,
    specificity: 0.52,
    transformation: 0.45,
    actionability: 0.5,
    distinctness: 0.72,
    uncertaintyHonesty: 1
  });

  function clamp(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function round(value) {
    return Number(clamp(value).toFixed(3));
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function words(value, includeStopWords = false) {
    return normalize(value).split(" ")
      .filter((word) => word.length > 1 && (includeStopWords || !STOP_WORDS.has(word)))
      .map((word) => word.length > 7 ? word.replace(/(?:ene|ende|ingen|en|et|er|a)$/u, "") : word);
  }

  function unique(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).filter((value) => {
      const key = normalize(value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function sentences(value) {
    return String(value || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/u).map((item) => item.trim()).filter(Boolean);
  }

  function tokenSet(value) {
    return new Set(words(value));
  }

  function overlap(left, right) {
    const a = tokenSet(left);
    const b = tokenSet(right);
    if (!a.size || !b.size) return 0;
    let shared = 0;
    a.forEach((token) => { if (b.has(token)) shared += 1; });
    return shared / Math.max(1, Math.min(a.size, b.size));
  }

  function jaccard(left, right) {
    const a = tokenSet(left);
    const b = tokenSet(right);
    if (!a.size || !b.size) return 0;
    let shared = 0;
    a.forEach((token) => { if (b.has(token)) shared += 1; });
    return shared / Math.max(1, new Set([...a, ...b]).size);
  }

  function exactSourceMatch(sourceText, value) {
    const source = ` ${normalize(sourceText)} `;
    const candidate = normalize(value);
    return Boolean(candidate) && source.includes(` ${candidate} `);
  }

  function bestSourceOverlap(sourceText, value) {
    return sentences(sourceText).reduce((best, sentence) => Math.max(best, overlap(sentence, value)), 0);
  }

  function specificityScore(value) {
    const text = String(value || "").trim();
    const contentWords = words(text);
    if (!contentWords.length) return 0;
    const genericHits = GENERIC_PATTERNS.filter((pattern) => pattern.test(text)).length;
    const detailSignals = contentWords.filter((word) => word.length >= 7).length
      + ((text.match(/\b\d+(?:[.,]\d+)?\b/g) || []).length * 2)
      + ((text.match(/\b[A-ZÆØÅ][\p{L}-]{2,}\b/gu) || []).length * 0.5);
    const lengthScore = Math.min(1, contentWords.length / 11);
    const detailScore = Math.min(1, detailSignals / 5);
    return round((lengthScore * 0.55) + (detailScore * 0.45) - (genericHits * 0.45));
  }

  function transformationScore(sourceText, insight) {
    const text = String(insight || "").trim();
    if (!text) return 0;
    if (exactSourceMatch(sourceText, text)) return 0.18;
    const lexical = bestSourceOverlap(sourceText, text);
    // En god innsikt skal være kildebundet, men ikke bare kopiere én setning.
    if (lexical >= 0.92) return 0.3;
    if (lexical >= 0.35) return round(0.72 + ((0.92 - lexical) * 0.25));
    if (lexical >= 0.18) return 0.68;
    return 0.45;
  }

  function actionabilityScore(actions, sourceText) {
    const list = unique(actions).slice(0, 5);
    if (!list.length) return 0;
    const scores = list.map((action) => {
      const normalized = normalize(action);
      const startsConcrete = ACTION_VERBS.some((verb) => normalized.startsWith(`${normalize(verb)} `));
      const nonGeneric = !GENERIC_PATTERNS.some((pattern) => pattern.test(action));
      const sourceOverlap = bestSourceOverlap(sourceText, action);
      const detail = specificityScore(action);
      return clamp((startsConcrete ? 0.35 : 0) + (nonGeneric ? 0.2 : 0) + (Math.min(0.25, sourceOverlap * 0.35)) + (detail * 0.2));
    });
    return round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }

  function distinctnessScore(values) {
    const list = unique(values);
    if (list.length < 2) return list.length ? 1 : 0;
    let worstSimilarity = 0;
    for (let left = 0; left < list.length; left += 1) {
      for (let right = left + 1; right < list.length; right += 1) {
        worstSimilarity = Math.max(worstSimilarity, jaccard(list[left], list[right]));
      }
    }
    return round(1 - worstSimilarity);
  }

  function confidenceValues(canonical) {
    const confidence = canonical && typeof canonical.confidence === "object" ? canonical.confidence : {};
    // historyGoLinks kan med rette ha lav sikkerhet selv når selve analysen er
    // solid. Usikkerhetsporten gjelder de synlige tolkningene, ikke valgfrie
    // integrasjonskoblinger.
    const coreKeys = ["contentType", "domain", "theme", "mainTension", "keyInsight"];
    return coreKeys.filter((key) => Object.prototype.hasOwnProperty.call(confidence, key))
      .map((key) => Number(confidence[key]))
      .filter(Number.isFinite);
  }

  function uncertaintyHonestyScore(canonical, sourceText) {
    const values = confidenceValues(canonical);
    const minimum = values.length ? Math.min(...values) : 0;
    const warnings = unique(canonical?.warnings);
    const fragmentary = words(sourceText, true).length < 12;
    const needsWarning = minimum < 0.55 || fragmentary;
    return needsWarning ? (warnings.length ? 1 : 0) : 1;
  }

  function buildClaimRegister(payload, sourceText) {
    const safe = payload && typeof payload === "object" ? payload : {};
    const canonical = safe.canonicalAnalysis && typeof safe.canonicalAnalysis === "object"
      ? safe.canonicalAnalysis
      : safe;
    const claims = [];
    (Array.isArray(safe.sortItems) ? safe.sortItems : []).forEach((item, index) => {
      const value = String(item?.text || "").trim();
      if (!value) return;
      claims.push({
        id: `evidence_${index + 1}`,
        kind: "source_evidence",
        label: String(item?.label || `Kildebelegg ${index + 1}`).trim(),
        text: value,
        sourceMatch: exactSourceMatch(sourceText, value) ? "verbatim" : "unverified",
        sourceOverlap: round(bestSourceOverlap(sourceText, value))
      });
    });
    [
      ["theme", "Tema", canonical?.theme],
      ["tension", "Hovedspenning", canonical?.mainTension],
      ["insight", "Viktigste innsikt", canonical?.keyInsight]
    ].forEach(([id, label, value]) => {
      if (!String(value || "").trim()) return;
      claims.push({
        id,
        kind: "interpretation",
        label,
        text: String(value).trim(),
        sourceMatch: exactSourceMatch(sourceText, value) ? "verbatim" : "interpreted",
        sourceOverlap: round(bestSourceOverlap(sourceText, value))
      });
    });
    unique(canonical?.suggestedActions || safe.path).forEach((value, index) => {
      claims.push({ id: `action_${index + 1}`, kind: "proposed_action", label: `Neste steg ${index + 1}`, text: value });
    });
    unique(canonical?.warnings).forEach((value, index) => {
      claims.push({ id: `warning_${index + 1}`, kind: "uncertainty", label: "Usikkerhet", text: value });
    });
    return claims;
  }

  function sourceGroundingScore(payload, sourceText, claims) {
    const evidence = claims.filter((claim) => claim.kind === "source_evidence");
    const evidenceScore = evidence.length
      ? evidence.reduce((sum, claim) => sum + (claim.sourceMatch === "verbatim" ? 1 : claim.sourceOverlap), 0) / evidence.length
      : 0;
    const canonical = payload?.canonicalAnalysis || payload || {};
    const interpretationValues = [canonical.theme, canonical.mainTension, canonical.keyInsight].filter(Boolean);
    const interpretationScore = interpretationValues.length
      ? interpretationValues.reduce((sum, value) => sum + Math.min(1, bestSourceOverlap(sourceText, value) + 0.2), 0) / interpretationValues.length
      : 0;
    return round((evidenceScore * 0.68) + (interpretationScore * 0.32));
  }

  function evaluateAnalysis(payload, sourceText, options = {}) {
    const safe = payload && typeof payload === "object" ? payload : {};
    const canonical = safe.canonicalAnalysis && typeof safe.canonicalAnalysis === "object" ? safe.canonicalAnalysis : safe;
    const evidencePayload = safe.canonicalAnalysis ? safe : { ...safe, canonicalAnalysis: canonical };
    const claims = buildClaimRegister(evidencePayload, sourceText);
    const actions = unique(canonical.suggestedActions || safe.path);
    const insight = String(canonical.keyInsight || safe?.ahaSer?.viktigsteInnsikt || "").trim();
    const visibleValues = [canonical.theme, canonical.mainTension, insight, ...actions].filter(Boolean);
    const dimensions = {
      sourceGrounding: sourceGroundingScore(evidencePayload, sourceText, claims),
      specificity: round(visibleValues.length ? visibleValues.reduce((sum, value) => sum + specificityScore(value), 0) / visibleValues.length : 0),
      transformation: transformationScore(sourceText, insight),
      actionability: actionabilityScore(actions, sourceText),
      distinctness: distinctnessScore(visibleValues),
      uncertaintyHonesty: uncertaintyHonestyScore(canonical, sourceText)
    };
    const thresholds = { ...THRESHOLDS, ...(options.thresholds || {}) };
    const failures = Object.entries(thresholds)
      .filter(([name, minimum]) => Number(dimensions[name] || 0) < Number(minimum))
      .map(([name, minimum]) => ({ dimension: name, score: dimensions[name], minimum }));
    const critical = [];
    if (!insight) critical.push("missing_key_insight");
    if (!actions.length) critical.push("missing_suggested_action");
    if (!claims.some((claim) => claim.kind === "source_evidence" && claim.sourceMatch === "verbatim")) critical.push("missing_verbatim_source_evidence");
    if (dimensions.uncertaintyHonesty < 1) critical.push("uncertainty_not_disclosed");
    const overall = round(Object.values(dimensions).reduce((sum, score) => sum + score, 0) / Object.keys(dimensions).length);
    const status = critical.length ? "blocked" : failures.length ? "needs_review" : "passed";
    return {
      version: VERSION,
      status,
      overall,
      dimensions,
      thresholds,
      failures,
      critical,
      claims,
      summary: status === "passed"
        ? "Kildebundet, spesifikk og handlingsrettet analyse."
        : status === "blocked"
          ? "Analysen må rettes før den kan behandles som kvalitetssikret."
          : "Analysen er brukbar, men minst én kvalitetsdimensjon bør forbedres."
    };
  }

  function selectBestCandidates(candidates, sourceText, options = {}) {
    const limit = Math.max(1, Number(options.limit || 3));
    const minimumScore = Number.isFinite(Number(options.minimumScore)) ? Number(options.minimumScore) : 0.48;
    const selected = [];
    const rejected = [];
    (Array.isArray(candidates) ? candidates : []).forEach((candidate, index) => {
      const item = candidate && typeof candidate === "object" ? candidate : { text: candidate };
      const text = String(item.text || item.summary || item.title || "").trim();
      if (!text) {
        rejected.push({ index, reason: "empty" });
        return;
      }
      const score = round((specificityScore(text) * 0.45) + (transformationScore(sourceText, text) * 0.35) + (Math.min(1, bestSourceOverlap(sourceText, text) + 0.2) * 0.2));
      const duplicate = selected.some((entry) => jaccard(entry.text, text) >= 0.4 || overlap(entry.text, text) >= 0.5);
      if (duplicate || score < minimumScore) {
        rejected.push({ index, text, score, reason: duplicate ? "duplicate" : "low_quality" });
        return;
      }
      selected.push({ ...item, text, qualityScore: score });
    });
    selected.sort((left, right) => right.qualityScore - left.qualityScore);
    return { selected: selected.slice(0, limit), rejected, considered: Array.isArray(candidates) ? candidates.length : 0 };
  }

  const api = Object.freeze({
    VERSION,
    THRESHOLDS,
    normalize,
    overlap,
    jaccard,
    exactSourceMatch,
    bestSourceOverlap,
    specificityScore,
    transformationScore,
    actionabilityScore,
    distinctnessScore,
    buildClaimRegister,
    evaluateAnalysis,
    selectBestCandidates
  });

  global.AHAAnalysisQualityEvaluator = api;
  global.AHAModuleApi?.register?.("analysis.qualityEvaluator", api, {
    version: 1,
    legacyGlobal: "AHAAnalysisQualityEvaluator",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
