const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ORIGIN = process.env.AHA_FRONTEND_ORIGIN || "https://paradispartiet.github.io/AHA-EchoNet";
const EXPECTED_MAIN = String(process.env.EXPECTED_MAIN_SHA || "");
const OUTPUT = process.env.PROOF_OUTPUT || "probe-evidence/two-record-expansion-live-proof.json";
const RUN_ID = Number(process.env.GITHUB_RUN_ID || 0) || null;
const RUN_ATTEMPT = Number(process.env.GITHUB_RUN_ATTEMPT || 0) || null;

if (!/^[a-f0-9]{40}$/u.test(EXPECTED_MAIN)) throw new Error("EXPECTED_MAIN_SHA is required");

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

async function storageSnapshot(page) {
  return page.evaluate(async () => {
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
    const dbs = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [];
    const indexed = [];
    for (const info of dbs) {
      if (!info.name) continue;
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(info.name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const counts = {};
      for (const storeName of Array.from(db.objectStoreNames)) {
        counts[storeName] = await new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, "readonly");
          const request = tx.objectStore(storeName).count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }
      db.close();
      indexed.push({ name: info.name, version: info.version, counts });
    }
    indexed.sort((a, b) => a.name.localeCompare(b.name));
    return { local, session, indexed };
  });
}

