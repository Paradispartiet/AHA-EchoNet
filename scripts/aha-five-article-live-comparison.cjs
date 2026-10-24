#!/usr/bin/env node
// Explicitly opt-in, cost-capped 5-article live comparison.
// This is the existing shadow-only AHA synthesis endpoint, not a new AI engine.
const fs = require("node:fs");
const path = require("node:path");

const ACK = "RUN_AHA_FIVE_ARTICLES";
const ENDPOINT = "https://aha-agent-7a3y.onrender.com/api/aha-agent/semantic-document";
const MAX_REQUESTS = 5;
const EXPECTED_ATTEMPTS = 1;
const output = path.resolve("test-results/aha-five-article-live-comparison.json");
const articles = require("../tests/aha-five-synthetic-articles-diagnostic.test.cjs").articles;

if (process.env.AHA_FIVE_ARTICLES_COST_ACK !== ACK)
  throw new Error("Explicit acknowledgement RUN_AHA_FIVE_ARTICLES is required before any model request");
if (!Array.isArray(articles) || articles.length !== MAX_REQUESTS)
  throw new Error("The five-article corpus has changed; refuse unexpected model calls");

const comparison = {
  schema: "aha_five_article_live_comparison_v1",
  read_only_shadow: true,
  endpoint: ENDPOINT,
  corpus_case_count: MAX_REQUESTS,
  hard_max_requests: MAX_REQUESTS,
  hard_max_model_attempts: MAX_REQUESTS * EXPECTED_ATTEMPTS,
  budget_id: String(process.env.GITHUB_RUN_ID || "manual") + ":aha-five-articles",
  model_requests: 0,
  model_attempts_reported: 0,
  outcomes: []
};

function persist() {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(comparison, null, 2) + "\n");
}
function claims(source) {
  return source.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/u)
    .filter((s) => s.length >= 35).slice(0, 8).map((text) => ({ text }));
}
async function main() {
  persist();
  for (const article of articles) {
    if (comparison.model_requests >= MAX_REQUESTS || comparison.model_attempts_reported >= MAX_REQUESTS)
      throw new Error("AHA model call budget exhausted");
    const record = { id: article.id, topic: article.topic, status: "started" };
    comparison.outcomes.push(record);
    comparison.model_requests += 1; // reserve before network I/O
    persist();
    let response, body;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Origin": "https://paradispartiet.github.io" },
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({
          format: "aha_insight_synthesis_output_v2",
          text: article.text,
          semantic_context: {
            entities: [],
            concepts: article.concepts.map((label) => ({ label })),
            source_claims: claims(article.text),
            relations: []
          },
          context: {
            cost_control: {
              schema: "aha_insight_synthesis_cost_control_v1",
              mode: "live_smoke",
              budget_id: comparison.budget_id + ":" + article.id,
              synthesis_validation_attempt_limit: EXPECTED_ATTEMPTS
            }
          }
        })
      });
      body = await response.json();
    } catch (error) {
      record.status = "transport_failed";
      record.error = String(error?.message || error);
      comparison.model_attempts_reported += 1; // conservatively reserve on ambiguous error
      persist();
      throw error;
    }
    // Fail closed on absent usage data; one request must never hide retries.
    const attempts = Number(body?.cost_control?.model_call_count);
    record.http_status = response.status;
    record.model_call_count = Number.isFinite(attempts) ? attempts : null;
    comparison.model_attempts_reported += Number.isFinite(attempts) ? attempts : 1;
    record.status = response.ok && body?.schema === "aha_insight_synthesis_contract_v2" && attempts === 1
      ? "model_response_received" : "failed_closed";
    record.error = record.status !== "model_response_received"
      ? String(body?.error || body?.code || body?.type || "invalid_response_or_model_budget") : undefined;
    record.candidates = record.status === "model_response_received"
      ? (Array.isArray(body?.synthesis?.candidates) ? body.synthesis.candidates.map((candidate) => ({
          insight: candidate.insight || "",
          abstraction: candidate.abstraction || "",
          evidence: candidate.evidence || [],
          why_it_matters: candidate.why_it_matters || "",
          uncertainty: candidate.uncertainty || "",
          causal_status: candidate.causal_status || ""
        })) : []) : [];
    persist();
    console.log("AHA_FIVE_ARTICLE_LIVE_RESULT " + JSON.stringify(record));
    if (record.status !== "model_response_received" || comparison.model_attempts_reported > MAX_REQUESTS)
      throw new Error("AHA live comparison stopped: missing contract, cost proof, or response; no retry performed");
  }
  console.log("AHA_FIVE_ARTICLE_LIVE_SUMMARY " + JSON.stringify({
    requests: comparison.model_requests,
    attempts: comparison.model_attempts_reported,
    completed: comparison.outcomes.filter((entry) => entry.status === "model_response_received").length,
    output
  }));
}
main().catch((error) => { console.error("AHA live comparison stopped:", error.message); process.exitCode = 1; });
