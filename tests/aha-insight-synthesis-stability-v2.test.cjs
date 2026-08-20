const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; }
  };
}

async function invoke(handler, body) {
  const res = createRes();
  await handler({ body }, res);
  return res;
}

async function run() {
  const stabilityUrl = `${pathToFileURL(path.resolve("server/ahaInsightSynthesisStabilityV2.js")).href}?test=${Date.now()}`;
  const stability = await import(stabilityUrl);
  assert.equal(stability.MAX_VALIDATION_ATTEMPTS, 4);
  assert.equal(stability.SYNTHESIS_TEMPERATURE, 0.2);

  const request = stability.applyStabilityRequestPolicy({
    model: "gpt-test",
    input: [
      { role: "system", content: "base instruction" },
      { role: "user", content: "payload" }
    ]
  });
  assert.equal(request.temperature, 0.2);
  assert.match(request.input[0].content, /Bevar sentrale source-\/canonical-begreper/i);
  assert.match(request.input[0].content, /Evidence må dekke hver hovedside/i);
  assert.match(request.input[0].content, /not_causal standardvalget/i);

  const mixedUseSource = "En gate fikk flere boliger og butikker. Fotgjengertrafikken ble jevnere fordelt. Materialet peker ikke ut ett enkelt tiltak som årsak, men viser at flere bruksformer opptrer samtidig med et bredere tidsmønster.";
  const missingLimit = {
    schema: "aha_insight_synthesis_output_v2",
    candidates: [{
      insight: "Flere bruksformer opptrer sammen med et bredere tidsmønster i fotgjengertrafikken.",
      abstraction: "Kobler bruksblanding og tidsmønster uten en kausal påstand.",
      evidence: [],
      why_it_matters: "Bevarer mønsteret uten å overtolke årsak.",
      confidence: "high",
      uncertainty: "",
      causal_status: "not_causal",
      type: "pattern"
    }]
  };
  const missing = stability.validateStabilitySynthesis(missingLimit, mixedUseSource);
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.includes("candidate:0:source_limitation_wording_not_preserved:peker_ikke_ut"));
  const preserved = structuredClone(missingLimit);
  preserved.candidates[0].uncertainty = "Materialet peker ikke ut ett enkelt tiltak som årsak.";
  assert.equal(stability.validateStabilitySynthesis(preserved, mixedUseSource).ok, true);

  const endpointUrl = `${pathToFileURL(path.resolve("server/ahaSemanticModelEndpoint.js")).href}?stability=${Date.now()}`;
  const { createSemanticModelHandler } = await import(endpointUrl);

  const source = "Et prosjekt brukte én felles mal for alle rapporter. Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur. Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken.";
  const semanticContext = {
    entities: [{ label: "prosjekt", entity_type: "other" }],
    concepts: [{ label: "faste felt" }, { label: "valgfrie felt" }, { label: "felles kjerne" }],
    source_claims: [
      { text: "Et prosjekt brukte én felles mal for alle rapporter." },
      { text: "Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur." },
      { text: "Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken." }
    ],
    relations: []
  };
  const valid = {
    schema: "aha_insight_synthesis_output_v2",
    candidates: [{
      insight: "Delvis standardisering kan bevare sammenlignbarhet samtidig som ulike saker får nødvendig fleksibilitet.",
      type: "tension",
      abstraction: "Kobler ulempen ved én fast struktur med løsningen der noen felt er faste og andre valgfrie.",
      evidence: [
        { quote: "Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur.", role: "supports" },
        { quote: "Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken.", role: "supports" }
      ],
      why_it_matters: "Det beskriver et designprinsipp for systemer som trenger både felles kjerne og lokal tilpasning.",
      confidence: "high",
      uncertainty: "",
      causal_status: "not_causal"
    }]
  };

  {
    let calls = 0;
    const captured = [];
    const invalid = structuredClone(valid);
    invalid.candidates[0].evidence[1].quote = "Ikke i source.";
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: { responses: { create: async (req) => {
        calls += 1;
        captured.push(req);
        return calls === 1
          ? { id: "bad_1", model: "gpt-test", output_parsed: invalid }
          : { id: "good_2", model: "gpt-test", output_parsed: valid };
      } } }
    });
    const res = await invoke(handler, { format: "aha_insight_synthesis_output_v2", text: source, semantic_context: semanticContext });
    assert.equal(res.statusCode, 200);
    assert.equal(calls, 2);
    assert.equal(captured[0].temperature, 0.2);
    assert.match(captured[1].input[0].content, /PREVIOUS SYNTHESIS ATTEMPT FAILED VALIDATION/i);
    assert.match(captured[1].input[0].content, /quote_not_in_source/i);
  }

  {
    const liveContext = {
      entities: [], concepts: [{ label: "flere bruksformer" }, { label: "tidsmønster" }],
      source_claims: [
        { text: "En gate fikk flere boliger og butikker." },
        { text: "Fotgjengertrafikken ble jevnere fordelt." },
        { text: "Materialet peker ikke ut ett enkelt tiltak som årsak, men viser at flere bruksformer opptrer samtidig med et bredere tidsmønster." }
      ],
      relations: []
    };
    const baseCandidate = {
      insight: "Flere bruksformer opptrer sammen med et bredere tidsmønster i fotgjengertrafikken.",
      type: "pattern",
      abstraction: "Kobler bruksblanding og tidsmønster uten en kausal påstand.",
      evidence: [
        { quote: "Fotgjengertrafikken ble jevnere fordelt.", role: "supports" },
        { quote: "Materialet peker ikke ut ett enkelt tiltak som årsak, men viser at flere bruksformer opptrer samtidig med et bredere tidsmønster.", role: "limits" }
      ],
      why_it_matters: "Bevarer mønsteret uten å overtolke årsak.",
      confidence: "high",
      uncertainty: "",
      causal_status: "not_causal"
    };
    let calls = 0;
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: { responses: { create: async () => {
        calls += 1;
        const candidate = structuredClone(baseCandidate);
        if (calls > 1) candidate.uncertainty = "Materialet peker ikke ut ett enkelt tiltak som årsak.";
        return { id: `mixed_${calls}`, model: "gpt-test", output_parsed: { schema: "aha_insight_synthesis_output_v2", candidates: [candidate] } };
      } } }
    });
    const res = await invoke(handler, { format: "aha_insight_synthesis_output_v2", text: mixedUseSource, semantic_context: liveContext });
    assert.equal(res.statusCode, 200);
    assert.equal(calls, 2);
    assert.match(res.body.synthesis.candidates[0].uncertainty, /peker ikke ut ett enkelt tiltak som årsak/i);
  }

  {
    let calls = 0;
    const invalid = structuredClone(valid);
    invalid.candidates[0].evidence[1].quote = "Fortsatt ikke i source.";
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: { responses: { create: async () => {
        calls += 1;
        return { id: `bad_${calls}`, model: "gpt-test", output_parsed: invalid };
      } } }
    });
    const res = await invoke(handler, { format: "aha_insight_synthesis_output_v2", text: source, semantic_context: semanticContext });
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, "insight_synthesis_validation_failed");
    assert.equal(calls, 4);
    assert.equal(res.body.policy.canonical_write, false);
  }

  console.log("aha-insight-synthesis-stability-v2 passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
