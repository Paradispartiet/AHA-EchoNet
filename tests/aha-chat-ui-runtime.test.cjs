const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaChatUiRuntime.js", "utf8");
const chatSource = fs.readFileSync("js/ahaChat.js", "utf8");
const compositionSource = fs.readFileSync("js/ahaChatRuntimeComposition.js", "utf8");
const applicationCompositionSource = fs.readFileSync("js/ahaChatApplicationComposition.js", "utf8");
const chatHtml = fs.readFileSync("chat.html", "utf8");

const context = { window: null };
context.window = context;
vm.runInNewContext(source, context, { filename: "js/ahaChatUiRuntime.js" });
assert.equal(typeof context.AHAChatUiRuntime?.create, "function");
assert.equal(Object.isFrozen(context.AHAChatUiRuntime), true);
assert.throws(() => context.AHAChatUiRuntime.create({}), /mangler avhengighet: submitMessage/);

class Element {
  constructor(id = "") {
    this.id = id;
    this.value = "";
    this.listeners = {};
    this.attributes = {};
    this.focused = false;
    this.clicked = 0;
    this.panelVisible = false;
  }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  dispatchEvent(event) { return this.listeners[event.type]?.(event); }
  focus() { this.focused = true; }
  click() { this.clicked += 1; return this.listeners.click?.(); }
  getAttribute(name) { return this.attributes[name] || null; }
  querySelector(selector) { return selector === ".insight-panel" && this.panelVisible ? {} : null; }
}

const store = new Map();
const elements = new Map();
[
  "msg", "btn-send", "btn-reset", "btn-import-hg", "panel", "chat-log",
  "btn-insights", "btn-status", "btn-concepts", "btn-meta", "btn-knowledge-map",
  "btn-saved-afterwork", "btn-export", "btn-export-analysis",
  "btn-export-analysis-json", "btn-export-analysis-main", "btn-export-analysis-json-main"
].forEach((id) => elements.set(id, new Element(id)));
const actionInsight = new Element();
actionInsight.attributes["data-chat-action"] = "lag_innsikt";
const actionImport = new Element();
actionImport.attributes["data-chat-action"] = "import_hg";
const documentRef = {
  getElementById: (id) => elements.get(id) || null,
  querySelectorAll: (selector) => selector === "[data-chat-action]" ? [actionInsight, actionImport] : []
};
const globalListeners = {};
const eventTarget = { addEventListener: (type, handler) => { globalListeners[type] = handler; } };
const calls = [];
const fn = (name) => (...args) => { calls.push([name, ...args]); };
const deps = {
  document: documentRef,
  storage: {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  },
  eventTarget,
  Event: function Event(type, options) { this.type = type; this.bubbles = options?.bubbles; },
  pendingPromptKey: "pending",
  highlightsStorageKey: "highlights",
  afterworkStorageKey: "afterwork",
  submitMessage: fn("submitMessage"),
  showInsights: fn("showInsights"),
  showStatus: fn("showStatus"),
  showConcepts: fn("showConcepts"),
  showMeta: fn("showMeta"),
  showKnowledgeMap: fn("showKnowledgeMap"),
  showSavedAfterwork: fn("showSavedAfterwork"),
  exportAnalysisJson: fn("exportAnalysisJson"),
  copyAnalysisMarkdown: fn("copyAnalysisMarkdown"),
  clearChamber: fn("clearChamber"),
  clearAutoOutputs: fn("clearAutoOutputs"),
  out: fn("out"),
  setStatusNote: fn("setStatusNote"),
  resetAnalysisView: fn("resetAnalysisView"),
  focusAutoCard: fn("focusAutoCard"),
  bindMemoryControls: fn("bindMemoryControls"),
  bindPanelActions: fn("bindPanelActions"),
  setProcessing: fn("setProcessing"),
  restoreAutoOutput: fn("restoreAutoOutput"),
  startMetaAiSession: fn("startMetaAiSession"),
  updateMemoryStatus: fn("updateMemoryStatus"),
  renderChatMemoryStatus: fn("renderChatMemoryStatus"),
  renderPersonalContextStatus: fn("renderPersonalContextStatus"),
  updateEmptyState: fn("updateEmptyState"),
  renderHighlightsRail: fn("renderHighlightsRail")
};

