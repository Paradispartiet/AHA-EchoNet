const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaChatProviderLoader.js", "utf8"), context, {
  filename: "js/ahaChatProviderLoader.js"
});

const api = context.AHAChatProviderLoader;
assert.ok(api);
assert.equal(typeof api.create, "function");

const originalInsights = Object.freeze({
  createEmptyChamber() { return { insights: [] }; },
  getActiveInsights(chamber) { return chamber?.insights || []; },
  marker: "frozen-insights-provider"
});
let metaCalls = 0;
const meta = Object.freeze({
  buildUserMetaProfile(chamber, subjectId) {
    metaCalls += 1;
    return {
      subject_id: subjectId,
      insight_count: Array.isArray(chamber?.insights) ? chamber.insights.length : 0
    };
  }
});
const legacyRoot = {
  InsightsEngine: originalInsights,
  MetaInsightsEngine: meta
};

const loader = api.create({ moduleApi: null, legacyRoot });

// Creating the loader must never attempt to mutate the frozen provider.
assert.equal(Object.isFrozen(originalInsights), true);
assert.equal(Object.isExtensible(originalInsights), false);
assert.equal(Object.prototype.hasOwnProperty.call(originalInsights, "buildMetaProfile"), false);

const resolvedA = loader.resolve("insights", "InsightsEngine");
const resolvedB = loader.resolve("insights", "InsightsEngine");
assert.ok(resolvedA);
assert.notEqual(resolvedA, originalInsights, "missing legacy method should use a compatibility view");
assert.equal(resolvedA, resolvedB, "compatibility view identity must remain stable");
assert.equal(Object.getPrototypeOf(resolvedA), originalInsights);
assert.equal(Object.isFrozen(resolvedA), true);
assert.equal(resolvedA.marker, "frozen-insights-provider");
assert.equal(resolvedA.createEmptyChamber, originalInsights.createEmptyChamber);
assert.equal(resolvedA.getActiveInsights, originalInsights.getActiveInsights);
assert.equal(typeof resolvedA.buildMetaProfile, "function");
assert.deepEqual(
  resolvedA.buildMetaProfile({ insights: [{ id: "a" }, { id: "b" }] }),
  { subject_id: "sub_laring", insight_count: 2 }
);
assert.equal(metaCalls, 1);
assert.equal(Object.prototype.hasOwnProperty.call(originalInsights, "buildMetaProfile"), false, "base provider must remain untouched");

// If InsightsEngine already owns buildMetaProfile, no compatibility wrapper is needed.
const nativeInsights = Object.freeze({
  buildMetaProfile() { return { native: true }; }
});
const nativeLoader = api.create({
  moduleApi: null,
  legacyRoot: { InsightsEngine: nativeInsights, MetaInsightsEngine: meta }
});
assert.equal(nativeLoader.resolve("insights", "InsightsEngine"), nativeInsights);
assert.deepEqual(nativeLoader.resolve("insights", "InsightsEngine").buildMetaProfile(), { native: true });

// Without the Meta owner, the original Insights provider remains the answer.
const noMetaLoader = api.create({
  moduleApi: null,
  legacyRoot: { InsightsEngine: originalInsights }
});
assert.equal(noMetaLoader.resolve("insights", "InsightsEngine"), originalInsights);
assert.equal(typeof noMetaLoader.resolve("insights", "InsightsEngine").buildMetaProfile, "undefined");

// Module API resolution must receive the same read-only compatibility behavior.
const moduleInsights = Object.freeze({ marker: "module-insights" });
const moduleMeta = Object.freeze({
  buildUserMetaProfile() { return { module: true }; }
});
const moduleApi = {
  resolve(name) {
    if (name === "insights") return moduleInsights;
    if (name === "meta") return moduleMeta;
    return null;
  }
};
const moduleLoader = api.create({ moduleApi, legacyRoot: {} });
const moduleView = moduleLoader.resolve("insights", "InsightsEngine");
assert.notEqual(moduleView, moduleInsights);
assert.equal(moduleView.marker, "module-insights");
assert.deepEqual(moduleView.buildMetaProfile({}), { module: true });
assert.equal(Object.prototype.hasOwnProperty.call(moduleInsights, "buildMetaProfile"), false);

// Source boundary: ProviderLoader may define the method on its own fresh view,
// never on a provider object returned by resolve().
const source = fs.readFileSync("js/ahaChatProviderLoader.js", "utf8");
assert.match(source, /const view = Object\.create\(insights\)/);
assert.match(source, /Object\.defineProperty\(view, "buildMetaProfile"/);
assert.equal(/Object\.defineProperty\(insights,\s*"buildMetaProfile"/.test(source), false);
assert.match(source, /insightsCompatView = Object\.freeze\(view\)/);

console.log("aha-chat-provider-loader-frozen-provider.test.cjs: OK");
