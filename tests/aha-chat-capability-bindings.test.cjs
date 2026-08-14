const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const registrations = [];
const context = {
  console,
  Object,
  Array,
  AHAModuleApi: {
    register(name, source, options) {
      registrations.push({ name, source, options });
      return source;
    }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaChatCapabilityBindings.js", "utf8"), context, {
  filename: "js/ahaChatCapabilityBindings.js"
});

const api = context.AHAChatCapabilityBindings;
assert.equal(Object.isFrozen(api), true);
assert.equal(Object.isFrozen(api.CHAT_CAPABILITY_GROUPS), true);
assert.equal(Object.isFrozen(api.CHAT_CAPABILITY_GROUPS.chamberStore), true);
assert.equal(Object.isFrozen(api.CHAT_CAPABILITY_GROUPS.chamberStore[0]), true);
Object.values(api.CHAT_CAPABILITY_GROUPS).forEach((entries) => {
  assert.equal(Object.isFrozen(entries), true);
  entries.forEach((entry) => assert.equal(Object.isFrozen(entry), true));
});
assert.equal(registrations.some(({ name }) => name === "chat.capabilityBindings"), true);

assert.throws(() => api.bind("unknown", {}), /Ukjent AHA Chat-capability-gruppe/);
assert.throws(() => api.bind("textUtils", null), /mangler kilde/);
assert.throws(
  () => api.bind("textUtils", { shortHash() {} }),
  /takeKeywords/,
  "the whole declared capability group must be present"
);

const chamberSource = {
  load() { return "loaded"; },
  save() { return "saved"; },
  clear() { return "cleared"; },
  hidden() { return "internal"; }
};
const chamber = api.bind("chamberStore", chamberSource);
assert.equal(Object.isFrozen(chamber), true);
assert.deepEqual(Object.keys(chamber).sort(), [
  "clearChamberStorage", "loadChamberFromStorage", "saveChamberToStorage"
]);
assert.strictEqual(chamber.loadChamberFromStorage, chamberSource.load);
assert.equal(chamber.loadChamberFromStorage(), "loaded");
assert.equal(Object.hasOwn(chamber, "hidden"), false, "undeclared provider internals must not cross the boundary");

const autoAnalysis = api.bind("autoAnalysis", {
  getUrlDominanceInfo() {}, isSportsArticleAnalysis() {}, buildArticleSourceTextFromAnalysis() {},
  buildSourceGroundedAcademicPayload() {}, applyRuntimeKnowledgePolicy() {},
  isTransientAnalysisDocument() {}, buildAutoOutputs() {}, buildAutoOutputFallbackPayload() {},
  AHA_RUNTIME_KNOWLEDGE_POLICY: { legacyArticleTemplatesEnabled: false }
});
assert.deepEqual(autoAnalysis.AHA_RUNTIME_KNOWLEDGE_POLICY, { legacyArticleTemplatesEnabled: false });
assert.throws(
  () => api.bind("autoAnalysis", {
    getUrlDominanceInfo() {}, isSportsArticleAnalysis() {}, buildArticleSourceTextFromAnalysis() {},
    buildSourceGroundedAcademicPayload() {}, applyRuntimeKnowledgePolicy() {},
    isTransientAnalysisDocument() {}, buildAutoOutputs() {}, buildAutoOutputFallbackPayload() {}
  }),
  /AHA_RUNTIME_KNOWLEDGE_POLICY/,
  "declared value capabilities must be present"
);

console.log("aha-chat-capability-bindings.test.cjs passed");
