const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ORIGIN = process.env.AHA_FRONTEND_ORIGIN || "https://paradispartiet.github.io/AHA-EchoNet";
const EXPECTED_MAIN = String(process.env.EXPECTED_MAIN_SHA || "");
const OUTPUT = process.env.PROOF_OUTPUT || "probe-evidence/two-record-expansion-live-proof-v2.json";
const PARITY_PATH = process.env.PARITY_PATH || "probe-evidence/pages-parity-v2.json";
const DEPLOYED_ASSET_DIR = process.env.DEPLOYED_ASSET_DIR || "probe-evidence/deployed-assets";
const RUN_ID = Number(process.env.GITHUB_RUN_ID || 0) || null;
const RUN_ATTEMPT = Number(process.env.GITHUB_RUN_ATTEMPT || 0) || null;

if (!/^[a-f0-9]{40}$/u.test(EXPECTED_MAIN)) throw new Error("EXPECTED_MAIN_SHA is required");

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function deployedAssetPath(repositoryPath) {
  return path.join(DEPLOYED_ASSET_DIR, repositoryPath.replaceAll("/", "__"));
}

function readVerifiedAsset(repositoryPath, parity) {
  const entry = parity.assets.find((asset) => asset.path === repositoryPath);
  if (!entry?.match || !/^[a-f0-9]{64}$/u.test(String(entry.sha256 || ""))) {
    throw new Error(`deployed_asset_not_verified:${repositoryPath}`);
  }
  const bytes = fs.readFileSync(deployedAssetPath(repositoryPath));
  const actual = sha256Buffer(bytes);
  if (actual !== entry.sha256) throw new Error(`execution_copy_hash_mismatch:${repositoryPath}`);
  return bytes;
}

async function storageSnapshot(page) {
  return page.evaluate(async () => {
    async function normalize(value) {
      if (value === undefined) return { __type: "undefined" };
      if (value === null || typeof value === "string" || typeof value === "boolean") return value;
      if (typeof value === "number") {
        if (Number.isNaN(value)) return { __type: "number", value: "NaN" };
        if (value === Infinity) return { __type: "number", value: "Infinity" };
        if (value === -Infinity) return { __type: "number", value: "-Infinity" };
        if (Object.is(value, -0)) return { __type: "number", value: "-0" };
        return value;
      }
      if (typeof value === "bigint") return { __type: "bigint", value: value.toString() };
      if (value instanceof Date) return { __type: "date", value: value.toISOString() };
      if (value instanceof ArrayBuffer) {
        return { __type: "arraybuffer", bytes: Array.from(new Uint8Array(value)) };
      }
      if (ArrayBuffer.isView(value)) {
        return {
          __type: value.constructor?.name || "typed-array",
          bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
        };
      }
      if (typeof Blob !== "undefined" && value instanceof Blob) {
        const bytes = Array.from(new Uint8Array(await value.arrayBuffer()));
        const out = { __type: value instanceof File ? "file" : "blob", type: value.type, size: value.size, bytes };
        if (typeof File !== "undefined" && value instanceof File) {
          out.name = value.name;
          out.lastModified = value.lastModified;
        }
        return out;
      }
      if (value instanceof Map) {
        const entries = [];
        for (const [key, entryValue] of value.entries()) entries.push([await normalize(key), await normalize(entryValue)]);
        entries.sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0])));
        return { __type: "map", entries };
      }
      if (value instanceof Set) {
        const values = [];
        for (const entryValue of value.values()) values.push(await normalize(entryValue));
        values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        return { __type: "set", values };
      }
      if (Array.isArray(value)) {
        const out = [];
        for (const entry of value) out.push(await normalize(entry));
        return out;
      }
      const out = {};
      for (const key of Object.keys(value).sort()) out[key] = await normalize(value[key]);
      return out;
    }

    async function digest(value) {
      const encoded = new TextEncoder().encode(JSON.stringify(await normalize(value)));
      const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoded));
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    function requestResult(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("indexeddb_request_failed"));
      });
    }

    const local = Object.fromEntries(
      Array.from({ length: localStorage.length }, (_, index) => {
        const key = localStorage.key(index);
        return [key, localStorage.getItem(key)];
      }).sort(([a], [b]) => a.localeCompare(b))
    );
    const session = Object.fromEntries(
      Array.from({ length: sessionStorage.length }, (_, index) => {
        const key = sessionStorage.key(index);
        return [key, sessionStorage.getItem(key)];
      }).sort(([a], [b]) => a.localeCompare(b))
    );

    const dbInfos = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [];
    const indexed = [];
    for (const info of dbInfos) {
      if (!info.name) continue;
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(info.name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
      });
      const stores = [];
      for (const storeName of Array.from(db.objectStoreNames).sort()) {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const [keys, values] = await Promise.all([
          requestResult(store.getAllKeys()),
          requestResult(store.getAll())
        ]);
        const records = [];
        for (let index = 0; index < Math.max(keys.length, values.length); index += 1) {
          records.push({ key: keys[index], value: values[index] });
        }
        stores.push({
          name: storeName,
          key_path: await normalize(store.keyPath),
          auto_increment: store.autoIncrement === true,
          record_count: records.length,
          records_sha256: await digest(records)
        });
      }
      indexed.push({ name: info.name, version: db.version, stores });
      db.close();
    }
    indexed.sort((a, b) => a.name.localeCompare(b.name));
    return { local, session, indexed, indexed_snapshot_mode: "stable_keys_values_sha256" };
  });
}

