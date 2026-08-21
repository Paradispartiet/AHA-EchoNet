const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { chromium } = require("playwright");

const FRONTEND = process.env.AHA_FRONTEND_ORIGIN || "https://paradispartiet.github.io/AHA-EchoNet";
const SYNTHESIS_ENDPOINT = process.env.AHA_AGENT_ENDPOINT || "https://aha-agent-7a3y.onrender.com/api/aha-agent/semantic-document";
const EXPECTED_MAIN = String(process.env.EXPECTED_MAIN_SHA || "");
const OUTPUT = process.env.PROOF_OUTPUT || "probe-evidence/two-record-expansion-activation-live-proof-v2.json";
const PARITY_PATH = process.env.PARITY_PATH || "probe-evidence/pages-activation-parity-v2.json";
const DEPLOYED_ASSET_DIR = process.env.DEPLOYED_ASSET_DIR || "probe-evidence/deployed-assets";
const OPERATOR_INTENT = "bounded_local_chamber_two_record_candidate_v1";
const ROLLBACK_LOCK_NAME = "aha-v2-controlled-write-expansion-rollback-v1";
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

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function deployedAssetPath(repositoryPath) {
  return path.join(DEPLOYED_ASSET_DIR, repositoryPath.replaceAll("/", "__"));
}

function readVerifiedAsset(repositoryPath, parity, executedAssets) {
  const entry = parity.assets.find((asset) => asset.path === repositoryPath);
  if (!entry?.match || !/^[a-f0-9]{64}$/u.test(String(entry.sha256 || ""))) {
    throw new Error(`deployed_asset_not_verified:${repositoryPath}`);
  }
  const bytes = fs.readFileSync(deployedAssetPath(repositoryPath));
  const actual = sha256(bytes);
  if (actual !== entry.sha256) throw new Error(`execution_copy_hash_mismatch:${repositoryPath}`);
  if (executedAssets) executedAssets.set(repositoryPath, actual);
  return bytes;
}

function readVerifiedJson(repositoryPath, parity, executedAssets) {
  return JSON.parse(readVerifiedAsset(repositoryPath, parity, executedAssets).toString("utf8"));
}

function contentType(repositoryPath) {
  if (repositoryPath.endsWith(".html")) return "text/html; charset=utf-8";
  if (repositoryPath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (repositoryPath.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function installCapturedRoutes(page, parity, routed) {
  const base = new URL(`${FRONTEND.replace(/\/$/u, "")}/`);
  await page.route(`${base.origin}/**`, async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== base.origin || !requestUrl.pathname.startsWith(base.pathname)) {
      await route.continue();
      return;
    }
    const relativePath = decodeURIComponent(requestUrl.pathname.slice(base.pathname.length));
    const entry = parity.assets.find((asset) => asset.path === relativePath);
    if (!entry) {
      await route.continue();
      return;
    }
    const bytes = readVerifiedAsset(relativePath, parity, routed);
    await route.fulfill({ status: 200, contentType: contentType(relativePath), body: bytes });
  });
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

function chamber(storage) {
  return JSON.parse(storage.getItem("aha_insight_chamber_v1") || '{"insights":[]}');
}

function chamberRecord(storage, id) {
  return clone((chamber(storage).insights || []).find((item) => item.id === id) || null);
}

function chamberSnapshot(storage) {
  const value = chamber(storage);
  value.insights = (value.insights || []).map(clone).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return stable(value);
}

function chamberIds(storage) {
  return (chamber(storage).insights || []).map((item) => item.id);
}

function makeExclusiveLockManager() {
  let tail = Promise.resolve();
  let active = 0;
  let maxActive = 0;
  const names = [];
  const modes = [];
  return {
    async request(name, options, callback) {
      names.push(name);
      modes.push(options?.mode || null);
      const previous = tail;
      let release;
      tail = new Promise((resolve) => { release = resolve; });
      await previous;
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        return await callback({ name, mode: options?.mode || null });
      } finally {
        active -= 1;
        release();
      }
    },
    stats() {
      return { active, max_active: maxActive, names: [...names], modes: [...modes] };
    }
  };
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
          anchor_id: `expansion_activation_live_ev_${candidateIndex}_${evidenceIndex}`,
          start_offset: start,
          end_offset: start + item.quote.length,
          text: item.quote
        }]
      };
    })
  }));
}

