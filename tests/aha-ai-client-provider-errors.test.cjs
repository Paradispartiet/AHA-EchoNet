const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
function load(file, overrides = {}) {
  const ctx = { console, setTimeout: (fn) => fn(), ...overrides };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx, { filename: file });
  return ctx;
}
async function checkSynthesisFailure(failure, expectedAttempts) {
  let attempts = 0;
  const ctx = load("js/ahaChatInsightPipeline.js", {
    AHA_AGENT_API: "https://agent.example.invalid/api/aha-agent",
    fetch: async (url) => {
      if (url.endsWith("/health")) {
        return {
          ok: true,
          json: async () => ({ runtime: ctx.AHAChatInsightPipeline.expectedRuntimeManifest() })
        };
      }
      attempts += 1;
      return {
        ok: false,
        status: 429,
        clone() { return { json: async () => failure }; }
      };
    }
  });
  const instance = ctx.AHAChatInsightPipeline.create({});
  const result = await instance.generateAIInsightCandidates(
    "Fortellinger om omsorg gir flere etiske spørsmål. Fortellingen er alltid et utvalg av livshendelser.",
    { analysis_run_id: "run-provider-test" }
  );
  assert.equal(result.length, 0);
  assert.equal(attempts, expectedAttempts);
  const trace = ctx.AHAChatInsightPipeline.getRuntimeTraceForRun("run-provider-test");
  assert.equal(trace.status, "blocked_synthesis_http");
  assert.equal(trace.http_status, 429);
  assert.equal(trace.transport_attempts, expectedAttempts);
  assert.equal(trace.run_synthesis_attempt_count, 1);
  assert.equal(trace.provider_error, failure.error);
  assert.equal(trace.provider_code, failure.code);
  assert.equal(trace.retryable, failure.retryable);
  assert.ok(trace.blocking_reasons.includes("synthesis_provider_" + failure.error));
  assert.doesNotMatch(JSON.stringify(trace), /secret raw provider message/);
}
async function checkChatFailure(failure, expectedCode) {
  const ctx = load("js/ahaChatAgentRuntime.js");
  const agent = ctx.AHAChatAgentRuntime.create({
    getApiBase: () => "https://agent.example.invalid/api/aha-agent",
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      json: async () => failure
    })
  });
  await assert.rejects(
    () => agent.askAhaAgent("Test av AI-feilhåndtering"),
    (error) => {
      assert.equal(error.code, expectedCode);
      assert.equal(error.httpStatus, 429);
      assert.doesNotMatch(error.message, /secret raw provider message/);
      return true;
    }
  );
}
(async () => {
  const quota = {
    error: "openai_quota_exhausted",
    code: "insufficient_quota",
    type: "insufficient_quota",
    retryable: false,
    message: "secret raw provider message"
  };
  await checkSynthesisFailure(quota, 1);
  await checkChatFailure(quota, "openai_quota_exhausted");
  const rate = {
    error: "openai_rate_limited",
    code: "rate_limit_exceeded",
    type: "requests",
    retryable: true,
    message: "secret raw provider message"
  };
  await checkSynthesisFailure(rate, 3);
  await checkChatFailure(rate, "openai_rate_limited");
  await checkChatFailure({ error: "unexpected_provider_secret", message: "secret raw provider message" }, "chat_http_429");
  const chatUi = fs.readFileSync(path.join(root, "js/ahaChatRunContext.js"), "utf8");
  assert.match(chatUi, /safeCode === "openai_quota_exhausted"/);
  assert.match(chatUi, /ui\.appendChat\("aha", userError\)/);
  console.log("AI client preserves sanitized quota/rate categories and retry decisions.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
