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

const ctx = { window: null, console };
ctx.window = ctx;
vm.runInNewContext(fs.readFileSync("js/ahaInsightQualityGateV2.js", "utf8"), ctx, { filename: "js/ahaInsightQualityGateV2.js" });
vm.runInNewContext(fs.readFileSync("js/ahaSemanticGoldEvaluator.js", "utf8"), ctx, { filename: "js/ahaSemanticGoldEvaluator.js" });
const qualityGate = ctx.AHAInsightQualityGateV2;
const goldEvaluator = ctx.AHASemanticGoldEvaluator;
if (!qualityGate || !goldEvaluator) throw new Error("v2_evaluators_unavailable");

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
    entities: uniqueBy(shadow.entities, (x) => x?.canonical_label || x?.source_surface).slice(0, 16).map((x) => ({ label: String(x?.canonical_label || x?.source_surface || ""), entity_type: String(x?.entity_type || "other") })),
    concepts: uniqueBy(shadow.concepts, (x) => x?.canonical_label || x?.source_surface).slice(0, 20).map((x) => ({ label: String(x?.canonical_label || x?.source_surface || "") })),
    source_claims: uniqueBy(safeArray(shadow.propositions).filter((x) => x?.kind === "source_claim"), (x) => x?.text).slice(0, 16).map((x) => ({ text: String(x?.text || "") })),
    relations: safeArray(shadow.relations).filter((x) => x?.epistemic_status === "source_explicit").slice(0, 20).map((x) => ({ relation_type: String(x?.relation_type || "other"), from_label: String(x?.from_label || ""), to_label: String(x?.to_label || ""), epistemic_status: "source_explicit" }))
  };
}
async function callLive(fixture) {
  const body = { text: fixture.source_text, format: "aha_insight_synthesis_output_v2", semantic_context: semanticContext(fixture), context: { source_event_id: fixture.source_event_id, source_type: "calibrated_live_gold", language: "no" } };
  const attempts = [];
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    let status = 0, data = null, error = null;
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
      status = response.status;
      data = await response.json().catch(() => null);
    } catch (err) { error = String(err?.message || err); }
    attempts.push({ attempt, status, ok: data?.ok === true, error: data?.error || error || null, validation_errors: data?.validation_errors || [] });
    console.log(`CAL_ATTEMPT ${fixture.id} #${attempt} status=${status} ok=${data?.ok === true} error=${data?.error || error || ""} validation=${JSON.stringify(data?.validation_errors || [])}`);
    if (status === 200 && data?.ok === true && data?.schema === "aha_insight_synthesis_contract_v2" && data?.synthesis?.schema === "aha_insight_synthesis_output_v2") return { envelope: data, attempts };
    await sleep(attempt === 1 ? 8000 : 3500);
  }
  return { envelope: null, attempts };
}
function buildShadow(fixture, candidates) {
  return { schema: "aha_insight_synthesis_shadow_v2", source_event_id: fixture.source_event_id, source_text_hash: null, candidates, policy: { production_gate_authority: false, synthesis_allowed: false, canonical_write: false, chamber_write: false, meta_write: false, persistent_write: false } };
}
function strictGold(fixture, eligible) {
  return goldEvaluator.evaluateGoldFixture({ gold_fixture: fixture, model_shadow: { source_event_id: fixture.source_event_id, entities: [], concepts: [], relations: [], propositions: eligible.map((candidate) => ({ kind: "interpretation", text: candidate.insight, evidence: safeArray(candidate.evidence).map((item) => ({ quote: item.quote })) })) } }).dimensions.interpretations;
}
function proxyMatch(candidate, goldItem) {
  const text = normalize(candidate?.insight);
  const required = safeArray(goldItem?.required_terms).map(normalize).filter(Boolean);
  const forbidden = safeArray(goldItem?.forbidden_terms).map(normalize).filter(Boolean);
  if (!required.every((term) => text.includes(term)) || forbidden.some((term) => text.includes(term))) return false;
  const evidence = safeArray(candidate?.evidence).map((item) => String(item?.quote || ""));
  return safeArray(goldItem?.evidence_quotes).every((requiredQuote) => evidence.some((quote) => quote.includes(requiredQuote) || requiredQuote.includes(quote)));
}
function proxyMetric(fixture, eligible) {
  const expected = safeArray(fixture?.gold?.interpretations);
  const used = new Set();
  let tp = 0;
  for (const candidate of eligible) {
    const idx = expected.findIndex((goldItem, i) => !used.has(i) && proxyMatch(candidate, goldItem));
    if (idx >= 0) { used.add(idx); tp += 1; }
  }
  return metric(tp, eligible.length, expected.length);
}
function metric(tp, predicted, expected) {
  const precision = predicted ? tp / predicted : (expected ? 0 : null);
  const recall = expected ? tp / expected : null;
  const f1 = precision != null && recall != null && precision + recall > 0 ? 2 * precision * recall / (precision + recall) : (precision === 0 && recall === 0 ? 0 : null);
  const round = (v) => v == null ? null : Number(v.toFixed(6));
  return { true_positive: tp, predicted, expected, false_positive: Math.max(0, predicted - tp), false_negative: Math.max(0, expected - tp), precision: round(precision), recall: round(recall), f1: round(f1) };
}

