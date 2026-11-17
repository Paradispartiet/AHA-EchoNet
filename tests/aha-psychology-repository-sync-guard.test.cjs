const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// The repository switches are explicitly ON to prove sensitive psychology
// references are still blocked at both immediate writes and bulk sync.
const insightId = "aha_psych_insight_selected";
const seed = {
  aha_insight_chamber_v1: {
    insights: [
      { id: insightId, title: "Selected private reflection",
        source_app: "aha_psychology_room", meta: { manual_promotion: true } },
      { id: "normal_insight", title: "Public subject" }
    ]
  },
  aha_lists_v1: [
    { id: "psychology_list", title: "Personal theme", items: [
      { source: "aha_insights", refId: insightId, title: "Private selected text", type: "insight" }
    ] },
    { id: "normal_list", title: "Safe theme", items: [
      { source: "aha_insights", refId: "normal_insight", title: "Public subject", type: "insight" }
    ] }
  ],
  aha_paths_v1: [
    { id: "private_path_direct", title: "My private route", steps: [
      { source: "aha_insights", refId: insightId, title: "Private selected text", type: "insight" }
    ] },
    { id: "private_path_indirect", title: "My personal list route", steps: [
      { source: "aha_lists", refId: "psychology_list", title: "Personal theme", type: "list" }
    ] },
    { id: "safe_path", title: "Safe knowledge route", steps: [
      { source: "aha_insights", refId: "normal_insight", title: "Public subject", type: "insight" }
    ] }
  ]
};
const contents = new Map(Object.entries(seed).map(([k,v]) => [k, JSON.stringify(v)]));
const storage = {
  getItem(key) { return contents.get(key) ?? null; },
  setItem(key, value) { contents.set(key, String(value)); }
};
const sends = [];
const global = {
  console, Date, Intl, Math, JSON, Promise, localStorage: storage,
  AHA_CONFIG: { lists: { enableDatabaseSync: true }, paths: { enableDatabaseSync: true } },
  AHARepository: {
    saveList(list) { sends.push({ kind: "list", id: list.id, value: JSON.stringify(list) }); return { ok: true }; },
    savePath(pathRecord) { sends.push({ kind: "path", id: pathRecord.id, value: JSON.stringify(pathRecord) }); return { ok: true }; },
    loadLists() { return { ok: true, data: [] }; },
    loadPaths() { return { ok: true, data: [] }; }
  },
  AHAGroups: { getActiveGroups() { return []; } },
  AHAModules: { localPageHealth() { return { status: "ready" }; }, updatePageHealth() {} },
  document: { readyState: "loading", addEventListener() {}, getElementById() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; } },
  location: { hash: "" },
  addEventListener() {},
  fetch() { throw Error("No fetch allowed during privacy sync test"); }
};
global.window = global;
vm.createContext(global);
for (const file of ["js/ahaContracts.js", "js/ahaLists.js", "js/ahaPaths.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), global, { filename: file });
}
(async () => {
  await global.AHALists.syncFromDatabase();
  await global.AHAPaths.syncFromDatabase();
  assert.deepEqual(sends.map(s => s.id).sort(), ["normal_list", "safe_path"],
    "bulk database sync must send only nonpsychology collections and routes");
  assert.ok(sends.every(s => !s.value.includes(insightId)), "private insight identifier never leaves");
  assert.equal(global.AHALists.loadLists().some(x => x.id === "psychology_list"), true,
    "the excluded private list stays available locally");
  assert.equal(global.AHAPaths.loadPaths().some(x => x.id === "private_path_direct"), true,
    "the excluded private path stays available locally");

  // Updating a protected collection must not trigger a write even though
  // the user explicitly enabled repository sync for ordinary collections.
  const sentBefore = sends.length;
  global.AHALists.updateList("psychology_list", { description: "Only on this device" });
  global.AHAPaths.updatePath("private_path_direct", { description: "Local route" });
  global.AHAPaths.updatePath("private_path_indirect", { description: "Local indirect route" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sends.length, sentBefore,
    "incremental changes to protected lists and paths must never call the repository");

  // A tombstoned insight may have been removed from chamber; the ID marker
  // still blocks exporting derived artifacts containing old private text.
  storage.setItem("aha_insight_chamber_v1", JSON.stringify({ insights: [
    { id: "normal_insight", title: "Public subject" }
  ] }));
  await global.AHALists.syncFromDatabase();
  await global.AHAPaths.syncFromDatabase();
  assert.equal(sends.filter(x => ["psychology_list","private_path_direct","private_path_indirect"].includes(x.id)).length, 0,
    "privacy guard must continue after source insight deletion");
  console.log("Psychology-derived AHA lists and paths never enter repository sync: passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
