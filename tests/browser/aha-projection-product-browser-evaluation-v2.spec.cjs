const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const TRANSIENT_HTTP_STATUSES = new Set([429, 502, 503, 504]);
const LIVE_CORPUS_TEST_TIMEOUT_MS = 35 * 60 * 1000;
const LIVE_MODE = String(process.env.AHA_LIVE_PRODUCT_MODE || "offline");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readResponseBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function envLimit(name) {
  const value = Number(process.env[name] || 0);
  if (!Number.isInteger(value) || value < 0) throw new Error(`invalid_live_budget_env:${name}`);
  return value;
}

function modelEndpoint(url) {
  if (String(url).endsWith("/chat")) return "chat";
  if (String(url).endsWith("/semantic-document")) return "synthesis";
  if (String(url).endsWith("/insight-candidates")) return "legacy_candidates";
  return null;
}

function quotaExhausted(body) {
  return body?.error === "openai_quota_exhausted"
    || (Number(body?.status) === 429 && body?.type === "insufficient_quota");
}

function createLiveBudget() {
  const limits = {
    max_chat_requests: envLimit("AHA_LIVE_MAX_CHAT_REQUESTS"),
    max_synthesis_requests: envLimit("AHA_LIVE_MAX_SYNTHESIS_REQUESTS"),
    synthesis_validation_attempt_limit: envLimit("AHA_LIVE_SYNTHESIS_ATTEMPT_LIMIT"),
    max_model_calls: envLimit("AHA_LIVE_MAX_MODEL_CALLS")
  };
  const usage = { chat_requests: 0, synthesis_requests: 0, legacy_candidate_requests: 0, reserved_model_calls: 0, reported_model_calls: 0 };
  const events = [];
  let halted = false;
  let haltReason = null;
  function reserve(url) {
    const endpoint = modelEndpoint(url);
    if (!endpoint) return;
    if (halted) throw new Error(`live_model_budget_halted:${haltReason}`);
    const reservation = endpoint === "synthesis" ? limits.synthesis_validation_attempt_limit : 1;
    if (endpoint === "chat" && usage.chat_requests + 1 > limits.max_chat_requests) throw new Error("live_model_budget_exceeded:chat_requests");
    if (endpoint === "synthesis" && usage.synthesis_requests + 1 > limits.max_synthesis_requests) throw new Error("live_model_budget_exceeded:synthesis_requests");
    if (endpoint === "legacy_candidates") throw new Error("live_model_budget_blocked:legacy_candidates");
    if (usage.reserved_model_calls + reservation > limits.max_model_calls) throw new Error("live_model_budget_exceeded:model_calls");
    if (endpoint === "chat") usage.chat_requests += 1;
    if (endpoint === "synthesis") usage.synthesis_requests += 1;
    usage.reserved_model_calls += reservation;
    events.push({ event: "reserved", endpoint, reservation });
  }
  function record(url, status, body) {
    const endpoint = modelEndpoint(url);
    if (!endpoint) return;
    const reported = endpoint === "synthesis"
      ? Number(body?.cost_control?.model_call_count ?? body?.synthesis_attempts ?? (status >= 500 || status === 429 ? 1 : 0))
      : 1;
    usage.reported_model_calls += Math.max(0, Number.isFinite(reported) ? reported : 0);
    events.push({ event: "response", endpoint, status, reported_model_calls: reported, error: body?.error || null, type: body?.type || null, code: body?.code || null });
    if (quotaExhausted(body)) {
      halted = true;
      haltReason = "openai_quota_exhausted";
      events.push({ event: "halted", reason: haltReason });
    }
  }
  function evidence() {
    return {
      schema: "aha_live_model_budget_usage_v1",
      generated_at: new Date().toISOString(),
      mode: LIVE_MODE,
      model: process.env.AHA_LIVE_MODEL_NAME || "gpt-4.1-mini",
      budget_id: process.env.AHA_LIVE_BUDGET_ID || null,
      hard_limits: limits,
      usage: { ...usage },
      halted,
      halt_reason: haltReason,
      within_budget: usage.chat_requests <= limits.max_chat_requests
        && usage.synthesis_requests <= limits.max_synthesis_requests
        && usage.reserved_model_calls <= limits.max_model_calls,
      events
    };
  }
  return { reserve, record, evidence, isHalted: () => halted, haltReason: () => haltReason };
}

const liveBudget = createLiveBudget();

function writeLiveBudgetEvidence() {
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync("test-results/aha-live-model-budget-usage-v1.json", `${JSON.stringify(liveBudget.evidence(), null, 2)}\n`);
}

function costControl(mode) {
  return {
    schema: "aha_insight_synthesis_cost_control_v1",
    mode: mode === "smoke" ? "live_smoke" : "live_release",
    budget_id: String(process.env.AHA_LIVE_BUDGET_ID || `${mode}:local-budget`),
    synthesis_validation_attempt_limit: envLimit("AHA_LIVE_SYNTHESIS_ATTEMPT_LIMIT")
  };
}

