// AHA Personal AI Memory Control – brukerens lokale kontroll over eksisterende Meta Insights Memory.
// Ingen ny store: handlingene skriver kun ny feedback til AHAMetaInsightsMemory og bygger avledede retrieval-indekser på nytt.
(function (global) {
  "use strict";

  const doc = global.document;
  const USER_RESPONSES = new Set(["stemmer", "delvis", "feil", "utdatert"]);
  const RESPONSE_LABELS = Object.freeze({
    stemmer: "Bekreftet som riktig.",
    delvis: "Markert som delvis riktig og må nyanseres.",
    feil: "Markert som feil og holdes utenfor personlig grunnlag.",
    utdatert: "Markert som ikke lenger relevant og holdes utenfor personlig grunnlag."
  });

  function asText(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

  function refreshDerivedIndexes() {
    const result = { lexical: false, semantic: false };
    try {
      if (typeof global.AHAPersonalRetrieval?.refreshRetrievalIndex === "function") {
        global.AHAPersonalRetrieval.refreshRetrievalIndex();
        result.lexical = true;
      }
    } catch {}
    try {
      if (typeof global.AHASemanticRetrieval?.refreshSemanticIndex === "function") {
        global.AHASemanticRetrieval.refreshSemanticIndex();
        result.semantic = true;
      }
    } catch {}
    return result;
  }

  function refreshSurfaces() {
    let selfKnowledge = null;
    try { selfKnowledge = global.AHAPersonalAiSelfKnowledge?.refresh?.() || null; } catch {}
    try { global.AHAPersonalAiDashboard?.refresh?.(); } catch {}
    return selfKnowledge;
  }

  function applyFeedback(input = {}) {
    const api = global.AHAMetaInsightsMemory;
    if (!api || typeof api.addFeedback !== "function") {
      return { ok: false, error: "memory_unavailable" };
    }

    const claimText = asText(input.claimText);
    const response = asText(input.response).toLowerCase();
    const note = asText(input.note);
    if (!claimText) return { ok: false, error: "missing_claim_text" };
    if (!USER_RESPONSES.has(response)) {
      return { ok: false, error: "invalid_response", allowed: [...USER_RESPONSES] };
    }

    const latest = asObject(api.getLatestFeedbackForClaim?.(claimText));
    const saved = api.addFeedback({
      claimId: asText(latest.claimId),
      claimText,
      response,
      note,
      basis: Array.isArray(latest.basis) ? latest.basis : [],
      confidence: Number(latest.confidence) || 0,
      sessionId: asText(latest.sessionId)
    });
    if (!saved?.ok) return saved || { ok: false, error: "save_failed" };

    const refreshed = refreshDerivedIndexes();
    const model = refreshSurfaces();
    return {
      ok: true,
      response,
      claimText,
      noteStored: Boolean(note),
      message: RESPONSE_LABELS[response],
      refreshed,
      model
    };
  }

  function handleClick(event) {
    const button = event.target?.closest?.("[data-personal-ai-memory-response]");
    if (!button) return;
    const item = button.closest?.("[data-personal-ai-memory-claim]");
    if (!item) return;

    const claimText = asText(item.getAttribute("data-personal-ai-memory-claim"));
    const response = asText(button.getAttribute("data-personal-ai-memory-response"));
    const note = asText(item.querySelector?.("[data-personal-ai-memory-note]")?.value);
    const status = item.querySelector?.("[data-personal-ai-memory-item-status]");
    const result = applyFeedback({ claimText, response, note });

    if (status) status.textContent = result.ok ? result.message : "Kunne ikke oppdatere denne selvinnsikten.";
  }

  function bind() {
    const host = doc?.getElementById?.("personal-ai-self-knowledge");
    if (!host || host.dataset.personalAiMemoryControlBound === "1") return false;
    host.dataset.personalAiMemoryControlBound = "1";
    host.addEventListener("click", handleClick);
    return true;
  }

  function init() { bind(); }

  const api = {
    USER_RESPONSES: [...USER_RESPONSES],
    RESPONSE_LABELS,
    applyFeedback,
    refreshDerivedIndexes,
    bind
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AHAPersonalAiMemoryControl = api;

  if (doc) doc.readyState === "loading" ? doc.addEventListener("DOMContentLoaded", init) : init();
})(typeof window !== "undefined" ? window : globalThis);
