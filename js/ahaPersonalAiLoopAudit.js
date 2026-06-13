// AHA Personal AI Loop Audit – kompakt readiness-audit for personal AI-sløyfen.
(function (global) {
  "use strict";
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function checkSemanticRetrieval() {
    const api = global.AHASemanticRetrieval;
    if (!api?.getSemanticStatus) return { ok: false, available: false, indexedItems: 0, vectorModel: "", sampleSemanticResults: 0, hybridReady: false };
    const status = asObject(api.getSemanticStatus());
    const sample = api.searchSemanticKnowledge ? api.searchSemanticKnowledge("AHA personlig innsikt", { limit: 3, minScore: 0 }) : { results: [] };
    const hybrid = api.hybridSearch ? api.hybridSearch("AHA personlig innsikt", { limit: 3, minScore: 0 }) : { results: [] };
    const hasReasons = asArray(sample.results).some((item) => asArray(item.reasons).length);
    return { ok: Boolean(status.available && (asArray(hybrid.results).length || asArray(sample.results).length)), available: Boolean(status.available), indexedItems: Number(status.indexedItems) || 0, vectorModel: String(status.vectorModel || ""), sampleSemanticResults: asArray(sample.results).length, hybridReady: Boolean(asArray(hybrid.results).length), hasReasons };
  }
  function runAudit() {
    const semanticRetrieval = checkSemanticRetrieval();
    let score = 0;
    if (semanticRetrieval.available) score += 5;
    if (semanticRetrieval.hybridReady) score += 10;
    if (semanticRetrieval.hasReasons) score += 5;
    return { generatedAt: new Date().toISOString(), score, semanticRetrieval };
  }
  global.AHAPersonalAiLoopAudit = { checkSemanticRetrieval, runAudit };
})(typeof window !== "undefined" ? window : globalThis);