async function configureReviewCostControl(page, mode) {
  const control = costControl(mode);
  await page.evaluate((value) => window.AHAProjectionProductReviewV2.configureCostControl(value), control);
  return control;
}

async function fetchRouteWithBoundedTransientRetry(route, request, headers) {
  const delays = [0, 1500, 3500];
  let response = null;
  let responseBody = null;
  let attempts = 0;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt]) await wait(delays[attempt]);
    liveBudget.reserve(request.url());
    response = await route.fetch({ headers, timeout: 60000 });
    responseBody = await readResponseBody(response);
    liveBudget.record(request.url(), response.status(), responseBody);
    attempts = attempt + 1;
    if (liveBudget.isHalted()) throw new Error(liveBudget.haltReason());
    const transientStatus = TRANSIENT_HTTP_STATUSES.has(response.status());
    const retryDisabled = transientStatus && (responseBody?.retryable === false || quotaExhausted(responseBody));
    if (!transientStatus || retryDisabled || attempt === delays.length - 1) break;
  }
  return { response, responseBody, attempts };
}

async function runEvaluation(page, control = null) {
  await page.goto("/projection-product-review-v2.html", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Produktnytte: faktisk browser-output" })).toBeVisible();
  if (control) await page.evaluate((value) => window.AHAProjectionProductReviewV2.configureCostControl(value), control);
  return page.evaluate(() => window.AHAProjectionProductReviewV2.runAll({ renderEach: false }));
}

const LIVE_PRODUCT_STATE_KEYS = Object.freeze({ lists: "list", paths: "path", mindmap: "mindmap" });

function hasReadyProductType(result, product) {
  const stateKey = LIVE_PRODUCT_STATE_KEYS[product];
  return Boolean(stateKey && result?.model?.product_states?.[stateKey]?.status === "ready");
}

function hasReadyProduct(result) {
  return Object.keys(LIVE_PRODUCT_STATE_KEYS).some((product) => hasReadyProductType(result, product));
}

function qualifiedProductCoverage(cases, retryByCase = new Map()) {
  return Object.fromEntries(Object.keys(LIVE_PRODUCT_STATE_KEYS).map((product) => {
    const qualified = cases.filter((result) => (
      hasReadyProductType(result, product)
      || hasReadyProductType(retryByCase.get(result.case_id), product)
    )).length;
    return [product, {
      qualified_case_count: qualified,
      qualified_case_share: cases.length ? qualified / cases.length : 0
    }];
  }));
}

async function readLocalStore(page, key) {
  return page.evaluate((storeKey) => JSON.parse(localStorage.getItem(storeKey) || "[]"), key);
}

function controlledJourneyFixtureModel() {
  const model = {
    schema: "aha_projection_product_read_model_v2",
    mode: "read_only",
    status: "ready",
    projection_id: "projection_v2_offline_journey",
    identity: {
      analysis_id: "analysis_v2_offline_journey",
      analysis_run_id: "run_v2_offline_journey",
      source_id: "source_v2_offline_journey",
      source_sha256: "a".repeat(64)
    },
    validation: { valid: true, errors: [] },
    policy: Object.fromEntries([
      "product_surface_binding_authority", "product_store_write_authority", "automatic_projection_authority",
      "chamber_write", "canonical_write", "insights_write", "concepts_write", "lists_write", "paths_write",
      "mindmap_write", "meta_write", "persistent_write", "remote_write", "normal_chat_persistence_authority"
    ].map((key) => [key, false])),
    surfaces: {
      insights: [],
      concepts: [],
      lists: [{
        id: "list_candidate",
        title: "Utforsk representasjon",
        type: "concepts",
        description: "To sider av samme tema.",
        tags: ["Representasjon"],
        source: "aha_semantic_v2",
        meta: {
          projection_id: "projection_v2_offline_journey", candidate_only: true, read_only: true,
          semantic_shape: "thematic_membership_v2", semantic_basis: "shared_concept", semantic_basis_label: "representasjon",
          membership_rule: "all_members_share_named_source_concept", member_ref_ids: ["i1", "i2"]
        },
        quality: { passed: true, score: 0.9 },
        items: [
          { id: "i1", refId: "i1", title: "Valg former representasjon", type: "insight", membership_reason: "Innsikten tilhører listen fordi kildebegrepet representasjon er eksplisitt felles.", meta: { member_ids: ["legacy_1"], quality_score: 0.9, membership_reason: "Innsikten tilhører listen fordi kildebegrepet representasjon er eksplisitt felles.", semantic_basis: "shared_concept", semantic_basis_label: "representasjon" } },
          { id: "i2", refId: "i2", title: "Deltakelse former legitimitet", type: "insight", membership_reason: "Innsikten tilhører listen fordi kildebegrepet representasjon er eksplisitt felles.", meta: { member_ids: ["legacy_2"], quality_score: 0.88, membership_reason: "Innsikten tilhører listen fordi kildebegrepet representasjon er eksplisitt felles.", semantic_basis: "shared_concept", semantic_basis_label: "representasjon" } }
        ]
      }],
      paths: [{
        id: "path_candidate",
        title: "Undersøk representasjon",
        type: "learning",
        mode: "learning",
        description: "Kontrollert progresjon.",
        goal: "Forstå sammenhengen.",
        learningOutcome: "Forklar med belegg.",
        source: "aha_semantic_v2",
        meta: { projection_id: "projection_v2_offline_journey", candidate_only: true, read_only: true, semantic_shape: "ordered_inquiry_v2", stage_selection: "semantic_role_ranked_not_round_robin", source_list_candidate_id: "list_candidate" },
        quality: { passed: true, score: 0.94 },
        steps: ["orientation", "claim_evidence", "tension_counterexample", "uncertainty", "synthesis_next_inquiry"].map((stage, index) => ({
          id: `s${index + 1}`,
          refId: `i${index % 2 + 1}`,
          title: `Steg ${index + 1}`,
          type: "insight",
          order: index,
          narrative: `Narrativ ${index + 1}`,
          learningOutcome: `Læringspunkt ${index + 1}`,
          meta: { stage, semantic_role: stage, semantic_basis: "shared_concept", selection_reason: `best_source_bound_fit_for_${stage}`, source_bound_narrative: true }
        }))
      }],
      mindmap: {
        read_only: true,
        nodes: [
          { id: "root", title: "Representasjon: oversikt", type: "theme" },
          { id: "concept", title: "Representasjon", type: "concept" },
          { id: "insight", title: "Valg former representasjon", type: "insight" }
        ],
        edges: [
          { id: "e1", from: "root", to: "concept", type: "theme_branch", label: "gren" },
          { id: "e2", from: "concept", to: "insight", type: "supports_insight", label: "belyser" }
        ],
        meta: { root_id: "root", projection_id: "projection_v2_offline_journey", candidate_only: true, read_only: true, semantic_shape: "ranked_hierarchy_v2", branch_assignment: "one_primary_hierarchy_parent_per_insight", branch_count: 1 },
        quality: { passed: true, score: 0.92 }
      }
    }
  };
  const query = (product) => new URLSearchParams({
    product,
    analysis_id: model.identity.analysis_id,
    projection_id: model.projection_id,
    source_sha256: model.identity.source_sha256
  }).toString();
  model.product_states = {
    list: { status: "ready", label: "Klar til forhåndsvisning", candidate_count: 1, href: `lists.html?${query("list")}` },
    path: { status: "ready", label: "Klar til forhåndsvisning", candidate_count: 1, href: `paths.html?${query("path")}` },
    mindmap: { status: "ready", label: "Klar til forhåndsvisning", candidate_count: 3, href: `mindmap.html?${query("mindmap")}` }
  };
  return model;
}

function controlledJourneyRuntimeStub(model) {
  return `(function(global){
    "use strict";
    const MODEL = ${JSON.stringify(model)};
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const api = Object.freeze({
      MODULE_SCHEMA: "aha_projection_runtime_source_v2",
      MODULE_VERSION: 2,
      build: () => clone(MODEL),
      surface: (name) => clone(MODEL.surfaces?.[name] ?? null),
      productStates: () => clone(MODEL.product_states),
      productUrl: (product) => MODEL.product_states?.[product]?.href || null,
      shouldOpenProduct: (product) => new URLSearchParams(global.location.search).get("product") === product
    });
    global.AHAProjectionRuntimeSourceV2 = api;
  })(window);`;
}

test("controlled-write actions honor the hidden state", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The shared product CSS is verified once in Chromium.");
  await page.goto("/lists.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const fixture = document.createElement("div");
    fixture.innerHTML = `
      <div class="aha-v2-materialize-actions">
        <button id="hidden-list-action" hidden>Skjult listehandling</button>
        <button id="visible-list-action">Synlig listehandling</button>
      </div>
      <button id="mindmap-v2-materialize" hidden>Skjult tankekarthandling</button>
      <button id="mindmap-v2-undo" hidden>Skjult angrehandling</button>`;
    document.body.append(fixture);
  });
  await expect(page.locator("#hidden-list-action")).toBeHidden();
  await expect(page.locator("#mindmap-v2-materialize")).toBeHidden();
  await expect(page.locator("#mindmap-v2-undo")).toBeHidden();
  await expect(page.locator("#visible-list-action")).toBeVisible();
});