async function run() {
  const parity = JSON.parse(fs.readFileSync(PARITY_PATH, "utf8"));
  assert.equal(parity.schema, "aha_v2_two_record_expansion_pages_parity_v2");
  assert.equal(parity.expected_main, EXPECTED_MAIN);
  assert.equal(parity.pages_commit, EXPECTED_MAIN);
  assert.equal(parity.pages_status, "built");
  assert.equal(parity.all_assets_match, true);

  const gateSource = readVerifiedAsset("js/ahaV2ControlledWriteExpansionGate.js", parity).toString("utf8");
  const rehearsalSource = readVerifiedAsset("js/ahaV2ControlledWriteExpansionRehearsal.js", parity).toString("utf8");
  const scope = JSON.parse(readVerifiedAsset("ops/contracts/aha-v2-controlled-write-expansion-scope-two-record-v1.json", parity).toString("utf8"));
  const baselineProof = JSON.parse(readVerifiedAsset("ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json", parity).toString("utf8"));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(45000);

  const pageErrors = [];
  const consoleErrors = [];
  const requests = [];
  page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));

  try {
    // Use a passive same-origin JSON document only to establish the Pages origin.
    // Every proof module/data byte executed below comes from the hash-verified
    // copies captured by the parity step, not from a later network refetch.
    await page.goto(`${ORIGIN}/ops/contracts/aha-v2-controlled-write-expansion-scope-two-record-v1.json?origin_probe=${RUN_ID || Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    const before = await storageSnapshot(page);
    requests.length = 0;
    pageErrors.length = 0;
    consoleErrors.length = 0;

    await page.addScriptTag({ content: gateSource });
    await page.addScriptTag({ content: rehearsalSource });

    const scenario = await page.evaluate(async ({ exactScope }) => {
      const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
      const stable = (value) => {
        if (Array.isArray(value)) return value.map(stable);
        if (!value || typeof value !== "object") return value;
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
      };
      const eq = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
      const gate = window.AHAV2ControlledWriteExpansionGate;
      const rehearsal = window.AHAV2ControlledWriteExpansionRehearsal;
      if (!gate || !rehearsal) throw new Error("expansion_live_modules_unavailable");
      if (!gate.validateScopeContract(exactScope)?.valid) throw new Error("expansion_live_scope_invalid");

      const records = [1, 2].map((ordinal) => ({
        schema: "aha_v2_controlled_write_expansion_rehearsal_record_v1",
        version: 1,
        id: `live_expansion_canary_${ordinal}`,
        target_kind: "v2_expansion_rehearsal_candidate",
        scope_id: exactScope.scope_id,
        scope_fingerprint: exactScope.scope_fingerprint,
        ordinal,
        source_event_id: `synthetic_live_expansion_source_${ordinal}`,
        source_text_hash: String(ordinal).repeat(64),
        record_fingerprint: (ordinal === 1 ? "a" : "b").repeat(64),
        synthetic_rehearsal_record: true
      }));
      const plan = {
        schema: "aha_v2_controlled_write_expansion_rehearsal_plan_v1",
        version: 1,
        scope_contract: clone(exactScope),
        records
      };
      const sentinel = { id: "expansion_live_sentinel", kind: "sentinel", value: "preserve", nested: { proof: "exact" } };

      function makeAdapter(options = {}) {
        const values = new Map([[sentinel.id, clone(sentinel)]]);
        let getCount = 0;
        let putFailed = false;
        let removeFailed = false;
        return {
          scope: "v2_expansion_rehearsal_staging",
          async get(id) {
            getCount += 1;
            if (options.failGetAt === getCount) throw new Error("synthetic_live_replay_get_failure");
            return clone(values.get(id) ?? null);
          },
          async put(id, value) {
            if (options.failPutId === id && !putFailed) {
              putFailed = true;
              if (options.writeThenThrow) values.set(id, clone(value));
              throw new Error("synthetic_live_partial_failure");
            }
            values.set(id, clone(value));
          },
          async remove(id) {
            if (options.failRemoveId === id && !removeFailed) {
              removeFailed = true;
              throw new Error("synthetic_live_remove_failure");
            }
            values.delete(id);
          },
          async list() { return [...values.values()].map(clone); },
          rawSet(id, value) { values.set(id, clone(value)); },
          rawGet(id) { return clone(values.get(id) ?? null); }
        };
      }

      // Exact immutable-scope binding: retaining the old fingerprint must not
      // authorize a mutated max=3 plan.
      const mutatedPlan = clone(plan);
      mutatedPlan.scope_contract.max_chamber_records_created = 3;
      mutatedPlan.records.push({
        ...clone(records[1]),
        id: "live_expansion_canary_3",
        ordinal: 3,
        source_event_id: "synthetic_live_expansion_source_3",
        source_text_hash: "3".repeat(64),
        record_fingerprint: "c".repeat(64)
      });
      let immutableScopeError = null;
      try { rehearsal.validatePlan(mutatedPlan); }
      catch (error) { immutableScopeError = error?.code || error?.message || null; }
      if (immutableScopeError !== "expansion_rehearsal_scope_not_committed_candidate") {
        throw new Error(`expansion_live_scope_mutation_not_blocked:${immutableScopeError}`);
      }

      const normalAdapter = makeAdapter();
      const normalBefore = await normalAdapter.list();
      const rehearsalProof = await rehearsal.rehearse(plan, normalAdapter, { explicit_rehearsal_authorization: true });
      if (rehearsalProof.status !== "verified") throw new Error("expansion_live_rehearsal_not_verified");
      if (!eq(await normalAdapter.list(), normalBefore)) throw new Error("expansion_live_exact_state_not_restored");
      if (!eq(normalAdapter.rawGet(sentinel.id), sentinel)) throw new Error("expansion_live_sentinel_content_changed");

      // Partial failure after the second record is actually written.
      const failureAdapter = makeAdapter({ failPutId: records[1].id, writeThenThrow: true });
      const failureBefore = await failureAdapter.list();
      let partialCompensation = null;
      try {
        await rehearsal.apply(plan, failureAdapter, { explicit_rehearsal_authorization: true });
        throw new Error("expansion_live_partial_failure_not_triggered");
      } catch (error) {
        if (error.message === "expansion_live_partial_failure_not_triggered") throw error;
        partialCompensation = clone(error.compensation || null);
      }
      if (partialCompensation?.status !== "compensated" || partialCompensation?.exact !== true) {
        throw new Error("expansion_live_partial_compensation_not_exact");
      }
      if (!eq(await failureAdapter.list(), failureBefore)) throw new Error("expansion_live_partial_compensation_state_mismatch");
      if (!eq(failureAdapter.rawGet(sentinel.id), sentinel)) throw new Error("expansion_live_partial_sentinel_changed");

      // Remove record 1 successfully, fail on record 2, then require exact
      // compensation of the already removed record.
      const removeFailureAdapter = makeAdapter({ failRemoveId: records[1].id });
      const removeReceipt = await rehearsal.apply(plan, removeFailureAdapter, { explicit_rehearsal_authorization: true });
      const removeBeforeRollback = await removeFailureAdapter.list();
      const removeFailureRollback = await rehearsal.rollback(removeReceipt, removeFailureAdapter);
      if (
        removeFailureRollback.status !== "manual_review_required" ||
        removeFailureRollback.rolled_back_count !== 0 ||
        removeFailureRollback.reason !== "expansion_rehearsal_rollback_remove_failed" ||
        removeFailureRollback.compensation?.exact !== true
      ) throw new Error("expansion_live_remove_failure_not_compensated");
      if (!eq(await removeFailureAdapter.list(), removeBeforeRollback)) throw new Error("expansion_live_remove_compensation_state_mismatch");
      if (!eq(removeFailureAdapter.rawGet(sentinel.id), sentinel)) throw new Error("expansion_live_remove_sentinel_changed");

      // First apply consumes six get() calls. Fail the first replay read and
      // require rehearse() to clean the first receipt back to exact pre-run state.
      const replayFailureAdapter = makeAdapter({ failGetAt: 7 });
      const replayBefore = await replayFailureAdapter.list();
      let replayError = null;
      try { await rehearsal.rehearse(plan, replayFailureAdapter, { explicit_rehearsal_authorization: true }); }
      catch (error) { replayError = error; }
      if (!replayError || replayError.message !== "synthetic_live_replay_get_failure") throw new Error("expansion_live_replay_failure_not_observed");
      if (replayError.rehearsal_cleanup?.status !== "rolled_back" || replayError.rehearsal_cleanup?.exact !== true) {
        throw new Error("expansion_live_replay_cleanup_not_exact");
      }
      if (!eq(await replayFailureAdapter.list(), replayBefore)) throw new Error("expansion_live_replay_cleanup_state_mismatch");
      if (!eq(replayFailureAdapter.rawGet(sentinel.id), sentinel)) throw new Error("expansion_live_replay_sentinel_changed");

      // Drift the LATER rollback target (record 2). Record 1 must not be
      // deleted before the drift is detected.
      const driftAdapter = makeAdapter();
      const driftReceipt = await rehearsal.apply(plan, driftAdapter, { explicit_rehearsal_authorization: true });
      const driftedSecond = clone(records[1]);
      driftedSecond.record_fingerprint = "d".repeat(64);
      driftAdapter.rawSet(driftedSecond.id, driftedSecond);
      const driftRollback = await rehearsal.rollback(driftReceipt, driftAdapter);
      if (driftRollback.status !== "manual_review_required" || driftRollback.rolled_back_count !== 0) {
        throw new Error("expansion_live_state_drift_not_fail_closed");
      }
      if (!eq(driftAdapter.rawGet(records[0].id), records[0])) throw new Error("expansion_live_earlier_record_deleted_before_later_drift");
      if (!eq(driftAdapter.rawGet(records[1].id), driftedSecond)) throw new Error("expansion_live_drifted_record_changed");
      if (!eq(driftAdapter.rawGet(sentinel.id), sentinel)) throw new Error("expansion_live_drift_sentinel_changed");

      const policy = rehearsal.policy();
      const policyOpen = Object.entries(policy)
        .filter(([name, value]) => /allowed$/u.test(name) && value === true)
        .map(([name]) => name);
      if (policyOpen.length) throw new Error(`expansion_live_rehearsal_authority_open:${policyOpen.join(",")}`);

      return {
        scope_id: exactScope.scope_id,
        max_records: exactScope.max_chamber_records_created,
        immutable_scope_mutation_blocked: true,
        immutable_scope_error: immutableScopeError,
        first_apply_write_count: rehearsalProof.first_apply_write_count,
        identical_replay_write_count: rehearsalProof.identical_replay_write_count,
        identical_replay_no_op_count: rehearsalProof.identical_replay_no_op_count,
        rollback_status: rehearsalProof.rollback_status,
        rollback_exact: rehearsalProof.rollback_exact,
        rollback_count: rehearsalProof.rollback_count,
        exact_pre_run_state_restored: rehearsalProof.exact_pre_run_state_restored,
        partial_failure_compensation_status: partialCompensation?.status || null,
        partial_failure_compensation_exact: partialCompensation?.exact === true,
        rollback_remove_failure_status: removeFailureRollback.status,
        rollback_remove_failure_rolled_back_count: removeFailureRollback.rolled_back_count,
        rollback_remove_failure_reason: removeFailureRollback.reason,
        rollback_remove_failure_compensation_exact: removeFailureRollback.compensation?.exact === true,
        rollback_remove_failure_state_restored: eq(await removeFailureAdapter.list(), removeBeforeRollback),
        replay_failure_message: replayError.message,
        replay_failure_cleanup_status: replayError.rehearsal_cleanup?.status || null,
        replay_failure_cleanup_exact: replayError.rehearsal_cleanup?.exact === true,
        replay_failure_exact_pre_run_state_restored: eq(await replayFailureAdapter.list(), replayBefore),
        drift_target_ordinal: 2,
        drift_rollback_status: driftRollback.status,
        drift_rolled_back_count: driftRollback.rolled_back_count,
        earlier_record_preserved_on_later_drift: eq(driftAdapter.rawGet(records[0].id), records[0]),
        drifted_record_preserved: eq(driftAdapter.rawGet(records[1].id), driftedSecond),
        unrelated_sentinel_full_content_preserved: [
          normalAdapter,
          failureAdapter,
          removeFailureAdapter,
          replayFailureAdapter,
          driftAdapter
        ].every((adapter) => eq(adapter.rawGet(sentinel.id), sentinel)),
        rehearsal_policy_all_write_authorities_false: policyOpen.length === 0
      };
    }, { exactScope: scope });

    const afterScenarios = await storageSnapshot(page);
    const unexpectedRequests = requests.slice();
    const browserBoundaryGreen =
      same(before.local, afterScenarios.local) &&
      same(before.session, afterScenarios.session) &&
      same(before.indexed, afterScenarios.indexed) &&
      unexpectedRequests.length === 0 &&
      pageErrors.length === 0 &&
      consoleErrors.length === 0;

    assert.equal(browserBoundaryGreen, true, JSON.stringify({ before, afterScenarios, unexpectedRequests, pageErrors, consoleErrors }));

    const evidence = {
      evidence_id: "aha_v2_two_record_expansion_corrected_temp_live_proof_v2",
      observed_at: new Date().toISOString(),
      source: "github_pages_hash_bound_two_record_expansion_live_canary_v2",
      one_record_pilot_proof_permanent: true,
      expansion_scope_contract: clone(scope),
      multi_record_rollback_rehearsal_proven: scenario.rollback_status === "rolled_back" && scenario.rollback_exact === true,
      rollback_each_record_exactly_bound: scenario.rollback_count === 2,
      unrelated_chamber_records_preserved: scenario.unrelated_sentinel_full_content_preserved === true,
      partial_failure_compensation_proven:
        scenario.partial_failure_compensation_exact === true &&
        scenario.rollback_remove_failure_compensation_exact === true,
      compensation_restores_exact_pre_run_state:
        scenario.rollback_remove_failure_state_restored === true &&
        scenario.replay_failure_exact_pre_run_state_restored === true,
      idempotent_multi_record_replay_proven:
        scenario.identical_replay_write_count === 0 && scenario.identical_replay_no_op_count === 2,
      identical_replay_write_count_zero: scenario.identical_replay_write_count === 0,
      multi_record_state_drift_fail_closed_proven:
        scenario.drift_target_ordinal === 2 &&
        scenario.drift_rolled_back_count === 0 &&
        scenario.earlier_record_preserved_on_later_drift === true,
      production_expansion_canary_proof: true,
      production_expansion_canary_count: 2,
      production_canary_coverage_complete: true,
      candidate_main_commit_sha: EXPECTED_MAIN,
      deployed_commit_sha: EXPECTED_MAIN,
      deployment_commit_matches_candidate_main: true,
      no_unexpected_persistence_write_observed: browserBoundaryGreen,
      no_authority_leak_observed: true,
      production_evidence_redacted: true,
      raw_source_text_in_evidence: false,
      raw_evidence_quotes_in_evidence: false,
      signatures_in_evidence: false,
      current_one_record_pilot_budget_unchanged: true,
      current_one_record_pilot_max_records: 1,
      separate_activation_pr_required: true,
      fresh_post_activation_production_proof_required: true,
      automatic_activation_open: false,
      batch_activation_open: false,
      normal_chat_persistence_open: false,
      automatic_backfill_open: false,
      backend_sync_open: false,
      backend_persistent_write_open: false,
      broad_canonical_write_open: false,
      projection_store_write_open: false,
      meta_write_open: false,
      remote_write_open: false
    };

    const gateDecision = await page.evaluate(({ exactEvidence, exactBaselineProof }) => {
      const gate = window.AHAV2ControlledWriteExpansionGate;
      return gate.evaluate({ evidence: exactEvidence, one_record_pilot_proof: exactBaselineProof });
    }, { exactEvidence: evidence, exactBaselineProof: baselineProof });

    const finalSnapshot = await storageSnapshot(page);
    assert.equal(same(before, finalSnapshot), true, "browser storage changed during gate decision");
    assert.equal(requests.length, 0, JSON.stringify(requests));
    assert.equal(pageErrors.length, 0, JSON.stringify(pageErrors));
    assert.equal(consoleErrors.length, 0, JSON.stringify(consoleErrors));
    assert.equal(gateDecision.decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE", JSON.stringify(gateDecision.blocking_reasons));
    assert.equal(gateDecision.eligible_for_expansion_activation, false);
    assert.equal(gateDecision.policy?.current_one_record_pilot_max_records, 1);
    assert.equal(gateDecision.policy?.current_one_record_pilot_budget_may_change, false);

    const proof = {
      schema: "aha_v2_two_record_expansion_live_proof_v1",
      version: 1,
      status: "production_evidence_verified",
      proof_revision: "corrected_v2",
      observed_at: new Date().toISOString(),
      expected_production_main: EXPECTED_MAIN,
      proof_identity: {
        workflow_run_id: RUN_ID,
        workflow_run_attempt: RUN_ATTEMPT,
        execution_source: "hash_verified_deployed_asset_copies",
        parity_manifest: PARITY_PATH
      },
      deployment: {
        authority: "github_pages",
        origin: ORIGIN,
        pages_commit: parity.pages_commit,
        pages_status: parity.pages_status,
        matched_attempt: parity.matched_attempt,
        all_assets_match: parity.all_assets_match,
        assets: parity.assets.map((asset) => ({ path: asset.path, sha256: asset.sha256, match: asset.match }))
      },
      scope: {
        scope_id: scenario.scope_id,
        max_chamber_records_created: scenario.max_records,
        candidate_only: true,
        activation_authority: false,
        immutable_scope_mutation_blocked: scenario.immutable_scope_mutation_blocked,
        immutable_scope_error: scenario.immutable_scope_error
      },
      canaries: {
        count: 2,
        coverage_complete: true,
        first_apply_write_count: scenario.first_apply_write_count,
        identical_replay_write_count: scenario.identical_replay_write_count,
        identical_replay_no_op_count: scenario.identical_replay_no_op_count,
        rollback_status: scenario.rollback_status,
        rollback_exact: scenario.rollback_exact,
        rollback_count: scenario.rollback_count,
        exact_pre_run_state_restored: scenario.exact_pre_run_state_restored,
        partial_failure_compensation_status: scenario.partial_failure_compensation_status,
        partial_failure_compensation_exact: scenario.partial_failure_compensation_exact,
        rollback_remove_failure_status: scenario.rollback_remove_failure_status,
        rollback_remove_failure_rolled_back_count: scenario.rollback_remove_failure_rolled_back_count,
        rollback_remove_failure_reason: scenario.rollback_remove_failure_reason,
        rollback_remove_failure_compensation_exact: scenario.rollback_remove_failure_compensation_exact,
        rollback_remove_failure_state_restored: scenario.rollback_remove_failure_state_restored,
        replay_failure_message: scenario.replay_failure_message,
        replay_failure_cleanup_status: scenario.replay_failure_cleanup_status,
        replay_failure_cleanup_exact: scenario.replay_failure_cleanup_exact,
        replay_failure_exact_pre_run_state_restored: scenario.replay_failure_exact_pre_run_state_restored,
        state_drift_target_ordinal: scenario.drift_target_ordinal,
        state_drift_status: scenario.drift_rollback_status,
        state_drift_rolled_back_count: scenario.drift_rolled_back_count,
        earlier_record_preserved_on_later_drift: scenario.earlier_record_preserved_on_later_drift,
        drifted_record_preserved: scenario.drifted_record_preserved,
        unrelated_sentinel_full_content_preserved: scenario.unrelated_sentinel_full_content_preserved
      },
      browser_boundary: {
        local_storage_unchanged: same(before.local, finalSnapshot.local),
        session_storage_unchanged: same(before.session, finalSnapshot.session),
        indexeddb_unchanged: same(before.indexed, finalSnapshot.indexed),
        indexeddb_content_digest_unchanged: same(before.indexed, finalSnapshot.indexed),
        indexeddb_snapshot_mode: finalSnapshot.indexed_snapshot_mode,
        unexpected_request_count: requests.length,
        unexpected_write_request_count: requests.filter((request) => request.method !== "GET" && request.method !== "HEAD").length,
        page_error_count: pageErrors.length,
        console_error_count: consoleErrors.length
      },
      decision: {
        expansion_gate_decision: gateDecision.decision,
        eligible_for_bounded_expansion_pilot: gateDecision.eligible_for_bounded_expansion_pilot,
        eligible_for_expansion_activation: gateDecision.eligible_for_expansion_activation,
        current_one_record_pilot_max_records: gateDecision.policy.current_one_record_pilot_max_records,
        current_one_record_pilot_budget_may_change: gateDecision.policy.current_one_record_pilot_budget_may_change,
        blocking_reasons: gateDecision.blocking_reasons
      },
      policy: {
        rehearsal_write_authorities_all_false: scenario.rehearsal_policy_all_write_authorities_false,
        normal_chat_persistence_open: false,
        automatic_backfill_open: false,
        backend_sync_open: false,
        backend_persistent_write_open: false,
        broad_canonical_write_open: false,
        projection_store_write_open: false,
        meta_write_open: false,
        remote_write_open: false,
        automatic_activation_open: false,
        batch_activation_open: false,
        separate_activation_pr_required: true,
        fresh_post_activation_production_proof_required: true
      },
      redaction: {
        raw_source_text_in_evidence: false,
        raw_evidence_quotes_in_evidence: false,
        signatures_in_evidence: false,
        user_production_data_modified: false,
        synthetic_rehearsal_records_only: true
      }
    };

    assert.equal(proof.scope.immutable_scope_mutation_blocked, true);
    assert.equal(proof.canaries.replay_failure_cleanup_exact, true);
    assert.equal(proof.canaries.rollback_remove_failure_compensation_exact, true);
    assert.equal(proof.canaries.state_drift_target_ordinal, 2);
    assert.equal(proof.canaries.state_drift_rolled_back_count, 0);
    assert.equal(proof.canaries.earlier_record_preserved_on_later_drift, true);
    assert.equal(proof.canaries.unrelated_sentinel_full_content_preserved, true);
    assert.equal(proof.browser_boundary.indexeddb_content_digest_unchanged, true);
    assert.equal(proof.browser_boundary.indexeddb_snapshot_mode, "stable_keys_values_sha256");
    assert.equal(proof.browser_boundary.unexpected_request_count, 0);
    assert.equal(proof.decision.expansion_gate_decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
    assert.deepEqual(proof.decision.blocking_reasons, []);

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(proof, null, 2)}\n`);
    console.log(JSON.stringify({
      production_evidence_verified: true,
      proof_revision: proof.proof_revision,
      canary_count: proof.canaries.count,
      immutable_scope_mutation_blocked: proof.scope.immutable_scope_mutation_blocked,
      replay_failure_cleanup_exact: proof.canaries.replay_failure_cleanup_exact,
      rollback_remove_failure_compensation_exact: proof.canaries.rollback_remove_failure_compensation_exact,
      later_target_drift_fail_closed: proof.canaries.state_drift_target_ordinal === 2 && proof.canaries.state_drift_rolled_back_count === 0,
      indexeddb_content_digest_unchanged: proof.browser_boundary.indexeddb_content_digest_unchanged,
      execution_source: proof.proof_identity.execution_source,
      gate_decision: proof.decision.expansion_gate_decision
    }, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
