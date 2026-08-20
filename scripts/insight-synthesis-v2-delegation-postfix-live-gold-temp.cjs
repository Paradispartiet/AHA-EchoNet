const fs = require("fs");
const vm = require("vm");

const endpoint = "https://aha-agent-7a3y.onrender.com/api/aha-agent/semantic-document";
const fixturePaths = [
  "tests/fixtures/semantic-live-reviewed/constraints-creativity-v1.json",
  "tests/fixtures/semantic-live-reviewed/retrieval-learning-v1.json",
  "tests/fixtures/semantic-live-reviewed/mixed-use-street-v1.json",
  "tests/fixtures/semantic-live-reviewed/delegation-bottleneck-v1.json",
  "tests/fixtures/semantic-live-reviewed/modularity-interfaces-v1.json",
  "tests/fixtures/semantic-live-reviewed/standardization-flexibility-v1.json"
];
const v1Fixtures = fixturePaths.map((path) => JSON.parse(fs.readFileSync(path, "utf8")));
const reviewSpec = JSON.parse(fs.readFileSync("tests/fixtures/semantic-insight-review-gold-v2.json", "utf8"));

const ctx = { window: null, console };
ctx.window = ctx;
vm.runInNewContext(fs.readFileSync("js/ahaInsightQualityGateV2.js", "utf8"), ctx, { filename: "js/ahaInsightQualityGateV2.js" });
vm.runInNewContext(fs.readFileSync("js/ahaSemanticInsightReviewEvaluatorV2.js", "utf8"), ctx, { filename: "js/ahaSemanticInsightReviewEvaluatorV2.js" });
const gateApi = ctx.AHAInsightQualityGateV2;
const reviewApi = ctx.AHASemanticInsightReviewEvaluatorV2;
if (!gateApi?.evaluateSynthesisShadow || !reviewApi?.evaluateCorpus) throw new Error("delegation_postfix_evaluators_unavailable");

const safeArray = (value) => Array.isArray(value) ? value : [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}
function uniqueBy(items, keyFn) {
  const seen = new Set();
  return safeArray(items).filter((item) => {
    const key = normalize(keyFn(item));
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function semanticContext(fixture) {
  const shadow = fixture.model_shadow || {};
  return {
    entities: uniqueBy(shadow.entities, (item) => item?.canonical_label || item?.source_surface).slice(0, 16).map((item) => ({
      label: String(item?.canonical_label || item?.source_surface || ""),
      entity_type: String(item?.entity_type || "other")
    })),
    concepts: uniqueBy(shadow.concepts, (item) => item?.canonical_label || item?.source_surface).slice(0, 20).map((item) => ({
      label: String(item?.canonical_label || item?.source_surface || "")
    })),
    source_claims: uniqueBy(safeArray(shadow.propositions).filter((item) => item?.kind === "source_claim"), (item) => item?.text).slice(0, 16).map((item) => ({
      text: String(item?.text || "")
    })),
    relations: safeArray(shadow.relations).filter((item) => item?.epistemic_status === "source_explicit").slice(0, 20).map((item) => ({
      relation_type: String(item?.relation_type || "other"),
      from_label: String(item?.from_label || ""),
      to_label: String(item?.to_label || ""),
      epistemic_status: "source_explicit"
    }))
  };
}
async function callLive(fixture, round) {
  const body = {
    text: fixture.source_text,
    format: "aha_insight_synthesis_output_v2",
    semantic_context: semanticContext(fixture),
    context: { source_event_id: fixture.source_event_id, source_type: "delegation_postfix_live_gold", language: "no", round }
  };
  const attempts = [];
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    let status = 0;
    let data = null;
    let transportError = null;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90000)
      });
      status = response.status;
      data = await response.json().catch(() => null);
    } catch (error) {
      transportError = String(error?.message || error);
    }
    const record = {
      attempt,
      status,
      ok: data?.ok === true,
      error: data?.error || transportError || null,
      validation_errors: safeArray(data?.validation_errors)
    };
    attempts.push(record);
    console.log(`POSTFIX_ATTEMPT round=${round} ${fixture.id} #${attempt} status=${status} ok=${record.ok} error=${record.error || ""} validation=${JSON.stringify(record.validation_errors)}`);
    if (status === 200 && data?.ok === true && data?.schema === "aha_insight_synthesis_contract_v2" && data?.synthesis?.schema === "aha_insight_synthesis_output_v2") {
      return { envelope: data, attempts };
    }
    await sleep(attempt === 1 ? 6000 : 3000);
  }
  return { envelope: null, attempts };
}
function buildGateShadow(fixture, candidates) {
  return {
    schema: "aha_insight_synthesis_shadow_v2",
    source_event_id: fixture.source_event_id,
    source_text_hash: null,
    candidates,
    policy: {
      production_gate_authority: false,
      synthesis_allowed: false,
      canonical_write: false,
      chamber_write: false,
      meta_write: false,
      persistent_write: false
    }
  };
}
async function measureRound(round) {
  const cases = [];
  const validationCodeCounts = {};
  let validOutputCount = 0;
  let totalAttempts = 0;
  for (const fixture of v1Fixtures) {
    const live = await callLive(fixture, round);
    totalAttempts += live.attempts.length;
    live.attempts.flatMap((item) => item.validation_errors).forEach((code) => {
      validationCodeCounts[code] = (validationCodeCounts[code] || 0) + 1;
    });
    const candidates = safeArray(live.envelope?.synthesis?.candidates);
    let gateDecisions = [];
    if (live.envelope) {
      validOutputCount += 1;
      const gate = gateApi.evaluateSynthesisShadow({
        source_text: fixture.source_text,
        synthesis_shadow: buildGateShadow(fixture, candidates)
      });
      gateDecisions = safeArray(gate.decisions);
    }
    const liveCase = {
      fixture_id: fixture.id,
      valid_live_output: Boolean(live.envelope),
      model: live.envelope?.model || null,
      response_id: live.envelope?.response_id || null,
      attempts: live.attempts,
      candidates,
      gate_decisions: gateDecisions
    };
    cases.push(liveCase);
    const eligible = gateDecisions.filter((item) => item.eligible_for_insight_review).length;
    console.log(`POSTFIX_CASE round=${round} ${fixture.id} valid=${Boolean(live.envelope)} candidates=${candidates.length} eligible=${eligible}`);
    candidates.forEach((candidate, index) => {
      const decision = gateDecisions[index];
      console.log(`POSTFIX_CANDIDATE round=${round} ${fixture.id} #${index} eligible=${decision?.eligible_for_insight_review === true} type=${candidate.type} confidence=${candidate.confidence} causal=${candidate.causal_status} insight=${JSON.stringify(candidate.insight)} abstraction=${JSON.stringify(candidate.abstraction)} uncertainty=${JSON.stringify(candidate.uncertainty)} reasons=${JSON.stringify(decision?.blocking_reasons || [])}`);
    });
  }
  const snapshot = {
    schema: "aha_insight_synthesis_v2_delegation_postfix_snapshot_v1",
    version: 1,
    round,
    cases
  };
  const review = reviewApi.evaluateCorpus({ spec: reviewSpec, v1Fixtures, v2Snapshot: snapshot });
  const delegationReview = review.v2.cases.find((item) => item.fixture_id === "delegation_bottleneck_live_v1") || null;
  console.log(`POSTFIX_REVIEW round=${round} v1F1=${review.v1.metrics.f1} v2F1=${review.v2.metrics.f1} delegationTP=${delegationReview?.metrics?.true_positive ?? null} delegationReasons=${JSON.stringify(delegationReview?.decisions?.[0]?.reasons || [])}`);
  return {
    round,
    measured_at: new Date().toISOString(),
    endpoint,
    valid_output_count: validOutputCount,
    total_attempt_count: totalAttempts,
    validation_code_counts: validationCodeCounts,
    snapshot,
    review,
    production_gate_authority: false,
    synthesis_allowed: false,
    canonical_write: false,
    chamber_write: false,
    meta_write: false,
    persistent_write: false
  };
}