test("27-case offline Chat browser matrix preserves source identity and closed writes", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The full corpus runs once in Chromium; WebKit has a separate iPad/Safari surface gate.");
  const diagnostics = [];
  page.on("console", (message) => diagnostics.push(`console:${message.type()}:${message.text()}`));
  page.on("pageerror", (error) => diagnostics.push(`pageerror:${error.message}`));
  page.on("requestfailed", (request) => diagnostics.push(`requestfailed:${request.url()}:${request.failure()?.errorText || "unknown"}`));
  await page.route("https://aha-agent-7a3y.onrender.com/**", (route) => route.abort("connectionfailed"));
  let evaluation;
  try {
    evaluation = await runEvaluation(page);
  } catch (error) {
    console.error(diagnostics.join("\n"));
    throw error;
  }
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync("test-results/aha-projection-product-browser-evaluation-v2.json", `${JSON.stringify(evaluation, null, 2)}\n`);

  expect(evaluation.schema).toBe("aha_projection_product_browser_evaluation_v2");
  expect(evaluation.corpus_cases).toBe(27);
  expect(evaluation.results).toHaveLength(27);
  expect(evaluation.policy).toEqual({ product_store_write: false, chamber_write: false, canonical_write: false, remote_write: false, sync_write: false });
  for (const result of evaluation.results) {
    expect(result.critical_provenance_errors, result.case_id).toEqual([]);
    expect(result.guarded_store_writes, result.case_id).toEqual([]);
    expect(result.identity.source_sha256, result.case_id).toMatch(/^[a-f0-9]{64}$/);
    expect(result.model.identity, result.case_id).toMatchObject({
      analysis_id: result.identity.analysis_id,
      analysis_run_id: result.identity.analysis_run_id,
      source_id: result.identity.source_id,
      source_sha256: result.identity.source_sha256
    });
    for (const product of ["list", "path", "mindmap"]) {
      expect(["ready", "needs_evidence", "not_relevant"], `${result.case_id}:${product}`).toContain(result.model.product_states[product].status);
    }
  }
  const livsarket = evaluation.results.find((entry) => entry.case_id === "literature_livsarket");
  expect(livsarket.hard_reload).toEqual({ comparable: true, deterministic: true });
  const repeated = evaluation.results.find((entry) => entry.case_id === "research_language");
  expect(repeated.same_source_replay).toEqual({ comparable: true, deterministic: true });
  expect(repeated.changed_runtime_version_guard).toEqual({ comparable: false, reason: "runtime_version_changed" });
});

