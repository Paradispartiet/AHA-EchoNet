const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { chromium } = require("playwright");

const FRONTEND = process.env.AHA_FRONTEND_ORIGIN || "https://paradispartiet.github.io/AHA-EchoNet";
const SYNTHESIS_ENDPOINT = process.env.AHA_AGENT_ENDPOINT || "https://aha-agent-7a3y.onrender.com/api/aha-agent/semantic-document";
const EXPECTED_MAIN = process.env.EXPECTED_MAIN_SHA;
const OUTPUT = process.env.PROOF_OUTPUT || "reports/TEMP-aha-v2-controlled-write-pilot-live-proof.json";
const OPERATOR_INTENT = "single_local_chamber_insight_v1";
const SYNTHESIS_PROOF_BASE = `${FRONTEND}/tests/fixtures/semantic-live-reviewed-v2/post-stability-two-round-v1`;
const ROLLBACK_PROOF_BASE = `${FRONTEND}/tests/fixtures/semantic-live-reviewed-v2/controlled-activation-production-v1`;
const PRODUCTION_EVIDENCE_URL = `${FRONTEND}/ops/evidence/aha-v2-production-write-gate-current-v1.json`;

if (!/^[a-f0-9]{40}$/u.test(String(EXPECTED_MAIN || ""))) throw new Error("EXPECTED_MAIN_SHA is required");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function makeStorage(chamber) {
  const values = new Map([["aha_insight_chamber_v1", JSON.stringify(chamber)]]);
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    snapshot: () => Object.fromEntries([...values.entries()].sort(([a], [b]) => a.localeCompare(b)))
  };
}

function chamberIds(storage) {
  const parsed = JSON.parse(storage.getItem("aha_insight_chamber_v1") || '{"insights":[]}');
  return (parsed.insights || []).map((item) => item.id);
}

function semanticContext(modelShadow) {
  return {
    entities: (modelShadow.entities || []).map((item) => ({
      label: item.canonical_label || item.source_surface,
      entity_type: item.entity_type || "other"
    })),
    concepts: (modelShadow.concepts || []).map((item) => ({ label: item.canonical_label || item.source_surface })),
    source_claims: (modelShadow.propositions || [])
      .filter((item) => item.kind === "source_claim")
      .map((item) => ({ text: item.text })),
    relations: (modelShadow.relations || [])
      .filter((item) => item.epistemic_status === "source_explicit")
      .map((item) => ({
        relation_type: item.relation_type,
        from_label: item.from_label,
        to_label: item.to_label,
        epistemic_status: "source_explicit"
      }))
  };
}

function mapEvidence(sourceText, candidates) {
  return candidates.map((candidate, candidateIndex) => ({
    ...candidate,
    evidence: (candidate.evidence || []).map((item, evidenceIndex) => {
      const start = sourceText.indexOf(item.quote);
      if (start < 0) throw new Error(`unmapped_live_evidence:${candidateIndex}:${evidenceIndex}`);
      return {
        ...item,
        spans: [{
          anchor_id: `live_pilot_ev_${candidateIndex}_${evidenceIndex}`,
          start_offset: start,
          end_offset: start + item.quote.length,
          text: item.quote
        }]
      };
    })
  }));
}

