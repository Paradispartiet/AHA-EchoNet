// metaInsightsMemory.js
// ─────────────────────────────────────────────
// AHA Meta Insights Memory – lagrer brukerbekreftet selvinnsikt lokalt.
// Feedback på AI-claims (stemmer/delvis/feil/viktig/utdatert) bygger en
// aktiv selvmodell som MetaInsightsAgent og MetaInsightsEngine kan bruke
// i senere meta-vurderinger. Alt er lokalt (localStorage) og read-only
// mot resten av AHA – ingen sync, ingen nettverkskall.
// ─────────────────────────────────────────────

(function (global) {
  "use strict";

  const STORAGE_KEY = "aha_meta_insights_memory_v1";
  const VERSION = "v1";
  const DERIVED_CACHE_KEYS = ["aha_personal_retrieval_index_v1", "aha_personal_semantic_index_v1"];
  const ALLOWED_RESPONSES = ["stemmer", "delvis", "feil", "viktig", "utdatert"];
  const RESPONSE_TO_BUCKET = {
    stemmer: "confirmedClaims",
    delvis: "partialClaims",
    feil: "rejectedClaims",
    viktig: "importantClaims",
    utdatert: "outdatedClaims"
  };

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function asText(value) { return String(value ?? "").trim(); }

  function normalizeClaimText(text) {
    return asText(text).replace(/\s+/g, " ").toLowerCase();
  }

  function makeId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function getStorage() {
    try { return global.localStorage || null; } catch { return null; }
  }

  function invalidateDerivedPersonalAiCaches() {
    const storage = getStorage();
    if (!storage) return 0;
    let removed = 0;
    DERIVED_CACHE_KEYS.forEach((key) => {
      try {
        if (storage.getItem(key) !== null) removed += 1;
        storage.removeItem(key);
      } catch {}
    });
    return removed;
  }

  function emptySelfModel() {
    return {
      confirmedClaims: [],
      partialClaims: [],
      rejectedClaims: [],
      importantClaims: [],
      outdatedClaims: [],
      activePatterns: [],
      activeProjects: [],
      activeTensions: []
    };
  }

  function emptyMemory() {
    return { version: VERSION, updatedAt: "", feedback: [], selfModel: emptySelfModel() };
  }

  function normalizeFeedbackEntry(entry) {
    const safe = asObject(entry);
    const response = normalizeClaimText(safe.response);
    return {
      id: asText(safe.id) || makeId("fb"),
      createdAt: asText(safe.createdAt) || new Date().toISOString(),
      source: asText(safe.source) || "meta_insights_ai",
      sessionId: asText(safe.sessionId),
      claimId: asText(safe.claimId),
      claimText: asText(safe.claimText),
      response,
      note: asText(safe.note),
      basis: asArray(safe.basis).map((item) => asText(item)).filter(Boolean),
      confidence: Number(safe.confidence) || 0
    };
  }

  function normalizeMemory(raw) {
    const safe = asObject(raw);
    const selfModelRaw = asObject(safe.selfModel);
    const base = emptySelfModel();
    const selfModel = {};
    Object.keys(base).forEach((key) => { selfModel[key] = asArray(selfModelRaw[key]); });
    return {
      version: VERSION,
      updatedAt: asText(safe.updatedAt),
      feedback: asArray(safe.feedback)
        .map(normalizeFeedbackEntry)
        .filter((entry) => entry.claimText && ALLOWED_RESPONSES.includes(entry.response)),
      selfModel
    };
  }

  function loadMemory() {
    const storage = getStorage();
    if (!storage) return emptyMemory();
    let raw = null;
    try { raw = storage.getItem(STORAGE_KEY); } catch { return emptyMemory(); }
    if (!raw) return emptyMemory();
    try { return normalizeMemory(JSON.parse(raw)); } catch { return emptyMemory(); }
  }

  function saveMemory(memory) {
    const normalized = normalizeMemory(memory);
    normalized.updatedAt = new Date().toISOString();
    try {
      getStorage()?.setItem(STORAGE_KEY, JSON.stringify(normalized));
      invalidateDerivedPersonalAiCaches();
    } catch {}
    return normalized;
  }

  // Bygger selfModel på nytt fra feedback-listen. Nyeste feedback vinner på
  // tvers av alle statusbøtter, slik at samme claim aldri kan være både f.eks.
  // bekreftet og avvist samtidig. Aktivt kuraterte spor beholdes separat.
  function updateSelfModelFromFeedback(memory) {
    const normalized = normalizeMemory(memory);
    const feedback = [...normalized.feedback].sort(
      (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
    );
    const selfModel = emptySelfModel();
    selfModel.activePatterns = asArray(normalized.selfModel.activePatterns);
    selfModel.activeProjects = asArray(normalized.selfModel.activeProjects);
    selfModel.activeTensions = asArray(normalized.selfModel.activeTensions);

    const seenClaims = new Set();
    feedback.forEach((entry) => {
      const bucket = RESPONSE_TO_BUCKET[entry.response];
      const key = normalizeClaimText(entry.claimText);
      if (!bucket || !key || seenClaims.has(key)) return;
      seenClaims.add(key);
      selfModel[bucket].push({
        claimId: entry.claimId,
        claimText: entry.claimText,
        basis: entry.basis,
        confidence: entry.confidence,
        sessionId: entry.sessionId,
        createdAt: entry.createdAt
      });
    });
    return selfModel;
  }

  function getLatestFeedbackForClaim(claimText, memoryArg) {
    const key = normalizeClaimText(claimText);
    if (!key) return null;
    const memory = memoryArg ? normalizeMemory(memoryArg) : loadMemory();
    return [...memory.feedback]
      .filter((entry) => normalizeClaimText(entry.claimText) === key)
      .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))[0] || null;
  }

  function addFeedback(entry) {
    const normalizedEntry = normalizeFeedbackEntry({ ...asObject(entry), id: "", createdAt: "", source: "meta_insights_ai" });
    if (!ALLOWED_RESPONSES.includes(normalizedEntry.response)) {
      return { ok: false, error: "invalid_response", allowed: [...ALLOWED_RESPONSES] };
    }
    if (!normalizedEntry.claimText) {
      return { ok: false, error: "missing_claim_text" };
    }
    const memory = loadMemory();
    memory.feedback.unshift(normalizedEntry);
    memory.selfModel = updateSelfModelFromFeedback(memory);
    const saved = saveMemory(memory);
    return { ok: true, entry: normalizedEntry, memory: saved };
  }

  // Erstatter formuleringen av en aktiv claim uten ny memory-store og uten et
  // mellomstadium der gammel og ny formulering er aktive samtidig. Den gamle
  // formuleringen blir eksplisitt utdatert, den nye arver gjeldende status,
  // og hele selvmodellen lagres én gang før retrieval-cachene ugyldiggjøres.
  function replaceClaim(oldClaimText, newClaimText, optionsArg) {
    const options = asObject(optionsArg);
    const oldText = asText(oldClaimText);
    const newText = asText(newClaimText);
    if (!oldText) return { ok: false, error: "missing_old_claim_text" };
    if (!newText) return { ok: false, error: "missing_new_claim_text" };
    if (normalizeClaimText(oldText) === normalizeClaimText(newText)) {
      return { ok: false, error: "unchanged_claim_text" };
    }

    const memory = loadMemory();
    const latest = getLatestFeedbackForClaim(oldText, memory);
    if (!latest) return { ok: false, error: "claim_not_found" };
    if (["feil", "utdatert"].includes(latest.response)) {
      return { ok: false, error: "claim_not_active" };
    }

    const requestedResponse = normalizeClaimText(options.response);
    const nextResponse = ALLOWED_RESPONSES.includes(requestedResponse) ? requestedResponse : latest.response;
    if (["feil", "utdatert"].includes(nextResponse)) {
      return { ok: false, error: "replacement_must_be_active" };
    }

    const baseMs = Date.parse(asText(options.createdAt)) || Date.now();
    const oldEntry = normalizeFeedbackEntry({
      ...latest,
      id: "",
      createdAt: new Date(baseMs).toISOString(),
      claimText: oldText,
      response: "utdatert",
      note: asText(options.note) || `Erstattet med: ${newText}`
    });
    const newEntry = normalizeFeedbackEntry({
      ...latest,
      id: "",
      createdAt: new Date(baseMs + 1).toISOString(),
      claimText: newText,
      response: nextResponse,
      note: asText(options.note),
      claimId: asText(latest.claimId)
    });

    memory.feedback.unshift(oldEntry);
    memory.feedback.unshift(newEntry);
    memory.selfModel = updateSelfModelFromFeedback(memory);
    const saved = saveMemory(memory);
    return { ok: true, oldEntry, newEntry, response: nextResponse, memory: saved };
  }

  function summarizeMemory(memoryArg) {
    const memory = memoryArg ? normalizeMemory(memoryArg) : loadMemory();
    const selfModel = updateSelfModelFromFeedback(memory);
    const feedbackCountBy = (response) => memory.feedback.filter((entry) => entry.response === response).length;
    return {
      totalFeedback: memory.feedback.length,
      confirmed: selfModel.confirmedClaims.length,
      partial: selfModel.partialClaims.length,
      rejected: selfModel.rejectedClaims.length,
      important: selfModel.importantClaims.length,
      outdated: selfModel.outdatedClaims.length,
      feedbackCounts: {
        confirmed: feedbackCountBy("stemmer"),
        partial: feedbackCountBy("delvis"),
        rejected: feedbackCountBy("feil"),
        important: feedbackCountBy("viktig"),
        outdated: feedbackCountBy("utdatert")
      },
      confirmedClaims: selfModel.confirmedClaims,
      partialClaims: selfModel.partialClaims,
      rejectedClaims: selfModel.rejectedClaims,
      importantClaims: selfModel.importantClaims,
      outdatedClaims: selfModel.outdatedClaims,
      activeSelfModel: selfModel
    };
  }

  // Kompakt minnepakke for MetaInsightsAgent.buildAgentContext().
  function buildMemoryPack(memoryArg) {
    const summary = summarizeMemory(memoryArg);
    const texts = (claims, limit) => asArray(claims).slice(0, limit).map((claim) => asText(claim?.claimText)).filter(Boolean);
    return {
      confirmed_claims: texts(summary.confirmedClaims, 8),
      partial_claims: texts(summary.partialClaims, 5),
      rejected_claims: texts(summary.rejectedClaims, 5),
      important_claims: texts(summary.importantClaims, 5),
      outdated_claims: texts(summary.outdatedClaims, 5),
      active_self_model: {
        confirmed_count: summary.confirmed,
        partial_count: summary.partial,
        rejected_count: summary.rejected,
        important_count: summary.important,
        outdated_count: summary.outdated,
        active_patterns: asArray(summary.activeSelfModel.activePatterns).slice(0, 5),
        active_projects: asArray(summary.activeSelfModel.activeProjects).slice(0, 5),
        active_tensions: asArray(summary.activeSelfModel.activeTensions).slice(0, 5)
      }
    };
  }

  const AHAMetaInsightsMemory = {
    STORAGE_KEY,
    DERIVED_CACHE_KEYS: [...DERIVED_CACHE_KEYS],
    ALLOWED_RESPONSES: [...ALLOWED_RESPONSES],
    loadMemory,
    saveMemory,
    addFeedback,
    replaceClaim,
    summarizeMemory,
    updateSelfModelFromFeedback,
    getLatestFeedbackForClaim,
    invalidateDerivedPersonalAiCaches,
    buildMemoryPack
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AHAMetaInsightsMemory;
  }
  if (global) {
    global.AHAMetaInsightsMemory = AHAMetaInsightsMemory;
  }
})(typeof window !== "undefined" ? window : this);