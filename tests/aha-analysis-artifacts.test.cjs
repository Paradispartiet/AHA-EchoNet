const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const model = {
  status: "ready",
  validation: { valid: true },
  projection_id: "projection_active",
  surfaces: { lists: [{ id: "list_active" }], paths: [{ id: "path_active" }], mindmap: {} },
  product_states: {
    list: { href: "lists.html?analysis_id=a&projection_id=projection_active" },
    path: { href: "paths.html?analysis_id=a&projection_id=projection_active" },
    mindmap: { href: "mindmap.html?analysis_id=a&projection_id=projection_active" }
  }
};
const context = {
  console,
  document: null,
  AHAProjectionRuntimeSourceV2: { build() { return model; } }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaAnalysisArtifacts.js", "utf8"), context, { filename: "js/ahaAnalysisArtifacts.js" });

const api = context.AHAAnalysisArtifacts;
assert.equal(api.VERSION, "aha_analysis_artifacts_v2_compatibility_wrapper");
assert.equal(typeof api.buildMindmapArtifact, "undefined", "legacy mindmap builder must be removed");
assert.equal(typeof api.buildPathArtifact, "undefined", "legacy path builder must be removed");

assert.equal(api.saveMindmapFromActiveAnalysis().ok, false);
assert.equal(api.saveMindmapFromActiveAnalysis().reason, "chat_projection_is_preview_only");
assert.equal(api.saveMindmapFromActiveAnalysis().preview_href, model.product_states.mindmap.href);
assert.equal(api.savePathFromActiveAnalysis().ok, false);
assert.equal(api.savePathFromActiveAnalysis().preview_href, model.product_states.path.href);
assert.equal(api.saveV2ProjectionArtifact("list").preview_href, model.product_states.list.href);

const source = fs.readFileSync("js/ahaAnalysisArtifacts.js", "utf8");
assert.doesNotMatch(source, /localStorage|buildMindmapArtifact|buildPathArtifact|fallback_allowed:\s*true/);
assert.doesNotMatch(source, /\bfetch\s*\(/);
assert.doesNotMatch(source, /AHAProjectionMaterializerV2|\.materialize\s*\(/, "Chat compatibility wrapper must not materialize products");
assert.deepEqual(Array.from(api.V2_DEPENDENCIES, (entry) => entry[0]), [
  "js/ahaInsightRelationClassifierV2.js", "js/ahaInsightSaturationV2.js", "js/ahaKnowledgeMigrationV2.js",
  "js/ahaSemanticProjectionsV2.js", "js/ahaV2ProductIntegrationGate.js", "js/ahaProjectionProductContractV2.js",
  "js/ahaProjectionArtifactQualityV2.js", "js/ahaProjectionProductReadModelV2.js", "js/ahaProjectionRuntimeSourceV2.js"
]);

console.log("aha-analysis-artifacts.test.cjs passed");
