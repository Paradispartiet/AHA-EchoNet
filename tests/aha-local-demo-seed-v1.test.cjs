const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class Storage {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed).map(([key, value]) => [
      String(key),
      typeof value === "string" ? value : JSON.stringify(value)
    ]));
  }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
  keys() { return [...this.map.keys()]; }
}

function load(file, context) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

function contextWith(storage) {
  const context = { console, Date, JSON, Object, Array, String, Set, Map, localStorage: storage };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

const existingNote = {
  id: "user_note_keep",
  title: "Mitt eget notat",
  text: "Dette skal aldri fjernes av demo-seedet.",
  created_at: "2026-10-01T09:00:00.000Z"
};
const existingInsight = {
  id: "user_insight_keep",
  title: "Min innsikt",
  summary: "Eksisterende brukerinnsikt."
};
const existingSession = {
  id: "user_chat_session_keep",
  type: "aha_chat_session",
  title: "Min samtale",
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-01T09:00:00.000Z",
  messages: []
};

const storage = new Storage({
  aha_notes_v1: [existingNote],
  aha_insight_chamber_v1: { insights: [existingInsight], other_field: "keep" },
  aha_chat_sessions_v1: [existingSession],
  aha_chat_current_session_v1: "user_chat_session_keep"
});
const context = contextWith(storage);
load("data/demo/aha-local-demo-seed-v1.js", context);
load("js/ahaLocalDemoSeed.js", context);

const pack = context.AHA_LOCAL_DEMO_SEED_V1;
const api = context.AHALocalDemoSeed;
assert.ok(pack && api, "seed pack and loader should load");
assert.equal(pack.seed_id, "aha_local_demo_seed_v1");
assert.equal(pack.local_only, true);
assert.equal(pack.synthetic_example, true);
assert.equal(pack.stores.length, 7);

for (const descriptor of pack.stores) {
  assert.match(descriptor.key, /^aha_/);
  assert.doesNotMatch(descriptor.key, /historygo|token|oauth|pkce|secret/i);
  for (const item of descriptor.items || []) {
    assert.equal(item.demo_seed_id, pack.seed_id);
    assert.equal(item.meta?.demo_seed_id, pack.seed_id);
    assert.equal(item.meta?.local_only, true);
    assert.equal(item.meta?.synthetic_example, true);
  }
}

assert.equal(api.inspectSeed().installed, false);
const first = api.applySeed();
assert.equal(first.ok, true);
assert.equal(first.installed, 9, "seed pack should install exactly nine owned objects");
assert.equal(storage.getItem("aha_chat_current_session_v1"), "user_chat_session_keep", "existing current Chat session must be preserved");

const notesAfterFirst = JSON.parse(storage.getItem("aha_notes_v1"));
assert.equal(notesAfterFirst.some((item) => item.id === "user_note_keep"), true);
assert.equal(notesAfterFirst.filter((item) => item.id === "demo_seed_note_byrom").length, 1);

const chamberAfterFirst = JSON.parse(storage.getItem("aha_insight_chamber_v1"));
assert.equal(chamberAfterFirst.other_field, "keep");
assert.equal(chamberAfterFirst.insights.some((item) => item.id === "user_insight_keep"), true);
assert.equal(chamberAfterFirst.insights.filter((item) => item.id === "demo_seed_insight_byrom").length, 1);

const second = api.applySeed();
assert.equal(second.ok, true);
const notesAfterSecond = JSON.parse(storage.getItem("aha_notes_v1"));
assert.equal(notesAfterSecond.filter((item) => item.id === "demo_seed_note_byrom").length, 1, "reapply must be idempotent");
const sessionsAfterSecond = JSON.parse(storage.getItem("aha_chat_sessions_v1"));
assert.equal(sessionsAfterSecond.filter((item) => item.id === "demo_seed_chat_session").length, 1, "Chat seed must stay unique");

const inspection = api.inspectSeed();
assert.equal(inspection.installed, true);
assert.equal(inspection.count, 9);

const removed = api.removeSeed();
assert.equal(removed.ok, true);
assert.equal(removed.removed, 9);
assert.equal(api.inspectSeed().installed, false);

const notesAfterRemove = JSON.parse(storage.getItem("aha_notes_v1"));
assert.deepEqual(notesAfterRemove.map((item) => item.id), ["user_note_keep"], "remove must preserve user note");
const chamberAfterRemove = JSON.parse(storage.getItem("aha_insight_chamber_v1"));
assert.equal(chamberAfterRemove.other_field, "keep");
assert.deepEqual(chamberAfterRemove.insights.map((item) => item.id), ["user_insight_keep"]);
const sessionsAfterRemove = JSON.parse(storage.getItem("aha_chat_sessions_v1"));
assert.deepEqual(sessionsAfterRemove.map((item) => item.id), ["user_chat_session_keep"]);
assert.equal(storage.getItem("aha_chat_current_session_v1"), "user_chat_session_keep");
assert.equal(storage.getItem(api.STATE_KEY), null);

const emptyStorage = new Storage();
const emptyContext = contextWith(emptyStorage);
load("data/demo/aha-local-demo-seed-v1.js", emptyContext);
load("js/ahaLocalDemoSeed.js", emptyContext);
emptyContext.AHALocalDemoSeed.applySeed();
assert.equal(emptyStorage.getItem("aha_chat_current_session_v1"), "demo_seed_chat_session", "empty browser may adopt the demo Chat session");
emptyContext.AHALocalDemoSeed.removeSeed();
assert.equal(emptyStorage.getItem("aha_chat_current_session_v1"), null, "seed-owned current session pointer must be removed");

const loaderSource = fs.readFileSync("js/ahaLocalDemoSeed.js", "utf8");
const dashboardSource = fs.readFileSync("js/ahaLocalDemoSeedDashboard.js", "utf8");
for (const source of [loaderSource, dashboardSource]) {
  assert.doesNotMatch(source, /fetch\s*\(/, "local demo seed must not fetch");
  assert.doesNotMatch(source, /XMLHttpRequest|sendBeacon/, "local demo seed must not use network transports");
  assert.doesNotMatch(source, /AHARepository|Supabase|AHASyncHub|EchoNet/, "local demo seed must not activate backend/sync/EchoNet");
}
assert.doesNotMatch(loaderSource, /historygo/i, "loader must not touch History Go");

const page = fs.readFileSync("demo-seed.html", "utf8");
assert.match(page, /id="aha-demo-seed-apply"/);
assert.match(page, /id="aha-demo-seed-remove"/);
assert.match(page, /data\/demo\/aha-local-demo-seed-v1\.js/);
assert.match(page, /js\/ahaLocalDemoSeed\.js/);
assert.match(page, /js\/ahaLocalDemoSeedDashboard\.js/);
assert.ok(
  page.indexOf("data/demo/aha-local-demo-seed-v1.js") < page.indexOf("js/ahaLocalDemoSeed.js"),
  "seed pack must load before loader"
);

const demo = fs.readFileSync("demo.html", "utf8");
assert.match(demo, /href="demo-seed\.html">Legg inn lokale eksempeldata</);

console.log("AHA Local Demo Seed V1 contract passed.");
