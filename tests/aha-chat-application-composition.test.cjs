const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("js/ahaChatApplicationComposition.js", "utf8");
const bootstrapSource = fs.readFileSync("js/ahaChat.js", "utf8");
const registrations = [];
const context = {
  window: null,
  AHAModuleApi: {
    register(name, api, metadata) { registrations.push({ name, api, metadata }); }
  }
};
context.window = context;
vm.runInNewContext(source, context, { filename: "js/ahaChatApplicationComposition.js" });

assert.equal(Object.isFrozen(context.AHAChatApplicationComposition), true);
assert.equal(typeof context.AHAChatApplicationComposition.create, "function");
assert.equal(registrations.length, 1);
assert.equal(registrations[0].name, "chat.applicationComposition");
assert.equal(registrations[0].metadata.version, 1);
assert.throws(
  () => context.AHAChatApplicationComposition.create({}),
  /mangler avhengighet: providerLoader/
);
assert.throws(
  () => context.AHAChatApplicationComposition.create({ providerLoader: {} }),
  /providerLoader\.resolve, providerLoader\.require, providerLoader\.instantiate/
);

const instantiatedProviders = Array.from(
  source.matchAll(/providerLoader\.instantiate\("([^"]+)"/g),
  (match) => match[1]
);
assert.deepEqual(instantiatedProviders, [
  "chamberStore", "autoOutputStore", "uiRuntime", "analysisPolicy", "conceptPolicy",
  "memoryControls", "afterwork", "memoryRuntime", "runContext", "afterwork",
  "insightPipeline", "agentRuntime", "ingestRuntime", "academicInsightView",
  "insightView", "personalUi", "conversationView", "analysisStateView",
  "autoAnalysis", "autoOutputView", "canonicalAnalysis", "runtimeComposition"
]);
assert.match(source, /memoryControls\.bindView\(\{/);
assert.match(source, /capabilities: \{[\s\S]*core: Object\.freeze\([\s\S]*persistence: Object\.freeze\([\s\S]*analysis: Object\.freeze\([\s\S]*execution: Object\.freeze\([\s\S]*memory: Object\.freeze\([\s\S]*view: Object\.freeze\(/);
for (const lateBinding of [
  "normalizeConceptKey", "applyRuntimeKnowledgePolicy", "normalizeAfterworkConcept",
  "filterConceptLabels", "buildSourceGroundedAcademicPayload", "buildAutoOutputs",
  "isFragmentaryInsightCard"
]) {
  assert.match(source, new RegExp(`${lateBinding}: \\(\\.\\.\\.args\\) =>`), `${lateBinding} must remain a late callback`);
}

let installed = 0;
let captured = null;
const providerLoader = {
  instantiate(key, deps) {
    captured = { key, deps };
    return { install() { installed += 1; } };
  }
};
const bootstrapWindow = {
  AHA_AGENT_API: "https://agent.example",
  AHAMetaInsightsAgent: { id: "meta" },
  MetaInsightsEngine: { buildUserMetaProfile: () => ({ id: "profile" }) },
  fetch: () => "fetched",
  AHAChat: { buildAhaAnalysisExportBundle: () => "bundle" },
  AHAModuleApi: {
    resolve(name) {
      assert.equal(name, "chat.providerLoader");
      return { create: () => providerLoader };
    }
  }
};
bootstrapWindow.window = bootstrapWindow;
vm.runInNewContext(bootstrapSource, { window: bootstrapWindow }, { filename: "js/ahaChat.js" });
assert.equal(captured.key, "applicationComposition");
assert.equal(captured.deps.providerLoader, providerLoader);
assert.equal(captured.deps.environment.getAgentApiBase(), "https://agent.example");
assert.equal(captured.deps.environment.getMetaInsightsAgent().id, "meta");
assert.equal(captured.deps.environment.getExportBundleBuilder()(), "bundle");
assert.equal(installed, 1, "bootstrap must install the composed application exactly once");
assert.ok(bootstrapSource.split("\n").length <= 35, "ahaChat.js must remain a small bootstrap");
assert.doesNotMatch(bootstrapSource, /capabilityBindings\.bind\(|providerLoader\.require\(/);

console.log("aha-chat-application-composition.test.cjs passed");
