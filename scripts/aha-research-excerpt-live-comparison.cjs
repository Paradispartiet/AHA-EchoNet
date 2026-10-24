#!/usr/bin/env node
// Explicit manual evaluation of real-paper SHORT excerpts. No default model calls.
// Endpoint, request shape, single attempt policy follow aha-five-article-live-comparison.cjs.
const fs = require("node:fs");
const path = require("node:path");
const { sourceText, evaluateResearchSynthesis } = require("./aha-research-synthesis-evaluator.cjs");

const ACK = "RUN_AHA_THREE_RESEARCH_ARTICLES";
const ENDPOINT = "https://aha-agent-7a3y.onrender.com/api/aha-agent/semantic-document";
const output = path.resolve("test-results/aha-research-excerpt-live-evaluation.json");
const MAX_CASES = 3;
const MAX_TOTAL_ATTEMPTS = 3;
const corpus = require("../tests/fixtures/aha-real-science-excerpts-v1.json");

async function main() {
  if (process.env.AHA_RESEARCH_ARTICLES_COST_ACK !== ACK) {
    throw new Error("Explicit acknowledgement RUN_AHA_THREE_RESEARCH_ARTICLES required; no model call made");
  }
  if (corpus.length !== MAX_CASES || new Set(corpus.map((item) => item.id)).size !== MAX_CASES) {
    throw new Error("Real-article corpus changed; refusing any model calls");
  }
  if (corpus.some((item) => !item.url?.startsWith("https://") ||
    !item.doi || !Array.isArray(item.topic_terms) || !item.topic_terms.length ||
    sourceText(item).length > 8000)) {
    throw new Error("Invalid research corpus; refusing any model calls");
  }
  const report = {
    schema: "aha_research_excerpt_live_evaluation_v1",
    corpus_case_count: MAX_CASES,
    source_scope: "short_noncontiguous_verbatim_excerpts_not_full_papers",
    model_calls_automatic: false,
    hard_max_http_requests: MAX_CASES,
    hard_max_reported_model_attempts: MAX_TOTAL_ATTEMPTS,
    model_requests_reserved: 0,
    model_attempts_accounted: 0,
    cost_limit_mode: "single_attempt_per_document",
    canonical_write: false,
    memory_write: false,
    scientific_validity_verified: false,
    requires_human_scientific_review: true,
    outcomes: []
  };
  function persist() {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  }
  persist();
  for (const item of corpus) {
    if (report.model_requests_reserved >= MAX_CASES || report.model_attempts_accounted >= MAX_TOTAL_ATTEMPTS) {
      throw new Error("Hard research evaluation model-call limit reached");
    }
    const record = {
      id: item.id,
      article_url: item.url,
      doi: item.doi,
      status: "request_reserved",
      model_call_count: null
    };
    report.outcomes.push(record);
    report.model_requests_reserved += 1;
    persist(); // Reserve request BEFORE I/O so partial runs remain auditable.
    let response, body;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://paradispartiet.github.io"
        },
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({
          format: "aha_insight_synthesis_output_v2",
          text: sourceText(item),
          semantic_context: {
            entities: [],
            concepts: item.topic_terms.map((label) => ({ label })),
            source_claims: [{ text: item.observation }, { text: item.limitation }],
            relations: []
          },
          context: {
            cost_control: {
              schema: "aha_insight_synthesis_cost_control_v1",
              mode: "live_smoke",
              budget_id: "research-excerpt:" + String(process.env.GITHUB_RUN_ID || "manual") + ":" + item.id,
              synthesis_validation_attempt_limit: 1
            }
          }
        })
      });
      body = await response.json();
    } catch (error) {
      record.status = "transport_failed_closed";
      record.error = String(error?.message || error).slice(0, 180);
      report.model_attempts_accounted += 1; // Count ambiguous remote attempts conservatively.
      persist();
      throw error;
    }
    const attempts = typeof body?.cost_control?.model_call_count === "number"
      ? body.cost_control.model_call_count : null;
    record.http_status = response.status;
    record.model_call_count = attempts;
    report.model_attempts_accounted += attempts === 1 ? 1 : MAX_TOTAL_ATTEMPTS;
    if (!response.ok || body?.schema !== "aha_insight_synthesis_contract_v2"
      || attempts !== 1 || report.model_attempts_accounted > MAX_TOTAL_ATTEMPTS
      || body?.policy?.persistent_write !== false
      || body?.policy?.canonical_write !== false
      || body?.policy?.synthesis_allowed !== false
      || body?.synthesis?.schema !== "aha_insight_synthesis_output_v2") {
      record.status = "contract_or_budget_failed_closed";
      record.error = String(body?.error || body?.code || "invalid_model_contract_or_budget").slice(0, 180);
      persist();
      throw new Error(record.status + ":" + item.id + "; no retry performed");
    }
    record.evaluation = await evaluateResearchSynthesis(item, body.synthesis);
    record.status = "source_evaluated_needs_human_review";
    persist();
    console.log("AHA_RESEARCH_LIVE_CASE " + JSON.stringify({
      id: item.id,
      candidates: record.evaluation.candidate_count,
      exact_quotes: record.evaluation.exact_evidence_quotes,
      quote_count: record.evaluation.total_evidence_quotes,
      causal_flags: record.evaluation.causal_overreach_flag_count,
      human_review_required: true
    }));
  }
  console.log("AHA_RESEARCH_LIVE_SUMMARY " + JSON.stringify({
    requests: report.model_requests_reserved,
    accounted_attempts: report.model_attempts_accounted,
    cases_evaluated: report.outcomes.length,
    output,
    scientific_validity_verified: false
  }));
}
if (require.main === module) main().catch((error) => {
  console.error("AHA research evaluation stopped: " + String(error?.message || error));
  process.exitCode = 1;
});
module.exports = { ACK, ENDPOINT, MAX_CASES, MAX_TOTAL_ATTEMPTS };
