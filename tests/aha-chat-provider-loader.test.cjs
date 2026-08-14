const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const registrations = [];
const registeredProviders = new Map();
const legacyRoot = {};
const context = {
  console,
  Object,
  Array,
  AHAModuleApi: {
    register(name, source, options) {
      registrations.push({ name, source, options });
      return source;
    },
    resolve(name) { return registeredProviders.get(name) || null; }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaChatProviderLoader.js", "utf8"), context, {
  filename: "js/ahaChatProviderLoader.js"
});

const api = context.AHAChatProviderLoader;
assert.equal(Object.isFrozen(api), true);
assert.equal(Object.isFrozen(api.CHAT_PROVIDERS), true);
assert.equal(Object.isFrozen(api.CHAT_PROVIDERS.textUtils), true);
assert.equal(Object.isFrozen(api.CHAT_PROVIDERS.textUtils.functions), true);
assert.deepEqual(Array.from(api.CHAT_PROVIDERS.capabilityBindings.functions), ["bind"]);
assert.equal(registrations.some(({ name }) => name === "chat.providerLoader"), true);

const loader = api.create({ moduleApi: context.AHAModuleApi, legacyRoot });
assert.equal(Object.isFrozen(loader), true);
assert.throws(() => loader.require("unknown"), /Ukjent AHA Chat-provider/);
assert.throws(() => loader.require("textUtils"), /AHAChatTextUtils må lastes før ahaChat\.js/);

legacyRoot.AHAChatTextUtils = {
  shortHash() {}, takeKeywords() {}, sourceHash() {}, cleanArticleText() {},
  toSentences() {}, collectOpinionArticleEvidence() {}
};
assert.strictEqual(loader.require("textUtils"), legacyRoot.AHAChatTextUtils);

registeredProviders.set("chat.signals", {
  detectTextType() {}, detectPublicAdministrationReformSignal() {}, detectPublicAdministrationSignal() {},
  inferReligiousLexiconEvidence() {}, detectCanonicalAnalysisDomain() {},
  detectInstitutionalMediaHistorySignal() {}, detectLiteraryAttachmentSignal() {}
});
assert.strictEqual(loader.require("signals"), registeredProviders.get("chat.signals"));

registeredProviders.set("chat.analysis", { buildOpinionArticleQualityAnalysis() {} });
legacyRoot.AHAChatAnalysis = { buildOpinionArticleQualityAnalysis: null };
assert.strictEqual(loader.require("analysis"), registeredProviders.get("chat.analysis"), "registry must win over legacy fallback");

registeredProviders.set("chat.signals", { detectTextType() {} });
assert.throws(
  () => loader.require("signals"),
  /detectPublicAdministrationReformSignal/,
  "missing named exports must fail at the provider boundary"
);

let receivedDeps = null;
registeredProviders.set("chat.chamberStore", {
  create(deps) { receivedDeps = deps; return { load() {} }; }
});
const chamber = loader.instantiate("chamberStore", { seed: true });
assert.equal(typeof chamber.load, "function");
assert.deepEqual(receivedDeps, { seed: true });

registeredProviders.set("chat.afterwork", {
  create() { return {}; },
  createAutoOutputAdapter(deps) { return { deps }; }
});
const adapter = loader.instantiate("afterwork", { source: "auto" }, {
  factory: "createAutoOutputAdapter",
  label: "AHAChatAfterworkAutoAdapter"
});
assert.deepEqual(adapter.deps, { source: "auto" });

registeredProviders.set("chat.personalUi", { create() { return null; } });
assert.throws(
  () => loader.instantiate("personalUi", {}),
  /AHAChatPersonalUi må lastes før ahaChat\.js/
);

assert.strictEqual(loader.resolve("insights", "InsightsEngine"), null);
legacyRoot.InsightsEngine = { ready: true };
assert.strictEqual(loader.resolve("insights", "InsightsEngine"), legacyRoot.InsightsEngine);

console.log("aha-chat-provider-loader.test.cjs passed");