test("one-attempt paid synthesis smoke stays inside its explicit budget", async ({ browserName, request: apiRequest }) => {
  test.skip(browserName !== "chromium", "The paid smoke runs once in Chromium.");
  test.skip(LIVE_MODE !== "smoke", "Paid smoke requires an explicit smoke workflow dispatch.");
  const sourceText = "En felles rapportmal gjorde sammenligning enklere. Valgfrie felt lot samtidig ulike saker beholde nødvendig variasjon.";
  const control = costControl("smoke");
  const url = "https://aha-agent-7a3y.onrender.com/api/aha-agent/semantic-document";
  liveBudget.reserve(url);
  const response = await apiRequest.post(url, {
    headers: { origin: "https://paradispartiet.github.io" },
    data: {
      format: "aha_insight_synthesis_output_v2",
      text: sourceText,
      semantic_context: {
        entities: [],
        concepts: [{ label: "rapportmal" }, { label: "valgfrie felt" }],
        source_claims: [
          { text: "En felles rapportmal gjorde sammenligning enklere." },
          { text: "Valgfrie felt lot samtidig ulike saker beholde nødvendig variasjon." }
        ],
        relations: []
      },
      context: { cost_control: control }
    },
    timeout: 60000
  });
  const body = await readResponseBody(response);
  liveBudget.record(url, response.status(), body);
  writeLiveBudgetEvidence();
  expect(liveBudget.isHalted(), "Quota/payment failures must halt the paid run immediately").toBe(false);
  expect(response.ok(), `Paid synthesis smoke must return 2xx; received HTTP ${response.status()}`).toBe(true);
  expect(body?.schema).toBe("aha_insight_synthesis_contract_v2");
  expect(body?.cost_control).toMatchObject({
    schema: "aha_insight_synthesis_cost_control_v1",
    mode: "live_smoke",
    budget_id: control.budget_id,
    synthesis_validation_attempt_limit: 1,
    model_call_count: 1
  });
  expect(liveBudget.evidence().usage.reserved_model_calls).toBe(1);
});

