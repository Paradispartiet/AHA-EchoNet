const { test, expect } = require("@playwright/test");
const fs = require("node:fs");

async function runEvaluation(page) {
  await page.goto("/projection-product-review-v2.html", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Produktnytte: faktisk browser-output" })).toBeVisible();
  return page.evaluate(() => window.AHAProjectionProductReviewV2.runAll({ renderEach: false }));
}

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
  const usefulCaseCoverage = expectedUseful.filter((result) => ["list", "path", "mindmap"]
    .some((product) => result.model.product_states[product].status === "ready")).length / expectedUseful.length;
  const suppressionCoverage = expectedSuppressed.filter((result) => ["list", "path", "mindmap"]
    .every((product) => result.model.product_states[product].status !== "ready")).length / expectedSuppressed.length;
  expect(calibrationCases.map((result) => result.case_id).sort()).toEqual(["conflict_tourism", "data_bus"]);
  expect(usefulCaseCoverage, "At least 80% of live coverage cases must yield one qualified, semantically relevant product preview").toBeGreaterThanOrEqual(0.8);
  expect(suppressionCoverage, "Every deliberately insufficient source must remain fully suppressed").toBe(1);

  for (const result of calibrationCases) {
    const ready = ["list", "path", "mindmap"].some((product) => result.model.product_states[product].status === "ready");
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
