const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);

for (const file of [
  "js/ahaInsightRelationClassifierV2.js",
  "js/ahaInsightSaturationV2.js",
  "js/ahaSemanticProjectionsV2.js"
]) vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });

const api = context.AHASemanticProjectionsV2;
assert.ok(api);

function makeInsight({
  id,
  insight,
  type,
  concepts,
  quality,
  abstraction = "",
  why_it_matters = "",
  confidence = "high",
  uncertainty = "",
  causal_status = "not_causal"
}) {
  return {
    id,
    source_event_id: `source_${id}`,
    source_text_hash: "a".repeat(64),
    semantic_concepts: concepts,
    candidate: {
      insight,
      type,
      abstraction,
      why_it_matters,
      confidence,
      uncertainty,
      causal_status,
      evidence: [
        { quote: `Første dokumenterte belegg for ${id}.`, role: "supports" },
        { quote: `Andre dokumenterte belegg for ${id}.`, role: "context" }
      ]
    },
    gate_decision: {
      eligible_for_insight_review: true,
      blocking_reasons: [],
      metrics: { quality_score: quality }
    }
  };
}

function sourceListForPath(result, path) {
  return result.projections.lists.find((list) => list.id === path.meta?.source_list_candidate_id);
}

const rich = api.project({ insights: [
  makeInsight({
    id: "news_generalization_a",
    insight: "Forutsigbarhet i ruteplanlegging oppleves som en nøkkelfaktor for tilfredshet blant kveldsreisende, utover bare antallet avganger.",
    type: "generalization",
    concepts: ["antall", "reisende"],
    quality: 0.800535,
    abstraction: "Reisendes vektlegging av forutsigbarhet i kollektivtilbud: Å forstå at reisende verdsetter forutsigbarhet kan hjelpe byrådet til å målrette forbedringer som øker kollektivtrafikkens bruk og tilfredshet.",
    why_it_matters: "Å forstå at reisende verdsetter forutsigbarhet kan hjelpe byrådet til å målrette forbedringer som øker kollektivtrafikkens bruk og tilfredshet.",
    confidence: "medium",
    uncertainty: "interpretive"
  }),
  makeInsight({
    id: "news_generalization_b",
    insight: "Brukerne legger mer vekt på å ha en forutsigbar og regelmessig rutetabell fremfor et høyt antall avganger på kveldstid.",
    type: "generalization",
    concepts: ["antall", "antall avganger"],
    quality: 0.814706,
    abstraction: "Reisendes prioritering av rutetilbud på kveldstid: For å effektivisere kollektivtrafikken bør tiltak fokusere på å forbedre rutetabellens regularitet, ikke bare kvantiteten av avganger.",
    why_it_matters: "For å effektivisere kollektivtrafikken bør tiltak fokusere på å forbedre rutetabellens regularitet, ikke bare kvantiteten av avganger.",
    confidence: "medium",
    uncertainty: "interpretive"
  }),
  makeInsight({
    id: "news_consequence",
    insight: "Det kan være nødvendig å balansere økningen i antall avganger med sikring av en konsekvent og pålitelig rutetabell for å møte reisendes forventninger.",
    type: "consequence",
    concepts: ["antall", "antall avganger"],
    quality: 0.730769,
    abstraction: "Kveldstidens trafikktilbud krever balansering av antall og regularitet",
    why_it_matters: "En ubalansert satsing på antall avganger uten tilstrekkelig fokus på regularitet kan svekke kollektivtrafikkens brukertilfredshet.",
    confidence: "low",
    uncertainty: "hypothesis"
  }),
  makeInsight({
    id: "news_tension",
    insight: "Byrådet fokuserer på å øke antallet avganger, mens reisende uttrykker et behov for mer regelmessige avganger, noe som kan indikere en spenning i prioriteringene.",
    type: "tension",
    concepts: ["antall", "byrådet"],
    quality: 0.733333,
    abstraction: "Motsetning mellom byrådets tiltak og reisendes preferanser",
    why_it_matters: "Hvis tiltakene ikke samsvarer med brukernes behov, kan det føre til misnøye eller underutnyttelse av tilbudet.",
    confidence: "medium",
    uncertainty: "interpretive"
  })
] });

assert.equal(rich.validation.valid, true, JSON.stringify(rich.validation));
assert.equal(rich.projections.paths.length, 1);
const richPath = rich.projections.paths[0];
assert.equal(richPath.meta?.semantic_shape, "ordered_inquiry_v2");
assert.equal(richPath.meta?.stage_selection, "semantic_role_ranked_not_round_robin");
assert.deepEqual(
  Array.from(richPath.steps, (step) => step.meta?.stage),
  ["orientation", "claim_evidence", "tension_counterexample", "uncertainty", "synthesis_next_inquiry"]
);

const richList = sourceListForPath(rich, richPath);
assert.ok(richList, "path must retain its source-list provenance");
const availableRefs = new Set(richList.items.map((item) => item.refId));
assert.equal(availableRefs.size, 4, "#894 news_transit regression must expose four source-bound insights");
const selectedRefs = richPath.steps.map((step) => step.refId);
selectedRefs.forEach((refId) => assert.ok(availableRefs.has(refId), `path selected ${refId} outside its source list`));
assert.ok(
  new Set(selectedRefs).size >= 3,
  "when four source insights are available, the ordered inquiry should use at least three without abandoning semantic stage ranking"
);

const scarce = api.project({ insights: [
  makeInsight({
    id: "scarce_a",
    insight: "Et hovedprinsipp setter rammen for vurderingen.",
    type: "principle",
    concepts: ["knapphet", "ramme"],
    quality: 0.86
  }),
  makeInsight({
    id: "scarce_b",
    insight: "Et motperspektiv viser samtidig hvor rammen kan være for snever.",
    type: "pattern",
    concepts: ["knapphet", "motperspektiv"],
    quality: 0.86
  })
] });
assert.equal(scarce.validation.valid, true, JSON.stringify(scarce.validation));
assert.equal(scarce.projections.paths.length, 1);
const scarcePath = scarce.projections.paths[0];
const scarceList = sourceListForPath(scarce, scarcePath);
assert.ok(scarceList);
const scarceAvailableRefs = new Set(scarceList.items.map((item) => item.refId));
const scarceSelectedRefs = new Set(scarcePath.steps.map((step) => step.refId));
assert.equal(scarceAvailableRefs.size, 2, "scarce fixture must expose exactly two source insights");
assert.ok(scarceSelectedRefs.size <= 2, "source diversity must never invent filler beyond the available evidence");
for (const refId of scarceSelectedRefs) assert.ok(scarceAvailableRefs.has(refId));

console.log("aha-path-source-diversity-v2.test.cjs: OK");
