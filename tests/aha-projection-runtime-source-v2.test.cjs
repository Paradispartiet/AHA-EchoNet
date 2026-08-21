const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const storage = new Map([
  ["aha_chat_auto_outputs_v1", JSON.stringify({ analysisRunId: "run_active", sourceHash: "hash_active", payload: {} })],
  ["aha_insight_chamber_v1", JSON.stringify({ insights: [
    { id: "insight_a", analysisRunId: "run_active" },
    { id: "insight_b", analysis_trace: { sourceHash: "hash_active" } },
    { id: "insight_stale", analysisRunId: "run_stale", sourceHash: "hash_stale" }
  ] })],
  ["aha_lists_v1", JSON.stringify([{ id: "list_a" }])],
  ["aha_paths_v1", JSON.stringify([{ id: "path_a" }])]
]);
let writes = 0;
let capturedInput = null;
const context = {
  console,
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem() { writes += 1; },
    removeItem() { writes += 1; }
  },
  AHAProjectionProductReadModelV2: {
    build(input) {
      capturedInput = JSON.parse(JSON.stringify(input));
      return {
        schema: "aha_projection_product_read_model_v2",
        version: 2,
        mode: "read_only",
        status: "ready",
        projection_id: "projection_1",
        surfaces: { insights: [], concepts: [], lists: [{ id: "candidate_list" }], paths: [], mindmap: { nodes: [], edges: [], read_only: true } },
        validation: { valid: true, errors: [] },
        policy: { persistent_write: false, remote_write: false }
      };
    }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaProjectionRuntimeSourceV2.js", "utf8"), context, { filename: "js/ahaProjectionRuntimeSourceV2.js" });

const api = context.AHAProjectionRuntimeSourceV2;
const snapshot = api.snapshot();
assert.deepEqual(Array.from(snapshot.legacy_insights, (item) => item.id), ["insight_a", "insight_b"]);
assert.deepEqual(Array.from(snapshot.legacy_lists, (item) => item.id), ["list_a"]);
assert.deepEqual(Array.from(snapshot.legacy_paths, (item) => item.id), ["path_a"]);
const model = api.build();
assert.equal(model.status, "ready");
assert.equal(capturedInput.legacy_insights.length, 2);
assert.equal(capturedInput.active_analysis.analysis_id, "run_active");
assert.deepEqual(api.surface("lists"), [{ id: "candidate_list" }]);
assert.equal(writes, 0, "runtime source must never write storage");

storage.set("aha_insight_chamber_v1", "not-json");
assert.equal(api.snapshot().legacy_insights.length, 0, "invalid storage must fail closed");
assert.equal(api.build().status, "blocked");
storage.delete("aha_chat_auto_outputs_v1");
assert.equal(api.build().blocking_reasons[0], "active_analysis_unavailable");
assert.equal(writes, 0);

console.log("aha-projection-runtime-source-v2.test.cjs: OK");
