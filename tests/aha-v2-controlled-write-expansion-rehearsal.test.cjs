const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const vm = require("vm");

const gateSource = fs.readFileSync("js/ahaV2ControlledWriteExpansionGate.js", "utf8");
const rehearsalSource = fs.readFileSync("js/ahaV2ControlledWriteExpansionRehearsal.js", "utf8");
const scope = JSON.parse(fs.readFileSync("ops/contracts/aha-v2-controlled-write-expansion-scope-two-record-v1.json", "utf8"));

const context = { globalThis: null };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(gateSource, context, { filename: "js/ahaV2ControlledWriteExpansionGate.js" });
vm.runInContext(rehearsalSource, context, { filename: "js/ahaV2ControlledWriteExpansionRehearsal.js" });

const gate = context.AHAV2ControlledWriteExpansionGate;
const rehearsal = context.AHAV2ControlledWriteExpansionRehearsal;
assert.ok(gate && rehearsal);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const scopeFingerprintInput = clone(scope);
delete scopeFingerprintInput.scope_fingerprint;
delete scopeFingerprintInput.status;
delete scopeFingerprintInput.notes;
assert.equal(scope.scope_fingerprint_algorithm, "sha256");
assert.equal(sha256(canonical(scopeFingerprintInput)), scope.scope_fingerprint, "scope fingerprint must bind the immutable candidate contract");
assert.equal(scope.scope_fingerprint, "ee6952eef3517af8a868c83e4424125c70591af42ff4f568e76a8bba4aa3b5f8");
assert.equal(scope.max_chamber_records_created, 2);
assert.equal(scope.candidate_only, true);
assert.equal(scope.activation_authority, false);
assert.equal(gate.validateScopeContract(scope).valid, true);

const plan = {
  schema: "aha_v2_controlled_write_expansion_rehearsal_plan_v1",
  version: 1,
  scope_contract: clone(scope),
  records: [
    {
      schema: "aha_v2_controlled_write_expansion_rehearsal_record_v1",
      version: 1,
      id: "expansion_rehearsal_record_1",
      target_kind: "v2_expansion_rehearsal_candidate",
      scope_id: scope.scope_id,
      scope_fingerprint: scope.scope_fingerprint,
      ordinal: 1,
      source_event_id: "synthetic_expansion_source_1",
      source_text_hash: "1".repeat(64),
      record_fingerprint: "a".repeat(64),
      synthetic_rehearsal_record: true
    },
    {
      schema: "aha_v2_controlled_write_expansion_rehearsal_record_v1",
      version: 1,
      id: "expansion_rehearsal_record_2",
      target_kind: "v2_expansion_rehearsal_candidate",
      scope_id: scope.scope_id,
      scope_fingerprint: scope.scope_fingerprint,
      ordinal: 2,
      source_event_id: "synthetic_expansion_source_2",
      source_text_hash: "2".repeat(64),
      record_fingerprint: "b".repeat(64),
      synthetic_rehearsal_record: true
    }
  ]
};

function makeAdapter(options = {}) {
  const sentinel = { id: "unrelated_sentinel", kind: "sentinel", value: "preserve" };
  const values = new Map([[sentinel.id, clone(sentinel)]]);
  let failed = false;
  const adapter = {
    scope: options.scope || "v2_expansion_rehearsal_staging",
    async get(id) { return clone(values.get(id) ?? null); },
    async put(id, value) {
      if (options.failPutId === id && !failed) {
        failed = true;
        if (options.writeThenThrow) values.set(id, clone(value));
        throw new Error("synthetic_adapter_put_failure");
      }
      values.set(id, clone(value));
    },
    async remove(id) { values.delete(id); },
    async list() { return [...values.values()].map(clone); },
    rawSet(id, value) { values.set(id, clone(value)); },
    rawGet(id) { return clone(values.get(id) ?? null); }
  };
  return adapter;
}