const runtime = context.AHAChatUiRuntime.create(deps);
assert.equal(Object.isFrozen(runtime), true);
store.set("pending", JSON.stringify({ prompt: "Fortsett analysen" }));
runtime.bind();
assert.equal(elements.get("msg").value, "Fortsett analysen");
assert.equal(elements.get("msg").focused, true);
assert.equal(store.has("pending"), false);
assert.ok(calls.some(([name, value]) => name === "setStatusNote" && /AHA Home/.test(value)));
assert.ok(calls.some(([name]) => name === "bindMemoryControls"));
assert.ok(calls.some(([name]) => name === "restoreAutoOutput"));
assert.ok(calls.some(([name]) => name === "renderPersonalContextStatus"));

elements.get("msg").value = "Send dette";
elements.get("btn-send").click();
assert.ok(calls.some(([name, text, textarea]) => name === "submitMessage" && text === "Send dette" && textarea === elements.get("msg")));
actionInsight.click();
assert.ok(calls.some(([name]) => name === "showInsights"));
assert.ok(calls.some(([name, action]) => name === "focusAutoCard" && action === "lag_innsikt"));
actionImport.click();
assert.equal(elements.get("btn-import-hg").clicked, 1);

store.set("highlights", "saved");
store.set("afterwork", "saved");
elements.get("btn-reset").click();
assert.equal(store.has("highlights"), false);
assert.equal(store.has("afterwork"), false);
assert.ok(calls.some(([name]) => name === "clearChamber"));
assert.ok(calls.some(([name]) => name === "clearAutoOutputs"));
assert.ok(calls.some(([name]) => name === "resetAnalysisView"));

globalListeners["aha:chamber-saved"]();
assert.ok(calls.filter(([name]) => name === "updateMemoryStatus").length >= 2);
elements.get("panel").panelVisible = true;
globalListeners["aha:merge-suggested"]();
assert.ok(calls.filter(([name]) => name === "showInsights").length >= 2);

assert.ok(applicationCompositionSource.includes('const uiRuntimeModule = providerLoader.require("uiRuntime")'));
assert.ok(applicationCompositionSource.includes('providerLoader.instantiate("uiRuntime", {'));
assert.ok(applicationCompositionSource.includes('label: "AHAChatShellRuntime"'));
assert.ok(compositionSource.includes('modules.uiRuntime.create({'));
assert.ok(compositionSource.includes("AHAChatUiRuntime må lastes før ahaChat.js."));
assert.doesNotMatch(chatSource, /function (?:consumePendingChatPrompt|bindActionChips|bind|reset)\s*\(/, "UI bootstrap implementation must remain outside ahaChat.js");
assert.doesNotMatch(chatSource, /function (?:resolveConceptTerm|suggestCategoryChips|refreshAhaExplorer|renderAhaChatMemoryStatus)\s*\(/, "shared shell adapters must remain outside ahaChat.js");
const uiRuntimeAt = chatHtml.indexOf("js/ahaChatUiRuntime.js");
const providerLoaderAt = chatHtml.indexOf("js/ahaChatProviderLoader.js");
const capabilityBindingsAt = chatHtml.indexOf("js/ahaChatCapabilityBindings.js");
const runtimeFacadeAt = chatHtml.indexOf("js/ahaChatRuntimeFacade.js");
const runtimeCompositionAt = chatHtml.indexOf("js/ahaChatRuntimeComposition.js");
const applicationCompositionAt = chatHtml.indexOf("js/ahaChatApplicationComposition.js");
const chatAt = chatHtml.indexOf("js/ahaChat.js");
assert.ok(uiRuntimeAt < providerLoaderAt && providerLoaderAt < capabilityBindingsAt && capabilityBindingsAt < runtimeFacadeAt && runtimeFacadeAt < runtimeCompositionAt && runtimeCompositionAt < applicationCompositionAt && applicationCompositionAt < chatAt);

console.log("aha-chat-ui-runtime passed");