async function buildEligibleSources(runtime) {
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
      const sourceHash = sha256(Buffer.from(sourceText, "utf8"));
      const response = await fetch(SYNTHESIS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "AHA-V2-Two-Record-Expansion-Activation-Proof-V2" },
        body: JSON.stringify({
          text: sourceText,
          format: "aha_insight_synthesis_output_v2",
          semantic_context: semanticContext(fixture.model_shadow),
          context: { source_event_id: fixture.source_event_id, source_type: "production_expansion_activation_proof_v2", language: "no" }
        })
      });
      const envelope = await response.json();
      if (response.status !== 200 || envelope.ok !== true || envelope.schema !== "aha_insight_synthesis_contract_v2") {
        attempts.push({ fixture: fixtureName, status: "endpoint_rejected", http_status: response.status });
        continue;
      }
      ["production_gate_authority", "synthesis_allowed", "canonical_write", "chamber_write", "persistent_write", "meta_write"]
        .forEach((field) => assert.equal(envelope.policy[field], false));

      const shadow = {
        schema: "aha_insight_synthesis_shadow_v2",
        version: 2,
        mode: "shadow",
        source_event_id: fixture.source_event_id,
        source_text_hash: sourceHash,
        deterministic_document_id: `sem_expansion_activation_${sourceHash.slice(0, 12)}`,
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
      const gate = runtime.AHAInsightQualityGateV2.evaluateSynthesisShadow({ source_text: sourceText, synthesis_shadow: shadow });
      const eligible = (gate.decisions || []).find((item) => item.eligible_for_insight_review === true && !(item.blocking_reasons || []).length);
      if (gate.valid !== true || !eligible) {
        attempts.push({ fixture: fixtureName, status: "no_eligible_candidate", eligible_count: gate.eligible_count || 0 });
        continue;
      }
      selected.push({ fixtureName, fixture, sourceText, sourceHash, shadow, gate, eligible, model: envelope.model });
      attempts.push({ fixture: fixtureName, status: "selected", eligible_count: gate.eligible_count, quality_score: eligible.metrics?.quality_score ?? null });
    } catch (error) {
      attempts.push({ fixture: fixtureName, status: "attempt_failed", reason: String(error?.code || error?.message || error).slice(0, 160) });
    }
  }

  assert.equal(selected.length, 2, JSON.stringify(attempts));
  assert.notEqual(selected[0].fixture.source_event_id, selected[1].fixture.source_event_id);
  assert.notEqual(selected[0].sourceHash, selected[1].sourceHash);
  return { selected, attempts };
}

