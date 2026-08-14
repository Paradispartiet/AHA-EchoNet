const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function createStorage(initial) {
  const values = new Map(Object.entries(initial || {}));
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

const registrations = [];
const listeners = new Map();
const storage = createStorage();
const baseApi = {
  STORAGE_KEY: "aha_insight_chamber_v1",
  SAVED_EVENT: "aha:chamber-saved",
  create(deps = {}) {
    const localStorage = deps.storage || storage;
    const now = deps.now || (() => "2026-08-14T00:00:00.000Z");
    return Object.freeze({
      load() {
        const raw = localStorage.getItem("aha_insight_chamber_v1");
        return raw ? JSON.parse(raw) : deps.createEmptyChamber();
      },
      save(chamber) {
        chamber._local_updated_at = now();
        localStorage.setItem("aha_insight_chamber_v1", JSON.stringify(chamber));
      },
      clear() { localStorage.removeItem("aha_insight_chamber_v1"); return true; }
    });
  }
};
const context = {
  console,
  window: null,
  globalThis: null,
  localStorage: storage,
  AHAChatChamberStore: baseApi,
  AHAModuleApi: { register(name, api, meta) { registrations.push({ name, api, meta }); } },
  addEventListener(name, handler) { listeners.set(name, handler); }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaMemoryRevision.js", "utf8"), context, { filename: "js/ahaMemoryRevision.js" });

const revision = context.AHAMemoryRevision;
assert.equal(revision.VERSION, "aha_memory_revision_v1");
assert.equal(Object.isFrozen(revision), true);
assert.equal(registrations.some((item) => item.name === "memory.revision" && item.meta.version === 1), true);
assert.equal(context.AHAChatChamberStore.__ahaMemoryRevision, "aha_memory_revision_v1");
assert.equal(typeof listeners.get("aha:chamber-saved"), "function");

const older = {
  id: "old_1",
  subject_id: "historygo",
  theme_id: "torggata",
  title: "Torggata Bad som før- og etterbilde",
  summary: "Torggata Bad kan brukes som før- og etterbilde for gaten.",
  concepts: ["Torggata Bad", "før og etter"],
  created_at: "2026-01-01T00:00:00.000Z"
};
const correction = {
  id: "new_1",
  subject_id: "historygo",
  theme_id: "torggata",
  title: "Rettelse om Torggata Bad",
  summary: "Rettelse: Torggata Bad har egen place-oppføring og skal ikke brukes som før- og etterbilde.",
  concepts: ["Torggata Bad", "før og etter"],
  created_at: "2026-08-14T00:00:00.000Z"
};

const corrected = revision.reconcileChamber({ insights: [older, correction] }, { now: "2026-08-14T00:00:00.000Z" });
assert.equal(corrected.changed, true);
assert.equal(corrected.relations, 1);
assert.equal(corrected.chamber.insights.length, 2, "audit history must be preserved");
assert.equal(corrected.chamber.insights[0].memory_status, "superseded");
assert.equal(corrected.chamber.insights[0].archived, true);
assert.equal(corrected.chamber.insights[0].superseded_by, "new_1");
assert.deepEqual(Array.from(corrected.chamber.insights[1].corrects), ["old_1"]);
assert.deepEqual(Array.from(corrected.activeInsights, (item) => item.id), ["new_1"]);

const repeated = revision.reconcileChamber(corrected.chamber, { now: "2026-08-15T00:00:00.000Z" });
assert.equal(repeated.changed, false, "reconciliation must be idempotent");
assert.deepEqual(JSON.parse(JSON.stringify(repeated.chamber)), JSON.parse(JSON.stringify(corrected.chamber)));

const ordinaryUpdate = {
  ...correction,
  id: "new_2",
  title: "Mer om Torggata Bad",
  summary: "Torggata Bad har en egen place-oppføring.",
  created_at: "2026-08-15T00:00:00.000Z"
};
const noSilentReplacement = revision.reconcileChamber({ insights: [older, ordinaryUpdate] });
assert.equal(noSilentReplacement.changed, false, "similarity alone must never supersede memory");
assert.equal(noSilentReplacement.chamber.insights[0].archived, undefined);

const unrelated = {
  id: "other_1",
  title: "Rettelse om barnesang",
  summary: "Rettelse: nyere kilder viser at voggesanger har en annen funksjon.",
  concepts: ["voggesang", "barnekultur"],
  subject_id: "music",
  theme_id: "child-song",
  created_at: "2026-08-17T00:00:00.000Z"
};
assert.equal(revision.reconcileChamber({ insights: [older, unrelated] }).changed, false, "corrections must not cross unrelated topics");

const direct = {
  id: "new_4",
  title: "Kort rettelse",
  summary: "Erstatter den eldre oppføringen.",
  corrects_insight_id: "old_1",
  created_at: "2026-08-18T00:00:00.000Z"
};
assert.equal(revision.reconcileChamber({ insights: [older, direct] }).changed, true, "explicit correction ids must be authoritative");

const directConflict = {
  id: "new_5",
  title: "Avvikende vurdering",
  summary: "En annen vurdering foreligger.",
  conflicts_with_insight_id: "old_1",
  created_at: "2026-08-19T00:00:00.000Z"
};
const contested = revision.reconcileChamber({ insights: [older, directConflict] });
assert.equal(contested.changed, true, "explicit conflict ids must be authoritative");
assert.equal(contested.chamber.insights[0].memory_status, "contested");
assert.deepEqual(Array.from(contested.chamber.insights[1].contests), ["old_1"]);

storage.setItem("aha_insight_chamber_v1", JSON.stringify({ insights: [older, correction] }));
const store = context.AHAChatChamberStore.create({
  storage,
  createEmptyChamber: () => ({ insights: [] }),
  now: () => "2026-08-14T00:00:00.000Z"
});
const loaded = store.load();
assert.equal(loaded.insights[0].memory_status, "superseded");
assert.equal(loaded.memory_revision.active_count, 1);
const mutableChamber = { insights: [older, correction] };
assert.equal(store.save(mutableChamber), undefined, "store save must keep the legacy void return contract");
assert.equal(mutableChamber.insights[0].memory_status, "superseded");
assert.equal(mutableChamber._local_updated_at, "2026-08-14T00:00:00.000Z");
assert.equal(JSON.parse(storage.getItem("aha_insight_chamber_v1")).insights.length, 2);

storage.setItem("aha_insight_chamber_v1", "null");
const legacy = revision.reconcileStoredChamber({ storage });
assert.equal(legacy.ok, true);
assert.equal(legacy.reason, "legacy_shape");
assert.equal(storage.getItem("aha_insight_chamber_v1"), "null");

console.log("aha-memory-revision.test.cjs passed");