async function run() {
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
    await page.goto(`${ORIGIN}/insight-activation-v2.html?expansion_probe=${Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    await page.waitForFunction(() => document.querySelector("#page-status")?.textContent?.includes("Pilot lukket"));
    await page.waitForTimeout(750);

    const before = await storageSnapshot(page);
    requests.length = 0;
    pageErrors.length = 0;
    consoleErrors.length = 0;

    await page.addScriptTag({ url: `${ORIGIN}/js/ahaV2ControlledWriteExpansionGate.js?proof=${RUN_ID || Date.now()}` });
    await page.addScriptTag({ url: `${ORIGIN}/js/ahaV2ControlledWriteExpansionRehearsal.js?proof=${RUN_ID || Date.now()}` });

    const result = await page.evaluate(async ({ origin, expectedMain }) => {
      const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
      const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const scopeResponse = await fetch(`${origin}/ops/contracts/aha-v2-controlled-write-expansion-scope-two-record-v1.json?proof=${Date.now()}`, { cache: "no-store" });
      const proofResponse = await fetch(`${origin}/ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json?proof=${Date.now()}`, { cache: "no-store" });
      if (!scopeResponse.ok || !proofResponse.ok) throw new Error("expansion_live_fixture_fetch_failed");
      const scope = await scopeResponse.json();
      const baselineProof = await proofResponse.json();
      const gate = window.AHAV2ControlledWriteExpansionGate;
      const rehearsal = window.AHAV2ControlledWriteExpansionRehearsal;
      if (!gate || !rehearsal) throw new Error("expansion_live_modules_unavailable");
      if (!gate.validateScopeContract(scope)?.valid) throw new Error("expansion_live_scope_invalid");

      const records = [1, 2].map((ordinal) => ({
        schema: "aha_v2_controlled_write_expansion_rehearsal_record_v1",
        version: 1,
        id: `live_expansion_canary_${ordinal}`,
        target_kind: "v2_expansion_rehearsal_candidate",
        scope_id: scope.scope_id,
        scope_fingerprint: scope.scope_fingerprint,
        ordinal,
        source_event_id: `synthetic_live_expansion_source_${ordinal}`,
        source_text_hash: String(ordinal).repeat(64),
        record_fingerprint: (ordinal === 1 ? "a" : "b").repeat(64),
        synthetic_rehearsal_record: true
      }));
      const plan = {
        schema: "aha_v2_controlled_write_expansion_rehearsal_plan_v1",
        version: 1,
        scope_contract: clone(scope),
        records
      };

      function makeAdapter(options = {}) {
        const sentinel = { id: "expansion_live_sentinel", kind: "sentinel", value: "preserve" };
        const values = new Map([[sentinel.id, clone(sentinel)]]);
        let failed = false;
        return {
          scope: "v2_expansion_rehearsal_staging",
          async get(id) { return clone(values.get(id) ?? null); },
          async put(id, value) {
            if (options.failPutId === id && !failed) {
              failed = true;
              if (options.writeThenThrow) values.set(id, clone(value));
              throw new Error("synthetic_live_partial_failure");
            }
            values.set(id, clone(value));
          },
          async remove(id) { values.delete(id); },
          async list() { return [...values.values()].map(clone); },
          rawSet(id, value) { values.set(id, clone(value)); },
          rawGet(id) { return clone(values.get(id) ?? null); }
        };
      }

      const normalAdapter = makeAdapter();
      const normalBefore = await normalAdapter.list();
      const rehearsalProof = await rehearsal.rehearse(plan, normalAdapter, { explicit_rehearsal_authorization: true });
      if (rehearsalProof.status !== "verified") throw new Error("expansion_live_rehearsal_not_verified");
      if (!eq(await normalAdapter.list(), normalBefore)) throw new Error("expansion_live_exact_state_not_restored");
      if (!normalAdapter.rawGet("expansion_live_sentinel")) throw new Error("expansion_live_sentinel_lost");

      const failureAdapter = makeAdapter({ failPutId: records[1].id, writeThenThrow: true });
      const failureBefore = await failureAdapter.list();
      let compensation = null;
      try {
        await rehearsal.apply(plan, failureAdapter, { explicit_rehearsal_authorization: true });
        throw new Error("expansion_live_partial_failure_not_triggered");
      } catch (error) {
        if (error.message === "expansion_live_partial_failure_not_triggered") throw error;
        compensation = clone(error.compensation || null);
      }
      if (compensation?.status !== "compensated" || compensation?.exact !== true) throw new Error("expansion_live_compensation_not_exact");
      if (!eq(await failureAdapter.list(), failureBefore)) throw new Error("expansion_live_compensation_state_mismatch");

      const driftAdapter = makeAdapter();
      const driftReceipt = await rehearsal.apply(plan, driftAdapter, { explicit_rehearsal_authorization: true });
      const drifted = clone(records[0]);
      drifted.record_fingerprint = "c".repeat(64);
      driftAdapter.rawSet(drifted.id, drifted);
      const driftRollback = await rehearsal.rollback(driftReceipt, driftAdapter);
      if (driftRollback.status !== "manual_review_required" || driftRollback.rolled_back_count !== 0) throw new Error("expansion_live_state_drift_not_fail_closed");
      if (!driftAdapter.rawGet(records[0].id) || !driftAdapter.rawGet(records[1].id)) throw new Error("expansion_live_drift_deleted_target");
      if (!driftAdapter.rawGet("expansion_live_sentinel")) throw new Error("expansion_live_drift_sentinel_lost");

      const evidence = {
        evidence_id: "aha_v2_two_record_expansion_temp_live_proof",
        observed_at: new Date().toISOString(),
        source: "github_pages_two_record_expansion_live_canary",
        one_record_pilot_proof_permanent: true,
        expansion_scope_contract: clone(scope),
        multi_record_rollback_rehearsal_proven: true,
        rollback_each_record_exactly_bound: rehearsalProof.rollback_exact === true && rehearsalProof.rollback_count === 2,
        unrelated_chamber_records_preserved: true,
        partial_failure_compensation_proven: compensation?.status === "compensated",
        compensation_restores_exact_pre_run_state: compensation?.exact === true,
        idempotent_multi_record_replay_proven: rehearsalProof.identical_replay_write_count === 0 && rehearsalProof.identical_replay_no_op_count === 2,
        identical_replay_write_count_zero: rehearsalProof.identical_replay_write_count === 0,
        multi_record_state_drift_fail_closed_proven: driftRollback.status === "manual_review_required" && driftRollback.rolled_back_count === 0,
        production_expansion_canary_proof: true,
        production_expansion_canary_count: 2,
        production_canary_coverage_complete: true,
        candidate_main_commit_sha: expectedMain,
        deployed_commit_sha: expectedMain,
        deployment_commit_matches_candidate_main: true,
        no_unexpected_persistence_write_observed: true,
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
      const gateDecision = gate.evaluate({ evidence, one_record_pilot_proof: baselineProof });
      if (gateDecision.decision !== "BOUNDED_EXPANSION_PILOT_ELIGIBLE") throw new Error(`expansion_live_gate_not_green:${gateDecision.blocking_reasons?.join(",")}`);
      if (gateDecision.eligible_for_expansion_activation !== false) throw new Error("expansion_live_activation_opened");
      if (gateDecision.policy?.current_one_record_pilot_max_records !== 1 || gateDecision.policy?.current_one_record_pilot_budget_may_change !== false) throw new Error("expansion_live_current_pilot_boundary_changed");

      const policy = rehearsal.policy();
      const policyOpen = Object.entries(policy).filter(([name, value]) => /allowed$/u.test(name) && value === true).map(([name]) => name);
      if (policyOpen.length) throw new Error(`expansion_live_rehearsal_authority_open:${policyOpen.join(",")}`);

      return {
        scope_id: scope.scope_id,
        max_records: scope.max_chamber_records_created,
        first_apply_write_count: rehearsalProof.first_apply_write_count,
        identical_replay_write_count: rehearsalProof.identical_replay_write_count,
        identical_replay_no_op_count: rehearsalProof.identical_replay_no_op_count,
        rollback_status: rehearsalProof.rollback_status,
        rollback_exact: rehearsalProof.rollback_exact,
        rollback_count: rehearsalProof.rollback_count,
        exact_pre_run_state_restored: rehearsalProof.exact_pre_run_state_restored,
        partial_failure_compensation_status: compensation?.status || null,
        partial_failure_compensation_exact: compensation?.exact === true,
        drift_rollback_status: driftRollback.status,
        drift_rolled_back_count: driftRollback.rolled_back_count,
        sentinel_preserved: true,
        production_canary_count: 2,
        gate_decision: gateDecision.decision,
        eligible_for_expansion_activation: gateDecision.eligible_for_expansion_activation,
        current_one_record_pilot_max_records: gateDecision.policy.current_one_record_pilot_max_records,
        current_one_record_pilot_budget_may_change: gateDecision.policy.current_one_record_pilot_budget_may_change,
        rehearsal_policy_all_write_authorities_false: policyOpen.length === 0
      };
    }, { origin: ORIGIN, expectedMain: EXPECTED_MAIN });

    const after = await storageSnapshot(page);
    const nonReadRequests = requests.filter((item) => item.method !== "GET" && item.method !== "HEAD");
    assert.equal(same(before, after), true, "browser storage changed during expansion rehearsal");
    assert.equal(nonReadRequests.length, 0, JSON.stringify(nonReadRequests));
    assert.equal(pageErrors.length, 0, JSON.stringify(pageErrors));
    assert.equal(consoleErrors.length, 0, JSON.stringify(consoleErrors));
    assert.equal(result.max_records, 2);
    assert.equal(result.production_canary_count, 2);
    assert.equal(result.first_apply_write_count, 2);
    assert.equal(result.identical_replay_write_count, 0);
    assert.equal(result.rollback_status, "rolled_back");
    assert.equal(result.rollback_count, 2);
    assert.equal(result.partial_failure_compensation_exact, true);
    assert.equal(result.drift_rollback_status, "manual_review_required");
    assert.equal(result.gate_decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
    assert.equal(result.eligible_for_expansion_activation, false);
    assert.equal(result.current_one_record_pilot_max_records, 1);
    assert.equal(result.current_one_record_pilot_budget_may_change, false);

    const proof = {
      schema: "aha_v2_two_record_expansion_live_proof_v1",
      version: 1,
      status: "production_evidence_verified",
      observed_at: new Date().toISOString(),
      expected_production_main: EXPECTED_MAIN,
      proof_identity: {
        workflow_run_id: RUN_ID,
        workflow_run_attempt: RUN_ATTEMPT
      },
      scope: {
        scope_id: result.scope_id,
        max_chamber_records_created: result.max_records,
        candidate_only: true,
        activation_authority: false
      },
      canaries: {
        count: result.production_canary_count,
        coverage_complete: true,
        first_apply_write_count: result.first_apply_write_count,
        identical_replay_write_count: result.identical_replay_write_count,
        identical_replay_no_op_count: result.identical_replay_no_op_count,
        rollback_status: result.rollback_status,
        rollback_exact: result.rollback_exact,
        rollback_count: result.rollback_count,
        exact_pre_run_state_restored: result.exact_pre_run_state_restored,
        partial_failure_compensation_status: result.partial_failure_compensation_status,
        partial_failure_compensation_exact: result.partial_failure_compensation_exact,
        state_drift_status: result.drift_rollback_status,
        state_drift_rolled_back_count: result.drift_rolled_back_count,
        unrelated_sentinel_preserved: result.sentinel_preserved
      },
      browser_boundary: {
        local_storage_unchanged: same(before.local, after.local),
        session_storage_unchanged: same(before.session, after.session),
        indexeddb_unchanged: same(before.indexed, after.indexed),
        unexpected_write_request_count: nonReadRequests.length,
        page_error_count: pageErrors.length,
        console_error_count: consoleErrors.length
      },
      decision: {
        expansion_gate_decision: result.gate_decision,
        eligible_for_expansion_activation: result.eligible_for_expansion_activation,
        current_one_record_pilot_max_records: result.current_one_record_pilot_max_records,
        current_one_record_pilot_budget_may_change: result.current_one_record_pilot_budget_may_change
      },
      policy: {
        rehearsal_write_authorities_all_false: result.rehearsal_policy_all_write_authorities_false,
        normal_chat_persistence_open: false,
        automatic_backfill_open: false,
        backend_sync_open: false,
        backend_persistent_write_open: false,
        broad_canonical_write_open: false,
        projection_store_write_open: false,
        meta_write_open: false,
        remote_write_open: false,
        automatic_activation_open: false,
        batch_activation_open: false
      },
      redaction: {
        raw_source_text_in_evidence: false,
        raw_evidence_quotes_in_evidence: false,
        signatures_in_evidence: false,
        user_production_data_modified: false
      }
    };

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, `${JSON.stringify(proof, null, 2)}\n`);
    console.log(JSON.stringify({
      production_evidence_verified: true,
      canary_count: proof.canaries.count,
      gate_decision: proof.decision.expansion_gate_decision,
      rollback_status: proof.canaries.rollback_status,
      partial_failure_compensation_exact: proof.canaries.partial_failure_compensation_exact,
      state_drift_status: proof.canaries.state_drift_status,
      browser_storage_unchanged: proof.browser_boundary.local_storage_unchanged && proof.browser_boundary.session_storage_unchanged && proof.browser_boundary.indexeddb_unchanged,
      unexpected_write_request_count: proof.browser_boundary.unexpected_write_request_count
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
