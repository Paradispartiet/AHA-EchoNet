const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function makeStorage(seed = {}) {
  const map = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
  return {
    get length() { return map.size; },
    key(index) { return [...map.keys()][index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); },
    clear() { map.clear(); }
  };
}

function loadScript(context, relativePath) {
  const source = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
  vm.runInContext(source, context, { filename: relativePath });
}

function createRuntime() {
  const localStorage = makeStorage();
  const document = {
    readyState: "loading",
    addEventListener() {},
    getElementById() { return null; }
  };
  const window = { localStorage, document };
  const context = vm.createContext({
    window,
    document,
    localStorage,
    console,
    Blob,
    URL: { createObjectURL() { return "blob:test"; }, revokeObjectURL() {} },
    setTimeout() {},
    clearTimeout() {}
  });
  return { context, window, localStorage };
}

const runtime = createRuntime();
const { context, window, localStorage } = runtime;

[
  "js/metaInsightsMemory.js",
  "js/ahaPersonalRetrieval.js",
  "js/ahaSemanticRetrieval.js",
  "js/ahaChatPersonalContext.js",
  "js/ahaPersonalAiSelfKnowledge.js",
  "js/ahaPersonalAiMemoryControl.js"
].forEach((file) => loadScript(context, file));

const claim = "Jeg bygger Fjellprosjekt Nordlys i Tromsø";
const query = "Hvordan går Fjellprosjekt Nordlys?";

// 1) A claim explicitly confirmed by the user becomes Personal AI grounding.
const confirmed = window.AHAMetaInsightsMemory.addFeedback({
  claimId: "claim_nordlys",
  claimText: claim,
  response: "stemmer",
  note: "Dette stemmer."
});
assert.equal(confirmed.ok, true);
window.AHAPersonalRetrieval.refreshRetrievalIndex();
window.AHASemanticRetrieval.refreshSemanticIndex();

let summary = window.AHAMetaInsightsMemory.summarizeMemory();
assert.equal(summary.confirmedClaims.some((item) => item.claimText === claim), true);
assert.equal(summary.rejectedClaims.some((item) => item.claimText === claim), false);

let lexical = window.AHAPersonalRetrieval.searchPersonalKnowledge(query, { sources: ["meta_insights_memory"] });
assert.equal(lexical.results.some((item) => item.excerpt.includes("Fjellprosjekt Nordlys")), true);
let semantic = window.AHASemanticRetrieval.hybridSearch(query, { limit: 8 });
assert.equal(semantic.results.some((item) => item.excerpt.includes("Fjellprosjekt Nordlys")), true);
let chat = window.AHAChatPersonalContext.buildMessageContext(query);
assert.equal(JSON.stringify(chat).includes("Fjellprosjekt Nordlys"), true);

// 2) The same claim is corrected from confirmed -> wrong through the user-facing control API.
// Newest feedback must win across every status bucket, not only inside one bucket.
const correction = window.AHAPersonalAiMemoryControl.applyFeedback({
  claimText: claim,
  response: "feil",
  note: "Dette prosjektet er ikke mitt."
});
assert.equal(correction.ok, true);
assert.equal(correction.refreshed.lexical, true);
assert.equal(correction.refreshed.semantic, true);

summary = window.AHAMetaInsightsMemory.summarizeMemory();
assert.equal(summary.confirmed, 0);
assert.equal(summary.rejected, 1);
assert.equal(summary.confirmedClaims.some((item) => item.claimText === claim), false);
assert.equal(summary.rejectedClaims.some((item) => item.claimText === claim), true);
assert.equal(summary.feedbackCounts.confirmed, 1, "historical feedback remains auditable");
assert.equal(summary.feedbackCounts.rejected, 1, "the correction is retained as feedback history");
assert.equal(window.AHAMetaInsightsMemory.getLatestFeedbackForClaim(claim).response, "feil");

const displayModel = window.AHAPersonalAiSelfKnowledge.buildSelfKnowledgeModel(summary);
assert.equal(displayModel.confirmed.includes(claim), false);
assert.equal(displayModel.important.includes(claim), false);
assert.equal(displayModel.partial.includes(claim), false);
assert.equal(displayModel.excluded.rejectedCount, 1);

// 3) Correction propagates immediately into both retrieval indexes and Chat grounding.
lexical = window.AHAPersonalRetrieval.searchPersonalKnowledge(query, { sources: ["meta_insights_memory"] });
assert.equal(lexical.results.some((item) => item.excerpt.includes("Fjellprosjekt Nordlys")), false);
semantic = window.AHASemanticRetrieval.hybridSearch(query, { limit: 8 });
assert.equal(semantic.results.some((item) => item.excerpt.includes("Fjellprosjekt Nordlys")), false);
chat = window.AHAChatPersonalContext.buildMessageContext(query);
assert.equal(chat.relevant.relevantClaims.some((item) => JSON.stringify(item).includes("Fjellprosjekt Nordlys")), false);
assert.equal(JSON.stringify(chat.retrieval || {}).includes("Fjellprosjekt Nordlys"), false);
assert.equal(chat.prompt.includes("Fjellprosjekt Nordlys"), false);

