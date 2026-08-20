const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const gateSource = fs.readFileSync("js/ahaV2ControlledWriteExpansionGate.js", "utf8");
const rehearsalSource = fs.readFileSync("js/ahaV2ControlledWriteExpansionRehearsal.js", "utf8");
const scope = JSON.parse(fs.readFileSync("ops/contracts/aha-v2-controlled-write-expansion-scope-two-record-v1.json", "utf8"));
const context = { globalThis: null };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(gateSource, context);
vm.runInContext(rehearsalSource, context);
const rehearsal = context.AHAV2ControlledWriteExpansionRehearsal;

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const record = (ordinal) => ({
  schema: "aha_v2_controlled_write_expansion_rehearsal_record_v1",
  version: 1,
  id: `expansion_rehearsal_record_${ordinal}`,
  target_kind: "v2_expansion_rehearsal_candidate",
  scope_id: scope.scope_id,
  scope_fingerprint: scope.scope_fingerprint,
  ordinal,
  source_event_id: `synthetic_expansion_source_${ordinal}`,
  source_text_hash: String(ordinal).repeat(64),
  record_fingerprint: (ordinal === 1 ? "a" : ordinal === 2 ? "b" : "c").repeat(64),
  synthetic_rehearsal_record: true
});
const plan = {
  schema: "aha_v2_controlled_write_expansion_rehearsal_plan_v1",
  version: 1,
  scope_contract: clone(scope),
  records: [record(1), record(2)]
};

function makeAdapter(options = {}) {
  const sentinel = { id: "unrelated_sentinel", kind: "sentinel", value: "preserve" };
  const values = new Map([[sentinel.id, clone(sentinel)]]);
  let getCount = 0;
  let removeFailed = false;
  return {
    scope: "v2_expansion_rehearsal_staging",
    async get(id) {
      getCount += 1;
      if (options.failGetAt === getCount) throw new Error("synthetic_replay_get_failure");
      return clone(values.get(id) ?? null);
    },
    async put(id, value) { values.set(id, clone(value)); },
    async remove(id) {
      if (options.failRemoveId === id && !removeFailed) {
        removeFailed = true;
        throw new Error("synthetic_remove_failure");
      }
      values.delete(id);
    },
    async list() { return [...values.values()].map(clone); },
    rawSet(id, value) { values.set(id, clone(value)); },
    rawGet(id) { return clone(values.get(id) ?? null); }
  };
}

(async () => {
  const mutatedScopePlan = clone(plan);
  mutatedScopePlan.scope_contract.max_chamber_records_created = 3;
  mutatedScopePlan.records.push(record(3));
  assert.throws(
    () => rehearsal.validatePlan(mutatedScopePlan),
    (error) => error?.code === "expansion_rehearsal_scope_not_committed_candidate",
    "same fingerprint must not authorize a mutated three-record scope"
  );

  const driftAdapter = makeAdapter();
  const driftReceipt = await rehearsal.apply(plan, driftAdapter, { explicit_rehearsal_authorization: true });
  const driftedSecond = clone(plan.records[1]);
  driftedSecond.record_fingerprint = "d".repeat(64);
  driftAdapter.rawSet(driftedSecond.id, driftedSecond);
  const drift = await rehearsal.rollback(driftReceipt, driftAdapter);
  assert.equal(drift.status, "manual_review_required");
  assert.equal(drift.rolled_back_count, 0);
  assert.ok(driftAdapter.rawGet(plan.records[0].id), "record 1 must remain when later record drift is detected");
  assert.ok(driftAdapter.rawGet(plan.records[1].id), "drifted record 2 must remain for review");
  assert.ok(driftAdapter.rawGet("unrelated_sentinel"));

  const removeFailureAdapter = makeAdapter({ failRemoveId: plan.records[1].id });
  const removeReceipt = await rehearsal.apply(plan, removeFailureAdapter, { explicit_rehearsal_authorization: true });
  const failedRollback = await rehearsal.rollback(removeReceipt, removeFailureAdapter);
  assert.equal(failedRollback.status, "manual_review_required");
  assert.equal(failedRollback.rolled_back_count, 0);
  assert.equal(failedRollback.reason, "expansion_rehearsal_rollback_remove_failed");
  assert.equal(failedRollback.compensation?.exact, true);
  assert.deepEqual(removeFailureAdapter.rawGet(plan.records[0].id), plan.records[0]);
  assert.deepEqual(removeFailureAdapter.rawGet(plan.records[1].id), plan.records[1]);
  assert.ok(removeFailureAdapter.rawGet("unrelated_sentinel"));

  // First apply consumes six get() calls. Fail the first read of replay; rehearse
  // must still roll the first receipt back to the exact pre-run sentinel state.
  const replayFailureAdapter = makeAdapter({ failGetAt: 7 });
  const beforeReplay = await replayFailureAdapter.list();
  let replayError = null;
  try {
    await rehearsal.rehearse(plan, replayFailureAdapter, { explicit_rehearsal_authorization: true });
  } catch (error) {
    replayError = error;
  }
  assert.ok(replayError, "replay failure must surface");
  assert.equal(replayError.message, "synthetic_replay_get_failure");
  assert.equal(replayError.rehearsal_cleanup?.status, "rolled_back");
  assert.equal(replayError.rehearsal_cleanup?.exact, true);
  assert.deepEqual(await replayFailureAdapter.list(), beforeReplay, "replay failure cleanup must restore exact pre-run state");

  console.log("aha-v2-controlled-write-expansion-hardening.test.cjs: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
