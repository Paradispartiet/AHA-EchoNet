// Cross-disciplinary evaluation of public research EXCERPTS and authored bilingual briefs.
// Real-source cases use short, verbatim excerpts with links (not full papers).
// This is a deterministic validator/brief test, NOT an LLM run or proof of scientific insight quality.
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createChatContext } = require("../scripts/compare-aha-engine-fixtures.cjs");

const sourceExcerpts = require("./fixtures/aha-real-science-excerpts-v1.json");

function proposal(item, insight, causalStatus) {
  return {
    schema: "aha_insight_synthesis_output_v2",
    candidates: [{
      insight,
      type: "pattern",
      abstraction: "Compares a source-reported observation with a specific unresolved claim.",
      evidence: [
        { quote: item.observation, role: "supports" },
        { quote: item.limitation, role: "limits" }
      ],
      why_it_matters: "An association is not by itself proof of a causal mechanism.",
      confidence: "medium",
      uncertainty: "The cited excerpt does not determine causal attribution.",
      causal_status: causalStatus
    }]
  };
}

const originalBriefs = [
  {
    id: "english-environment",
    text: "Researchers observed 39 additional bee visits after planting native flowers. However, the counts were made in different seasons and the study cannot establish a causal effect of planting on bee visits. The report recommends matching sites by weather and baseline habitat.",
    observationTerm: "bee visits",
    limitationTerm: "counts were made"
  },
  {
    id: "english-education",
    text: "The survey recorded higher reading engagement among participants using audio materials. The study was cross-sectional and relied on self-reported visits, so the effect of audio materials remains unclear. In comparison, a separate school reported no comparable increase.",
    observationTerm: "reading engagement",
    limitationTerm: "cross-sectional"
  },
  {
    id: "norwegian-city",
    text: "En kommune innførte i et prøveprosjekt digital søknad om boligtilpasning. Saksbehandlerne registrerte 42 fullførte digitale søknader på seks uker, men 11 innbyggere oppsøkte biblioteket fordi de ikke kom gjennom identitetskontrollen. Frivillige veiledere hjalp ni av de elleve med å finne en alternativ søknadsvei. Kommunen vurderer å stenge papirskjemaet fordi den digitale behandlingen ser raskere ut. Rapporten sammenligner ikke saksbehandlingstid for ellers like saker, og registreringen omfatter ikke dem som aldri forsøkte å søke. Tallene beskriver bruk i et lite prøveprosjekt, ikke dokumentert effekt for alle innbyggere. Spørsmålet er om digital effektivitet og reell tilgjengelighet blir vurdert med samme målestokk.",
    observationTerm: "42 fullførte digitale søknader",
    limitationTerm: "ikke dokumentert effekt"
  }
];

async function run() {
  const contract = await import(pathToFileURL(path.resolve("server/ahaInsightSynthesisContractV2.js")).href);
  for (const item of sourceExcerpts) {
    const source = item.observation + "\n" + item.limitation;
    const careful = proposal(item, "The excerpt reports a bounded association, leaving the causal mechanism unresolved.", "not_causal");
    const carefulValidation = contract.validateSynthesisPayload(careful, source);
    assert.equal(carefulValidation.ok, true, item.id + ": accurate qualified candidate must remain possible: " + carefulValidation.errors);

    const inventedCause = proposal(item, "The investigated factor caused the observed outcome.", "source_explicit");
    const invalid = contract.validateSynthesisPayload(inventedCause, source);
    assert.equal(invalid.ok, false, item.id + ": excerpt cannot certify causal attribution");
    assert.ok(invalid.errors.includes("candidate:0:causal_claim_contradicts_source_limitation"),
      item.id + ": causal uncertainty was not detected: " + invalid.errors);

    inventedCause.candidates[0].evidence[0].quote = "A claim absent from the actual cited excerpt";
    const fabricatedQuote = contract.validateSynthesisPayload(inventedCause, source);
    assert.ok(fabricatedQuote.errors.includes("candidate:0:evidence:0:quote_not_in_source"),
      item.id + ": source mismatch must be rejected");
    console.log("REAL_SOURCE_EXCERPT " + JSON.stringify({ id: item.id, url: item.url, subject: item.subject, negative_causal_gate: "passed", model_run: false }));
  }

  const context = createChatContext();
  for (const item of originalBriefs) {
    const auto = context.AHATestHooks.buildAutoOutputs(item.text, "");
    const canonical = context.AHATestHooks.buildCanonicalAnalysis(auto, item.text);
    const brief = canonical.sourceResearchBrief;
    assert.equal(brief?.status, "source_bound_review", item.id + ": brief must be available in both languages");
    assert.ok(brief.observation.quote.includes(item.observationTerm), item.id + ": lost domain-specific finding");
    assert.ok(brief.limitation.quote.includes(item.limitationTerm), item.id + ": missed study limitation");
    assert.equal(brief.researchPath.length, 3);
    assert.ok(brief.researchPath.every((step) => item.text.includes(step.sourceQuote)),
      item.id + ": investigation path cites material not present");
    assert.ok(brief.researchPath[0].question.includes(item.observationTerm),
      item.id + ": question must reference this paper's finding");
    assert.ok(brief.researchPath[1].question.includes(item.limitationTerm),
      item.id + ": question must reference this paper's limitation");
    assert.equal(brief.verifiedInterpretation, false);
    assert.equal(canonical.analysisEvidenceStatus, "extractive_only");
    console.log("BILINGUAL_BRIEF " + JSON.stringify({ id: item.id, grounded_steps: 3, model_run: false }));
  }
  console.log("AHA real-source excerpt causal guard: 3 verified-source excerpts + 3 authored bilingual briefs.");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
