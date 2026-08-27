const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");

async function run() {
  const api = await import(`${pathToFileURL(path.resolve("scripts/plan-aha-live-model-budget.mjs")).href}?test=${Date.now()}`);
  const corpus = { cases: Array.from({ length: 27 }, (_, index) => ({ id: `case_${index}`, source_text: "Kildegrunnlag." })) };

  const offline = api.buildPlan({ mode: "offline", corpus });
  assert.equal(offline.explicit_paid_run, false);
  assert.equal(offline.hard_limits.max_model_calls, 0);
  assert.equal(offline.policy.automatic_pull_request_model_calls, false);
  assert.equal(offline.policy.automatic_push_model_calls, false);

  assert.throws(() => api.buildPlan({ mode: "smoke", corpus }), /RUN_AHA_LIVE_SMOKE/);
  const smoke = api.buildPlan({ mode: "smoke", acknowledgement: "RUN_AHA_LIVE_SMOKE", corpus });
  assert.equal(smoke.corpus.selected_case_count, 1);
  assert.equal(smoke.hard_limits.max_chat_requests, 0);
  assert.equal(smoke.hard_limits.max_synthesis_requests, 1);
  assert.equal(smoke.hard_limits.synthesis_validation_attempt_limit, 1);
  assert.equal(smoke.hard_limits.max_model_calls, 1);

  assert.throws(() => api.buildPlan({ mode: "release", acknowledgement: "RUN_AHA_LIVE_RELEASE", corpus: { cases: [] } }), /corpus_size_changed/);
  const release = api.buildPlan({ mode: "release", acknowledgement: "RUN_AHA_LIVE_RELEASE", corpus });
  assert.equal(release.corpus.selected_case_count, 27);
  assert.equal(release.hard_limits.max_model_calls, 170);
  assert.equal(release.policy.full_corpus_requires_explicit_release_dispatch, true);
  assert.ok(release.token_estimate_ceiling.total_tokens > 0);
  assert.match(api.githubOutput(release), /max_model_calls=170/);

  const workflow = fs.readFileSync(".github/workflows/aha-projection-product-browser-evaluation-v2.yml", "utf8");
  const browserGate = fs.readFileSync("tests/browser/aha-projection-product-browser-evaluation-v2.spec.cjs", "utf8");
  assert.match(workflow, /live_mode:/);
  assert.match(workflow, /RUN_AHA_LIVE_SMOKE/);
  assert.match(workflow, /RUN_AHA_LIVE_RELEASE/);
  assert.match(workflow, /Automatic pull-request and push runs are model-call free/);
  assert.match(workflow, /plan-aha-live-model-budget\.mjs/);
  assert.match(workflow, /cost-evidence\//);
  assert.doesNotMatch(workflow, /AHA_REQUIRE_LIVE_PRODUCT_CORPUS/);
  assert.match(browserGate, /LIVE_MODE !== "smoke"/);
  assert.match(browserGate, /LIVE_MODE !== "release"/);
  assert.match(browserGate, /live_model_budget_exceeded:model_calls/);
  assert.match(browserGate, /openai_quota_exhausted/);

  console.log("aha-live-model-budget-v1.test.cjs passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
