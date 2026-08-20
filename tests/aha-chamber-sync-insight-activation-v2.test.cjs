const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function makeStorage(chamber) {
  const values = new Map([["aha_insight_chamber_v1", JSON.stringify(chamber)]]);
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values
  };
}

async function run() {
  const localOnlyInsight = {
    id: "ins_v2_controlled",
    activation_v2: {
      schema: "aha_insight_activation_v2",
      backend_sync_allowed: false
    }
  };
  const storage = makeStorage({ insights: [{ id: "existing" }, localOnlyInsight] });
  const listeners = new Map();
  let saveCalls = 0;
  let loadCalls = 0;
  const context = {
    window: null,
    console,
    localStorage: storage,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    setTimeout,
    clearTimeout,
    AHARepository: {
      saveChamber: async () => { saveCalls += 1; return { ok: true }; },
      loadChamber: async () => { loadCalls += 1; return { ok: true, data: null }; }
    },
    addEventListener: (name, handler) => listeners.set(name, handler),
    dispatchEvent: () => true
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync("js/ahaChamberSync.js", "utf8"), context, { filename: "js/ahaChamberSync.js" });

  assert.equal(context.AHAChamberSync.hasLocalOnlyInsightActivation(JSON.parse(storage.getItem("aha_insight_chamber_v1"))), true);
  assert.deepEqual(await context.AHAChamberSync.push(), { ok: false, reason: "local_only_insight_activation_present" });
  assert.deepEqual(await context.AHAChamberSync.pull(), { ok: false, reason: "local_only_insight_activation_present" });
  assert.equal(saveCalls, 0);
  assert.equal(loadCalls, 0);

  storage.setItem("aha_insight_chamber_v1", JSON.stringify({ insights: [{ id: "existing" }] }));
  assert.equal(context.AHAChamberSync.hasLocalOnlyInsightActivation(JSON.parse(storage.getItem("aha_insight_chamber_v1"))), false);
  assert.equal((await context.AHAChamberSync.push()).ok, true);
  assert.equal(saveCalls, 1);

  console.log("aha-chamber-sync-insight-activation-v2 passed: local-only records block push and pull");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
