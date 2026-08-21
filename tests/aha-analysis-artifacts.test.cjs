const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const calls = [];
const model = {
  status: "ready",
  validation: { valid: true },
  projection_id: "projection_active",
  surfaces: { lists: [{ id: "list_active" }], paths: [{ id: "path_active" }], mindmap: {} }
};
const context = {
  console,
  document: null,
  AHAProjectionRuntimeSourceV2: { build() { return model; } },
  AHAProjectionMaterializerV2: {
    materialize(options) { calls.push(options); return { ok: true, artifact: { id: options.artifact_id } }; }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaAnalysisArtifacts.js", "utf8"), context, { filename: "js/ahaAnalysisArtifacts.js" });

const api = context.AHAAnalysisArtifacts;
assert.equal(api.VERSION, "aha_analysis_artifacts_v2_compatibility_wrapper");
assert.equal(typeof api.buildMindmapArtifact, "undefined", "legacy mindmap builder must be removed");
assert.equal(typeof api.buildPathArtifact, "undefined", "legacy path builder must be removed");

assert.equal(api.saveMindmapFromActiveAnalysis().ok, true);
assert.equal(api.savePathFromActiveAnalysis().ok, true);
assert.equal(api.saveV2ProjectionArtifact("list").ok, true);
assert.deepEqual(calls.map((entry) => [entry.artifact_type, entry.artifact_id]), [
  ["mindmap", "projection_active"],
  ["path", "path_active"],
  ["list", "list_active"]
]);
assert.ok(calls.every((entry) => entry.model === model && entry.user_confirmed === true));

const source = fs.readFileSync("js/ahaAnalysisArtifacts.js", "utf8");
assert.doesNotMatch(source, /localStorage|buildMindmapArtifact|buildPathArtifact|fallback_allowed:\s*true/);
assert.doesNotMatch(source, /\bfetch\s*\(/);
assert.deepEqual(Array.from(api.V2_DEPENDENCIES, (entry) => entry[0]), [
  "js/ahaInsightRelationClassifierV2.js", "js/ahaInsightSaturationV2.js", "js/ahaKnowledgeMigrationV2.js",
  "js/ahaSemanticProjectionsV2.js", "js/ahaV2ProductIntegrationGate.js", "js/ahaProjectionProductContractV2.js",
  "js/ahaProjectionArtifactQualityV2.js", "js/ahaProjectionProductReadModelV2.js", "js/ahaProjectionRuntimeSourceV2.js",
  "js/ahaProjectionMaterializerV2.js"
]);

console.log("aha-analysis-artifacts.test.cjs passed");