// 4) A direct memory update invalidates stale derived indexes before any rebuild.
localStorage.setItem("aha_personal_retrieval_index_v1", JSON.stringify({ items: [{ text: claim }] }));
localStorage.setItem("aha_personal_semantic_index_v1", JSON.stringify({ items: [{ text: claim }] }));
window.AHAMetaInsightsMemory.addFeedback({ claimText: "Jeg foretrekker korte svar", response: "stemmer" });
assert.equal(localStorage.getItem("aha_personal_retrieval_index_v1"), null);
assert.equal(localStorage.getItem("aha_personal_semantic_index_v1"), null);

// 5) Privacy export includes canonical Meta Insights Memory; restore preserves the correction
// and discards derived retrieval caches so stale indexes cannot resurrect rejected material.
loadScript(context, "js/ahaPrivacy.js");
loadScript(context, "js/ahaPrivacyRestore.js");
loadScript(context, "js/ahaPrivacyPersonalAiMemory.js");

const payload = window.AHAPrivacyPersonalAiMemory.buildExportPayload();
assert.ok(payload.data.aha_meta_insights_memory_v1);
assert.equal(
  payload.data.aha_meta_insights_memory_v1.feedback.some((item) => item.claimText === claim && item.response === "feil"),
  true
);
assert.equal(payload.data.aha_meta_insights_memory_v1.selfModel.rejectedClaims.some((item) => item.claimText === claim), true);
const backup = JSON.stringify(payload);

localStorage.clear();
localStorage.setItem("aha_personal_retrieval_index_v1", JSON.stringify({ items: [{ text: claim }] }));
localStorage.setItem("aha_personal_semantic_index_v1", JSON.stringify({ items: [{ text: claim }] }));

const preview = window.AHAPrivacyPersonalAiMemory.previewRestore(backup);
assert.equal(preview.personalAiMemory, true);
assert.equal(preview.restorableKeys.includes("aha_meta_insights_memory_v1"), true);
assert.equal(preview.skipped.unknown, 0, "Meta Insights Memory is classified by the bridge, not as an unknown key");

const restored = window.AHAPrivacyPersonalAiMemory.applyRestore(backup);
assert.equal(restored.personalAiMemory, true);
assert.equal(restored.restorableKeys.includes("aha_meta_insights_memory_v1"), true);
assert.equal(restored.skipped.unknown, 0);
assert.equal(localStorage.getItem("aha_personal_retrieval_index_v1"), null);
assert.equal(localStorage.getItem("aha_personal_semantic_index_v1"), null);

summary = window.AHAMetaInsightsMemory.summarizeMemory();
assert.equal(summary.confirmedClaims.some((item) => item.claimText === claim), false);
assert.equal(summary.rejectedClaims.some((item) => item.claimText === claim), true);
lexical = window.AHAPersonalRetrieval.searchPersonalKnowledge(query, { sources: ["meta_insights_memory"] });
assert.equal(lexical.results.some((item) => item.excerpt.includes("Fjellprosjekt Nordlys")), false);
semantic = window.AHASemanticRetrieval.hybridSearch(query, { limit: 8 });
assert.equal(semantic.results.some((item) => item.excerpt.includes("Fjellprosjekt Nordlys")), false);
chat = window.AHAChatPersonalContext.buildMessageContext(query);
assert.equal(chat.prompt.includes("Fjellprosjekt Nordlys"), false);

// 6) Lock the production UI wiring and boundaries.
const personalAiHtml = fs.readFileSync(path.join(__dirname, "..", "personal-ai.html"), "utf8");
const privacyHtml = fs.readFileSync(path.join(__dirname, "..", "privacy.html"), "utf8");
const controlSource = fs.readFileSync(path.join(__dirname, "..", "js", "ahaPersonalAiMemoryControl.js"), "utf8");
const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "js", "ahaPrivacyPersonalAiMemory.js"), "utf8");

assert.ok(personalAiHtml.includes('data-personal-ai-memory-response="feil"') || fs.readFileSync(path.join(__dirname, "..", "js", "ahaPersonalAiSelfKnowledge.js"), "utf8").includes('data-personal-ai-memory-response="feil"'));
assert.ok(personalAiHtml.indexOf('js/ahaPersonalAiSelfKnowledge.js') < personalAiHtml.indexOf('js/ahaPersonalAiMemoryControl.js'));
assert.match(personalAiHtml, /Du kan korrigere hver synlig selvinnsikt/);
assert.ok(privacyHtml.indexOf('js/ahaPrivacyRestore.js') < privacyHtml.indexOf('js/ahaPrivacyPersonalAiMemory.js'));
assert.match(privacyHtml, /Meta Insights Memory følger backupen/);
assert.doesNotMatch(controlSource, /fetch\s*\(|XMLHttpRequest|WebSocket|echonet_shared\s*=\s*true|historygo_writeback_enabled\s*=\s*true/i);
assert.doesNotMatch(bridgeSource, /fetch\s*\(|XMLHttpRequest|WebSocket|echonet_shared\s*=\s*true|historygo_writeback_enabled\s*=\s*true/i);

console.log("aha personal ai memory control end-to-end: ok");
