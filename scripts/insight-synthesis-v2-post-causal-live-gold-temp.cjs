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
const gateApi = ctx.AHAInsightQualityGateV2;
const goldApi = ctx.AHASemanticGoldEvaluator;
if (!gateApi || !goldApi) throw new Error("post_causal_evaluators_unavailable");

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
  const body = { text: fixture.source_text, format: "aha_insight_synthesis_output_v2", semantic_context: semanticContext(fixture), context: { source_event_id: fixture.source_event_id, source_type: "post_causal_language_live_gold", language: "no" } };
  const attempts = [];
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    let status = 0, data = null, transportError = null;
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
      status = response.status;
      data = await response.json().catch(() => null);
    } catch (error) {
      transportError = String(error?.message || error);
    }
    const record = { attempt, status, ok: data?.ok === true, error: data?.error || transportError || null, validation_errors: safeArray(data?.validation_errors) };
    attempts.push(record);
    console.log(`POST_CAUSAL_ATTEMPT ${fixture.id} #${attempt} status=${status} ok=${record.ok} error=${record.error || ""} validation=${JSON.stringify(record.validation_errors)}`);
    if (status === 200 && data?.ok === true && data?.schema === "aha_insight_synthesis_contract_v2" && data?.synthesis?.schema === "aha_insight_synthesis_output_v2") return { envelope: data, attempts };
    await sleep(attempt === 1 ? 6000 : 3000);
  }
  return { envelope: null, attempts };
}
function shadow(fixture, candidates) {
  return { schema: "aha_insight_synthesis_shadow_v2", source_event_id: fixture.source_event_id, source_text_hash: null, candidates, policy: { production_gate_authority: false, synthesis_allowed: false, canonical_write: false, chamber_write: false, meta_write: false, persistent_write: false } };
}
function strictGold(fixture, eligible) {
  return goldApi.evaluateGoldFixture({ gold_fixture: fixture, model_shadow: { source_event_id: fixture.source_event_id, entities: [], concepts: [], relations: [], propositions: eligible.map((c) => ({ kind: "interpretation", text: c.insight, evidence: safeArray(c.evidence).map((e) => ({ quote: e.quote })) })) } }).dimensions.interpretations;
}
function metric(tp, predicted, expected) {
  const p = predicted ? tp / predicted : (expected ? 0 : null);
  const r = expected ? tp / expected : null;
  const f1 = p != null && r != null && p + r > 0 ? (2 * p * r) / (p + r) : (p === 0 && r === 0 ? 0 : null);
  const round = (v) => v == null ? null : Number(v.toFixed(6));
  return { true_positive: tp, predicted, expected, false_positive: Math.max(0, predicted - tp), false_negative: Math.max(0, expected - tp), precision: round(p), recall: round(r), f1: round(f1) };
}
function proxyMatch(candidate, goldItem) {
  const text = normalize(candidate?.insight);
  const required = safeArray(goldItem?.required_terms).map(normalize).filter(Boolean);
  const forbidden = safeArray(goldItem?.forbidden_terms).map(normalize).filter(Boolean);
  if (!required.every((term) => text.includes(term)) || forbidden.some((term) => text.includes(term))) return false;
  const evidence = safeArray(candidate?.evidence).map((e) => String(e?.quote || ""));
  return safeArray(goldItem?.evidence_quotes).every((goldQuote) => evidence.some((quote) => quote.includes(goldQuote) || goldQuote.includes(quote)));
}
function proxyGold(fixture, eligible) {
  const expected = safeArray(fixture?.gold?.interpretations);
  const used = new Set();
  let tp = 0;
  eligible.forEach((candidate) => {
    const index = expected.findIndex((gold, i) => !used.has(i) && proxyMatch(candidate, gold));
    if (index >= 0) { used.add(index); tp += 1; }
  });
  return metric(tp, eligible.length, expected.length);
}

