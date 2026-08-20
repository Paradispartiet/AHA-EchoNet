const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const FRONTEND = process.env.AHA_FRONTEND_ORIGIN || "https://paradispartiet.github.io/AHA-EchoNet";
const ENDPOINT = process.env.AHA_AGENT_ENDPOINT || "https://aha-agent-7a3y.onrender.com/api/aha-agent/semantic-document";
const EXPECTED_MAIN = process.env.EXPECTED_MAIN_SHA;
const OUTPUT = process.env.PROOF_OUTPUT || "reports/TEMP-aha-insight-v2-activation-production-proof.json";

if (!/^[a-f0-9]{40}$/u.test(String(EXPECTED_MAIN || ""))) throw new Error("EXPECTED_MAIN_SHA is required");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": "AHA-Insight-V2-Production-Proof" } });
  if (!response.ok) throw new Error(`fetch_failed:${response.status}:${url}`);
  return response.text();
}

async function waitForExactAsset(url, localPath) {
  const expected = sha256(fs.readFileSync(localPath));
  let latest = null;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    latest = await fetchText(`${url}?proof_main=${EXPECTED_MAIN}&attempt=${attempt}`);
    if (sha256(latest) === expected) return { body: latest, sha256: expected, attempts: attempt };
    if (attempt < 20) await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  throw new Error(`deployed_asset_hash_mismatch:${url}:${sha256(latest || "")}:${expected}`);
}

function makeStorage(chamber) {
  const values = new Map([["aha_insight_chamber_v1", JSON.stringify(chamber)]]);
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

function semanticContext(modelShadow) {
  return {
    entities: (modelShadow.entities || []).map((item) => ({ label: item.canonical_label || item.source_surface, entity_type: item.entity_type || "other" })),
    concepts: (modelShadow.concepts || []).map((item) => ({ label: item.canonical_label || item.source_surface })),
    source_claims: (modelShadow.propositions || []).filter((item) => item.kind === "source_claim").map((item) => ({ text: item.text })),
    relations: (modelShadow.relations || []).filter((item) => item.epistemic_status === "source_explicit").map((item) => ({
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
        spans: [{ anchor_id: `live_ev_${candidateIndex}_${evidenceIndex}`, start_offset: start, end_offset: start + item.quote.length, text: item.quote }]
      };
    })
  }));
}