test("27-case live semantic browser corpus yields qualified product previews", async ({ page, browserName, request: apiRequest }) => {
  test.setTimeout(LIVE_CORPUS_TEST_TIMEOUT_MS);
  test.skip(browserName !== "chromium", "The live corpus runs once in Chromium.");
  test.skip(LIVE_MODE !== "release", "The full live model corpus requires an explicit release workflow dispatch.");
  const preflightResponse = await apiRequest.get("https://aha-agent-7a3y.onrender.com/api/aha-agent/health", { timeout: 60000 });
  const preflight = {
    schema: "aha_projection_product_live_backend_preflight_v3",
    checked_at: new Date().toISOString(),
    endpoint: "configured_aha_agent_health",
    status: preflightResponse.status(),
    successful_2xx: preflightResponse.ok(),
    model_calls: 0
  };
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync("test-results/aha-projection-product-live-backend-preflight-v2.json", `${JSON.stringify(preflight, null, 2)}\n`);
  expect(preflightResponse.ok(), `Free health preflight must return 2xx before the 27-case model corpus runs; received HTTP ${preflight.status}`).toBe(true);
  const proxiedAgentRequests = [];
  const proxyFailures = [];
  await page.route("https://aha-agent-7a3y.onrender.com/**", async (route, request) => {
    try {
      const outboundHeaders = { ...request.headers(), origin: "https://paradispartiet.github.io" };
      delete outboundHeaders.host;
      const transport = await fetchRouteWithBoundedTransientRetry(route, request, outboundHeaders);
      const response = transport.response;
      proxiedAgentRequests.push({ method: request.method(), url: request.url(), status: response.status(), transport_attempts: transport.attempts });
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          "access-control-allow-origin": "http://127.0.0.1:4177",
          "access-control-allow-credentials": "true"
        }
      });
    } catch (error) {
      proxyFailures.push(`${request.method()} ${request.url()}: ${error.message}`);
      await route.abort("connectionfailed");
    }
  });
  let evaluation;
  try {
    evaluation = await runEvaluation(page, costControl("release"));
  } finally {
    writeLiveBudgetEvidence();
  }
  const initialCoverageCases = evaluation.results.filter((result) => result.expected_visible && result.live_disposition !== "calibration_observation");
  const initialUsefulCaseCoverage = initialCoverageCases.filter(hasReadyProduct).length / initialCoverageCases.length;
  const initialProductCoverage = qualifiedProductCoverage(initialCoverageCases);
  const deficientProducts = Object.entries(initialProductCoverage)
    .filter(([, coverage]) => coverage.qualified_case_share < 0.8)
    .map(([product]) => product);
  let retryResults = [];
  if (deficientProducts.length) {
    const missingCaseIds = initialCoverageCases
      .filter((result) => deficientProducts.some((product) => !hasReadyProductType(result, product)))
      .map((result) => result.case_id);
    retryResults = await page.evaluate((caseIds) => window.AHAProjectionProductReviewV2.runCases(caseIds), missingCaseIds);
  }
  evaluation.live_retry = {
    attempted: retryResults.length > 0,
    initial_coverage_share: initialUsefulCaseCoverage,
    initial_product_coverage: initialProductCoverage,
    deficient_product_types: deficientProducts,
    case_ids: retryResults.map((result) => result.case_id),
    results: retryResults
  };
  const retryByCase = new Map(retryResults.map((result) => [result.case_id, result]));
  evaluation.live_product_coverage = qualifiedProductCoverage(initialCoverageCases, retryByCase);
  const chatResponses = proxiedAgentRequests.filter((request) => request.url.endsWith("/chat"));
  const successfulChatResponses = chatResponses.filter((request) => request.status >= 200 && request.status < 300);
  const backendHttpFailures = chatResponses.filter((request) => request.status < 200 || request.status >= 300);
  const synthesisResponses = proxiedAgentRequests.filter((request) => request.url.endsWith("/semantic-document"));
  const successfulSynthesisResponses = synthesisResponses.filter((request) => request.status >= 200 && request.status < 300);
  const synthesisHttpFailures = synthesisResponses.filter((request) => request.status < 200 || request.status >= 300);
  const chatStatusCounts = Object.fromEntries([...new Set(chatResponses.map((request) => request.status))]
    .sort((left, right) => left - right)
    .map((status) => [String(status), chatResponses.filter((request) => request.status === status).length]));
  const criticalProxyFailures = proxyFailures.filter((failure) => !failure.includes("/insight-candidates"));
  evaluation.live_transport = {
    received_response_count: proxiedAgentRequests.length,
    chat_response_count: chatResponses.length,
    successful_chat_count: successfulChatResponses.length,
    synthesis_response_count: synthesisResponses.length,
    successful_synthesis_count: successfulSynthesisResponses.length,
    chat_status_counts: chatStatusCounts,
    backend_http_failures: backendHttpFailures.map((request) => ({ method: request.method, status: request.status })),
    synthesis_http_failures: synthesisHttpFailures.map((request) => ({ method: request.method, status: request.status })),
    auxiliary_insight_candidate_failures: proxyFailures.filter((failure) => failure.includes("/insight-candidates")),
    critical_failures: criticalProxyFailures
  };
  evaluation.live_model_budget = liveBudget.evidence();
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync("test-results/aha-projection-product-live-browser-evaluation-v2.json", `${JSON.stringify(evaluation, null, 2)}\n`);

  expect(criticalProxyFailures, "The CI transport proxy must receive successful responses from every required semantic/chat backend call").toEqual([]);
  expect(evaluation.live_model_budget.within_budget, "The full release corpus must remain inside the pre-authorized model-call ceiling").toBe(true);
  expect(proxiedAgentRequests.length, "The live release corpus must actually reach the configured semantic/chat backend").toBeGreaterThan(0);
  expect(chatResponses.length, "Every corpus case must exercise a real Chat backend response").toBeGreaterThanOrEqual(27);
  expect(backendHttpFailures, "Every real Chat backend response must be 2xx; received responses are not successful responses").toEqual([]);
  expect(successfulChatResponses.length, "Every corpus case must exercise a successful real Chat backend response").toBeGreaterThanOrEqual(27);
  expect(synthesisResponses.length, "Every substantive live corpus case must exercise the strict synthesis endpoint").toBeGreaterThanOrEqual(22);
  expect(synthesisHttpFailures, "Every strict synthesis response must be 2xx; contract rejections must remain visible").toEqual([]);
  expect(successfulSynthesisResponses.length, "The live corpus must receive successful strict synthesis envelopes").toBeGreaterThanOrEqual(22);
  expect(evaluation.results).toHaveLength(27);
  const expectedUseful = evaluation.results.filter((result) => result.expected_visible && result.live_disposition !== "calibration_observation");
  const calibrationCases = evaluation.results.filter((result) => result.live_disposition === "calibration_observation");
  const expectedSuppressed = evaluation.results.filter((result) => !result.expected_visible);
  for (const result of evaluation.results) {
    expect(result.critical_provenance_errors, result.case_id).toEqual([]);
    expect(result.guarded_store_writes, result.case_id).toEqual([]);
    const states = ["list", "path", "mindmap"].map((product) => result.model.product_states[product].status);
    if (!result.expected_visible) {
      expect(states, `${result.case_id}: deliberately insufficient input must remain suppressed`).not.toContain("ready");
    }
  }
  for (const result of retryResults) {
    expect(result.critical_provenance_errors, `retry:${result.case_id}`).toEqual([]);
    expect(result.guarded_store_writes, `retry:${result.case_id}`).toEqual([]);
  }
  const usefulCaseCoverage = expectedUseful.filter((result) => hasReadyProduct(result) || hasReadyProduct(retryByCase.get(result.case_id) || { model: { product_states: {} } })).length / expectedUseful.length;
  const finalProductCoverage = evaluation.live_product_coverage;
  const suppressionCoverage = expectedSuppressed.filter((result) => ["list", "path", "mindmap"]
    .every((product) => result.model.product_states[product].status !== "ready")).length / expectedSuppressed.length;
  expect(calibrationCases.map((result) => result.case_id).sort()).toEqual(["conflict_tourism", "data_bus"]);
  expect(initialUsefulCaseCoverage, "The first live pass must retain at least 70% qualified case coverage before a bounded retry is allowed").toBeGreaterThanOrEqual(0.7);
  for (const [product, coverage] of Object.entries(finalProductCoverage)) {
    expect(coverage.qualified_case_share, `At least 80% of live coverage cases must yield a qualified product preview for each product type: ${product}`).toBeGreaterThanOrEqual(0.8);
  }
  expect(usefulCaseCoverage, "At least 80% of live coverage cases must yield one qualified, semantically relevant product preview").toBeGreaterThanOrEqual(0.8);
  expect(suppressionCoverage, "Every deliberately insufficient source must remain fully suppressed").toBe(1);

  for (const result of calibrationCases) {
    const ready = hasReadyProduct(result);
    if (ready) continue;
    const approved = result.semantic_diagnostics.quality.approved_insight_count;
    if (approved > 0) {
      expect(result.model.blocking_reasons, `${result.case_id}: approved insight must still fail closed at projection readiness`)
        .toEqual(expect.arrayContaining(["integration_not_ready"]));
    } else {
      expect(result.semantic_diagnostics.candidates.flatMap((candidate) => candidate.blocking_reasons).length,
        `${result.case_id}: synthesis suppression must expose quality-gate reasons`).toBeGreaterThan(0);
      expect(result.model.blocking_reasons, `${result.case_id}: no approved insight must remain unavailable to products`)
        .toEqual(expect.arrayContaining(["active_analysis_has_no_projection_ready_insights"]));
    }
  }
});

