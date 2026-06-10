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
    try { getStorage()?.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch {}
    return normalized;
  }

  // Bygger selfModel på nytt fra feedback-listen. Nyeste feedback vinner,
  // og hver claim telles bare én gang per liste (dedup på normalisert tekst).
  function updateSelfModelFromFeedback(memory) {
    const normalized = normalizeMemory(memory);
    const feedback = [...normalized.feedback].sort(
      (a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
    );
    const selfModel = emptySelfModel();
    // Behold ev. manuelt kuraterte aktive mønstre/prosjekter/spenninger.
    selfModel.activePatterns = asArray(normalized.selfModel.activePatterns);
    selfModel.activeProjects = asArray(normalized.selfModel.activeProjects);
    selfModel.activeTensions = asArray(normalized.selfModel.activeTensions);

    const seen = { confirmedClaims: new Set(), partialClaims: new Set(), rejectedClaims: new Set(), importantClaims: new Set(), outdatedClaims: new Set() };
    feedback.forEach((entry) => {
      const bucket = RESPONSE_TO_BUCKET[entry.response];
      if (!bucket) return;
      const key = normalizeClaimText(entry.claimText);
      if (!key || seen[bucket].has(key)) return;
      seen[bucket].add(key);
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

  function summarizeMemory(memoryArg) {
    const memory = memoryArg ? normalizeMemory(memoryArg) : loadMemory();
    const selfModel = updateSelfModelFromFeedback(memory);
    const countBy = (response) => memory.feedback.filter((entry) => entry.response === response).length;
    return {
      totalFeedback: memory.feedback.length,
      confirmed: countBy("stemmer"),
      partial: countBy("delvis"),
      rejected: countBy("feil"),
      important: countBy("viktig"),
      outdated: countBy("utdatert"),
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
    ALLOWED_RESPONSES: [...ALLOWED_RESPONSES],
    loadMemory,
    saveMemory,
    addFeedback,
    summarizeMemory,
    updateSelfModelFromFeedback,
    buildMemoryPack
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AHAMetaInsightsMemory;
  }
  if (global) {
    global.AHAMetaInsightsMemory = AHAMetaInsightsMemory;
  }
})(typeof window !== "undefined" ? window : this);
