const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const registrations = [];
const storage = new Map();
const context = {
  console,
  Map,
  Set,
  Array,
  Object,
  String,
  Number,
  JSON,
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  },
  AHAModuleApi: {
    register(name, source, options) {
      registrations.push({ name, source, options });
      return source;
    }
  },
  AHATestHooks: { preservedHook: () => "preserved" }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaChatRuntimeFacade.js", "utf8"), context, {
  filename: "js/ahaChatRuntimeFacade.js"
});

const api = context.AHAChatRuntimeFacade;
assert.equal(Object.isFrozen(api), true);
assert.equal(Object.isFrozen(api.TEST_HOOK_EXPORTS), true);
assert.equal(Object.isFrozen(api.CHAT_EXPORTS), true);
assert.throws(() => api.create({}), /mangler avhengighet: bindings/);

const calls = [];
const activeRun = { id: "run-1" };
const bindings = {};
api.REQUIRED_BINDINGS.forEach((name) => {
  bindings[name] = (...args) => {
    calls.push([name, ...args]);
    return name;
  };
});
bindings.AHA_RUNTIME_KNOWLEDGE_POLICY = { legacyArticleTemplatesEnabled: false };
bindings.getActiveAnalysisRun = () => activeRun;
bindings.loadAhaMemoryControls = () => ({ saveNewInsights: true, useExistingMemory: true });
bindings.loadAhaMemoryExclusions = () => ({ excludedKeys: ["insight-1"] });
bindings.getAhaExcludedMemoryItems = () => [{ key: "insight-1" }];
bindings.isAhaMemoryDebugEnabled = () => storage.get("aha_memory_debug") === "true";
bindings.artifactMatchesActiveRun = (artifact, run) => artifact.runId === run.id;
bindings.bindAnalysisArtifact = (artifact, run) => ({ ...artifact, runId: run.id });

let readyHandler = null;
const documentRef = {
  readyState: "loading",
  addEventListener(type, handler) {
    assert.equal(type, "DOMContentLoaded");
    readyHandler = handler;
  }
};
const existingLoader = () => "existing-loader";
context.loadChamberFromStorage = existingLoader;

const runtime = api.create({ bindings, document: documentRef });
assert.equal(Object.isFrozen(runtime), true);
const installed = runtime.install();
assert.equal(Object.isFrozen(installed), true);
assert.equal(typeof readyHandler, "function");
assert.equal(calls.some(([name]) => name === "bind"), false, "loading documents must defer bootstrap");
assert.strictEqual(context.loadChamberFromStorage, existingLoader, "existing compatibility loaders must be preserved");
assert.equal(context.AHATestHooks.preservedHook(), "preserved");
assert.deepEqual(Object.keys(context.AHAChat).sort(), Array.from(api.CHAT_EXPORTS).sort());
assert.equal(registrations.some(({ name }) => name === "chat.runtimeFacade"), true);
assert.equal(registrations.some(({ name }) => name === "chat"), true);

context.AHAMemoryControls.disableSaving();
context.AHAMemoryControls.enableMemoryUse();
assert.equal(calls.some(([name, key, value]) => name === "setAhaMemoryControl" && key === "saveNewInsights" && value === false), true);
assert.equal(calls.some(([name, key, value]) => name === "setAhaMemoryControl" && key === "useExistingMemory" && value === true), true);
assert.deepEqual(context.AHAMemoryExclusions.items(), [{ key: "insight-1" }]);

context.AHAMemoryDebug.enable();
assert.equal(context.AHAMemoryDebug.isEnabled(), true);
context.AHAMemoryDebug.disable();
assert.equal(context.AHAMemoryDebug.isEnabled(), false);
assert.strictEqual(context.AHAActiveRun.get(), activeRun);
assert.equal(context.AHAActiveRun.matches({ runId: "run-1" }), true);
assert.deepEqual(context.AHAActiveRun.bind({ id: "artifact" }), { id: "artifact", runId: "run-1" });

readyHandler();
assert.equal(calls.filter(([name]) => name === "bind").length, 1);
assert.strictEqual(runtime.install(), installed, "install must be idempotent");
assert.equal(calls.filter(([name]) => name === "bind").length, 1);

console.log("aha-chat-runtime-facade.test.cjs passed");