(async () => {
  fs.mkdirSync("v2-post-causal-live-results", { recursive: true });
  const results = [];
  const validationCodeCounts = {};
  for (const fixturePath of fixturePaths) {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const live = await callLive(fixture);
    live.attempts.flatMap((a) => a.validation_errors || []).forEach((code) => { validationCodeCounts[code] = (validationCodeCounts[code] || 0) + 1; });
    if (!live.envelope) {
      const failed = { fixture_id: fixture.id, valid_live_output: false, attempts: live.attempts };
      results.push(failed);
      fs.writeFileSync(`v2-post-causal-live-results/${fixture.id}.json`, JSON.stringify(failed, null, 2));
      continue;
    }
    const candidates = safeArray(live.envelope.synthesis?.candidates);
    const gate = gateApi.evaluateSynthesisShadow({ source_text: fixture.source_text, synthesis_shadow: shadow(fixture, candidates) });
    const eligibleIndexes = new Set(safeArray(gate.decisions).filter((d) => d.eligible_for_insight_review).map((d) => d.candidate_index));
    const eligible = candidates.filter((_c, i) => eligibleIndexes.has(i));
    const strict = strictGold(fixture, eligible);
    const proxy = proxyGold(fixture, eligible);
    const result = { fixture_id: fixture.id, valid_live_output: true, model: live.envelope.model || null, response_id: live.envelope.response_id || null, attempts: live.attempts, candidates, gate_decisions: gate.decisions, eligible_candidates: eligible, strict_interpretation: strict, evidence_granularity_proxy: proxy };
    results.push(result);
    fs.writeFileSync(`v2-post-causal-live-results/${fixture.id}.json`, JSON.stringify(result, null, 2));
    console.log(`POST_CAUSAL_RESULT ${fixture.id} candidates=${candidates.length} eligible=${eligible.length} strictF1=${strict.f1} proxyF1=${proxy.f1}`);
    candidates.forEach((candidate, index) => {
      const decision = gate.decisions[index];
      console.log(`POST_CAUSAL_CANDIDATE ${fixture.id} #${index} eligible=${decision?.eligible_for_insight_review === true} type=${candidate.type} confidence=${candidate.confidence} causal=${candidate.causal_status} uncertainty=${JSON.stringify(candidate.uncertainty)} quality=${decision?.metrics?.quality_score ?? null} reasons=${JSON.stringify(decision?.blocking_reasons || [])} insight=${JSON.stringify(candidate.insight)} evidence=${JSON.stringify(candidate.evidence)}`);
    });
  }
  const valid = results.filter((r) => r.valid_live_output);
  const aggregateFrom = (key) => valid.reduce((a, r) => { const m = r[key]; a.tp += m.true_positive; a.pred += m.predicted; a.exp += m.expected; return a; }, { tp: 0, pred: 0, exp: 0 });
  const strictTotals = aggregateFrom("strict_interpretation");
  const proxyTotals = aggregateFrom("evidence_granularity_proxy");
  const summary = {
    schema: "aha_insight_synthesis_v2_post_causal_language_live_gold_v1",
    measured_at: new Date().toISOString(), endpoint,
    fixture_count: results.length, valid_live_output_count: valid.length, invalid_live_output_count: results.length - valid.length,
    total_attempt_count: results.reduce((n, r) => n + safeArray(r.attempts).length, 0), validation_code_counts: validationCodeCounts,
    candidate_count: valid.reduce((n, r) => n + safeArray(r.candidates).length, 0), gate_eligible_count: valid.reduce((n, r) => n + safeArray(r.eligible_candidates).length, 0),
    strict_interpretation: metric(strictTotals.tp, strictTotals.pred, strictTotals.exp), evidence_granularity_proxy: metric(proxyTotals.tp, proxyTotals.pred, proxyTotals.exp),
    baseline_interpretation_f1: 0.166667,
    production_gate_authority: false, synthesis_allowed: false, canonical_write: false, chamber_write: false, meta_write: false, persistent_write: false,
    results
  };
  fs.writeFileSync("v2-post-causal-live-results/summary.json", JSON.stringify(summary, null, 2));
  console.log("POST_CAUSAL_SUMMARY " + JSON.stringify({ valid_live_output_count: summary.valid_live_output_count, total_attempt_count: summary.total_attempt_count, validation_code_counts: summary.validation_code_counts, candidate_count: summary.candidate_count, gate_eligible_count: summary.gate_eligible_count, strict_interpretation: summary.strict_interpretation, evidence_granularity_proxy: summary.evidence_granularity_proxy, baseline_interpretation_f1: summary.baseline_interpretation_f1 }));
  if (valid.length < 4) process.exitCode = 2;
})().catch((error) => { console.error(error); process.exitCode = 1; });
