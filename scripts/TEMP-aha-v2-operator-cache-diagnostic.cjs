const fs = require("fs");
const crypto = require("crypto");
const { chromium } = require("playwright");

const FRONTEND = process.env.AHA_FRONTEND_ORIGIN || "https://paradispartiet.github.io/AHA-EchoNet";
const OUTPUT = "probe-evidence/operator-browser-diagnostic.json";
const EXPECTED_MAIN = process.env.EXPECTED_MAIN_SHA || "";
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const requests = [];
  const responses = [];
  const bodyTasks = [];

  page.on("pageerror", (error) => pageErrors.push(String(error?.message || error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
  page.on("response", (response) => {
    const url = response.url();
    if (!/insight-activation-v2\.html|ahaInsightActivationOperatorV2\.js/u.test(url)) return;
    bodyTasks.push((async () => {
      let body = Buffer.alloc(0);
      let bodyError = null;
      try { body = await response.body(); }
      catch (error) { bodyError = String(error?.message || error); }
      responses.push({
        url,
        status: response.status(),
        from_service_worker: response.fromServiceWorker(),
        sha256: body.length ? sha256(body) : null,
        body_error: bodyError
      });
    })());
  });

  const url = `${FRONTEND}/insight-activation-v2.html?proof_no_intent_diag=${Date.now()}&main=${EXPECTED_MAIN}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3000);
  await Promise.allSettled(bodyTasks);

  const state = await page.evaluate(() => ({
    document_ready_state: document.readyState,
    status: document.querySelector("#page-status")?.textContent || "",
    gate_status: document.querySelector("#gate-status")?.textContent || "",
    iframe_src_attribute: document.querySelector("#chat-frame")?.getAttribute("src") || "",
    iframe_resolved_src: document.querySelector("#chat-frame")?.src || "",
    disabled_buttons: [...document.querySelectorAll("button")].filter((button) => button.disabled).length,
    button_count: document.querySelectorAll("button").length,
    scripts: [...document.scripts].map((script) => script.src || "inline")
  }));
  const chatRequests = requests.filter((item) => /\/chat\.html(?:[?#]|$)/u.test(item.url));
  const output = {
    schema: "aha_v2_operator_browser_cache_diagnostic_v1",
    expected_main: EXPECTED_MAIN,
    page_url: url,
    state,
    chat_request_count: chatRequests.length,
    page_errors: pageErrors,
    console_errors: consoleErrors,
    relevant_responses: responses
  };
  fs.mkdirSync("probe-evidence", { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
  await context.close();
  await browser.close();

  console.log(JSON.stringify(output, null, 2));
  if (!state.status.includes("Pilot lukket")) {
    throw new Error(`operator_no_intent_guard_not_observed:${state.status}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
