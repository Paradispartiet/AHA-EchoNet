const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const store = new Map();
const storage = {
  getItem(key) { return store.get(key) ?? null; },
  setItem(key, value) { store.set(key, String(value)); },
  seed(key, value) { store.set(key, JSON.stringify(value)); }
};
const optInId = "aha_psych_insight_user_selected_one";
const selected = "Jeg vil ta et lite steg og undersøke hva som hjelper.";
const undisclosed = "PRIVAT ARKIV: ikke valgt for ordinær AHA-bruk";
storage.seed("aha_psychology_private_reflections_v1", [
  { id: "private_1", text: selected, source_app: "historygo", created_at: "2026-11-16T12:00:00Z" },
  { id: "private_2", text: undisclosed, source_app: "historygo", created_at: "2026-11-16T12:00:00Z" }
]);
storage.seed("aha_insight_chamber_v1", { insights: [{
  id: optInId, title: selected, summary: selected,
  status: "draft", claim_kind: "personal_reflection",
  source_app: "aha_psychology_room", local_only: true,
  echonet_shared: false, published_external: false, sync_enabled: false,
  created_at: "2026-11-16T13:00:00Z",
  meta: { manual_promotion: true, psychology_reflection_id: "private_1", local_only: true }
}] });

const ctx = {
  console, Date, Intl, Math, JSON, Promise, localStorage: storage,
  location: { hash: "" },
  document: { readyState: "loading", addEventListener() {}, getElementById() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; } },
  addEventListener() {},
  fetch() { throw Error("Local product journey must never send private data to a network"); },
  AHAModules: { localPageHealth() { return { status: "ready" }; }, updatePageHealth() {} },
  AHAGroups: { getActiveGroups() { return []; } },
  AHA_CONFIG: { lists: { enableDatabaseSync: false }, paths: { enableDatabaseSync: false } }
};
ctx.window = ctx;
vm.createContext(ctx);
for (const file of [
  "js/ahaContracts.js", "js/ahaLists.js", "js/ahaPaths.js",
  "js/ahaInsights.js", "js/ahaMindmap.js", "js/ahaOrganizationFlow.js"
]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), ctx, { filename: file });
}

const insights = ctx.AHAInsights.getInsights();
assert.equal(insights.length, 1, "ordinary AHA insights include only manually promoted text");
assert.equal(insights[0].id, optInId);
assert.equal(insights[0].claim_kind, "personal_reflection");
assert.equal(insights[0].status, "draft");
assert.ok(!JSON.stringify(insights).includes(undisclosed), "unselected private reflection is not visible");
const graph = ctx.AHAMindmap.collectGraphData();
assert.ok(graph.nodes.some((node) => node.source === "aha_insights" && node.refId === optInId),
  "promoted reflection appears as an actual AHA mindmap node");
assert.ok(!JSON.stringify(graph).includes(undisclosed),
  "the private unselected reflection stays out of the graph");
const list = ctx.AHALists.createList({ title: "Valgte egne innsikter" });
assert.ok(list?.id);
const added = ctx.AHALists.addItemToList(list.id, { source: "aha_insights", refId: optInId });
assert.equal(added.ok, true, "real AHA list accepts the promoted insight");
const journey = ctx.AHAOrganizationFlow.createPathFromList(list.id);
assert.equal(journey.ok, true, "normal organization flow can make a real path");
const saved = ctx.AHAPaths.loadPaths().find(p => p.id === journey.path.id);
assert.ok(saved.steps.some(step => step.source === "aha_insights" && step.refId === optInId));
assert.equal(saved.local_only, true);
assert.equal(saved.echonet_shared, false);
assert.equal(saved.published_external, false);
assert.ok(!JSON.stringify(ctx.AHALists.loadLists()).includes(undisclosed));
assert.ok(!JSON.stringify(ctx.AHAPaths.loadPaths()).includes(undisclosed));
assert.equal(JSON.parse(storage.getItem("aha_psychology_private_reflections_v1")).length, 2,
  "organization never moves or modifies the private originals");
console.log("Explicit psychology insight -> AHA map/list/path, unselected private data excluded: passed");
