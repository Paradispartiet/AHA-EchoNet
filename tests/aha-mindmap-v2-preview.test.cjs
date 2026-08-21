const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let writes = 0;
const context = {
  console,
  document: {
    readyState: "loading",
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { value: "", textContent: "", appendChild() {} }; }
  },
  localStorage: {
    getItem() { return null; },
    setItem() { writes += 1; },
    removeItem() { writes += 1; }
  },
  AHAProjectionRuntimeSourceV2: {
    build() {
      return {
        status: "ready",
        validation: { valid: true },
        projection_id: "projection_preview",
        surfaces: {
          mindmap: {
            nodes: [
              { id: "root", title: "Demokrati: semantisk oversikt", type: "theme", refId: "projection_preview", meta: { root: true } },
              { id: "concept", title: "Representasjon", type: "concept", refId: "concept" },
              { id: "insight", title: "Valg former representasjon", type: "insight", refId: "insight" }
            ],
            edges: [
              { id: "branch", from: "root", to: "concept", type: "theme_branch", label: "gren" },
              { id: "support", from: "concept", to: "insight", type: "supports_insight", label: "belyser innsikt" },
              { id: "broken", from: "concept", to: "missing", type: "supports_insight" }
            ],
            read_only: true,
            quality: { passed: true, score: 1 },
            meta: { root_id: "root" }
          }
        }
      };
    }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaMindmap.js", "utf8"), context, { filename: "js/ahaMindmap.js" });

const graph = context.AHAMindmap.collectProjectionGraphData();
assert.equal(graph.nodes.length, 3);
assert.equal(graph.edges.length, 2, "unresolved preview edges must fail closed");
assert.equal(graph.meta.root_id, "root");
assert.equal(graph.summary.preview, true);
assert.equal(graph.summary.projectionId, "projection_preview");
for (const node of graph.nodes) {
  assert.equal(node.meta.read_only, true);
  assert.equal(node.meta.projection_preview, true);
  assert.equal(node.meta.sync_enabled, false);
}
for (const edge of graph.edges) assert.equal(edge.meta.projection_preview, true);
assert.equal(writes, 0);

const html = fs.readFileSync("mindmap.html", "utf8");
assert.match(html, /id="mindmap-data-source"/);
assert.match(html, /AHA foreslår fra denne analysen/);
assert.match(html, /ahaProjectionRuntimeSourceV2\.js/);

console.log("aha-mindmap-v2-preview.test.cjs: OK");