(async () => {
  const validated = rehearsal.validatePlan(plan);
  assert.equal(validated.scope.max_records, 2);
  assert.equal(validated.records.length, 2);

  const adapter = makeAdapter();
  const before = await adapter.list();
  const proof = await rehearsal.rehearse(plan, adapter, { explicit_rehearsal_authorization: true });
  assert.equal(proof.status, "verified");
  assert.equal(proof.isolated_rehearsal_verified, true);
  assert.equal(proof.first_apply_write_count, 2);
  assert.equal(proof.identical_replay_write_count, 0);
  assert.equal(proof.identical_replay_no_op_count, 2);
  assert.equal(proof.rollback_status, "rolled_back");
  assert.equal(proof.rollback_exact, true);
  assert.equal(proof.rollback_count, 2);
  assert.equal(proof.exact_pre_run_state_restored, true);
  assert.deepEqual(await adapter.list(), before);
  assert.deepEqual(adapter.rawGet("unrelated_sentinel"), { id: "unrelated_sentinel", kind: "sentinel", value: "preserve" });

  const directAdapter = makeAdapter();
  const first = await rehearsal.apply(plan, directAdapter, { explicit_rehearsal_authorization: true });
  assert.equal(first.write_count, 2);
  const replay = await rehearsal.apply(plan, directAdapter, { explicit_rehearsal_authorization: true });
  assert.equal(replay.write_count, 0);
  assert.equal(replay.no_op_count, 2);
  const rolledBack = await rehearsal.rollback(first, directAdapter);
  assert.equal(rolledBack.status, "rolled_back");
  assert.equal(rolledBack.exact, true);
  assert.equal(rolledBack.rolled_back_count, 2);
  assert.equal(directAdapter.rawGet("expansion_rehearsal_record_1"), null);
  assert.equal(directAdapter.rawGet("expansion_rehearsal_record_2"), null);
  assert.ok(directAdapter.rawGet("unrelated_sentinel"));

  // Partial failure after record 2 has actually been written must compensate
  // both target records back to the exact pre-run state.
  const failureAdapter = makeAdapter({ failPutId: "expansion_rehearsal_record_2", writeThenThrow: true });
  const failureBefore = await failureAdapter.list();
  let partialFailure = null;
  try {
    await rehearsal.apply(plan, failureAdapter, { explicit_rehearsal_authorization: true });
  } catch (error) {
    partialFailure = error;
  }
  assert.ok(partialFailure, "partial failure must throw");
  assert.equal(partialFailure.message, "synthetic_adapter_put_failure");
  assert.equal(partialFailure.compensation?.status, "compensated");
  assert.equal(partialFailure.compensation?.exact, true);
  assert.equal(partialFailure.compensation?.restored_count, 2);
  assert.deepEqual(await failureAdapter.list(), failureBefore, "partial failure compensation must restore exact pre-run state");
  assert.ok(failureAdapter.rawGet("unrelated_sentinel"));

  // Any drift on one target must block the whole rollback before another target
  // is removed. This proves fail-closed, all-or-nothing rollback preflight.
  const driftAdapter = makeAdapter();
  const driftReceipt = await rehearsal.apply(plan, driftAdapter, { explicit_rehearsal_authorization: true });
  const modified = clone(plan.records[0]);
  modified.record_fingerprint = "c".repeat(64);
  driftAdapter.rawSet(modified.id, modified);
  const driftRollback = await rehearsal.rollback(driftReceipt, driftAdapter);
  assert.equal(driftRollback.status, "manual_review_required");
  assert.equal(driftRollback.exact, false);
  assert.equal(driftRollback.rolled_back_count, 0);
  assert.equal(driftRollback.reason, "expansion_rehearsal_rollback_state_drift");
  assert.ok(driftAdapter.rawGet("expansion_rehearsal_record_1"));
  assert.ok(driftAdapter.rawGet("expansion_rehearsal_record_2"), "record 2 must not be partially deleted when record 1 drifted");
  assert.ok(driftAdapter.rawGet("unrelated_sentinel"));

  await assert.rejects(
    () => rehearsal.apply(plan, makeAdapter(), {}),
    (error) => error?.code === "expansion_rehearsal_authorization_required"
  );
  await assert.rejects(
    () => rehearsal.apply(plan, makeAdapter({ scope: "aha_insight_chamber_v1" }), { explicit_rehearsal_authorization: true }),
    (error) => error?.code === "expansion_rehearsal_adapter_scope_invalid"
  );

  const unsafeScopePlan = clone(plan);
  unsafeScopePlan.scope_contract.activation_authority = true;
  await assert.rejects(
    () => rehearsal.apply(unsafeScopePlan, makeAdapter(), { explicit_rehearsal_authorization: true }),
    (error) => error?.code === "expansion_rehearsal_scope_not_candidate_only"
  );

  const unsafeRecordPlan = clone(plan);
  unsafeRecordPlan.records[0].synthetic_rehearsal_record = false;
  await assert.rejects(
    () => rehearsal.apply(unsafeRecordPlan, makeAdapter(), { explicit_rehearsal_authorization: true }),
    (error) => error?.code === "expansion_rehearsal_non_synthetic_record_blocked"
  );

  const p = rehearsal.policy();
  assert.equal(p.rehearsal_only, true);
  assert.equal(p.current_one_record_pilot_max_records, 1);
  assert.equal(p.current_one_record_pilot_budget_may_change, false);
  [
    "chamber_write_allowed",
    "backend_sync_allowed",
    "backend_persistent_write_allowed",
    "normal_chat_persistence_allowed",
    "automatic_activation_allowed",
    "batch_activation_allowed",
    "automatic_backfill_allowed",
    "broad_canonical_write_allowed",
    "projection_store_write_allowed",
    "meta_write_allowed",
    "remote_write_allowed"
  ].forEach((field) => assert.equal(p[field], false, `${field} must stay false`));

  assert.doesNotMatch(rehearsalSource, /localStorage\.|sessionStorage\.|indexedDB\.|fetch\(|XMLHttpRequest|saveChamber|loadChamber|AHARepository|Supabase/u);
  assert.match(rehearsalSource, /ADAPTER_SCOPE = "v2_expansion_rehearsal_staging"/u);
  assert.match(rehearsalSource, /current_one_record_pilot_max_records: 1/u);

  console.log("aha-v2-controlled-write-expansion-rehearsal.test.cjs: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
