const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const calls = [];
const context = {
  console,
  document: null,
  AHAAnalysisArtifacts: {
    saveV2ProjectionArtifact(type) { calls.push(type); return { ok: true, type }; }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaAdaptiveArtifacts.js", "utf8"), context, { filename: "js/ahaAdaptiveArtifacts.js" });

const api = context.AHAAdaptiveArtifacts;
assert.equal(api.VERSION, "aha_adaptive_artifacts_v2_compatibility_shim");
assert.equal(api.deprecated, true);
assert.equal(api.replacement, "AHAAnalysisArtifacts.saveV2ProjectionArtifact");
assert.equal(api.saveMindmapFromActiveAnalysis().ok, true);
assert.equal(api.savePathFromActiveAnalysis().ok, true);
assert.deepEqual(calls, ["mindmap", "path"]);
assert.equal(typeof api.buildMindmapArtifact, "undefined");
assert.equal(typeof api.buildPathArtifact, "undefined");
assert.equal(api.install(), true);

const source = fs.readFileSync("js/ahaAdaptiveArtifacts.js", "utf8");
assert.doesNotMatch(source, /localStorage|createConceptList|createPath|buildMindmapArtifact|buildPathArtifact/);
console.log("aha-adaptive-artifacts.test.cjs passed");