(async () => {
  fs.mkdirSync("v2-calibrated-live-results", { recursive: true });
  const results = [];
  for (const path of fixturePaths) {
    const fixture = JSON.parse(fs.readFileSync(path, "utf8"));
    const live = await callLive(fixture);
    if (!live.envelope) {
      const failed = { fixture_id: fixture.id, valid_live_output: false, attempts: live.attempts };
      results.push(failed);
      fs.writeFileSync(`v2-calibrated-live-results/${fixture.id}.json`, JSON.stringify(failed, null, 2));
      continue;
    }
    const candidates = safeArray(live.envelope.synthesis?.candidates);
    const gate = qualityGate.evaluateSynthesisShadow({ source_text: fixture.source_text, synthesis_shadow: buildShadow(fixture, candidates) });
    const eligibleIndexes = new Set(safeArray(gate.decisions).filter((d) => d.eligible_for_insight_review).map((d) => d.candidate_index));
    const eligible = candidates.filter((_c, i) => eligibleIndexes.has(i));
    const strict = strictGold(fixture, eligible);
    const proxy = proxyMetric(fixture, eligible);
    const invalidInterpretiveHigh = candidates.filter((c) => c?.causal_status === "interpretive" && c?.confidence === "high").length;
    const invalidInterpretiveNoUncertainty = candidates.filter((c) => c?.causal_status === "interpretive" && !String(c?.uncertainty || "").trim()).length;
    const result = { fixture_id: fixture.id, valid_live_output: true, model: live.envelope.model || null, response_id: live.envelope.response_id || null, attempts: live.attempts, candidates, gate_decisions: gate.decisions, eligible_candidates: eligible, strict_interpretation: strict, evidence_granularity_proxy: proxy, invalid_interpretive_high: invalidInterpretiveHigh, invalid_interpretive_without_uncertainty: invalidInterpretiveNoUncertainty };
    results.push(result);
    fs.writeFileSync(`v2-calibrated-live-results/${fixture.id}.json`, JSON.stringify(result, null, 2));
    console.log(`CAL_RESULT ${fixture.id} candidates=${candidates.length} eligible=${eligible.length} strictF1=${strict.f1} proxyF1=${proxy.f1} invalidIH=${invalidInterpretiveHigh} invalidIU=${invalidInterpretiveNoUncertainty}`);
    candidates.forEach((candidate, index) => {
      const decision = gate.decisions[index];
      console.log(`CAL_CANDIDATE ${fixture.id} #${index} eligible=${decision?.eligible_for_insight_review === true} type=${candidate.type} confidence=${candidate.confidence} causal=${candidate.causal_status} uncertainty=${JSON.stringify(candidate.uncertainty)} quality=${decision?.metrics?.quality_score ?? null} reasons=${JSON.stringify(decision?.blocking_reasons || [])} insight=${JSON.stringify(candidate.insight)} evidence=${JSON.stringify(candidate.evidence)}`);
    });
  }
  const valid = results.filter((r) => r.valid_live_output);
  const sum = (key) => valid.reduce((total, r) => total + Number(r[key] || 0), 0);
  const strictTotals = valid.reduce((a, r) => { a.tp += r.strict_interpretation.true_positive; a.pred += r.strict_interpretation.predicted; a.exp += r.strict_interpretation.expected; return a; }, { tp: 0, pred: 0, exp: 0 });
  const proxyTotals = valid.reduce((a, r) => { a.tp += r.evidence_granularity_proxy.true_positive; a.pred += r.evidence_granularity_proxy.predicted; a.exp += r.evidence_granularity_proxy.expected; return a; }, { tp: 0, pred: 0, exp: 0 });
  const summary = {
    schema: "aha_insight_synthesis_v2_calibrated_live_gold_measurement_v1",
    measured_at: new Date().toISOString(), endpoint,
    fixture_count: results.length, valid_live_output_count: valid.length, invalid_live_output_count: results.length - valid.length,
    candidate_count: valid.reduce((n, r) => n + r.candidates.length, 0), gate_eligible_count: valid.reduce((n, r) => n + r.eligible_candidates.length, 0),
    strict_interpretation: metric(strictTotals.tp, strictTotals.pred, strictTotals.exp), evidence_granularity_proxy: metric(proxyTotals.tp, proxyTotals.pred, proxyTotals.exp),
    baseline_interpretation_f1: 0.166667,
    invalid_interpretive_high_count: sum("invalid_interpretive_high"), invalid_interpretive_without_uncertainty_count: sum("invalid_interpretive_without_uncertainty"),
    production_gate_authority: false, synthesis_allowed: false, canonical_write: false, chamber_write: false, meta_write: false, persistent_write: false,
    results
  };
  fs.writeFileSync("v2-calibrated-live-results/summary.json", JSON.stringify(summary, null, 2));
  console.log("CAL_SUMMARY " + JSON.stringify({ valid_live_output_count: summary.valid_live_output_count, candidate_count: summary.candidate_count, gate_eligible_count: summary.gate_eligible_count, strict_interpretation: summary.strict_interpretation, evidence_granularity_proxy: summary.evidence_granularity_proxy, baseline_interpretation_f1: summary.baseline_interpretation_f1, invalid_interpretive_high_count: summary.invalid_interpretive_high_count, invalid_interpretive_without_uncertainty_count: summary.invalid_interpretive_without_uncertainty_count }));
  if (valid.length < 4) process.exitCode = 2;
})().catch((error) => { console.error(error); process.exitCode = 1; });