async function proveOperator(parity) {
  const browser = await chromium.launch({ headless: true });
  const routed = new Map();
  try {
    const noIntentContext = await browser.newContext();
    const noIntentPage = await noIntentContext.newPage();
    await installCapturedRoutes(noIntentPage, parity, routed);
    const noIntentRequests = [];
    const noIntentErrors = [];
    const noIntentConsoleErrors = [];
    noIntentPage.on("request", (request) => noIntentRequests.push({ method: request.method(), url: request.url() }));
    noIntentPage.on("pageerror", (error) => noIntentErrors.push(String(error?.message || error)));
    noIntentPage.on("console", (message) => { if (message.type() === "error") noIntentConsoleErrors.push(message.text()); });
    await noIntentPage.goto(`${FRONTEND}/insight-expansion-v2.html?proof_v2_no_intent=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await noIntentPage.waitForFunction(() => document.querySelector("#page-status")?.textContent?.includes("Expansion lukket"), null, { timeout: 25000 });
    await noIntentPage.waitForTimeout(400);
    const noIntentState = await noIntentPage.evaluate(() => ({
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
    await installCapturedRoutes(intentPage, parity, routed);
    const intentRequests = [];
    const intentErrors = [];
    const intentConsoleErrors = [];
    intentPage.on("request", (request) => intentRequests.push({ method: request.method(), url: request.url() }));
    intentPage.on("pageerror", (error) => intentErrors.push(String(error?.message || error)));
    intentPage.on("console", (message) => { if (message.type() === "error") intentConsoleErrors.push(message.text()); });
    await intentPage.goto(`${FRONTEND}/insight-expansion-v2.html?pilot=${OPERATOR_INTENT}&proof_v2_intent=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await intentPage.waitForFunction(() => document.querySelector("#page-status")?.textContent?.includes("To-record-authority er etablert"), null, { timeout: 60000 });
    const intentState = await intentPage.evaluate(() => ({
      gate_status: document.querySelector("#gate-status")?.textContent || "",
      iframe_src: document.querySelector("#chat-frame")?.getAttribute("src") || "",
      iframe_ready: document.querySelector("#chat-frame")?.classList.contains("ready") || false,
      web_locks_available: typeof document.querySelector("#chat-frame")?.contentWindow?.navigator?.locks?.request === "function"
    }));
    const intentChatRequests = intentRequests.filter((item) => /\/chat\.html(?:[?#]|$)/u.test(item.url));
    const intentWrites = intentRequests.filter((item) => !["GET", "HEAD"].includes(item.method));
    assert.match(intentState.gate_status, /BOUNDED_EXPANSION_PILOT_ELIGIBLE/u);
    assert.equal(intentState.iframe_src, "chat.html?ahaSemanticModelShadow=1&ahaInsightSynthesisV2=1");
    assert.equal(intentState.iframe_ready, true);
    assert.equal(intentState.web_locks_available, true);
    assert.ok(intentChatRequests.length >= 1);
    assert.equal(intentWrites.length, 0, JSON.stringify(intentWrites));
    assert.equal(intentErrors.length, 0, JSON.stringify(intentErrors));
    assert.equal(intentConsoleErrors.length, 0, JSON.stringify(intentConsoleErrors));
    await intentContext.close();

    return {
      no_intent: { closed: true, iframe_about_blank: true, chat_request_count: 0, all_buttons_disabled: true, unexpected_write_request_count: 0 },
      exact_intent: {
        authorized: true,
        gate_decision: "BOUNDED_EXPANSION_PILOT_ELIGIBLE",
        iframe_ready: true,
        web_locks_available: true,
        chat_request_count: intentChatRequests.length,
        unexpected_write_request_count: 0
      },
      captured_route_execution: {
        mode: "captured_hash_verified_deployed_bytes",
        routed_asset_count: routed.size,
        routed_assets: [...routed.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([asset, digest]) => ({ path: asset, sha256: digest }))
      }
    };
  } finally {
    await browser.close();
  }
}

async function runActivationSequence(parity, executedAssets) {
  const assetPaths = {
    chamber: "js/insightsChamber.js",
    qualityGate: "js/ahaInsightQualityGateV2.js",
    activation: "js/ahaInsightActivationV2.js",
    expansionGate: "js/ahaV2ControlledWriteExpansionGate.js",
    expansionActivation: "js/ahaV2ControlledWriteExpansionActivation.js",
    chamberSync: "js/ahaChamberSync.js"
  };
  const deployed = {};
  for (const [name, asset] of Object.entries(assetPaths)) deployed[name] = readVerifiedAsset(asset, parity, executedAssets).toString("utf8");

  const synthesisProof = {
    provenance: readVerifiedJson("tests/fixtures/semantic-live-reviewed-v2/post-stability-two-round-v1/provenance.json", parity, executedAssets),
    summary: readVerifiedJson("tests/fixtures/semantic-live-reviewed-v2/post-stability-two-round-v1/summary.json", parity, executedAssets)
  };
  const expansionEvidence = readVerifiedJson("ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json", parity, executedAssets);
  const oneRecordPilotProof = readVerifiedJson("ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json", parity, executedAssets);
  const expansionLiveProof = readVerifiedJson("ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json", parity, executedAssets);
  const scopeContract = readVerifiedJson("ops/contracts/aha-v2-controlled-write-expansion-scope-two-record-v1.json", parity, executedAssets);

  assert.equal(expansionEvidence.current_decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
  assert.equal(expansionLiveProof.status, "production_evidence_verified");
  assert.equal(expansionLiveProof.proof_revision, "corrected_v2");

  const runtime = { window: null, globalThis: null, console, Date, Math, JSON, setTimeout, clearTimeout };
  runtime.window = runtime;
  runtime.globalThis = runtime;
  vm.createContext(runtime);
  for (const key of ["chamber", "qualityGate", "activation", "expansionGate", "expansionActivation"]) {
    vm.runInContext(deployed[key], runtime, { filename: `captured/${assetPaths[key]}` });
  }

  const { selected, attempts } = await buildEligibleSources(runtime);
  const sourceEvents = new Map(selected.map((item) => [item.fixture.source_event_id, { id: item.fixture.source_event_id, text: item.sourceText }]));
  let currentShadow = null;
  let currentGate = null;
  const dispatched = [];
  const sentinel = {
    id: "two_record_expansion_live_sentinel_v2",
    title: "Unrelated sentinel",
    summary: "Must remain byte-equivalent",
    kind: "sentinel",
    tags: ["unrelated", "preserve"],
    nested: { proof: "full_record_equality", version: 2 }
  };
  const storage = makeStorage({ insights: [clone(sentinel)] });
  const sentinelBefore = chamberRecord(storage, sentinel.id);
  const chamberBeforeActivation = chamberSnapshot(storage);
  const lockManager = makeExclusiveLockManager();

  const activationDeps = {
    storage,
    randomId: () => crypto.randomUUID(),
    sha256Hex: (value) => sha256(Buffer.from(String(value), "utf8")),
    getRuntime: () => ({
      getLastSynthesisShadow: () => clone(currentShadow),
      getLastGateEvaluation: () => clone(currentGate)
    }),
    getProof: () => clone(synthesisProof),
    getSourceEvent: (sourceEventId) => clone(sourceEvents.get(sourceEventId) || null),
    getEngine: () => runtime.InsightsEngine,
    createEvent: (detail) => ({ type: "aha:insight-activation-v2", detail }),
    dispatchEvent: (event) => dispatched.push(event)
  };
  const expansionInput = { operatorIntent: OPERATOR_INTENT, expansionEvidence, oneRecordPilotProof, expansionLiveProof, scopeContract };
  const expansion = runtime.AHAV2ControlledWriteExpansionActivation.create(expansionInput, {
    activationApi: runtime.AHAInsightActivationV2,
    activationDeps,
    rollbackLockManager: lockManager
  });
  const authorization = expansion.authorization();
  assert.equal(authorization.authorized, true);
  assert.equal(authorization.expansion_gate_decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
  assert.equal(authorization.max_chamber_records_created, 2);
  assert.equal(authorization.policy.cross_instance_rollback_serialization, "web_locks_exclusive");

  const recordProofs = [];
  const reviewIds = [];
  const canonicalIds = [];
  for (let index = 0; index < selected.length; index += 1) {
    const source = selected[index];
    currentShadow = clone(source.shadow);
    currentGate = clone(source.gate);
    const chamberBeforeReview = chamberSnapshot(storage);
    const reviewRequest = await expansion.prepareReview({ candidate_index: source.eligible.candidate_index });
    const review = await expansion.approveReview({ request_id: reviewRequest.request_id, approval: reviewRequest.approval_phrase });
    assert.equal(same(chamberSnapshot(storage), chamberBeforeReview), true, "review must not change Chamber");
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
  const firstCanonicalBeforeRollbacks = chamberRecord(storage, canonicalIds[0]);
  assert.ok(firstCanonicalBeforeRollbacks);
  assert.equal(same(chamberRecord(storage, sentinel.id), sentinelBefore), true);

  let thirdWriteError = null;
  try { await expansion.prepareReview({ candidate_index: selected[1].eligible.candidate_index }); }
  catch (error) { thirdWriteError = error.code || error.message; }
  assert.equal(thirdWriteError, "expansion_record_budget_exhausted");

  let repositorySaveCalls = 0;
  let repositoryLoadCalls = 0;
  const syncRuntime = {
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
  syncRuntime.window = syncRuntime;
  vm.createContext(syncRuntime);
  vm.runInContext(deployed.chamberSync, syncRuntime, { filename: "captured/ahaChamberSync.js" });
  const syncPush = await syncRuntime.AHAChamberSync.push();
  const syncPull = await syncRuntime.AHAChamberSync.pull();
  assert.equal(syncPush?.ok, false);
  assert.equal(syncPush?.reason, "local_only_insight_activation_present");
  assert.equal(syncPull?.ok, false);
  assert.equal(syncPull?.reason, "local_only_insight_activation_present");
  assert.equal(repositorySaveCalls, 0);
  assert.equal(repositoryLoadCalls, 0);

  const rollback2 = expansion.prepareRollback({ review_id: reviewIds[1] });
  const rolled2 = await expansion.approveRollback({ request_id: rollback2.request_id, approval: rollback2.approval_phrase });
  assert.equal(rolled2.status, "rolled_back");
  const sentinelAfterRollback2 = chamberRecord(storage, sentinel.id);
  const firstCanonicalAfterRollback2 = chamberRecord(storage, canonicalIds[0]);
  assert.equal(same(sentinelAfterRollback2, sentinelBefore), true, "full sentinel record changed after rollback 2");
  assert.equal(same(firstCanonicalAfterRollback2, firstCanonicalBeforeRollbacks), true, "record 1 changed during rollback 2");
  assert.equal(chamberRecord(storage, canonicalIds[1]), null);
  assert.equal(expansion.getStatus().created_record_count, 2);

  const rollback1 = expansion.prepareRollback({ review_id: reviewIds[0] });
  const rolled1 = await expansion.approveRollback({ request_id: rollback1.request_id, approval: rollback1.approval_phrase });
  assert.equal(rolled1.status, "rolled_back");
  const sentinelAfterRollback1 = chamberRecord(storage, sentinel.id);
  assert.equal(same(sentinelAfterRollback1, sentinelBefore), true, "full sentinel record changed after rollback 1");
  assert.equal(chamberRecord(storage, canonicalIds[0]), null);
  const finalChamber = chamberSnapshot(storage);
  const finalBusinessState = clone(finalChamber);
  const preActivationBusinessState = clone(chamberBeforeActivation);
  delete finalBusinessState._local_updated_at;
  delete preActivationBusinessState._local_updated_at;
  const expectedFinalTopLevelKeys = [...new Set([...Object.keys(chamberBeforeActivation), "_local_updated_at"])].sort();
  const finalTopLevelKeys = Object.keys(finalChamber).sort();
  assert.equal(same(finalBusinessState, preActivationBusinessState), true, "final Chamber business state must equal exact pre-activation state");
  assert.deepEqual(finalTopLevelKeys, expectedFinalTopLevelKeys, "_local_updated_at must be the only allowed top-level housekeeping delta");
  assert.equal(typeof finalChamber._local_updated_at, "string", "final Chamber must expose _local_updated_at housekeeping timestamp");
  assert.equal(expansion.getStatus().created_record_count, 2);
  assert.equal(expansion.getStatus().expansion_complete, true);

  const lockStats = lockManager.stats();
  assert.equal(lockStats.max_active, 1);
  assert.deepEqual(lockStats.names, [ROLLBACK_LOCK_NAME, ROLLBACK_LOCK_NAME]);
  assert.deepEqual(lockStats.modes, ["exclusive", "exclusive"]);

  const fresh = runtime.AHAV2ControlledWriteExpansionActivation.create(expansionInput, {
    activationApi: runtime.AHAInsightActivationV2,
    activationDeps,
    rollbackLockManager: lockManager
  });
  assert.equal(fresh.getStatus().created_record_count, 2);
  let freshThirdError = null;
  try { await fresh.prepareReview({ candidate_index: selected[0].eligible.candidate_index }); }
  catch (error) { freshThirdError = error.code || error.message; }
  assert.equal(freshThirdError, "expansion_record_budget_exhausted");

  const policy = fresh.getStatus().policy;
  for (const field of [
    "automatic_activation_open", "batch_activation_open", "normal_chat_persistence_open", "automatic_backfill_open",
    "backend_sync_open", "backend_persistent_write_open", "broad_canonical_write_open", "projection_store_write_open",
    "meta_write_open", "remote_write_open"
  ]) assert.equal(policy[field], false, `${field} must remain closed`);
  assert.equal(policy.cross_instance_rollback_serialization_required, true);
  assert.equal(policy.cross_instance_rollback_serialization, "web_locks_exclusive");

  return {
    attempts,
    selected_records: recordProofs,
    distinct_sources: true,
    distinct_candidate_signatures: true,
    created_record_count: 2,
    third_write_error: thirdWriteError,
    repository_save_calls: repositorySaveCalls,
    repository_load_calls: repositoryLoadCalls,
    sync_push: syncPush,
    sync_pull: syncPull,
    rollback_second_status: rolled2.status,
    rollback_second_full_sentinel_preserved: same(sentinelAfterRollback2, sentinelBefore),
    rollback_second_full_first_record_preserved: same(firstCanonicalAfterRollback2, firstCanonicalBeforeRollbacks),
    rollback_first_status: rolled1.status,
    rollback_first_full_sentinel_preserved: same(sentinelAfterRollback1, sentinelBefore),
    final_chamber_exact_pre_activation_business_state: same(finalBusinessState, preActivationBusinessState),
    final_chamber_only_local_updated_at_housekeeping_delta: same(finalTopLevelKeys, expectedFinalTopLevelKeys) && typeof finalChamber._local_updated_at === "string",
    lifetime_count_after_rollbacks: expansion.getStatus().created_record_count,
    fresh_wrapper_third_write_error: freshThirdError,
    audit_event_count: fresh.getAudit().length,
    dispatched_action_count: dispatched.length,
    rollback_lock: lockStats,
    all_broader_authorities_false: true
  };
}

async function run() {
  const parity = JSON.parse(fs.readFileSync(PARITY_PATH, "utf8"));
  assert.equal(parity.schema, "aha_v2_two_record_expansion_activation_pages_parity_v2");
  assert.equal(parity.expected_main, EXPECTED_MAIN);
  assert.equal(parity.pages_commit, EXPECTED_MAIN);
  assert.equal(parity.pages_status, "built");
  assert.equal(parity.all_assets_match, true);
  assert.equal(parity.execution_source, "captured_hash_verified_deployed_bytes");

  const executedAssets = new Map();
  const operator = await proveOperator(parity);
  const activation = await runActivationSequence(parity, executedAssets);

  const proof = {
    schema: "aha_v2_two_record_expansion_activation_live_proof_v1",
    version: 1,
    status: "production_activation_verified",
    proof_revision: "corrected_v2",
    observed_at: new Date().toISOString(),
    expected_production_main: EXPECTED_MAIN,
    proof_identity: {
      workflow_run_id: RUN_ID,
      workflow_run_attempt: RUN_ATTEMPT,
      probe_head: process.env.PROBE_HEAD_SHA || null,
      execution_source: "captured_hash_verified_deployed_bytes"
    },
    deployment: {
      authority: "github_pages",
      origin: FRONTEND,
      pages_commit: parity.pages_commit,
      pages_status: parity.pages_status,
      matched_attempt: parity.matched_attempt,
      all_assets_match: true,
      assets: parity.assets.map((asset) => ({ path: asset.path, sha256: asset.sha256, match: asset.match }))
    },
    execution_binding: {
      exact_deployed_bytes_used: true,
      mode: "captured_hash_verified_deployed_bytes",
      executed_vm_assets: [...executedAssets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([asset, digest]) => ({ path: asset, sha256: digest })),
      operator_captured_routes: operator.captured_route_execution
    },
    operator: {
      no_intent: operator.no_intent,
      exact_intent: operator.exact_intent
    },
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
      rollback_second_full_sentinel_preserved: activation.rollback_second_full_sentinel_preserved,
      rollback_second_full_first_record_preserved: activation.rollback_second_full_first_record_preserved,
      rollback_first_status: activation.rollback_first_status,
      rollback_first_full_sentinel_preserved: activation.rollback_first_full_sentinel_preserved,
      final_chamber_exact_pre_activation_business_state: activation.final_chamber_exact_pre_activation_business_state,
      final_chamber_only_local_updated_at_housekeeping_delta: activation.final_chamber_only_local_updated_at_housekeeping_delta,
      lifetime_count_after_rollbacks: activation.lifetime_count_after_rollbacks,
      fresh_wrapper_third_write_error: activation.fresh_wrapper_third_write_error,
      audit_event_count: activation.audit_event_count,
      rollback_lock: activation.rollback_lock,
      all_broader_authorities_false: activation.all_broader_authorities_false
    },
    synthesis_attempts: activation.attempts,
    policy: {
      scope_id: OPERATOR_INTENT,
      max_chamber_records_created: 2,
      activation_mode: "manual_sequential",
      cross_instance_rollback_serialization_required: true,
      cross_instance_rollback_serialization: "web_locks_exclusive",
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
    review_remediation: {
      deployed_execution_byte_binding_gap_closed: true,
      unrelated_sentinel_full_content_check_gap_closed: true,
      cross_instance_rollback_serialization_proven: true,
      pending_review_threads: ["PRRT_kwDOQgS1AM6a9Pio", "PRRT_kwDOQgS1AM6a9Pis"]
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

  assert.equal(proof.execution_binding.exact_deployed_bytes_used, true);
  assert.equal(proof.activation.rollback_second_full_sentinel_preserved, true);
  assert.equal(proof.activation.rollback_second_full_first_record_preserved, true);
  assert.equal(proof.activation.rollback_first_full_sentinel_preserved, true);
  assert.equal(proof.activation.final_chamber_exact_pre_activation_business_state, true);
  assert.equal(proof.activation.final_chamber_only_local_updated_at_housekeeping_delta, true);
  assert.equal(proof.activation.rollback_lock.max_active, 1);
  assert.deepEqual(proof.activation.rollback_lock.names, [ROLLBACK_LOCK_NAME, ROLLBACK_LOCK_NAME]);
  assert.deepEqual(proof.activation.rollback_lock.modes, ["exclusive", "exclusive"]);
  assert.equal(proof.operator.exact_intent.web_locks_available, true);
  assert.equal(proof.activation.third_write_error, "expansion_record_budget_exhausted");
  assert.equal(proof.activation.fresh_wrapper_third_write_error, "expansion_record_budget_exhausted");
  assert.equal(proof.activation.repository_save_calls, 0);
  assert.equal(proof.activation.repository_load_calls, 0);

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify({
    production_activation_verified: true,
    proof_revision: proof.proof_revision,
    expected_main: proof.expected_production_main,
    exact_deployed_bytes_used: proof.execution_binding.exact_deployed_bytes_used,
    selected_record_count: proof.activation.selected_records.length,
    created_record_count: proof.activation.created_record_count,
    full_sentinel_preserved_after_both_rollbacks: proof.activation.rollback_second_full_sentinel_preserved && proof.activation.rollback_first_full_sentinel_preserved,
    first_record_preserved_during_second_rollback: proof.activation.rollback_second_full_first_record_preserved,
    final_chamber_exact_pre_activation_business_state: proof.activation.final_chamber_exact_pre_activation_business_state,
    final_chamber_only_local_updated_at_housekeeping_delta: proof.activation.final_chamber_only_local_updated_at_housekeeping_delta,
    rollback_lock_max_active: proof.activation.rollback_lock.max_active,
    rollback_lock_modes: proof.activation.rollback_lock.modes,
    third_write_error: proof.activation.third_write_error,
    repository_calls: `${proof.activation.repository_save_calls}/${proof.activation.repository_load_calls}`
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
