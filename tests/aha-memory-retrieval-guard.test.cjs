const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const calls = {};
const embeddings = {
  async embedAndStore(insight) { calls.embedded = insight.id; return { ok: true, id: insight.id }; },
  async embedAllPending(chamber) { calls.pending = chamber.insights.map((item) => item.id); return { ok: true, pending: chamber.insights.length }; },
  async findSimilarToText(_query, options) {
    calls.textChamber = options.chamber.insights.map((item) => item.id);
    return { ok: true, matches: [{ id: "active" }, { id: "superseded" }, { id: "unknown" }] };
  },
  async findSimilarToInsight(_id, options) {
    calls.insightChamber = options.chamber.insights.map((item) => item.id);
    return { ok: true, matches: [{ id: "active" }, { id: "contested" }] };
  },
  async findMergeCandidate(_insight, chamber) {
    calls.mergeChamber = chamber.insights.map((item) => item.id);
    return { ok: true, candidate: chamber.insights[0], threshold: 0.7 };
  },
  async calibrateMergeThresholdsForChamber(chamber) {
    calls.calibration = chamber.insights.map((item) => item.id);
    return { ok: true };
  }
};
const registrations = [];
const context = {
  console,
  window: null,
  globalThis: null,
  AHAEmbeddings: embeddings,
  InsightsEngine: { getActiveInsights(chamber) { return chamber.insights; } },
  AHAModuleApi: { register(name, api, meta) { registrations.push({ name, api, meta }); } }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaMemoryRetrievalGuard.js", "utf8"), context, { filename: "js/ahaMemoryRetrievalGuard.js" });

const api = context.AHAMemoryRetrievalGuard;
assert.equal(api.VERSION, "aha_memory_retrieval_guard_v1");
assert.equal(Object.isFrozen(api), true);
assert.equal(registrations.some((item) => item.name === "memory.retrievalGuard" && item.meta.version === 1), true);

const active = { id: "active", memory_status: "active" };
const inactive = [
  { id: "archived", archived: true },
  { id: "superseded", memory_status: "superseded" },
  { id: "contested", memory_status: "contested" },
  { id: "stale", memory_status: "stale" },
  { id: "irrelevant", memory_status: "irrelevant" },
  { id: "deleted", deleted_at: "2026-01-01" },
  { id: "rejected", status: "rejected" },
  { id: "merged", merged_into: "active" }
];
assert.equal(api.isActiveMemoryInsight(active), true);
inactive.forEach((item) => assert.equal(api.isActiveMemoryInsight(item), false, item.id));

const chamber = { insights: [active, ...inactive] };
assert.deepEqual(Array.from(api.activeChamber(chamber).insights, (item) => item.id), ["active"]);
assert.deepEqual(Array.from(context.InsightsEngine.getActiveInsights(chamber), (item) => item.id), ["active"]);
assert.deepEqual(Array.from(api.filterActiveMatches([{ id: "active" }, { id: "superseded" }, { id: "unknown" }], chamber), (item) => item.id), ["active"]);
assert.deepEqual(Array.from(api.filterActiveMatches([{ id: "unknown" }], chamber, { allowUnknown: true }), (item) => item.id), ["unknown"]);

(async () => {
  const textResult = await context.AHAEmbeddings.findSimilarToText("query", { chamber, limit: 5 });
  assert.deepEqual(calls.textChamber, ["active"]);
  assert.deepEqual(Array.from(textResult.matches, (item) => item.id), ["active"]);
  assert.equal(textResult.memoryGuard.filtered, 2);

  const insightResult = await context.AHAEmbeddings.findSimilarToInsight("active", { chamber, limit: 5 });
  assert.deepEqual(calls.insightChamber, ["active"]);
  assert.deepEqual(Array.from(insightResult.matches, (item) => item.id), ["active"]);

  const inactiveSource = await context.AHAEmbeddings.findSimilarToInsight("superseded", { chamber });
  assert.equal(inactiveSource.ok, false);
  assert.equal(inactiveSource.reason, "inactive_source_memory");

  const pending = await context.AHAEmbeddings.embedAllPending(chamber);
  assert.deepEqual(calls.pending, ["active"]);
  assert.equal(pending.pending, 1);

  const rejectedEmbed = await context.AHAEmbeddings.embedAndStore(inactive[1]);
  assert.equal(rejectedEmbed.reason, "inactive_memory");
  assert.equal(calls.embedded, undefined);

  const merge = await context.AHAEmbeddings.findMergeCandidate(active, chamber);
  assert.deepEqual(calls.mergeChamber, ["active"]);
  assert.equal(merge.candidate.id, "active");

  await context.AHAEmbeddings.calibrateMergeThresholdsForChamber(chamber);
  assert.deepEqual(calls.calibration, ["active"]);

  const secondInstall = api.install(context.AHAEmbeddings);
  assert.equal(secondInstall.alreadyInstalled, true);
  console.log("aha-memory-retrieval-guard.test.cjs passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});