import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA = "aha_live_model_budget_plan_v1";
const MODES = Object.freeze({
  offline: Object.freeze({
    acknowledgement: "",
    corpus_cases: 0,
    max_chat_requests: 0,
    max_synthesis_requests: 0,
    synthesis_validation_attempt_limit: 0
  }),
  smoke: Object.freeze({
    acknowledgement: "RUN_AHA_LIVE_SMOKE",
    corpus_cases: 1,
    max_chat_requests: 0,
    max_synthesis_requests: 1,
    synthesis_validation_attempt_limit: 1
  }),
  release: Object.freeze({
    acknowledgement: "RUN_AHA_LIVE_RELEASE",
    corpus_cases: 27,
    max_chat_requests: 50,
    max_synthesis_requests: 60,
    synthesis_validation_attempt_limit: 2
  })
});

function buildPlan({ mode = "offline", acknowledgement = "", model = "gpt-4.1-mini", corpus } = {}) {
  const selectedMode = String(mode || "offline").trim();
  const limits = MODES[selectedMode];
  if (!limits) throw new Error(`unsupported_live_model_mode:${selectedMode}`);
  if (limits.acknowledgement && acknowledgement !== limits.acknowledgement) {
    throw new Error(`live_model_cost_acknowledgement_required:${limits.acknowledgement}`);
  }
  const cases = Array.isArray(corpus?.cases) ? corpus.cases : [];
  if (selectedMode === "release" && cases.length !== limits.corpus_cases) {
    throw new Error(`live_release_corpus_size_changed:${cases.length}`);
  }
  const sourceChars = cases.reduce((sum, entry) => sum + String(entry?.source_text || "").length, 0);
  const maximumModelCalls = limits.max_chat_requests
    + (limits.max_synthesis_requests * limits.synthesis_validation_attempt_limit);
  const estimatedInputTokenCeiling = (limits.max_chat_requests * 2500)
    + (limits.max_synthesis_requests * limits.synthesis_validation_attempt_limit * 4500);
  const estimatedOutputTokenCeiling = (limits.max_chat_requests * 1200)
    + (limits.max_synthesis_requests * limits.synthesis_validation_attempt_limit * 2500);
  return {
    schema: SCHEMA,
    generated_at: new Date().toISOString(),
    mode: selectedMode,
    model,
    explicit_paid_run: selectedMode !== "offline",
    acknowledgement_required: limits.acknowledgement || null,
    corpus: {
      selected_case_count: limits.corpus_cases,
      available_case_count: cases.length,
      fixture_source_char_count: sourceChars
    },
    hard_limits: {
      max_chat_requests: limits.max_chat_requests,
      max_synthesis_requests: limits.max_synthesis_requests,
      synthesis_validation_attempt_limit: limits.synthesis_validation_attempt_limit,
      max_model_calls: maximumModelCalls
    },
    token_estimate_ceiling: {
      input_tokens: estimatedInputTokenCeiling,
      output_tokens: estimatedOutputTokenCeiling,
      total_tokens: estimatedInputTokenCeiling + estimatedOutputTokenCeiling,
      method: "conservative_per_call_ceiling_v1"
    },
    policy: {
      automatic_pull_request_model_calls: false,
      automatic_push_model_calls: false,
      full_corpus_requires_explicit_release_dispatch: true,
      quota_error_stops_run_immediately: true,
      model_calls_above_limit_allowed: false
    }
  };
}

function githubOutput(plan) {
  return [
    `mode=${plan.mode}`,
    `paid=${plan.explicit_paid_run ? 1 : 0}`,
    `max_chat_requests=${plan.hard_limits.max_chat_requests}`,
    `max_synthesis_requests=${plan.hard_limits.max_synthesis_requests}`,
    `synthesis_attempt_limit=${plan.hard_limits.synthesis_validation_attempt_limit}`,
    `max_model_calls=${plan.hard_limits.max_model_calls}`
  ].join("\n") + "\n";
}

async function main() {
  const root = process.cwd();
  const corpus = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/aha-projection-product-evaluation-v2.json"), "utf8"));
  const plan = buildPlan({
    mode: process.env.AHA_LIVE_PRODUCT_MODE || "offline",
    acknowledgement: process.env.AHA_LIVE_COST_ACK || "",
    model: process.env.AHA_LIVE_MODEL_NAME || "gpt-4.1-mini",
    corpus
  });
  const outputDirectory = path.join(root, "test-results");
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, "aha-live-model-budget-plan-v1.json"), `${JSON.stringify(plan, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, githubOutput(plan));
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      "## AHA live model budget",
      "",
      `- Mode: **${plan.mode}**`,
      `- Model: **${plan.model}**`,
      `- Hard model-call ceiling: **${plan.hard_limits.max_model_calls}**`,
      `- Estimated token ceiling: **${plan.token_estimate_ceiling.total_tokens}**`,
      `- Full corpus cases: **${plan.corpus.selected_case_count}**`,
      ""
    ].join("\n"));
  }
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

export { SCHEMA, MODES, buildPlan, githubOutput };
