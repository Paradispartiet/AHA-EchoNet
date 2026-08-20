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

const context = { window: null, console };
context.window = context;
vm.runInNewContext(fs.readFileSync("js/ahaInsightQualityGateV2.js", "utf8"), context, { filename: "js/ahaInsightQualityGateV2.js" });
vm.runInNewContext(fs.readFileSync("js/ahaSemanticGoldEvaluator.js", "utf8"), context, { filename: "js/ahaSemanticGoldEvaluator.js" });
const qualityGate = context.AHAInsightQualityGateV2;
const goldEvaluator = context.AHASemanticGoldEvaluator;
const safeArray = (value) => Array.isArray(value) ? value : [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return safeArray(items).filter((item) => {
    const key = String(keyFn(item) || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSemanticContext(fixture) {
  const shadow = fixture.model_shadow || {};
  return {
    entities: uniqueBy(shadow.entities, (item) => item?.canonical_label || item?.source_surface).slice(0, 16).map((item) => ({
      label: String(item?.canonical_label || item?.source_surface || "").trim(),
      entity_type: String(item?.entity_type || "other").trim() || "other"
    })),
    concepts: uniqueBy(shadow.concepts, (item) => item?.canonical_label || item?.source_surface).slice(0, 20).map((item) => ({
      label: String(item?.canonical_label || item?.source_surface || "").trim()
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

async function callLive(fixture) {
  const body = {
    text: fixture.source_text,
    format: "aha_insight_synthesis_output_v2",
    semantic_context: buildSemanticContext(fixture),
    context: { source_event_id: fixture.source_event_id, source_type: "live_gold_evaluation", language: "no" }
  };
  const attempts = [];
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    let status = 0;
    let data = null;
    let error = null;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90000)
      });
      status = response.status;
      data = await response.json().catch(() => null);
    } catch (err) {
      error = String(err?.message || err);
    }
    attempts.push({ attempt, status, ok: data?.ok === true, error: data?.error || error || null, validation_errors: data?.validation_errors || [] });
    console.log(`V2_LIVE_ATTEMPT ${fixture.id} #${attempt} status=${status} ok=${data?.ok === true} error=${data?.error || error || ""}`);
    if (status === 200 && data?.ok === true && data?.schema === "aha_insight_synthesis_contract_v2" && data?.synthesis?.schema === "aha_insight_synthesis_output_v2") {
      return { envelope: data, attempts };
    }
    await sleep(attempt === 1 ? 10000 : 4000);
  }
  return { envelope: null, attempts };
}

function evaluate(fixture, envelope, attempts) {
  const candidates = safeArray(envelope.synthesis?.candidates);
  const gate = qualityGate.evaluateSynthesisShadow({
    source_text: fixture.source_text,
    synthesis_shadow: {
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
    }
  });
  const eligibleIndexes = new Set(safeArray(gate.decisions).filter((item) => item.eligible_for_insight_review).map((item) => item.candidate_index));
  const eligible = candidates.filter((_candidate, index) => eligibleIndexes.has(index));
  const goldResult = goldEvaluator.evaluateGoldFixture({
    gold_fixture: fixture,
    model_shadow: {
      source_event_id: fixture.source_event_id,
      entities: [], concepts: [], relations: [],
      propositions: eligible.map((candidate) => ({
        kind: "interpretation",
        text: candidate.insight,
        evidence: safeArray(candidate.evidence).map((item) => ({ quote: item.quote }))
      }))
    }
  });
  return {
    fixture_id: fixture.id,
    model: envelope.model || null,
    response_id: envelope.response_id || null,
    attempts,
    candidate_count: candidates.length,
    eligible_count: eligible.length,
    rejected_count: candidates.length - eligible.length,
    candidates,
    gate_decisions: gate.decisions,
    eligible_candidates: eligible,
    interpretation_metrics: goldResult.dimensions.interpretations
  };
}

function metric(tp, predicted, expected) {
  const precision = predicted > 0 ? tp / predicted : (expected > 0 ? 0 : null);
  const recall = expected > 0 ? tp / expected : null;
  const f1 = precision != null && recall != null && precision + recall > 0 ? 2 * precision * recall / (precision + recall) : (precision === 0 && recall === 0 ? 0 : null);
  const round = (value) => value == null ? null : Number(value.toFixed(6));
  return { true_positive: tp, predicted, expected, false_positive: Math.max(0, predicted - tp), false_negative: Math.max(0, expected - tp), precision: round(precision), recall: round(recall), f1: round(f1) };
}

(async () => {
  if (!qualityGate || !goldEvaluator) throw new Error("live_measurement_evaluators_unavailable");
  const results = [];
  for (const fixturePath of fixturePaths) {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const live = await callLive(fixture);
    if (!live.envelope) {
      results.push({ fixture_id: fixture.id, valid_live_output: false, attempts: live.attempts });
      console.log(`V2_LIVE_RESULT ${fixture.id} NO_VALID_OUTPUT attempts=${JSON.stringify(live.attempts)}`);
      continue;
    }
    const result = evaluate(fixture, live.envelope, live.attempts);
    result.valid_live_output = true;
    results.push(result);
    console.log(`V2_LIVE_RESULT ${fixture.id} candidates=${result.candidate_count} eligible=${result.eligible_count} TP=${result.interpretation_metrics.true_positive} predicted=${result.interpretation_metrics.predicted} expected=${result.interpretation_metrics.expected} F1=${result.interpretation_metrics.f1}`);
    result.candidates.forEach((candidate, index) => {
      const decision = result.gate_decisions[index];
      console.log(`V2_LIVE_CANDIDATE ${fixture.id} #${index} eligible=${decision?.eligible_for_insight_review === true} type=${candidate.type} confidence=${candidate.confidence} causal=${candidate.causal_status} quality=${decision?.metrics?.quality_score ?? null} reasons=${JSON.stringify(decision?.blocking_reasons || [])} insight=${JSON.stringify(candidate.insight)} evidence=${JSON.stringify(candidate.evidence)}`);
    });
  }

  const valid = results.filter((item) => item.valid_live_output && item.interpretation_metrics);
  const totals = valid.reduce((sum, item) => {
    sum.tp += Number(item.interpretation_metrics.true_positive || 0);
    sum.predicted += Number(item.interpretation_metrics.predicted || 0);
    sum.expected += Number(item.interpretation_metrics.expected || 0);
    sum.candidates += Number(item.candidate_count || 0);
    sum.eligible += Number(item.eligible_count || 0);
    return sum;
  }, { tp: 0, predicted: 0, expected: 0, candidates: 0, eligible: 0 });
  const aggregate = metric(totals.tp, totals.predicted, totals.expected);
  const summary = {
    valid_live_output_count: valid.length,
    invalid_live_output_count: results.length - valid.length,
    candidate_count: totals.candidates,
    gate_eligible_count: totals.eligible,
    gate_rejected_count: totals.candidates - totals.eligible,
    interpretation: aggregate,
    baseline_interpretation_f1: 0.166667,
    f1_delta: aggregate.f1 == null ? null : Number((aggregate.f1 - 0.166667).toFixed(6)),
    production_gate_authority: false,
    synthesis_allowed: false,
    canonical_write: false,
    chamber_write: false,
    meta_write: false,
    persistent_write: false
  };
  console.log("V2_LIVE_SUMMARY " + JSON.stringify(summary));
  if (valid.length < 4) throw new Error(`too_few_valid_v2_outputs:${valid.length}`);
  console.log("zz-temp-insight-synthesis-v2-live-gold passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