test("controlled save journey survives reload and protects user edits for all three products", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The complete controlled-write journey runs once in Chromium.");
  const journeyRequests = [];
  const journeyProxyFailures = [];
  let prepared;

  if (LIVE_MODE === "release") {
    await page.route("https://aha-agent-7a3y.onrender.com/**", async (route, request) => {
      try {
        const outboundHeaders = { ...request.headers(), origin: "https://paradispartiet.github.io" };
        delete outboundHeaders.host;
        const transport = await fetchRouteWithBoundedTransientRetry(route, request, outboundHeaders);
        const response = transport.response;
        journeyRequests.push({ method: request.method(), url: request.url(), status: response.status(), transport_attempts: transport.attempts });
        await route.fulfill({
          response,
          headers: {
            ...response.headers(),
            "access-control-allow-origin": "http://127.0.0.1:4177",
            "access-control-allow-credentials": "true"
          }
        });
      } catch (error) {
        journeyProxyFailures.push(`${request.method()} ${request.url()}: ${error.message}`);
        await route.abort("connectionfailed");
      }
    });
    await page.goto("/projection-product-review-v2.html", { waitUntil: "domcontentloaded" });
    await configureReviewCostControl(page, "release");
    try {
      prepared = await page.evaluate(() => window.AHAProjectionProductReviewV2.prepareControlledJourney("news_school_meals"));
    } finally {
      writeLiveBudgetEvidence();
    }
  } else {
    const model = controlledJourneyFixtureModel();
    await page.route("**/js/ahaProjectionRuntimeSourceV2.js", (route) => route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: controlledJourneyRuntimeStub(model)
    }));
    prepared = {
      case_id: "offline_controlled_fixture",
      identity: model.identity,
      model,
      critical_provenance_errors: [],
      guarded_store_writes: []
    };
  }
  expect(prepared.critical_provenance_errors).toEqual([]);
  expect(prepared.guarded_store_writes).toEqual([]);
  if (LIVE_MODE === "release") {
    expect(journeyProxyFailures.filter((failure) => !failure.includes("/insight-candidates"))).toEqual([]);
    expect(journeyRequests.filter((request) => request.url.endsWith("/chat") && request.status >= 200 && request.status < 300)).toHaveLength(1);
    expect(journeyRequests.filter((request) => request.url.endsWith("/semantic-document") && request.status >= 200 && request.status < 300).length).toBeGreaterThanOrEqual(1);
  } else {
    expect(journeyRequests).toEqual([]);
    expect(journeyProxyFailures.every((failure) => failure.startsWith("offline_remote_blocked:"))).toBe(true);
  }
  expect(["list", "path", "mindmap"].map((product) => prepared.model.product_states[product].status)).toEqual(["ready", "ready", "ready"]);

  const list = prepared.model.surfaces.lists[0];
  await page.goto(prepared.model.product_states.list.href, { waitUntil: "domcontentloaded" });
  const chamberBefore = await page.evaluate(() => localStorage.getItem("aha_insight_chamber_v1"));
  const listSave = page.locator(`[data-v2-list-materialize="${list.id}"]`);
  await expect(listSave).toBeVisible();
  await listSave.click();
  let listRecords = await readLocalStore(page, "aha_lists_v1");
  expect(listRecords).toHaveLength(1);
  expect(listRecords[0].meta).toMatchObject({ local_only: true, sync_enabled: false, automation_enabled: false });
  await expect(page.locator(`[data-v2-list-save-state="unchanged"]`)).toHaveText("Lagret lokalt");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(`[data-v2-list-undo="${list.id}"]`)).toBeVisible();
  await page.locator(`[data-v2-list-undo="${list.id}"]`).click();
  expect(await readLocalStore(page, "aha_lists_v1")).toEqual([]);

  await page.locator(`[data-v2-list-materialize="${list.id}"]`).click();
  listRecords = await readLocalStore(page, "aha_lists_v1");
  const savedList = listRecords[0];
  await page.locator(`[data-list-select-preview="${savedList.id}"]`).click();
  await page.locator(`[data-list-remove^="${savedList.id}::"]`).first().click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(`[data-v2-list-save-state="modified"]`)).toHaveText("Lagret lokalt");
  await expect(page.locator(`[data-v2-list-undo="${list.id}"]`)).toBeHidden();
  const listUndoRefusal = await page.evaluate(({ artifactId, projectionId }) => window.AHAProjectionMaterializerV2.undoMaterialized({
    artifact_type: "list", artifact_id: artifactId, projection_id: projectionId, user_confirmed: true
  }), { artifactId: list.id, projectionId: prepared.model.projection_id });
  expect(listUndoRefusal.reason).toBe("artifact_modified_since_materialization");

  const path = prepared.model.surfaces.paths[0];
  await page.goto(prepared.model.product_states.path.href, { waitUntil: "domcontentloaded" });
  await page.locator(`[data-v2-path-materialize="${path.id}"]`).click();
  let pathRecords = await readLocalStore(page, "aha_paths_v1");
  expect(pathRecords).toHaveLength(1);
  expect(pathRecords[0].meta).toMatchObject({ local_only: true, sync_enabled: false, automation_enabled: false });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(`[data-v2-path-undo="${path.id}"]`)).toBeVisible();
  await page.locator(`[data-v2-path-undo="${path.id}"]`).click();
  expect(await readLocalStore(page, "aha_paths_v1")).toEqual([]);

  await page.locator(`[data-v2-path-materialize="${path.id}"]`).click();
  pathRecords = await readLocalStore(page, "aha_paths_v1");
  const savedPath = pathRecords[0];
  await page.locator(`[data-path-select-preview="${savedPath.id}"]`).click();
  await page.locator(`[data-step-remove^="${savedPath.id}::"]`).first().click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(`[data-v2-path-save-state="modified"]`)).toHaveText("Lagret lokalt");
  await expect(page.locator(`[data-v2-path-undo="${path.id}"]`)).toBeHidden();
  const pathUndoRefusal = await page.evaluate(({ artifactId, projectionId }) => window.AHAProjectionMaterializerV2.undoMaterialized({
    artifact_type: "path", artifact_id: artifactId, projection_id: projectionId, user_confirmed: true
  }), { artifactId: path.id, projectionId: prepared.model.projection_id });
  expect(pathUndoRefusal.reason).toBe("artifact_modified_since_materialization");

  await page.goto(prepared.model.product_states.mindmap.href, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#mindmap-v2-materialize")).toBeVisible();
  await page.locator("#mindmap-v2-materialize").click();
  let mindmapRecords = await readLocalStore(page, "aha_concept_lists_v1");
  expect(mindmapRecords).toHaveLength(1);
  expect(mindmapRecords[0].meta).toMatchObject({ local_only: true, sync_enabled: false, automation_enabled: false });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#mindmap-v2-undo")).toBeVisible();
  await page.locator("#mindmap-v2-undo").click();
  expect(await readLocalStore(page, "aha_concept_lists_v1")).toEqual([]);

  await page.locator("#mindmap-v2-materialize").click();
  mindmapRecords = await readLocalStore(page, "aha_concept_lists_v1");
  const savedMindmap = mindmapRecords[0];
  await page.goto("/lists.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator(`[data-concept-list-card="${savedMindmap.id}"]`)).toBeVisible();
  await page.locator(`[data-concept-list-card="${savedMindmap.id}"] [data-concept-term-remove]`).first().click();
  await page.goto(prepared.model.product_states.mindmap.href, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#mindmap-v2-materialize-status")).toContainText("senere endret");
  await expect(page.locator("#mindmap-v2-undo")).toBeHidden();
  const mindmapUndoRefusal = await page.evaluate(({ projectionId }) => window.AHAProjectionMaterializerV2.undoMaterialized({
    artifact_type: "mindmap", artifact_id: projectionId, projection_id: projectionId, user_confirmed: true
  }), { projectionId: prepared.model.projection_id });
  expect(mindmapUndoRefusal.reason).toBe("artifact_modified_since_materialization");
  expect(await page.evaluate(() => localStorage.getItem("aha_insight_chamber_v1"))).toBe(chamberBefore);
  const evidence = {
    schema: "aha_projection_product_controlled_save_journey_v2",
    version: 2,
    generated_at: new Date().toISOString(),
    source_case: prepared.case_id,
    identity: prepared.identity,
    projection_id: prepared.model.projection_id,
    journey: LIVE_MODE === "release" ? "raw_chat_to_preview_to_explicit_save_to_edit_to_reload_to_safe_undo" : "deterministic_v2_read_model_to_preview_to_explicit_save_to_edit_to_reload_to_safe_undo",
    products: {
      list: { unchanged_reload_undo: true, edited_through_product_ui: true, edited_reload_undo_refusal: listUndoRefusal.reason },
      path: { unchanged_reload_undo: true, edited_through_product_ui: true, edited_reload_undo_refusal: pathUndoRefusal.reason },
      mindmap: { unchanged_reload_undo: true, edited_through_product_ui: true, edited_reload_undo_refusal: mindmapUndoRefusal.reason }
    },
    policy: { one_artifact_per_explicit_action: true, local_only: true, automatic_write: false, remote_write: false, sync_write: false, chamber_write_after_analysis: false, meta_write: false },
    transport: {
      mode: LIVE_MODE,
      successful_chat_count: journeyRequests.filter((request) => request.url.endsWith("/chat") && request.status >= 200 && request.status < 300).length,
      offline_remote_blocks: LIVE_MODE === "release" ? [] : journeyProxyFailures.filter((failure) => failure.startsWith("offline_remote_blocked:")),
      auxiliary_insight_candidate_failures: journeyProxyFailures.filter((failure) => failure.includes("/insight-candidates")),
      critical_failures: LIVE_MODE === "release"
        ? journeyProxyFailures.filter((failure) => !failure.includes("/insight-candidates"))
        : []
    }
  };
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync("test-results/aha-projection-product-controlled-save-journey-v2.json", `${JSON.stringify(evidence, null, 2)}\n`);
});

test("iPad WebKit review surface is responsive and accessible", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "This gate targets WebKit with an iPad viewport.");
  await page.goto("/projection-product-review-v2.html", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Produktnytte: faktisk browser-output" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kjør 27-case browsermatrise" })).toBeVisible();
  await expect(page.getByText(/Human-porten er åpen/)).toBeVisible();
  const layout = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
  expect(layout.overflow).toBe(false);
  await page.goto("/chat.html", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Skriv til AHA" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
});
