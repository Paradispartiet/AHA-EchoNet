const { test, expect } = require("@playwright/test");
const fs = require("node:fs");

async function runEvaluation(page) {
  await page.goto("/projection-product-review-v2.html", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Produktnytte: faktisk browser-output" })).toBeVisible();
  return page.evaluate(() => window.AHAProjectionProductReviewV2.runAll({ renderEach: false }));
}

function hasReadyProduct(result) {
  return ["list", "path", "mindmap"].some((product) => result?.model?.product_states?.[product]?.status === "ready");
}

async function readLocalStore(page, key) {
  return page.evaluate((storeKey) => JSON.parse(localStorage.getItem(storeKey) || "[]"), key);
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

test("27-case live semantic browser corpus yields qualified product previews", async ({ page, browserName, request: apiRequest }) => {
  test.setTimeout(18 * 60 * 1000);
  test.skip(browserName !== "chromium", "The live corpus runs once in Chromium.");
  test.skip(process.env.AHA_REQUIRE_LIVE_PRODUCT_CORPUS !== "1", "Live model corpus is an explicit CI/release gate.");
  const preflightResponse = await apiRequest.post("https://aha-agent-7a3y.onrender.com/api/aha-agent/chat", {
    headers: { origin: "https://paradispartiet.github.io" },
    data: { message: "AHA live product corpus preflight.", ai_state: {}, memory_context: null },
    timeout: 60000
  });
  const preflight = {
    schema: "aha_projection_product_live_backend_preflight_v2",
    checked_at: new Date().toISOString(),
    endpoint: "configured_aha_agent_chat",
    status: preflightResponse.status(),
    successful_2xx: preflightResponse.ok()
  };
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync("test-results/aha-projection-product-live-backend-preflight-v2.json", `${JSON.stringify(preflight, null, 2)}\n`);
  expect(preflightResponse.ok(), `Live Chat preflight must return 2xx before the 27-case model corpus runs; received HTTP ${preflight.status}`).toBe(true);
  const proxiedAgentRequests = [];
  const proxyFailures = [];
  await page.route("https://aha-agent-7a3y.onrender.com/**", async (route, request) => {
    try {
      const outboundHeaders = { ...request.headers(), origin: "https://paradispartiet.github.io" };
      delete outboundHeaders.host;
      const response = await route.fetch({ headers: outboundHeaders, timeout: 60000 });
      proxiedAgentRequests.push({ method: request.method(), url: request.url(), status: response.status() });
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
  const evaluation = await runEvaluation(page);
  const initialCoverageCases = evaluation.results.filter((result) => result.expected_visible && result.live_disposition !== "calibration_observation");
  const initialUsefulCaseCoverage = initialCoverageCases.filter(hasReadyProduct).length / initialCoverageCases.length;
  let retryResults = [];
  if (initialUsefulCaseCoverage < 0.8) {
    const missingCaseIds = initialCoverageCases.filter((result) => !hasReadyProduct(result)).map((result) => result.case_id);
    retryResults = await page.evaluate((caseIds) => window.AHAProjectionProductReviewV2.runCases(caseIds), missingCaseIds);
  }
  evaluation.live_retry = {
    attempted: retryResults.length > 0,
    initial_coverage_share: initialUsefulCaseCoverage,
    case_ids: retryResults.map((result) => result.case_id),
    results: retryResults
  };
  const chatResponses = proxiedAgentRequests.filter((request) => request.url.endsWith("/chat"));
  const successfulChatResponses = chatResponses.filter((request) => request.status >= 200 && request.status < 300);
  const backendHttpFailures = chatResponses.filter((request) => request.status < 200 || request.status >= 300);
  const chatStatusCounts = Object.fromEntries([...new Set(chatResponses.map((request) => request.status))]
    .sort((left, right) => left - right)
    .map((status) => [String(status), chatResponses.filter((request) => request.status === status).length]));
  const criticalProxyFailures = proxyFailures.filter((failure) => !failure.includes("/insight-candidates"));
  evaluation.live_transport = {
    received_response_count: proxiedAgentRequests.length,
    chat_response_count: chatResponses.length,
    successful_chat_count: successfulChatResponses.length,
    chat_status_counts: chatStatusCounts,
    backend_http_failures: backendHttpFailures.map((request) => ({ method: request.method, status: request.status })),
    auxiliary_insight_candidate_failures: proxyFailures.filter((failure) => failure.includes("/insight-candidates")),
    critical_failures: criticalProxyFailures
  };
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync("test-results/aha-projection-product-live-browser-evaluation-v2.json", `${JSON.stringify(evaluation, null, 2)}\n`);

  expect(criticalProxyFailures, "The CI transport proxy must receive successful responses from every required semantic/chat backend call").toEqual([]);
  expect(proxiedAgentRequests.length, "The live release corpus must actually reach the configured semantic/chat backend").toBeGreaterThan(0);
  expect(chatResponses.length, "Every corpus case must exercise a real Chat backend response").toBeGreaterThanOrEqual(27);
  expect(backendHttpFailures, "Every real Chat backend response must be 2xx; received responses are not successful responses").toEqual([]);
  expect(successfulChatResponses.length, "Every corpus case must exercise a successful real Chat backend response").toBeGreaterThanOrEqual(27);
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
  const retryByCase = new Map(retryResults.map((result) => [result.case_id, result]));
  for (const result of retryResults) {
    expect(result.critical_provenance_errors, `retry:${result.case_id}`).toEqual([]);
    expect(result.guarded_store_writes, `retry:${result.case_id}`).toEqual([]);
  }
  const usefulCaseCoverage = expectedUseful.filter((result) => hasReadyProduct(result) || hasReadyProduct(retryByCase.get(result.case_id) || { model: { product_states: {} } })).length / expectedUseful.length;
  const suppressionCoverage = expectedSuppressed.filter((result) => ["list", "path", "mindmap"]
    .every((product) => result.model.product_states[product].status !== "ready")).length / expectedSuppressed.length;
  expect(calibrationCases.map((result) => result.case_id).sort()).toEqual(["conflict_tourism", "data_bus"]);
  expect(initialUsefulCaseCoverage, "The first live pass must retain at least 70% qualified case coverage before a bounded retry is allowed").toBeGreaterThanOrEqual(0.7);
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
  test.skip(process.env.AHA_REQUIRE_LIVE_PRODUCT_CORPUS !== "1", "The controlled-write journey requires a qualified live AnalysisBundle.");
  const journeyRequests = [];
  const journeyProxyFailures = [];
  await page.route("https://aha-agent-7a3y.onrender.com/**", async (route, request) => {
    try {
      const outboundHeaders = { ...request.headers(), origin: "https://paradispartiet.github.io" };
      delete outboundHeaders.host;
      const response = await route.fetch({ headers: outboundHeaders, timeout: 60000 });
      journeyRequests.push({ method: request.method(), url: request.url(), status: response.status() });
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
  const prepared = await page.evaluate(() => window.AHAProjectionProductReviewV2.prepareControlledJourney("news_school_meals"));
  expect(prepared.critical_provenance_errors).toEqual([]);
  expect(prepared.guarded_store_writes).toEqual([]);
  expect(journeyProxyFailures.filter((failure) => !failure.includes("/insight-candidates"))).toEqual([]);
  expect(journeyRequests.filter((request) => request.url.endsWith("/chat") && request.status >= 200 && request.status < 300)).toHaveLength(1);
  expect(["list", "path", "mindmap"].map((product) => prepared.model.product_states[product].status)).toEqual(["ready", "ready", "ready"]);
  const chamberBefore = await page.evaluate(() => localStorage.getItem("aha_insight_chamber_v1"));

  const list = prepared.model.surfaces.lists[0];
  await page.goto(prepared.model.product_states.list.href, { waitUntil: "domcontentloaded" });
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
    journey: "raw_chat_to_preview_to_explicit_save_to_edit_to_reload_to_safe_undo",
    products: {
      list: { unchanged_reload_undo: true, edited_through_product_ui: true, edited_reload_undo_refusal: listUndoRefusal.reason },
      path: { unchanged_reload_undo: true, edited_through_product_ui: true, edited_reload_undo_refusal: pathUndoRefusal.reason },
      mindmap: { unchanged_reload_undo: true, edited_through_product_ui: true, edited_reload_undo_refusal: mindmapUndoRefusal.reason }
    },
    policy: { one_artifact_per_explicit_action: true, local_only: true, automatic_write: false, remote_write: false, sync_write: false, chamber_write_after_analysis: false, meta_write: false },
    transport: {
      successful_chat_count: journeyRequests.filter((request) => request.url.endsWith("/chat") && request.status >= 200 && request.status < 300).length,
      auxiliary_insight_candidate_failures: journeyProxyFailures.filter((failure) => failure.includes("/insight-candidates")),
      critical_failures: journeyProxyFailures.filter((failure) => !failure.includes("/insight-candidates"))
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
