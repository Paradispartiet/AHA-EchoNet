const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function makeStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.get(key) ?? null; },
    setItem(key, value) { map.set(key, String(value)); },
    read(key, fallback) { return JSON.parse(map.get(key) || JSON.stringify(fallback)); },
    seed(key, value) { map.set(key, JSON.stringify(value)); }
  };
}
const storage = makeStorage();
const seedInsights = [
  { title: "Gammel innsikt uten ID", summary: "Eksisterende innsikt", created_at: "2026-09-15T12:00:00Z" },
  { id: "ins-2", title: "Dokumentert innsikt", summary: "Undersøk konsekvensene", created_at: "2026-10-24T12:00:00Z" }
];
storage.seed("aha_insight_chamber_v1", { insights: seedInsights });
storage.seed("aha_notes_v1", [{ id: "note-1", title: "Kildenotat" }]);
const c = {
  console, Date, Intl, Math, JSON, Promise,
  localStorage: storage,
  location: { hash: "" },
  document: { readyState: "loading", addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } },
  addEventListener() {},
  fetch() { throw Error("Organization journey must not fetch"); },
  AHAModules: { localPageHealth() { return { status: "ready" }; }, updatePageHealth() {} },
  AHAGroups: { getActiveGroups() { return []; } },
  AHA_CONFIG: {}
};
c.window = c;
vm.createContext(c);
function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", rel), "utf8"), c, { filename: rel });
}
load("js/ahaContracts.js");
load("js/ahaLists.js");
load("js/ahaPaths.js");
load("js/ahaInsights.js");
load("js/ahaOrganizationFlow.js");
const { AHAInsights: insights, AHALists: lists, AHAPaths: paths, AHAOrganizationFlow: flow } = c;
const sorted = Array.from(insights.getInsights());
assert.equal(sorted[0].id, "ins-2");
assert.equal(sorted[1].__ahaArchiveIndex, 0, "fallback source identity must not change with date sorting");
const list = lists.createList({ title: "Samlet" });
let added = insights.sendInsightToList(list.id, sorted[0], 0);
assert.equal(added.ok, true);
assert.equal(lists.loadLists().find(x => x.id === list.id).items[0].refId, "ins-2");
added = insights.sendInsightToList(list.id, sorted[0], 0);
assert.equal(added.ok, false, "duplicate must never claim successful storage");
assert.equal(added.reason, "duplicate");
assert.equal(insights.sendInsightToList("missing", sorted[0], 0).ok, false, "missing list must not claim success");
added = insights.sendInsightToList(list.id, sorted[1], 1);
assert.equal(added.ok, true, "insight without ID should use canonical archive index");
assert.equal(lists.loadLists().find(x => x.id === list.id).items[1].refId, "insight_idx_0");
const createdFromInsight = insights.createListFromInsight(sorted[0], 0);
assert.equal(createdFromInsight.ok, true);
assert.equal(lists.loadLists().find(x => x.id === createdFromInsight.listId).items[0].refId, "ins-2");
const countBeforeError = lists.loadLists().filter(x => !x.deletedAt).length;
const bad = insights.createListFromInsight({ id: "not-present", title: "Falsk referanse" }, 8);
assert.equal(bad.ok, false);
assert.equal(lists.loadLists().filter(x => !x.deletedAt).length, countBeforeError, "failed add must roll back collection");

assert.equal(lists.addItemToList(list.id, { source: "aha_notes", refId: "note-1" }).ok, true);
const generated = flow.createPathFromList(list.id);
assert.equal(generated.ok, true);
assert.equal(generated.promoted, 2, "real, compatible insight and note become steps");
assert.equal(generated.skipped, 1, "unaddressable insight without id is reported as skipped");
const storedPath = paths.loadPaths().find(x => x.id === generated.path.id);
assert.equal(storedPath.steps.length, 3, "collection header plus original referenced knowledge");
assert.deepEqual(Array.from(storedPath.steps.map(x => x.source)), ["aha_lists", "aha_insights", "aha_notes"]);
assert.equal(storedPath.steps[1].refId, "ins-2");
assert.equal(storedPath.steps[2].refId, "note-1");
assert.equal(storedPath.local_only, true);
assert.equal(storedPath.echonet_shared, false);
assert.equal(storedPath.published_external, false);
assert.equal(storedPath.meta.automation_enabled, false);
assert.equal(paths.pathProgress(storedPath).done, 0);
const reloaded = paths.loadPaths().find(x => x.id === storedPath.id);
assert.equal(reloaded.steps.length, 3, "path must survive storage reload");
console.log("AHA insight → real collection → validated path: passed");
