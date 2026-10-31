const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rows = new Map([
  ["aha_insight_chamber_v1", JSON.stringify({ insights: [
    { id: "i1", title: "Kildebundet innsikt" },
    { id: "gone", title: "Slettet AI-innsikt", deletedAt: "2026-10-30" }
  ] })],
  ["aha_lists_v1", JSON.stringify([
    { id: "list:1", title: "Samling om et tema", items: [
      { id: "member1", source: "aha_insights", refId: "i1", type: "insight" },
      { id: "missing", source: "aha_insights", refId: "gone", type: "insight" }
    ] }
  ])],
  ["aha_paths_v1", JSON.stringify([
    { id: "path/1", title: "Min kunnskapssti", steps: [
      { id: "step1", source: "aha_lists", refId: "list:1", type: "list" }
    ] }
  ])],
  ["aha_concept_lists_v1", JSON.stringify([
    { id: "concept 1", title: "Sentrale begreper", terms: [
      { id: "c1", term: "Sammenheng" }, { id: "c2", term: "Kilde" }
    ] }
  ])]
]);

const handlers = new Map();
const fields = {
  "mindmap-node-type": { value: "all", addEventListener() {}, options: [{}], remove(index) { this.options.splice(index, 1); }, appendChild(option) { this.options.push(option); } },
  "mindmap-edge-type": { value: "all", addEventListener() {}, options: [{}], remove(index) { this.options.splice(index, 1); }, appendChild(option) { this.options.push(option); } },
  "mindmap-search": { value: "", addEventListener() {} },
  "mindmap-visual": { innerHTML: "", querySelector() { return null; } },
  "mindmap-branch-legend": { innerHTML: "" },
  "mindmap-details": { innerHTML: "", addEventListener(name, handler) { handlers.set(name, handler); } },
  "mindmap-node-list": { innerHTML: "" },
  "mindmap-edge-list": { innerHTML: "" },
  "mindmap-origin-summary": { innerHTML: "" },
  "mindmap-stats-nodes": { textContent: "" },
  "mindmap-stats-edges": { textContent: "" },
  "mindmap-stats-node-types": { textContent: "" },
  "mindmap-stats-edge-types": { textContent: "" }
};
const writes = [];
const ctx = {
  console,
  document: {
    readyState: "complete",
    getElementById(id) { return fields[id] || null; },
    querySelectorAll() { return []; },
    createElement() { return { value: "", textContent: "" }; }
  },
  localStorage: {
    getItem(key) { return rows.get(key) || null; },
    setItem(key) { writes.push(key); throw Error("Mindmap must remain read-only"); },
    removeItem(key) { writes.push(key); throw Error("Mindmap must remain read-only"); }
  }
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/ahaMindmap.js"), "utf8"), ctx, { filename: "js/ahaMindmap.js" });

const graph = ctx.AHAMindmap.collectGraphData();
const ids = graph.nodes.map((n) => n.id);
const listId = "list::aha_lists::list:1";
const pathId = "path::aha_paths::path/1";
const insightId = "insight::aha_insights::i1";
assert.ok(ids.includes(listId));
assert.ok(ids.includes(pathId));
assert.ok(ids.includes(insightId));
assert.ok(!ids.some((id) => id.endsWith("::gone")));

const byId = (id) => graph.nodes.find((node) => node.id === id);
assert.equal(byId(listId).href, "lists.html#list-list%3A1", "List opens the exact saved collection");
assert.equal(byId(pathId).href, "paths.html#path-path%2F1", "Path opens the exact saved knowledge Path");
assert.equal(byId("concept_list::aha_concept_lists::concept 1").href,
  "lists.html#concept-list-concept%201", "Concept List opens its exact card");
assert.equal(byId("concept::aha_concept_lists::concept 1:c1").href,
  "lists.html#concept-list-concept%201", "Concept opens the parent Concept List, not an unrelated page");

const neighbors = ctx.AHAMindmap.connectedMindmapNodes(listId, graph.nodes, graph.edges);
assert.ok(neighbors.some((n) => n.id === insightId && n.direction === "utgående"));
assert.ok(neighbors.some((n) => n.id === pathId && n.direction === "inngående"));
assert.ok(neighbors.every((n) => ids.includes(n.id)));
assert.ok(!neighbors.some((n) => n.id.includes("gone")));
assert.equal(ctx.AHAMindmap.connectedMindmapNodes("missing", graph.nodes, graph.edges).length, 0);
assert.equal(ctx.AHAMindmap.connectedMindmapNodes(listId, graph.nodes, [{
  id: "fabricated_missing", from: listId, to: "not-a-real-node", label: "ingen"
}]).length, 0, "No link may be displayed without an existing source node");

assert.equal(ctx.AHAMindmap.selectMindmapNode(listId), true);
assert.match(fields["mindmap-details"].innerHTML, /Følg koblingene/);
assert.match(fields["mindmap-details"].innerHTML, /Kildebundet innsikt/);
assert.match(fields["mindmap-details"].innerHTML, /Min kunnskapssti/);
assert.match(fields["mindmap-details"].innerHTML, /lists\.html#list-list%3A1/);
assert.match(fields["mindmap-visual"].innerHTML, /mindmap-svg/);
assert.equal(ctx.AHAMindmap.selectMindmapNode("not-a-real-node"), false);

fields["mindmap-node-type"].value = "list";
fields["mindmap-edge-type"].value = "list_contains";
fields["mindmap-search"].value = "ikke treff";
const handler = handlers.get("click");
assert.equal(typeof handler, "function", "Related-node buttons must have a real click handler");
handler({
  target: {
    closest(selector) {
      assert.equal(selector, "[data-mindmap-related-node]");
      return { getAttribute(name) {
        assert.equal(name, "data-mindmap-related-node");
        return pathId;
      } };
    }
  }
});
assert.equal(fields["mindmap-node-type"].value, "all");
assert.equal(fields["mindmap-edge-type"].value, "all");
assert.equal(fields["mindmap-search"].value, "");
assert.match(fields["mindmap-details"].innerHTML, /Min kunnskapssti/);
assert.match(fields["mindmap-visual"].innerHTML, /Gjør Min kunnskapssti til hovedidé/);
assert.deepEqual(writes, [], "Mindmap navigation must not write user data or call AI");
console.log("Connected Mindmap traversal, deep links and filter reset are local-only and source-backed.");