async function fetchJson(url) {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}pilot_proof=${encodeURIComponent(EXPECTED_MAIN)}&t=${Date.now()}`, {
    cache: "no-store",
    headers: { "User-Agent": "AHA-V2-Controlled-Write-Pilot-Proof" }
  });
  if (!response.ok) throw new Error(`fetch_json_failed:${response.status}:${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}pilot_proof=${encodeURIComponent(EXPECTED_MAIN)}&t=${Date.now()}`, {
    cache: "no-store",
    headers: { "User-Agent": "AHA-V2-Controlled-Write-Pilot-Proof" }
  });
  if (!response.ok) throw new Error(`fetch_text_failed:${response.status}:${url}`);
  return response.text();
}

async function proveOperatorPages() {
  const browser = await chromium.launch({ headless: true });
  try {
    const noIntentContext = await browser.newContext();
    const noIntentPage = await noIntentContext.newPage();
    const noIntentRequests = [];
    const noIntentWrites = [];
    const noIntentPageErrors = [];
    noIntentPage.on("request", (request) => {
      noIntentRequests.push({ method: request.method(), url: request.url() });
      if (request.method() !== "GET" && request.method() !== "HEAD") noIntentWrites.push({ method: request.method(), url: request.url() });
    });
    noIntentPage.on("pageerror", (error) => noIntentPageErrors.push(String(error?.message || error)));
    await noIntentPage.goto(`${FRONTEND}/insight-activation-v2.html?proof_no_intent=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await noIntentPage.waitForFunction(() => document.querySelector("#page-status")?.textContent?.includes("Pilot lukket"), null, { timeout: 20000 });
    await noIntentPage.waitForTimeout(1500);
    const noIntentState = await noIntentPage.evaluate(() => ({
      status: document.querySelector("#page-status")?.textContent || "",
      gate_status: document.querySelector("#gate-status")?.textContent || "",
      iframe_src_attribute: document.querySelector("#chat-frame")?.getAttribute("src") || "",
      iframe_resolved_src: document.querySelector("#chat-frame")?.src || "",
      disabled_buttons: [...document.querySelectorAll("button")].filter((button) => button.disabled).length,
      button_count: document.querySelectorAll("button").length
    }));
    const noIntentChatRequests = noIntentRequests.filter((item) => /\/chat\.html(?:[?#]|$)/u.test(item.url));
    assert.equal(noIntentChatRequests.length, 0, JSON.stringify(noIntentChatRequests));
    assert.equal(noIntentState.iframe_src_attribute, "about:blank");
    assert.equal(noIntentState.disabled_buttons, noIntentState.button_count);
    assert.equal(noIntentWrites.length, 0, JSON.stringify(noIntentWrites));
    assert.equal(noIntentPageErrors.length, 0, JSON.stringify(noIntentPageErrors));
    await noIntentContext.close();

    const intentContext = await browser.newContext();
    const intentPage = await intentContext.newPage();
    const intentRequests = [];
    const intentWrites = [];
    const intentPageErrors = [];
    intentPage.on("request", (request) => {
      intentRequests.push({ method: request.method(), url: request.url() });
      if (request.method() !== "GET" && request.method() !== "HEAD") intentWrites.push({ method: request.method(), url: request.url() });
    });
    intentPage.on("pageerror", (error) => intentPageErrors.push(String(error?.message || error)));
    await intentPage.goto(`${FRONTEND}/insight-activation-v2.html?pilot=${OPERATOR_INTENT}&proof_intent=${Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    await intentPage.waitForFunction(() => {
      const text = document.querySelector("#page-status")?.textContent || "";
      return text.includes("12/12 production gate + rollback-proof grønn") ||
        text.includes("Review er godkjent") ||
        text.includes("Én lokal Chamber-record er aktiv") ||
        text.includes("Kontrollert pilot fullført");
    }, null, { timeout: 45000 });
    const intentState = await intentPage.evaluate(() => ({
      status: document.querySelector("#page-status")?.textContent || "",
      gate_status: document.querySelector("#gate-status")?.textContent || "",
      iframe_src_attribute: document.querySelector("#chat-frame")?.getAttribute("src") || "",
      iframe_ready: document.querySelector("#chat-frame")?.classList.contains("ready") || false
    }));
    assert.doesNotMatch(intentState.status, /Stoppet fail-closed/u);
    assert.match(intentState.gate_status, /Production gate: CONTROLLED_WRITE_PILOT_ELIGIBLE/u);
    assert.match(intentState.gate_status, /rollback: ready/u);
    assert.match(intentState.iframe_src_attribute, /^chat\.html\?ahaSemanticModelShadow=1&ahaInsightSynthesisV2=1$/u);
    assert.equal(intentState.iframe_ready, true);
    const intentChatRequests = intentRequests.filter((item) => /\/chat\.html(?:[?#]|$)/u.test(item.url));
    assert.ok(intentChatRequests.length >= 1, "valid operator intent must navigate the iframe to chat.html");
    assert.equal(intentWrites.length, 0, JSON.stringify(intentWrites));
    assert.equal(intentPageErrors.length, 0, JSON.stringify(intentPageErrors));
    await intentContext.close();

    return {
      no_intent: {
        status_closed: true,
        chat_request_count: noIntentChatRequests.length,
        iframe_about_blank: noIntentState.iframe_src_attribute === "about:blank",
        all_buttons_disabled: noIntentState.disabled_buttons === noIntentState.button_count,
        unexpected_write_request_count: noIntentWrites.length,
        page_error_count: noIntentPageErrors.length
      },
      exact_intent: {
        authority_ready: true,
        production_gate_decision: "CONTROLLED_WRITE_PILOT_ELIGIBLE",
        rollback_status: "ready",
        chat_request_count: intentChatRequests.length,
        iframe_ready: intentState.iframe_ready,
        unexpected_write_request_count: intentWrites.length,
        page_error_count: intentPageErrors.length
      }
    };
  } finally {
    await browser.close();
  }
}

async function runPilotSequence() {
  const assetPaths = {
    chamber: "js/insightsChamber.js",
    qualityGate: "js/ahaInsightQualityGateV2.js",
    activation: "js/ahaInsightActivationV2.js",
    productionGate: "js/ahaV2ProductionWriteGate.js",
    rollback: "js/ahaV2ControlledWritePilotRollback.js",
    pilotActivation: "js/ahaV2ControlledWritePilotActivation.js",
    chamberSync: "js/ahaChamberSync.js"
  };
  const deployed = {};
  for (const [key, remotePath] of Object.entries(assetPaths)) deployed[key] = await fetchText(`${FRONTEND}/${remotePath}`);

  const [synthesisProvenance, synthesisSummary, productionEvidence, rollbackProof, rollbackProvenance] = await Promise.all([
    fetchJson(`${SYNTHESIS_PROOF_BASE}/provenance.json`),
    fetchJson(`${SYNTHESIS_PROOF_BASE}/summary.json`),
    fetchJson(PRODUCTION_EVIDENCE_URL),
    fetchJson(`${ROLLBACK_PROOF_BASE}/proof.json`),
    fetchJson(`${ROLLBACK_PROOF_BASE}/provenance.json`)
  ]);
  const synthesisProof = { provenance: synthesisProvenance, summary: synthesisSummary };

  const fixture = JSON.parse(fs.readFileSync("tests/fixtures/semantic-live-reviewed/standardization-flexibility-v1.json", "utf8"));
  const sourceText = fixture.source_text;
  const sourceHash = sha256(sourceText);
  const synthesisResponse = await fetch(SYNTHESIS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "AHA-V2-Controlled-Write-Pilot-Proof" },
    body: JSON.stringify({
      text: sourceText,
      format: "aha_insight_synthesis_output_v2",
      semantic_context: semanticContext(fixture.model_shadow),
      context: { source_event_id: fixture.source_event_id, source_type: "controlled_write_pilot_proof", language: "no" }
    })
  });
  const envelope = await synthesisResponse.json();
  assert.equal(synthesisResponse.status, 200, JSON.stringify(envelope));
  assert.equal(envelope.ok, true);
  assert.equal(envelope.schema, "aha_insight_synthesis_contract_v2");
  for (const field of ["production_gate_authority", "synthesis_allowed", "canonical_write", "chamber_write", "persistent_write", "meta_write"]) {
    assert.equal(envelope.policy[field], false, `${field} must remain false on synthesis endpoint`);
  }

  const sandbox = {
    window: null,
    globalThis: null,
    console,
    Date,
    Math,
    JSON,
    setTimeout,
    clearTimeout,
    crypto: globalThis.crypto
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const [name, source] of [
    ["insightsChamber.js", deployed.chamber],
    ["ahaInsightQualityGateV2.js", deployed.qualityGate],
    ["ahaInsightActivationV2.js", deployed.activation],
    ["ahaV2ProductionWriteGate.js", deployed.productionGate],
    ["ahaV2ControlledWritePilotRollback.js", deployed.rollback],
    ["ahaV2ControlledWritePilotActivation.js", deployed.pilotActivation]
  ]) vm.runInContext(source, sandbox, { filename: `deployed/${name}` });

  assert.ok(sandbox.AHAInsightActivationV2);
  assert.ok(sandbox.AHAV2ProductionWriteGate);
  assert.ok(sandbox.AHAV2ControlledWritePilotRollback);
  assert.ok(sandbox.AHAV2ControlledWritePilotActivation);
  sandbox.AHAInsightActivationV2.validateProof(synthesisProof);

  const shadow = {
    schema: "aha_insight_synthesis_shadow_v2",
    version: 2,
    mode: "shadow",
    source_event_id: fixture.source_event_id,
    source_text_hash: sourceHash,
    deterministic_document_id: `sem_pilot_${sourceHash.slice(0, 12)}`,
    semantic_model_response_id: fixture.provenance.response_id,
    synthesis_model: envelope.model,
    synthesis_response_id: envelope.response_id,
    semantic_context: semanticContext(fixture.model_shadow),
    candidates: mapEvidence(sourceText, envelope.synthesis.candidates),
    policy: {
      production_gate_authority: false,
      synthesis_allowed: false,
      canonical_write: false,
      chamber_write: false,
      persistent_write: false,
      meta_write: false,
      source_text_stored: false
    }
  };
  const gate = sandbox.AHAInsightQualityGateV2.evaluateSynthesisShadow({ source_text: sourceText, synthesis_shadow: shadow });
  assert.equal(gate.valid, true);
  const eligible = gate.decisions.find((item) => item.eligible_for_insight_review === true);
  assert.ok(eligible, JSON.stringify(gate));
  assert.equal(eligible.candidate_index, 0, "single-record pilot is intentionally bound to candidate index 0");

  const storage = makeStorage({ insights: [{ id: "pilot_sentinel", title: "Must remain" }] });
  const initialSnapshot = storage.snapshot();
  const dispatched = [];
  const activationDeps = {
    storage,
    randomId: () => crypto.randomUUID(),
    sha256Hex: sha256,
    getRuntime: () => ({
      getLastSynthesisShadow: () => clone(shadow),
      getLastGateEvaluation: () => clone(gate)
    }),
    getProof: () => clone(synthesisProof),
    getSourceEvent: () => ({ id: fixture.source_event_id, text: sourceText }),
    getEngine: () => sandbox.InsightsEngine,
    createEvent: (detail) => ({ type: "aha:insight-activation-v2", detail }),
    dispatchEvent: (event) => dispatched.push(event)
  };

  function createPilot() {
    return sandbox.AHAV2ControlledWritePilotActivation.create({
      operatorIntent: OPERATOR_INTENT,
      productionEvidence: clone(productionEvidence),
      rollbackProof: clone(rollbackProof),
      rollbackProvenance: clone(rollbackProvenance)
    }, { activationDeps });
  }

  const pilot = createPilot();
  const initialStatus = pilot.getStatus();
  assert.equal(initialStatus.phase, "available");
  assert.equal(initialStatus.created_record_count, 0);
  assert.equal(initialStatus.production_gate_decision, "CONTROLLED_WRITE_PILOT_ELIGIBLE");
  assert.equal(initialStatus.rollback_status, "ready");
  for (const [key, value] of Object.entries(initialStatus.policy)) {
    if (["pilot_enabled", "pilot_may_prepare_manual_review", "pilot_may_create_local_chamber_record", "pilot_may_execute_exact_rollback", "review_approval_required", "canonical_approval_required", "rollback_approval_required", "approval_challenges_single_use"].includes(key)) {
      assert.equal(value, true, `${key} must be true for the explicit pilot`);
    } else if (key !== "pilot_scope" && key !== "max_chamber_records_created") {
      assert.equal(value, false, `${key} must remain false`);
    }
  }
  assert.equal(initialStatus.policy.max_chamber_records_created, 1);

  const reviewRequest = await pilot.prepareReview({ candidate_index: 0 });
  const review = await pilot.approveReview({ request_id: reviewRequest.request_id, approval: reviewRequest.approval_phrase });
  assert.equal(review.status, "reviewed");
  assert.deepEqual(chamberIds(storage), ["pilot_sentinel"]);
  const afterReview = pilot.getStatus();
  assert.equal(afterReview.phase, "review_committed");
  assert.equal(afterReview.created_record_count, 0);

  const canonicalRequest = await pilot.prepareCanonical({ review_id: review.id });
  const canonical = await pilot.approveCanonical({ request_id: canonicalRequest.request_id, approval: canonicalRequest.approval_phrase });
  const promotedIds = chamberIds(storage);
  assert.equal(promotedIds.length, 2);
  assert.equal(promotedIds[0], "pilot_sentinel");
  assert.equal(promotedIds[1], canonical.insight.id);
  assert.equal(canonical.insight.activation_v2?.backend_sync_allowed, false);
  assert.equal(canonical.insight.activation_v2?.meta_write_allowed, false);
  const afterCanonical = pilot.getStatus();
  assert.equal(afterCanonical.phase, "canonical_promoted");
  assert.equal(afterCanonical.created_record_count, 1);

  let secondBeforeRollbackError = null;
  try {
    await pilot.prepareReview({ candidate_index: 0 });
  } catch (error) {
    secondBeforeRollbackError = error?.code || error?.message || String(error);
  }
  assert.equal(secondBeforeRollbackError, "pilot_record_budget_exhausted");

  let repositorySaveCalls = 0;
  let repositoryLoadCalls = 0;
  const syncSandbox = {
    window: null,
    console,
    localStorage: storage,
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    setTimeout,
    clearTimeout,
    addEventListener: () => {},
    dispatchEvent: () => true,
    AHARepository: {
      saveChamber: async () => { repositorySaveCalls += 1; return { ok: true }; },
      loadChamber: async () => { repositoryLoadCalls += 1; return { ok: true, data: null }; }
    }
  };
  syncSandbox.window = syncSandbox;
  vm.createContext(syncSandbox);
  vm.runInContext(deployed.chamberSync, syncSandbox, { filename: "deployed/ahaChamberSync.js" });
  const syncPush = await syncSandbox.AHAChamberSync.push();
  const syncPull = await syncSandbox.AHAChamberSync.pull();
  assert.deepEqual(syncPush, { ok: false, reason: "local_only_insight_activation_present" });
  assert.deepEqual(syncPull, { ok: false, reason: "local_only_insight_activation_present" });
  assert.equal(repositorySaveCalls, 0);
  assert.equal(repositoryLoadCalls, 0);

  const rollbackRequest = pilot.prepareRollback({ review_id: review.id });
  const rolledBack = await pilot.approveRollback({ request_id: rollbackRequest.request_id, approval: rollbackRequest.approval_phrase });
  assert.equal(rolledBack.status, "rolled_back");
  assert.deepEqual(chamberIds(storage), ["pilot_sentinel"]);
  const afterRollback = pilot.getStatus();
  assert.equal(afterRollback.phase, "rolled_back_complete");
  assert.equal(afterRollback.created_record_count, 1);
  assert.equal(afterRollback.pilot_complete, true);

  let secondAfterRollbackError = null;
  try {
    await pilot.prepareReview({ candidate_index: 0 });
  } catch (error) {
    secondAfterRollbackError = error?.code || error?.message || String(error);
  }
  assert.equal(secondAfterRollbackError, "pilot_record_budget_exhausted");

  // Simulate reload/new wrapper instance against the same persistent browser-local storage.
  const reloadedPilot = createPilot();
  const reloadedStatus = reloadedPilot.getStatus();
  assert.equal(reloadedStatus.phase, "rolled_back_complete");
  assert.equal(reloadedStatus.created_record_count, 1);
  let reloadSecondWriteError = null;
  try {
    await reloadedPilot.prepareReview({ candidate_index: 0 });
  } catch (error) {
    reloadSecondWriteError = error?.code || error?.message || String(error);
  }
  assert.equal(reloadSecondWriteError, "pilot_record_budget_exhausted");

  const finalSnapshot = storage.snapshot();
  assert.equal(chamberIds(storage).length, 1);
  assert.equal(chamberIds(storage)[0], "pilot_sentinel");
  assert.equal(repositorySaveCalls, 0);
  assert.equal(repositoryLoadCalls, 0);
  assert.ok(pilot.getAudit().length >= 9);
  assert.equal(dispatched.length, 3);

  return {
    synthesis: {
      endpoint: SYNTHESIS_ENDPOINT,
      model: envelope.model,
      response_id: envelope.response_id,
      candidate_count: shadow.candidates.length,
      eligible_count: gate.eligible_count,
      selected_candidate_index: eligible.candidate_index,
      selected_quality_score: eligible.metrics.quality_score
    },
    pilot: {
      initial_phase: initialStatus.phase,
      initial_created_record_count: initialStatus.created_record_count,
      review_chamber_unchanged: true,
      review_id_present: Boolean(review.id),
      canonical_added_count: promotedIds.length - 1,
      created_record_count_after_canonical: afterCanonical.created_record_count,
      second_activation_before_rollback_error: secondBeforeRollbackError,
      sync_push: syncPush,
      sync_pull: syncPull,
      repository_save_calls: repositorySaveCalls,
      repository_load_calls: repositoryLoadCalls,
      rollback_status: rolledBack.status,
      sentinel_preserved_after_rollback: chamberIds(storage)[0] === "pilot_sentinel",
      chamber_count_after_rollback: chamberIds(storage).length,
      created_record_count_after_rollback: afterRollback.created_record_count,
      second_activation_after_rollback_error: secondAfterRollbackError,
      reload_phase: reloadedStatus.phase,
      reload_created_record_count: reloadedStatus.created_record_count,
      reload_second_activation_error: reloadSecondWriteError,
      audit_event_count: pilot.getAudit().length,
      dispatched_action_count: dispatched.length,
      browser_local_storage_only: true,
      user_production_data_modified: false,
      representative_fixture_only: true,
      initial_chamber_sentinel_preserved: Boolean(initialSnapshot.aha_insight_chamber_v1),
      final_chamber_sentinel_preserved: Boolean(finalSnapshot.aha_insight_chamber_v1)
    },
    policy: {
      pilot_scope: initialStatus.policy.pilot_scope,
      max_chamber_records_created: initialStatus.policy.max_chamber_records_created,
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
    }
  };
}

async function run() {
  const operator = await proveOperatorPages();
  const sequence = await runPilotSequence();
  const result = {
    schema: "aha_v2_controlled_write_pilot_live_proof_v1",
    version: 1,
    measured_at: new Date().toISOString(),
    expected_production_main: EXPECTED_MAIN,
    workflow_run_id: Number(process.env.GITHUB_RUN_ID || 0) || null,
    workflow_run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT || 0) || null,
    workflow_head: process.env.GITHUB_SHA || null,
    frontend_origin: FRONTEND,
    operator,
    ...sequence,
    redaction: {
      raw_source_text_in_evidence: false,
      raw_evidence_quotes_in_evidence: false,
      candidate_signature_in_evidence: false,
      canonical_signature_in_evidence: false
    },
    production_proof_passed: true
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    production_proof_passed: true,
    expected_production_main: EXPECTED_MAIN,
    no_intent_chat_request_count: result.operator.no_intent.chat_request_count,
    exact_intent_authority_ready: result.operator.exact_intent.authority_ready,
    eligible_count: result.synthesis.eligible_count,
    created_record_count_after_canonical: result.pilot.created_record_count_after_canonical,
    created_record_count_after_rollback: result.pilot.created_record_count_after_rollback,
    reload_second_activation_error: result.pilot.reload_second_activation_error,
    repository_save_calls: result.pilot.repository_save_calls,
    repository_load_calls: result.pilot.repository_load_calls
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
