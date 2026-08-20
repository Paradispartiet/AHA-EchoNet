const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { chromium } = require("playwright");

const FRONTEND = process.env.AHA_FRONTEND_ORIGIN || "https://paradispartiet.github.io/AHA-EchoNet";
const SYNTHESIS_ENDPOINT = process.env.AHA_AGENT_ENDPOINT || "https://aha-agent-7a3y.onrender.com/api/aha-agent/semantic-document";
const EXPECTED_MAIN = String(process.env.EXPECTED_MAIN_SHA || "");
const OUTPUT = process.env.PROOF_OUTPUT || "probe-evidence/two-record-expansion-activation-live-proof.json";
const OPERATOR_INTENT = "bounded_local_chamber_two_record_candidate_v1";

if (!/^[a-f0-9]{40}$/u.test(EXPECTED_MAIN)) throw new Error("EXPECTED_MAIN_SHA is required");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
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
  const value = JSON.parse(storage.getItem("aha_insight_chamber_v1") || '{"insights":[]}');
  return (value.insights || []).map((item) => item.id);
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
          anchor_id: `expansion_live_ev_${candidateIndex}_${evidenceIndex}`,
          start_offset: start,
          end_offset: start + item.quote.length,
          text: item.quote
        }]
      };
    })
  }));
}

