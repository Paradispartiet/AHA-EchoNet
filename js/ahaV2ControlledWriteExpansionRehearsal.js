// ahaV2ControlledWriteExpansionRehearsal.js
// Isolated staging rehearsal for a future bounded multi-record V2 pilot.
// The current production pilot remains max=1 regardless of rehearsal outcome.
(function (global) {
  "use strict";

  const REHEARSAL_SCHEMA = "aha_v2_controlled_write_expansion_rehearsal_v1";
  const PLAN_SCHEMA = "aha_v2_controlled_write_expansion_rehearsal_plan_v1";
  const RECORD_SCHEMA = "aha_v2_controlled_write_expansion_rehearsal_record_v1";
  const ADAPTER_SCOPE = "v2_expansion_rehearsal_staging";
  const TARGET_KIND = "v2_expansion_rehearsal_candidate";
  const EXPECTED_SCOPE_ID = "bounded_local_chamber_two_record_candidate_v1";
  const EXPECTED_SCOPE_FINGERPRINT = "ee6952eef3517af8a868c83e4424125c70591af42ff4f568e76a8bba4aa3b5f8";
  const EXPECTED_MAX_RECORDS = 2;

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function text(value) { return String(value == null ? "" : value).trim(); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function sha256Like(value) { return /^[a-f0-9]{64}$/u.test(text(value)); }
  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  }
  function equal(left, right) { return stableStringify(left) === stableStringify(right); }
  function fail(code, detail = null) {
    const error = new Error(code);
    error.code = code;
    if (detail != null) error.detail = clone(detail);
    throw error;
  }

  function policy() {
    return {
      rehearsal_only: true,
      dedicated_staging_scope_only: true,
      current_one_record_pilot_max_records: 1,
      current_one_record_pilot_budget_may_change: false,
      chamber_write_allowed: false,
      backend_sync_allowed: false,
      backend_persistent_write_allowed: false,
      normal_chat_persistence_allowed: false,
      automatic_activation_allowed: false,
      batch_activation_allowed: false,
      automatic_backfill_allowed: false,
      broad_canonical_write_allowed: false,
      projection_store_write_allowed: false,
      meta_write_allowed: false,
      remote_write_allowed: false
    };
  }

  function validateScope(scope) {
    const validator = global.AHAV2ControlledWriteExpansionGate?.validateScopeContract;
    if (typeof validator !== "function") fail("expansion_rehearsal_gate_unavailable");
    const result = validator(scope);
    if (!result?.valid) fail("expansion_rehearsal_scope_invalid", result?.blocking_reasons || []);
    if (
      result.scope_id !== EXPECTED_SCOPE_ID ||
      result.scope_fingerprint !== EXPECTED_SCOPE_FINGERPRINT ||
      result.max_records !== EXPECTED_MAX_RECORDS
    ) {
      fail("expansion_rehearsal_scope_not_committed_candidate", {
        expected_scope_id: EXPECTED_SCOPE_ID,
        expected_scope_fingerprint: EXPECTED_SCOPE_FINGERPRINT,
        expected_max_records: EXPECTED_MAX_RECORDS
      });
    }
    if (scope?.candidate_only !== true || scope?.activation_authority !== false) fail("expansion_rehearsal_scope_not_candidate_only");
    const closedFields = [
      "normal_chat_persistence_open", "automatic_backfill_open", "backend_sync_open",
      "backend_persistent_write_open", "broad_canonical_write_open", "projection_store_write_open",
      "meta_write_open", "remote_write_open"
    ];
    closedFields.forEach((field) => {
      if (scope?.[field] !== false) fail(`expansion_rehearsal_scope_authority_open:${field}`);
    });
    if (scope?.scope_fingerprint_algorithm !== "sha256" || !sha256Like(scope?.scope_fingerprint)) {
      fail("expansion_rehearsal_scope_fingerprint_invalid");
    }
    return result;
  }

  function validatePlan(input) {
    const plan = input && typeof input === "object" ? input : {};
    if (plan.schema !== PLAN_SCHEMA || plan.version !== 1) fail("expansion_rehearsal_plan_invalid");
    const scope = validateScope(plan.scope_contract);
    const records = arr(plan.records);
    if (records.length !== scope.max_records) fail("expansion_rehearsal_record_budget_mismatch");
    const ids = new Set();
    const ordinals = new Set();
    records.forEach((record) => {
      if (record?.schema !== RECORD_SCHEMA || record?.version !== 1) fail("expansion_rehearsal_record_schema_invalid");
      if (record?.target_kind !== TARGET_KIND) fail("expansion_rehearsal_target_kind_invalid");
      if (record?.scope_id !== scope.scope_id || record?.scope_fingerprint !== scope.scope_fingerprint) fail("expansion_rehearsal_record_scope_binding_invalid");
      if (!text(record?.id) || ids.has(record.id)) fail("expansion_rehearsal_record_id_invalid");
      ids.add(record.id);
      const ordinal = Number(record?.ordinal);
      if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > scope.max_records || ordinals.has(ordinal)) fail("expansion_rehearsal_record_ordinal_invalid");
      ordinals.add(ordinal);
      if (!text(record?.source_event_id) || !sha256Like(record?.source_text_hash)) fail("expansion_rehearsal_source_binding_invalid");
      if (!sha256Like(record?.record_fingerprint)) fail("expansion_rehearsal_record_fingerprint_invalid");
      if (record?.synthetic_rehearsal_record !== true) fail("expansion_rehearsal_non_synthetic_record_blocked");
    });
    return clone({ scope, records });
  }

  function requireAdapter(adapter) {
    if (adapter?.scope !== ADAPTER_SCOPE) fail("expansion_rehearsal_adapter_scope_invalid");
    ["get", "put", "remove", "list"].forEach((method) => {
      if (typeof adapter?.[method] !== "function") fail(`expansion_rehearsal_adapter_missing:${method}`);
    });
    return adapter;
  }

  async function exactSnapshot(adapter) {
    const items = await adapter.list();
    return stableStringify(arr(items).map(clone).sort((a, b) => text(a?.id).localeCompare(text(b?.id))));
  }

  async function readTargets(records, adapter) {
    const result = {};
    for (const record of records) result[record.id] = clone(await adapter.get(record.id));
    return result;
  }

  async function restoreTargets(records, desired, adapter) {
    for (const record of records) {
      const current = clone(await adapter.get(record.id));
      const target = desired[record.id];
      if (!equal(current, target) && !equal(current, record)) {
        return { status: "manual_review_required", exact: false, restored_count: 0, reason: "expansion_rehearsal_compensation_state_drift" };
      }
    }
    let restored = 0;
    const errors = [];
    for (const record of records) {
      const target = desired[record.id];
      const current = clone(await adapter.get(record.id));
      if (equal(current, target)) continue;
      try {
        if (target == null) await adapter.remove(record.id);
        else await adapter.put(record.id, clone(target));
        restored += 1;
      } catch (error) {
        errors.push(text(error?.message || error));
      }
    }
    let exact = true;
    for (const record of records) {
      if (!equal(clone(await adapter.get(record.id)), desired[record.id])) exact = false;
    }
    return {
      status: exact ? "compensated" : "manual_review_required",
      exact,
      restored_count: restored,
      reason: exact ? null : "expansion_rehearsal_compensation_verification_failed",
      operation_errors: errors
    };
  }

  async function restoreCreatedRecords(created, adapter) {
    for (const record of created) {
      const current = clone(await adapter.get(record.id));
      if (current != null && !equal(current, record)) {
        return { status: "manual_review_required", exact: false, restored_count: 0, reason: "expansion_rehearsal_rollback_compensation_state_drift" };
      }
    }
    let restored = 0;
    const errors = [];
    for (const record of created) {
      const current = clone(await adapter.get(record.id));
      if (equal(current, record)) continue;
      try {
        await adapter.put(record.id, clone(record));
        restored += 1;
      } catch (error) {
        errors.push(text(error?.message || error));
      }
    }
    let exact = true;
    for (const record of created) {
      if (!equal(clone(await adapter.get(record.id)), record)) exact = false;
    }
    return {
      status: exact ? "compensated" : "manual_review_required",
      exact,
      restored_count: restored,
      reason: exact ? null : "expansion_rehearsal_rollback_compensation_verification_failed",
      operation_errors: errors
    };
  }

  async function apply(planInput, adapterInput, options = {}) {
    if (options.explicit_rehearsal_authorization !== true) fail("expansion_rehearsal_authorization_required");
    const { scope, records } = validatePlan(planInput);
    const adapter = requireAdapter(adapterInput);
    const before = await readTargets(records, adapter);
    const created = [];
    let noOps = 0;
    try {
      for (const record of records) {
        const existing = clone(await adapter.get(record.id));
        if (existing == null) {
          await adapter.put(record.id, clone(record));
          if (!equal(clone(await adapter.get(record.id)), record)) fail("expansion_rehearsal_write_verification_failed");
          created.push(clone(record));
        } else if (equal(existing, record)) {
          noOps += 1;
        } else {
          fail("expansion_rehearsal_state_conflict", { id: record.id });
        }
      }
    } catch (error) {
      const compensation = await restoreTargets(records, before, adapter);
      error.compensation = clone(compensation);
      if (!compensation.exact) error.code = "expansion_rehearsal_partial_failure_manual_review_required";
      throw error;
    }
    return clone({
      schema: REHEARSAL_SCHEMA, version: 1, status: "applied", adapter_scope: adapter.scope,
      scope_id: scope.scope_id, scope_fingerprint: scope.scope_fingerprint, max_records: scope.max_records,
      write_count: created.length, no_op_count: noOps, created_records: created, target_pre_state: before,
      policy: policy()
    });
  }

  async function rollback(receiptInput, adapterInput) {
    const receipt = receiptInput && typeof receiptInput === "object" ? receiptInput : {};
    const adapter = requireAdapter(adapterInput);
    if (receipt.schema !== REHEARSAL_SCHEMA || receipt.version !== 1 || receipt.status !== "applied") fail("expansion_rehearsal_receipt_invalid");
    if (receipt.adapter_scope !== ADAPTER_SCOPE) fail("expansion_rehearsal_receipt_scope_invalid");
    const created = arr(receipt.created_records);

    for (const record of created) {
      const current = clone(await adapter.get(record.id));
      if (!equal(current, record)) {
        return clone({ schema: REHEARSAL_SCHEMA, version: 1, status: "manual_review_required", exact: false, rolled_back_count: 0, reason: "expansion_rehearsal_rollback_state_drift", policy: policy() });
      }
    }

    let removeError = null;
    for (const record of created) {
      try { await adapter.remove(record.id); }
      catch (error) { removeError = error; break; }
    }
    if (removeError) {
      const compensation = await restoreCreatedRecords(created, adapter);
      return clone({
        schema: REHEARSAL_SCHEMA, version: 1, status: "manual_review_required", exact: false,
        rolled_back_count: 0,
        reason: compensation.exact ? "expansion_rehearsal_rollback_remove_failed" : "expansion_rehearsal_rollback_remove_failed_compensation_incomplete",
        compensation,
        policy: policy()
      });
    }

    let verified = true;
    for (const record of created) {
      const previous = receipt.target_pre_state?.[record.id] ?? null;
      if (!equal(clone(await adapter.get(record.id)), previous)) verified = false;
    }
    if (!verified) {
      const compensation = await restoreCreatedRecords(created, adapter);
      return clone({
        schema: REHEARSAL_SCHEMA, version: 1, status: "manual_review_required", exact: false,
        rolled_back_count: 0,
        reason: compensation.exact ? "expansion_rehearsal_rollback_verification_failed" : "expansion_rehearsal_rollback_verification_failed_compensation_incomplete",
        compensation,
        policy: policy()
      });
    }

    return clone({ schema: REHEARSAL_SCHEMA, version: 1, status: "rolled_back", exact: true, rolled_back_count: created.length, reason: null, policy: policy() });
  }

  async function rehearse(plan, adapter, options = {}) {
    requireAdapter(adapter);
    const before = await exactSnapshot(adapter);
    const first = await apply(plan, adapter, options);
    let second;
    try {
      second = await apply(plan, adapter, options);
    } catch (error) {
      try {
        const cleanup = await rollback(first, adapter);
        error.rehearsal_cleanup = clone(cleanup);
        if (cleanup.status !== "rolled_back" || cleanup.exact !== true) {
          error.code = "expansion_rehearsal_replay_failure_cleanup_incomplete";
        }
      } catch (cleanupError) {
        error.rehearsal_cleanup_error = text(cleanupError?.message || cleanupError);
        error.code = "expansion_rehearsal_replay_failure_cleanup_incomplete";
      }
      throw error;
    }
    const rollbackResult = await rollback(first, adapter);
    const after = await exactSnapshot(adapter);
    const expectedCount = validatePlan(plan).scope.max_records;
    const verified = first.write_count === expectedCount && second.write_count === 0 && second.no_op_count === expectedCount && rollbackResult.status === "rolled_back" && rollbackResult.rolled_back_count === expectedCount && before === after;
    return clone({
      schema: REHEARSAL_SCHEMA, version: 1, status: verified ? "verified" : "failed",
      isolated_rehearsal_verified: verified, adapter_scope: ADAPTER_SCOPE,
      first_apply_write_count: first.write_count, identical_replay_write_count: second.write_count,
      identical_replay_no_op_count: second.no_op_count, rollback_status: rollbackResult.status,
      rollback_exact: rollbackResult.exact, rollback_count: rollbackResult.rolled_back_count,
      exact_pre_run_state_restored: before === after, policy: policy()
    });
  }

  const api = Object.freeze({
    REHEARSAL_SCHEMA, PLAN_SCHEMA, RECORD_SCHEMA, ADAPTER_SCOPE, TARGET_KIND,
    stableStringify, validatePlan, apply, rollback, rehearse, policy
  });
  global.AHAV2ControlledWriteExpansionRehearsal = api;
  global.AHAModuleApi?.register?.("v2ControlledWriteExpansionRehearsal", api, {
    version: 1,
    legacyGlobal: "AHAV2ControlledWriteExpansionRehearsal",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
