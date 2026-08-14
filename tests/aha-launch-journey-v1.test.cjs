const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const CHAT_SESSIONS_KEY = "aha_chat_sessions_v1";
const CHAT_CURRENT_SESSION_KEY = "aha_chat_current_session_v1";
const MEMORY_CONTROLS_KEY = "aha_memory_controls_v1";
const AFTERWORK_KEY = "aha_afterwork_v1";
const HISTORY_GO_PAYLOAD_KEY = "aha_import_payload_v1";
const HISTORY_GO_IMPORT_LOG_KEY = "aha_historygo_imports_v1";

class SharedStorage {
  constructor(seed = {}) {
    this.values = new Map(Object.entries(seed).map(([key, value]) => [String(key), String(value)]));
    this.reads = [];
    this.writes = [];
  }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) {
    this.reads.push(String(key));
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }
  setItem(key, value) {
    this.writes.push(String(key));
    this.values.set(String(key), String(value));
  }
  removeItem(key) {
    this.writes.push(String(key));
    this.values.delete(String(key));
  }
  clear() {
    this.writes.push("*");
    this.values.clear();
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function makeContext(storage, shared) {
  const document = {
    readyState: "complete",
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const context = {
    console,
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Set,
    Map,
    WeakSet,
    Promise,
    Blob,
    document,
    localStorage: storage,
    location: { pathname: "/chat.html" },
    fetch(...args) {
      shared.fetchCalls.push(args);
      throw new Error("Launch journey must not call the network");
    },
    AHAIngest: {
      ingest(input) {
        shared.ingestCalls.push(JSON.parse(JSON.stringify(input)));
        return { ok: true, id: `launch_signal_${shared.ingestCalls.length}` };
      }
    },
    AHARepository: {
      saveImport(input) {
        shared.repositoryWrites.push(input);
        return Promise.resolve({ ok: true });
      }
    },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    Event: function Event(type, init) { this.type = type; this.bubbles = init?.bubbles === true; },
    addEventListener() {},
    dispatchEvent() {},
    setTimeout(callback) { if (typeof callback === "function") callback(); return 1; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {}
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

function load(context, relativePath) {
  vm.runInContext(read(relativePath), context, { filename: relativePath });
}

function createAfterworkRuntime(context) {
  return context.AHAChatAfterwork.create({
    storageKey: AFTERWORK_KEY,
    sourceHash: (value) => `hash_${String(value || "").length}`,
    escHtml: (value) => String(value || ""),
    normalizeDisplayText: (value) => String(value || ""),
    filterConceptLabels: (items) => Array.isArray(items) ? items : [],
    canonicalizeDisplayConcept: (value) => String(value || ""),
    renderAuxPanel() {},
    renderPanel() {},
    setStatusNote() {}
  });
}

const fixtureText = read("docs/fixtures/historygo-import/history-go-export-array-visited-v1.json");
const sourceOwnedSentinel = JSON.stringify([{ id: "history_go_owned_sentinel" }]);
const storage = new SharedStorage({
  [HISTORY_GO_PAYLOAD_KEY]: fixtureText,
  hg_learning_log_v1: sourceOwnedSentinel
});
const shared = { fetchCalls: [], ingestCalls: [], repositoryWrites: [] };

// 1. The launch path remains reachable and the production scripts load in their contract order.
const homeHtml = read("index.html");
const chatHtml = read("chat.html");
const historyGoHtml = read("historygo.html");
assert.match(homeHtml, /href="chat\.html"[^>]*>Snakk med AHA</);
assert.match(homeHtml, /id="btn-import-hg-primary"/);
assert.match(historyGoHtml, /id="hg-import-consent"/);
assert.match(historyGoHtml, /id="btn-hg-import"[^>]*disabled/);
const chatOrder = [
  "js/ahaChatPersistence.js",
  "js/ahaChatMemoryControls.js",
  "js/ahaChatAfterwork.js",
  "js/ahaChatProviderLoader.js",
  "js/ahaChatCapabilityBindings.js",
  "js/ahaChatRuntimeComposition.js",
  "js/ahaChatApplicationComposition.js",
  "js/ahaChat.js"
].map((src) => chatHtml.indexOf(`src="${src}"`));
assert.equal(chatOrder.every((index) => index >= 0), true, "Chat launch modules must all be loaded");
for (let index = 1; index < chatOrder.length; index += 1) {
  assert.ok(chatOrder[index] > chatOrder[index - 1], "Chat launch modules must keep production order");
}

// 2. A local Chat session, memory controls and afterwork survive a fresh page context.
const firstPage = makeContext(storage, shared);
load(firstPage, "js/ahaChatPersistence.js");
load(firstPage, "js/ahaChatMemoryControls.js");
load(firstPage, "js/ahaChatAfterwork.js");

firstPage.AHAChatPersistence.addMessage({
  id: "launch_user_message",
  role: "user",
  text: "Analyser hvordan institusjoner former offentligheten i byrommet.",
  createdAt: "2026-08-14T09:00:00.000Z"
});
firstPage.AHAChatPersistence.addMessage({
  id: "launch_assistant_message",
  role: "assistant",
  text: "Kilden viser at institusjonell makt og stedets organisering virker sammen.",
  createdAt: "2026-08-14T09:00:01.000Z"
});
firstPage.AHAChatPersistence.addMessage({
  id: "launch_assistant_message_duplicate",
  role: "assistant",
  text: "Kilden viser at institusjonell makt og stedets organisering virker sammen.",
  createdAt: "2026-08-14T09:00:02.000Z"
});
assert.equal(firstPage.AHAChatPersistence.loadSessions()[0].messages.length, 2, "same-role duplicate Chat text must not persist twice");

const memory = firstPage.AHAChatMemoryControls.create({ loadChamber: () => ({ insights: [] }) });
memory.setAhaMemoryControl("saveNewInsights", false);
memory.setAhaMemoryControl("useExistingMemory", false);
const sourceText = "Institusjoner former offentligheten i byrommet.";
const sourceTextHash = `hash_${sourceText.length}`;
const afterwork = createAfterworkRuntime(firstPage);
afterwork.saveAfterworkEntries([{
  id: "launch_afterwork",
  type: "aha_afterwork",
  textType: "academic_article",
  sourceText,
  sourceTextHash,
  sourceTextPreview: sourceText,
  summary: "Institusjoner og byrom analyseres sammen.",
  reflection: "Kilden avgrenser makt som en institusjonell og romlig relasjon.",
  concepts: ["institusjoner", "byrom"],
  learningPath: ["Spor kildebelegget"]
}]);

const reloadedPage = makeContext(storage, shared);
load(reloadedPage, "js/ahaChatPersistence.js");
load(reloadedPage, "js/ahaChatMemoryControls.js");
load(reloadedPage, "js/ahaChatAfterwork.js");
const reloadedSessions = reloadedPage.AHAChatPersistence.loadSessions();
assert.equal(reloadedSessions.length, 1);
assert.deepEqual(Array.from(reloadedSessions[0].messages, (message) => message.id), [
  "launch_user_message",
  "launch_assistant_message"
]);
const reloadedMemory = reloadedPage.AHAChatMemoryControls.create({ loadChamber: () => ({ insights: [] }) });
assert.equal(reloadedMemory.isAhaSavingEnabled(), false);
assert.equal(reloadedMemory.isAhaMemoryUseEnabled(), false);
assert.equal(createAfterworkRuntime(reloadedPage).loadAfterworkEntries()[0].id, "launch_afterwork");

// 3. The source-bound export uses the reloaded afterwork and remains valid.
load(reloadedPage, "js/ahaChatAnalysisRunContract.js");
load(reloadedPage, "js/ahaChatExport.js");
const activeRun = {
  analysisId: "launch_analysis",
  analysisRunId: "launch_run",
  runId: "launch_run",
  conversationId: reloadedSessions[0].id,
  sessionId: reloadedSessions[0].id,
  turnId: "launch_turn",
  sourceId: "launch_source",
  sourceKind: "pasted_text",
  sourceText,
  sourceTextHash,
  sourceHash: sourceTextHash,
  ahaReply: reloadedSessions[0].messages[1].text,
  memoryAllowed: false,
  memoryMode: "off",
  createdAt: "2026-08-14T09:00:00.000Z"
};
const exportRuntime = reloadedPage.AHAChatExport.createRuntime({
  loadAutoOutputs: () => ({
    sourceText,
    sourceTextHash,
    analysisRunId: activeRun.analysisRunId,
    payload: { analysisRunId: activeRun.analysisRunId, sourceTextHash }
  }),
  getActiveAnalysisRun: () => activeRun,
  loadAfterworkEntries: () => createAfterworkRuntime(reloadedPage).loadAfterworkEntries(),
  sourceHash: () => sourceTextHash,
  buildCanonicalAnalysis: () => ({
    contentType: "academic_article",
    domain: "urban_studies",
    theme: "Institusjoner og byrom",
    mainTension: "Institusjonell makt og offentlighet",
    keyInsight: "Institusjoner former offentligheten i byrommet.",
    fieldConnections: ["Byforskning"],
    historyGoLinks: [],
    suggestedActions: ["Spor kildebelegget"],
    confidence: { contentType: 1, domain: 1, theme: 1, mainTension: 1, historyGoLinks: 1 },
    warnings: [],
    ahaSer: {
      tema: "Institusjoner og byrom",
      hovedspenning: "Institusjonell makt og offentlighet",
      viktigsteInnsikt: "Institusjoner former offentligheten i byrommet.",
      fagkoblinger: ["Byforskning"],
      nesteSteg: "Spor kildebelegget",
      kortSvar: "Institusjoner og sted virker sammen."
    },
    sortItems: [{ label: "Tema", text: "Institusjoner og byrom" }],
    list: ["Institusjoner", "Byrom"],
    path: ["Spor kildebelegget"],
    concepts: ["institusjoner", "byrom"]
  }),
  normalizeSubjectLinks: (items) => Array.isArray(items) ? items : [],
  normalizeFagkoblinger: (items) => Array.isArray(items) ? items : [],
  isAcademicLikeType: (type) => type === "academic_article",
  loadChamberFromStorage: () => ({ insights: [], chatLog: [], meta: {} }),
  buildMetaProfile: () => ({}),
  setStatusNote() {},
  out() {},
  analysisRunContract: reloadedPage.AHAChatAnalysisRunContract,
  document: reloadedPage.document
});
const exportBundle = exportRuntime.buildAhaAnalysisExportBundle();
assert.equal(exportBundle.analysisBinding.valid, true);
assert.equal(exportBundle.sourceTextHash, sourceTextHash);
assert.equal(exportBundle.selectedAfterwork.id, "launch_afterwork");
assert.equal(exportBundle.memoryMode, "off");
assert.equal(exportBundle.quality.failClosed, false);

// 4. History Go stays unread before consent, imports once, and stays idempotent after reload.
const importPage = makeContext(storage, shared);
const readsBeforeImporterLoad = storage.reads.length;
const writesBeforeImporterLoad = storage.writes.length;
load(importPage, "js/ahaHistoryGoImportContract.js");
load(importPage, "js/ahaHistoryGoImport.js");
assert.equal(storage.reads.length, readsBeforeImporterLoad, "import modules must not read shared payload on load");
assert.equal(storage.writes.length, writesBeforeImporterLoad, "import modules must not write on load");
const blocked = importPage.AHAHistoryGoImport.importHistoryGoDataFromSharedStorage();
assert.equal(blocked.error_code, "explicit_consent_required");
assert.equal(storage.reads.length, readsBeforeImporterLoad, "rejected consent must not read shared payload");
assert.equal(shared.ingestCalls.length, 0);

const imported = importPage.AHAHistoryGoImport.importHistoryGoDataFromSharedStorage({
  confirmed: true,
  consent_method: "launch_gate_checkbox"
});
assert.equal(imported.importedSignals, 6);
assert.equal(imported.storage_keys_applied, 0);
assert.equal(imported.database_persist_enabled, false);
assert.equal(shared.ingestCalls.length, 6);
assert.equal(shared.ingestCalls.every((call) => call.meta?.local_only === true), true);
assert.equal(storage.getItem("hg_learning_log_v1"), sourceOwnedSentinel, "AHA must not write back to History Go-owned storage");

const duplicatePage = makeContext(storage, shared);
load(duplicatePage, "js/ahaHistoryGoImportContract.js");
load(duplicatePage, "js/ahaHistoryGoImport.js");
const writesBeforeDuplicate = storage.writes.length;
const duplicate = duplicatePage.AHAHistoryGoImport.importHistoryGoDataFromSharedStorage({
  confirmed: true,
  consent_method: "launch_gate_reload"
});
assert.equal(duplicate.duplicate, true);
assert.equal(duplicate.importedSignals, 0);
assert.equal(duplicate.import_log_written, false);
assert.equal(shared.ingestCalls.length, 6, "reload must not duplicate History Go signals");
assert.equal(storage.writes.length, writesBeforeDuplicate, "duplicate import after reload must not write");

const allowedWrites = new Set([
  CHAT_SESSIONS_KEY,
  CHAT_CURRENT_SESSION_KEY,
  MEMORY_CONTROLS_KEY,
  AFTERWORK_KEY,
  HISTORY_GO_IMPORT_LOG_KEY
]);
assert.deepEqual(
  [...new Set(storage.writes)].filter((key) => !allowedWrites.has(key)),
  [],
  "launch journey may only write its explicit local AHA stores"
);
assert.equal(shared.repositoryWrites.length, 0, "launch journey must not persist to backend");
assert.equal(shared.fetchCalls.length, 0, "launch journey must not activate backend, Sync Hub or EchoNet");

console.log("aha-launch-journey-v1.test.cjs passed");