async function run() {
  const assetSpecs = [
    ["insight-activation-v2.html", "insight-activation-v2.html"],
    ["js/ahaInsightActivationV2.js", "js/ahaInsightActivationV2.js"],
    ["js/ahaInsightActivationOperatorV2.js", "js/ahaInsightActivationOperatorV2.js"],
    ["js/ahaInsightQualityGateV2.js", "js/ahaInsightQualityGateV2.js"],
    ["js/insightsChamber.js", "js/insightsChamber.js"],
    ["js/ahaChamberSync.js", "js/ahaChamberSync.js"]
  ];
  const deployed = {};
  for (const [remotePath, localPath] of assetSpecs) {
    deployed[remotePath] = await waitForExactAsset(`${FRONTEND}/${remotePath}`, localPath);
  }
  assert.match(deployed["insight-activation-v2.html"].body, /Godkjenn én Chamber-innsikt/);

  const [provenance, summary] = await Promise.all([
    fetch(`${FRONTEND}/tests/fixtures/semantic-live-reviewed-v2/post-stability-two-round-v1/provenance.json?proof_main=${EXPECTED_MAIN}`).then((response) => response.json()),
    fetch(`${FRONTEND}/tests/fixtures/semantic-live-reviewed-v2/post-stability-two-round-v1/summary.json?proof_main=${EXPECTED_MAIN}`).then((response) => response.json())
  ]);
  const proof = { provenance, summary };

  const fixture = JSON.parse(fs.readFileSync("tests/fixtures/semantic-live-reviewed/standardization-flexibility-v1.json", "utf8"));
  const sourceText = fixture.source_text;
  const sourceHash = sha256(sourceText);
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "AHA-Insight-V2-Production-Proof" },
    body: JSON.stringify({
      text: sourceText,
      format: "aha_insight_synthesis_output_v2",
      semantic_context: semanticContext(fixture.model_shadow),
      context: { source_event_id: fixture.source_event_id, source_type: "production_proof", language: "no" }
    })
  });
  const envelope = await response.json();
  assert.equal(response.status, 200, JSON.stringify(envelope));
  assert.equal(envelope.ok, true);
  assert.equal(envelope.schema, "aha_insight_synthesis_contract_v2");
  ["production_gate_authority", "synthesis_allowed", "canonical_write", "chamber_write", "persistent_write", "meta_write"]
    .forEach((field) => assert.equal(envelope.policy[field], false));

  const browser = { window: null, globalThis: null, console, Date, Math, JSON, setTimeout, clearTimeout };
  browser.window = browser;
  browser.globalThis = browser;
  vm.createContext(browser);
  vm.runInContext(deployed["js/insightsChamber.js"].body, browser, { filename: "deployed/insightsChamber.js" });
  vm.runInContext(deployed["js/ahaInsightQualityGateV2.js"].body, browser, { filename: "deployed/ahaInsightQualityGateV2.js" });
  vm.runInContext(deployed["js/ahaInsightActivationV2.js"].body, browser, { filename: "deployed/ahaInsightActivationV2.js" });

  const shadow = {
    schema: "aha_insight_synthesis_shadow_v2",
    version: 2,
    mode: "shadow",
    source_event_id: fixture.source_event_id,
    source_text_hash: sourceHash,
    deterministic_document_id: `sem_prod_${sourceHash.slice(0, 12)}`,
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
  const gate = browser.AHAInsightQualityGateV2.evaluateSynthesisShadow({ source_text: sourceText, synthesis_shadow: shadow });
  assert.equal(gate.valid, true);
  const eligible = gate.decisions.find((item) => item.eligible_for_insight_review === true);
  assert.ok(eligible, JSON.stringify(gate));

  const storage = makeStorage({ insights: [{ id: "existing_production_proof", title: "Must remain" }] });
  const dispatched = [];
  const controller = browser.AHAInsightActivationV2.create({
    storage,
    randomId: () => crypto.randomUUID(),
    sha256Hex: sha256,
    getRuntime: () => ({
      getLastSynthesisShadow: () => clone(shadow),
      getLastGateEvaluation: () => clone(gate)
    }),
    getProof: () => clone(proof),
    getSourceEvent: () => ({ id: fixture.source_event_id, text: sourceText }),
    getEngine: () => browser.InsightsEngine,
    createEvent: (detail) => ({ type: "aha:insight-activation-v2", detail }),
    dispatchEvent: (event) => dispatched.push(event)
  });

  const reviewRequest = await controller.prepareReview({ candidate_index: eligible.candidate_index });
  const review = await controller.approveReview({ request_id: reviewRequest.request_id, approval: reviewRequest.approval_phrase });
  assert.equal(review.status, "reviewed");
  assert.deepEqual(JSON.parse(storage.getItem("aha_insight_chamber_v1")).insights.map((item) => item.id), ["existing_production_proof"]);

  const canonicalRequest = await controller.prepareCanonical({ review_id: review.id });
  const canonical = await controller.approveCanonical({ request_id: canonicalRequest.request_id, approval: canonicalRequest.approval_phrase });
  const promotedIds = JSON.parse(storage.getItem("aha_insight_chamber_v1")).insights.map((item) => item.id);
  assert.deepEqual(promotedIds, ["existing_production_proof", canonical.insight.id]);

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
  vm.runInContext(deployed["js/ahaChamberSync.js"].body, syncBrowser, { filename: "deployed/ahaChamberSync.js" });
  const push = await syncBrowser.AHAChamberSync.push();
  const pull = await syncBrowser.AHAChamberSync.pull();
  assert.deepEqual(push, { ok: false, reason: "local_only_insight_activation_present" });
  assert.deepEqual(pull, { ok: false, reason: "local_only_insight_activation_present" });
  assert.equal(repositorySaveCalls, 0);
  assert.equal(repositoryLoadCalls, 0);

  const rollbackRequest = controller.prepareRollback({ review_id: review.id });
  const rolledBack = await controller.approveRollback({ request_id: rollbackRequest.request_id, approval: rollbackRequest.approval_phrase });
  assert.equal(rolledBack.status, "rolled_back");
  const finalIds = JSON.parse(storage.getItem("aha_insight_chamber_v1")).insights.map((item) => item.id);
  assert.deepEqual(finalIds, ["existing_production_proof"]);
  const audit = controller.getAudit();
  assert.ok(audit.length >= 9);
  assert.equal(dispatched.length, 3);

  const result = {
    schema: "aha_insight_synthesis_v2_controlled_activation_production_proof_v1",
    version: 1,
    measured_at: new Date().toISOString(),
    workflow_run_id: Number(process.env.GITHUB_RUN_ID || 0) || null,
    workflow_run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT || 0) || null,
    workflow_head: process.env.GITHUB_SHA || null,
    expected_production_main: EXPECTED_MAIN,
    frontend: {
      origin: FRONTEND,
      assets: Object.fromEntries(Object.entries(deployed).map(([name, item]) => [name, { sha256: item.sha256, fetch_attempts: item.attempts }]))
    },
    synthesis: {
      endpoint: ENDPOINT,
      model: envelope.model,
      response_id: envelope.response_id,
      candidate_count: shadow.candidates.length,
      eligible_count: gate.eligible_count,
      selected_candidate_index: eligible.candidate_index,
      selected_quality_score: eligible.metrics.quality_score
    },
    activation: {
      review_id: review.id,
      candidate_signature: review.candidate_signature,
      canonical_insight_id: canonical.insight.id,
      canonical_signature: canonical.insight.activation_v2.canonical_signature,
      chamber_ids_after_review: ["existing_production_proof"],
      chamber_ids_after_promotion: promotedIds,
      sync_push: push,
      sync_pull: pull,
      repository_save_calls: repositorySaveCalls,
      repository_load_calls: repositoryLoadCalls,
      rollback_status: rolledBack.status,
      chamber_ids_after_rollback: finalIds,
      audit_event_count: audit.length,
      audit_tail_hash: audit.at(-1).event_hash,
      dispatched_actions: dispatched.map((event) => event.detail.action)
    },
    policy: {
      automatic_canonical_write: false,
      backend_persistent_write: false,
      backend_sync: false,
      meta_write: false,
      normal_chat_activation: false,
      production_proof_passed: true
    }
  };
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    production_proof_passed: true,
    model: result.synthesis.model,
    response_id: result.synthesis.response_id,
    eligible_count: result.synthesis.eligible_count,
    audit_event_count: result.activation.audit_event_count,
    rollback_status: result.activation.rollback_status
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