(async () => {
  fs.mkdirSync("v2-delegation-postfix-results", { recursive: true });
  const rounds = [];
  for (let round = 1; round <= 2; round += 1) {
    const result = await measureRound(round);
    rounds.push(result);
    fs.writeFileSync(`v2-delegation-postfix-results/round-${round}.json`, JSON.stringify(result, null, 2));
  }
  const summary = {
    schema: "aha_insight_synthesis_v2_delegation_postfix_live_gold_v1",
    measured_at: new Date().toISOString(),
    endpoint,
    round_count: rounds.length,
    rounds: rounds.map((item) => ({
      round: item.round,
      valid_output_count: item.valid_output_count,
      total_attempt_count: item.total_attempt_count,
      validation_code_counts: item.validation_code_counts,
      v1_review: item.review.v1.metrics,
      v2_review: item.review.v2.metrics,
      delegation_review: item.review.v2.cases.find((entry) => entry.fixture_id === "delegation_bottleneck_live_v1") || null
    })),
    stable_all_six_match: rounds.every((item) => item.review.valid && item.review.v2.metrics.true_positive === 6 && item.review.v2.metrics.f1 === 1),
    all_rounds_six_valid: rounds.every((item) => item.valid_output_count === 6),
    production_gate_authority: false,
    synthesis_allowed: false,
    canonical_write: false,
    chamber_write: false,
    meta_write: false,
    persistent_write: false
  };
  fs.writeFileSync("v2-delegation-postfix-results/summary.json", JSON.stringify(summary, null, 2));
  console.log("POSTFIX_SUMMARY " + JSON.stringify({
    stable_all_six_match: summary.stable_all_six_match,
    all_rounds_six_valid: summary.all_rounds_six_valid,
    rounds: summary.rounds.map((item) => ({ round: item.round, valid: item.valid_output_count, attempts: item.total_attempt_count, v2F1: item.v2_review.f1, delegationTP: item.delegation_review?.metrics?.true_positive ?? null }))
  }));
  if (!summary.all_rounds_six_valid) process.exitCode = 2;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