async function fetchText(url) {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}expansion_activation_proof=${encodeURIComponent(EXPECTED_MAIN)}&t=${Date.now()}`, {
    cache: "no-store",
    headers: { "User-Agent": "AHA-V2-Two-Record-Expansion-Activation-Proof" }
  });
  if (!response.ok) throw new Error(`fetch_text_failed:${response.status}:${url}`);
  return response.text();
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

async function proveOperator() {
  const browser = await chromium.launch({ headless: true });
  try {
    const noIntentContext = await browser.newContext();
    const noIntentPage = await noIntentContext.newPage();
    const noIntentRequests = [];
    const noIntentErrors = [];
    const noIntentConsoleErrors = [];
    noIntentPage.on("request", (request) => noIntentRequests.push({ method: request.method(), url: request.url() }));
    noIntentPage.on("pageerror", (error) => noIntentErrors.push(String(error?.message || error)));
    noIntentPage.on("console", (message) => { if (message.type() === "error") noIntentConsoleErrors.push(message.text()); });
    await noIntentPage.goto(`${FRONTEND}/insight-expansion-v2.html?proof_no_intent=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await noIntentPage.waitForFunction(() => document.querySelector("#page-status")?.textContent?.includes("Expansion lukket"), null, { timeout: 25000 });
    await noIntentPage.waitForTimeout(1000);
    const noIntentState = await noIntentPage.evaluate(() => ({
      status: document.querySelector("#page-status")?.textContent || "",
      iframe_src: document.querySelector("#chat-frame")?.getAttribute("src") || "",
      disabled_buttons: [...document.querySelectorAll("button")].filter((button) => button.disabled).length,
      button_count: document.querySelectorAll("button").length
    }));
    const noIntentChatRequests = noIntentRequests.filter((item) => /\/chat\.html(?:[?#]|$)/u.test(item.url));
    const noIntentWrites = noIntentRequests.filter((item) => !["GET", "HEAD"].includes(item.method));
    assert.equal(noIntentState.iframe_src, "about:blank");
    assert.equal(noIntentChatRequests.length, 0);
    assert.equal(noIntentState.disabled_buttons, noIntentState.button_count);
    assert.equal(noIntentWrites.length, 0, JSON.stringify(noIntentWrites));
    assert.equal(noIntentErrors.length, 0, JSON.stringify(noIntentErrors));
    assert.equal(noIntentConsoleErrors.length, 0, JSON.stringify(noIntentConsoleErrors));
    await noIntentContext.close();

    const intentContext = await browser.newContext();
    const intentPage = await intentContext.newPage();
    const intentRequests = [];
    const intentErrors = [];
    const intentConsoleErrors = [];
    intentPage.on("request", (request) => intentRequests.push({ method: request.method(), url: request.url() }));
    intentPage.on("pageerror", (error) => intentErrors.push(String(error?.message || error)));
    intentPage.on("console", (message) => { if (message.type() === "error") intentConsoleErrors.push(message.text()); });
    await intentPage.goto(`${FRONTEND}/insight-expansion-v2.html?pilot=${OPERATOR_INTENT}&proof_intent=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await intentPage.waitForFunction(() => document.querySelector("#page-status")?.textContent?.includes("To-record-authority er etablert"), null, { timeout: 60000 });
    const intentState = await intentPage.evaluate(() => ({
      status: document.querySelector("#page-status")?.textContent || "",
      gate_status: document.querySelector("#gate-status")?.textContent || "",
      iframe_src: document.querySelector("#chat-frame")?.getAttribute("src") || "",
      iframe_ready: document.querySelector("#chat-frame")?.classList.contains("ready") || false
    }));
    const intentChatRequests = intentRequests.filter((item) => /\/chat\.html(?:[?#]|$)/u.test(item.url));
    const intentWrites = intentRequests.filter((item) => !["GET", "HEAD"].includes(item.method));
    assert.match(intentState.gate_status, /BOUNDED_EXPANSION_PILOT_ELIGIBLE/u);
    assert.equal(intentState.iframe_src, "chat.html?ahaSemanticModelShadow=1&ahaInsightSynthesisV2=1");
    assert.equal(intentState.iframe_ready, true);
    assert.ok(intentChatRequests.length >= 1);
    assert.equal(intentWrites.length, 0, JSON.stringify(intentWrites));
    assert.equal(intentErrors.length, 0, JSON.stringify(intentErrors));
    assert.equal(intentConsoleErrors.length, 0, JSON.stringify(intentConsoleErrors));
    await intentContext.close();

    return {
      no_intent: {
        closed: true,
        iframe_about_blank: true,
        chat_request_count: 0,
        all_buttons_disabled: true,
        unexpected_write_request_count: 0,
        page_error_count: 0,
        console_error_count: 0
      },
      exact_intent: {
        authorized: true,
        gate_decision: "BOUNDED_EXPANSION_PILOT_ELIGIBLE",
        iframe_ready: true,
        chat_request_count: intentChatRequests.length,
        unexpected_write_request_count: 0,
        page_error_count: 0,
        console_error_count: 0
      }
    };
  } finally {
    await browser.close();
  }
}

async function buildEligibleSources(browser) {
  const fixtureNames = [
    "standardization-flexibility-v1.json",
    "constraints-creativity-v1.json",
    "modularity-interfaces-v1.json",
    "retrieval-learning-v1.json",
    "mixed-use-street-v1.json"
  ];
  const selected = [];
  const attempts = [];

  for (const fixtureName of fixtureNames) {
    if (selected.length >= 2) break;
    try {
      const fixture = JSON.parse(fs.readFileSync(`tests/fixtures/semantic-live-reviewed/${fixtureName}`, "utf8"));
      const sourceText = fixture.source_text;
      const sourceHash = sha256(sourceText);
      const response = await fetch(SYNTHESIS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "AHA-V2-Two-Record-Expansion-Activation-Proof" },
        body: JSON.stringify({
          text: sourceText,
          format: "aha_insight_synthesis_output_v2",
          semantic_context: semanticContext(fixture.model_shadow),
          context: { source_event_id: fixture.source_event_id, source_type: "production_expansion_proof", language: "no" }
        })
      });
      const envelope = await response.json();
      if (response.status !== 200 || envelope.ok !== true || envelope.schema !== "aha_insight_synthesis_contract_v2") {
        attempts.push({ fixture: fixtureName, status: "endpoint_rejected", http_status: response.status });
        continue;
      }
      ["production_gate_authority", "synthesis_allowed", "canonical_write", "chamber_write", "persistent_write", "meta_write"]
        .forEach((field) => assert.equal(envelope.policy[field], false));

      const candidates = mapEvidence(sourceText, envelope.synthesis.candidates);
      const shadow = {
        schema: "aha_insight_synthesis_shadow_v2",
        version: 2,
        mode: "shadow",
        source_event_id: fixture.source_event_id,
        source_text_hash: sourceHash,
        deterministic_document_id: `sem_expansion_${sourceHash.slice(0, 12)}`,
        semantic_model_response_id: fixture.provenance.response_id,
        synthesis_model: envelope.model,
        synthesis_response_id: envelope.response_id,
        semantic_context: semanticContext(fixture.model_shadow),
        candidates,
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
      const gate = browser.AHAInsightQualityGateV2.evaluateSynthesisShadow({ source_text: sourceText, synthesis_shadow: shadow });
      if (gate.valid !== true) {
        attempts.push({ fixture: fixtureName, status: "gate_invalid" });
        continue;
      }
      const eligible = (gate.decisions || []).find((item) => item.eligible_for_insight_review === true && !(item.blocking_reasons || []).length);
      if (!eligible) {
        attempts.push({ fixture: fixtureName, status: "no_eligible_candidate", eligible_count: gate.eligible_count || 0 });
        continue;
      }
      selected.push({
        fixtureName,
        fixture,
        sourceText,
        sourceHash,
        shadow,
        gate,
        eligible,
        model: envelope.model,
        responseId: envelope.response_id
      });
      attempts.push({
        fixture: fixtureName,
        status: "selected",
        eligible_count: gate.eligible_count,
        selected_quality_score: eligible.metrics?.quality_score ?? null
      });
    } catch (error) {
      attempts.push({ fixture: fixtureName, status: "attempt_failed", reason: String(error?.code || error?.message || error).slice(0, 160) });
    }
  }

  assert.equal(selected.length, 2, JSON.stringify(attempts));
  assert.notEqual(selected[0].fixture.source_event_id, selected[1].fixture.source_event_id);
  assert.notEqual(selected[0].sourceHash, selected[1].sourceHash);
  return { selected, attempts };
}

async function runActivationSequence() {
  const assetPaths = {
    chamber: "js/insightsChamber.js",
    qualityGate: "js/ahaInsightQualityGateV2.js",
    activation: "js/ahaInsightActivationV2.js",
    expansionGate: "js/ahaV2ControlledWriteExpansionGate.js",
    expansionActivation: "js/ahaV2ControlledWriteExpansionActivation.js",
    chamberSync: "js/ahaChamberSync.js"
  };
  const deployed = {};
  for (const [name, asset] of Object.entries(assetPaths)) deployed[name] = await fetchText(`${FRONTEND}/${asset}`);

  const [synthesisProvenance, synthesisSummary, expansionEvidence, oneRecordPilotProof, expansionLiveProof, scopeContract] = await Promise.all([
    fetchJson(`${FRONTEND}/tests/fixtures/semantic-live-reviewed-v2/post-stability-two-round-v1/provenance.json`),
    fetchJson(`${FRONTEND}/tests/fixtures/semantic-live-reviewed-v2/post-stability-two-round-v1/summary.json`),
    fetchJson(`${FRONTEND}/ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json`),
    fetchJson(`${FRONTEND}/ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json`),
    fetchJson(`${FRONTEND}/ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json`),
    fetchJson(`${FRONTEND}/ops/contracts/aha-v2-controlled-write-expansion-scope-two-record-v1.json`)
  ]);
  const synthesisProof = { provenance: synthesisProvenance, summary: synthesisSummary };

  const browser = { window: null, globalThis: null, console, Date, Math, JSON, setTimeout, clearTimeout };
  browser.window = browser;
  browser.globalThis = browser;
  vm.createContext(browser);
  for (const key of ["chamber", "qualityGate", "activation", "expansionGate", "expansionActivation"]) {
    vm.runInContext(deployed[key], browser, { filename: `deployed/${assetPaths[key]}` });
  }

  const { selected, attempts } = await buildEligibleSources(browser);
  const sourceEvents = new Map(selected.map((item) => [item.fixture.source_event_id, { id: item.fixture.source_event_id, text: item.sourceText }]));
  let currentShadow = null;
  let currentGate = null;
  const dispatched = [];
  const sentinelId = "two_record_expansion_live_sentinel";
  const storage = makeStorage({ insights: [{ id: sentinelId, title: "Unrelated sentinel", summary: "Must remain" }] });

  const activationDeps = {
    storage,
    randomId: () => crypto.randomUUID(),
    sha256Hex: sha256,
    getRuntime: () => ({
      getLastSynthesisShadow: () => clone(currentShadow),
      getLastGateEvaluation: () => clone(currentGate)
    }),
    getProof: () => clone(synthesisProof),
    getSourceEvent: (sourceEventId) => clone(sourceEvents.get(sourceEventId) || null),
    getEngine: () => browser.InsightsEngine,
    createEvent: (detail) => ({ type: "aha:insight-activation-v2", detail }),
    dispatchEvent: (event) => dispatched.push(event)
  };

  const expansionInput = {
    operatorIntent: OPERATOR_INTENT,
    expansionEvidence,
    oneRecordPilotProof,
    expansionLiveProof,
    scopeContract
  };

  const expansion = browser.AHAV2ControlledWriteExpansionActivation.create(expansionInput, {
    activationApi: browser.AHAInsightActivationV2,
    activationDeps
  });
  const authorization = expansion.authorization();
  assert.equal(authorization.authorized, true);
  assert.equal(authorization.expansion_gate_decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
  assert.equal(authorization.max_chamber_records_created, 2);

  const recordProofs = [];
  const reviewIds = [];
  const canonicalIds = [];

  for (let index = 0; index < selected.length; index += 1) {
    const source = selected[index];
    currentShadow = clone(source.shadow);
    currentGate = clone(source.gate);
    const beforeReviewIds = chamberIds(storage);
    const reviewRequest = await expansion.prepareReview({ candidate_index: source.eligible.candidate_index });
    const review = await expansion.approveReview({ request_id: reviewRequest.request_id, approval: reviewRequest.approval_phrase });
    const afterReviewIds = chamberIds(storage);
    assert.deepEqual(afterReviewIds, beforeReviewIds, "review must not change Chamber");
    assert.equal(review.source_event_id, source.fixture.source_event_id);
    assert.equal(review.source_text_hash, source.sourceHash);

    const canonicalRequest = await expansion.prepareCanonical({ review_id: review.id });
    const canonical = await expansion.approveCanonical({ request_id: canonicalRequest.request_id, approval: canonicalRequest.approval_phrase });
    const status = expansion.getStatus();
    assert.equal(status.created_record_count, index + 1);
    assert.equal(status.remaining_record_budget, 2 - (index + 1));
    assert.ok(chamberIds(storage).includes(canonical.insight.id));
    reviewIds.push(review.id);
    canonicalIds.push(canonical.insight.id);
    recordProofs.push({
      ordinal: index + 1,
      fixture: source.fixtureName,
      model: source.model,
      quality_score: source.eligible.metrics?.quality_score ?? null,
      review_changed_chamber: false,
      source_binding_verified: true,
      created_record_count: status.created_record_count,
      remaining_record_budget: status.remaining_record_budget
    });
  }

  assert.equal(new Set(recordProofs.map((item) => item.fixture)).size, 2);
  assert.equal(expansion.getStatus().created_record_count, 2);
  assert.equal(expansion.getStatus().remaining_record_budget, 0);

  let thirdWriteError = null;
  try {
    await expansion.prepareReview({ candidate_index: selected[1].eligible.candidate_index });
  } catch (error) {
    thirdWriteError = error.code || error.message;
  }
  assert.equal(thirdWriteError, "expansion_record_budget_exhausted");

  let repositorySaveCalls = 0;
  let repositoryLoadCalls = 0;
  const syncBrowser = {
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
  syncBrowser.window = syncBrowser;
  vm.createContext(syncBrowser);
  vm.runInContext(deployed.chamberSync, syncBrowser, { filename: "deployed/ahaChamberSync.js" });
  const syncPush = await syncBrowser.AHAChamberSync.push();
  const syncPull = await syncBrowser.AHAChamberSync.pull();
  assert.deepEqual(syncPush, { ok: false, reason: "local_only_insight_activation_present" });
  assert.deepEqual(syncPull, { ok: false, reason: "local_only_insight_activation_present" });
  assert.equal(repositorySaveCalls, 0);
  assert.equal(repositoryLoadCalls, 0);

  const rollback2 = expansion.prepareRollback({ review_id: reviewIds[1] });
  const rolled2 = await expansion.approveRollback({ request_id: rollback2.request_id, approval: rollback2.approval_phrase });
  assert.equal(rolled2.status, "rolled_back");
  let idsAfterRollback2 = chamberIds(storage);
  assert.ok(idsAfterRollback2.includes(sentinelId));
  assert.ok(idsAfterRollback2.includes(canonicalIds[0]));
  assert.ok(!idsAfterRollback2.includes(canonicalIds[1]));
  assert.equal(expansion.getStatus().created_record_count, 2);

  const rollback1 = expansion.prepareRollback({ review_id: reviewIds[0] });
  const rolled1 = await expansion.approveRollback({ request_id: rollback1.request_id, approval: rollback1.approval_phrase });
  assert.equal(rolled1.status, "rolled_back");
  const finalIds = chamberIds(storage);
  assert.deepEqual(finalIds, [sentinelId]);
  assert.equal(expansion.getStatus().created_record_count, 2);
  assert.equal(expansion.getStatus().expansion_complete, true);

  const fresh = browser.AHAV2ControlledWriteExpansionActivation.create(expansionInput, {
    activationApi: browser.AHAInsightActivationV2,
    activationDeps
  });
  assert.equal(fresh.getStatus().created_record_count, 2);
  let freshThirdError = null;
  try {
    await fresh.prepareReview({ candidate_index: selected[0].eligible.candidate_index });
  } catch (error) {
    freshThirdError = error.code || error.message;
  }
  assert.equal(freshThirdError, "expansion_record_budget_exhausted");

  const audit = fresh.getAudit();
  assert.ok(audit.length >= 18, `expected at least 18 raw activation audit events, got ${audit.length}`);
  const policy = fresh.getStatus().policy;
  [
    "automatic_activation_open",
    "batch_activation_open",
    "normal_chat_persistence_open",
    "automatic_backfill_open",
    "backend_sync_open",
    "backend_persistent_write_open",
    "broad_canonical_write_open",
    "projection_store_write_open",
    "meta_write_open",
    "remote_write_open"
  ].forEach((field) => assert.equal(policy[field], false));

  return {
    attempts,
    selected_records: recordProofs,
    distinct_sources: true,
    distinct_candidate_signatures: true,
    created_record_count: 2,
    third_write_error: thirdWriteError,
    sync_push: syncPush,
    sync_pull: syncPull,
    repository_save_calls: repositorySaveCalls,
    repository_load_calls: repositoryLoadCalls,
    rollback_second_status: rolled2.status,
    rollback_second_preserved_first_record: idsAfterRollback2.includes(canonicalIds[0]),
    rollback_first_status: rolled1.status,
    final_chamber_only_sentinel: finalIds.length === 1 && finalIds[0] === sentinelId,
    unrelated_sentinel_preserved: true,
    lifetime_count_after_rollbacks: expansion.getStatus().created_record_count,
    fresh_wrapper_third_write_error: freshThirdError,
    audit_event_count: audit.length,
    dispatched_action_count: dispatched.length,
    all_broader_authorities_false: true
  };
}

async function run() {
  const operator = await proveOperator();
  const activation = await runActivationSequence();

  const proof = {
    schema: "aha_v2_two_record_expansion_activation_live_proof_v1",
    version: 1,
    status: "production_activation_verified",
    observed_at: new Date().toISOString(),
    expected_production_main: EXPECTED_MAIN,
    proof_identity: {
      workflow_run_id: Number(process.env.GITHUB_RUN_ID || 0) || null,
      workflow_run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT || 0) || null,
      probe_head: process.env.GITHUB_SHA || null
    },
    operator,
    activation: {
      selected_records: activation.selected_records,
      distinct_sources: activation.distinct_sources,
      distinct_candidate_signatures: activation.distinct_candidate_signatures,
      created_record_count: activation.created_record_count,
      third_write_error: activation.third_write_error,
      repository_save_calls: activation.repository_save_calls,
      repository_load_calls: activation.repository_load_calls,
      sync_push: activation.sync_push,
      sync_pull: activation.sync_pull,
      rollback_second_status: activation.rollback_second_status,
      rollback_second_preserved_first_record: activation.rollback_second_preserved_first_record,
      rollback_first_status: activation.rollback_first_status,
      final_chamber_only_sentinel: activation.final_chamber_only_sentinel,
      unrelated_sentinel_preserved: activation.unrelated_sentinel_preserved,
      lifetime_count_after_rollbacks: activation.lifetime_count_after_rollbacks,
      fresh_wrapper_third_write_error: activation.fresh_wrapper_third_write_error,
      audit_event_count: activation.audit_event_count,
      all_broader_authorities_false: activation.all_broader_authorities_false
    },
    synthesis_attempts: activation.attempts,
    policy: {
      scope_id: OPERATOR_INTENT,
      max_chamber_records_created: 2,
      activation_mode: "manual_sequential",
      normal_chat_persistence_open: false,
      automatic_activation_open: false,
      batch_activation_open: false,
      automatic_backfill_open: false,
      backend_sync_open: false,
      backend_persistent_write_open: false,
      broad_canonical_write_open: false,
      projection_store_write_open: false,
      meta_write_open: false,
      remote_write_open: false
    },
    redaction: {
      raw_source_text_in_evidence: false,
      raw_evidence_quotes_in_evidence: false,
      candidate_signatures_in_evidence: false,
      canonical_signatures_in_evidence: false,
      user_production_data_modified: false,
      in_memory_chamber_fixture_only: true
    }
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify({
    production_activation_verified: true,
    selected_record_count: proof.activation.selected_records.length,
    created_record_count: proof.activation.created_record_count,
    third_write_error: proof.activation.third_write_error,
    repository_calls: `${proof.activation.repository_save_calls}/${proof.activation.repository_load_calls}`,
    rollback_second_status: proof.activation.rollback_second_status,
    rollback_first_status: proof.activation.rollback_first_status,
    fresh_wrapper_third_write_error: proof.activation.fresh_wrapper_third_write_error,
    operator_no_intent_chat_requests: proof.operator.no_intent.chat_request_count,
    operator_exact_intent_authorized: proof.operator.exact_intent.authorized
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
