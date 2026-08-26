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

  {
    const causalRetryRequest = stability.addRetryInstruction({
      input: [
        { role: "system", content: "base instruction" },
        {
          role: "user",
          content: JSON.stringify({
            source_text: "Etter delegering gikk lokale valg raskere.",
            semantic_context: {
              relations: [{
                relation_type: "causes",
                from_label: "delegering",
                to_label: "lokale valg",
                epistemic_status: "source_explicit"
              }]
            }
          })
        }
      ]
    }, ["candidate:0:source_explicit_causality_not_in_evidence"]);
    assert.match(causalRetryRequest.input[0].content, /MANDATORY CAUSAL CORRECTION/i);
    assert.match(causalRetryRequest.input[0].content, /set causal_status=not_causal/i);
    assert.match(causalRetryRequest.input[0].content, /Do not repeat the rejected causal_status/i);
    const retryPayload = JSON.parse(causalRetryRequest.input[1].content);
    assert.deepEqual(retryPayload.semantic_context.relations, []);
  }

  {
    const wordingRetry = stability.addRetryInstruction({
      input: [
        { role: "system", content: "base instruction" },
        {
          role: "user",
          content: JSON.stringify({
            semantic_context: {
              relations: [{ relation_type: "causes", epistemic_status: "source_explicit" }]
            }
          })
        }
      ]
    }, ["candidate:0:not_causal_contains_causal_language"]);
    assert.match(wordingRetry.input[0].content, /MANDATORY WORDING CORRECTION/i);
    assert.match(wordingRetry.input[0].content, /Keep causal_status=not_causal/i);
    assert.match(wordingRetry.input[0].content, /MUST use this non-causal sentence frame/i);
    assert.match(wordingRetry.input[0].content, /er forbundet med.*samtidig som/i);
    assert.match(wordingRetry.input[0].content, /do not use a causal synonym/i);
    const retryPayload = JSON.parse(wordingRetry.input[1].content);
    assert.deepEqual(retryPayload.semantic_context.relations, []);
  }

  {
    const breadthRetry = stability.addRetryInstruction({
      input: [{ role: "system", content: "base instruction" }]
    }, ["candidates_below_requested_minimum:2"]);
    assert.match(breadthRetry.input[0].content, /MANDATORY BREADTH CORRECTION/i);
    assert.match(breadthRetry.input[0].content, /requested number of new/i);
  }

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

  {
    const modularitySource = "Da to utviklingsteam stadig endret den samme monolittiske kodebasen, ble små leveranser ofte forsinket av koordinering. Etter at systemet ble delt i moduler med tydelige grensesnitt, kunne flere lokale endringer gjøres uavhengig. Samtidig oppstod en større andel av feilene i antakelsene teamene gjorde om grensesnittene mellom modulene.";
    const modularityCandidate = {
      insight: "Moduler er forbundet med uavhengige lokale endringer samtidig som feil samler seg ved grensesnittene.",
      abstraction: "Kobler lokal uavhengighet og grensesnittfeil.",
      uncertainty: "",
      evidence: [
        { quote: "Etter at systemet ble delt i moduler med tydelige grensesnitt, kunne flere lokale endringer gjøres uavhengig." },
        { quote: "Samtidig oppstod en større andel av feilene i antakelsene teamene gjorde om grensesnittene mellom modulene." }
      ]
    };
    const missingPremise = stability.validateStabilitySynthesis({ candidates: [modularityCandidate] }, modularitySource);
    assert.equal(missingPremise.ok, false);
    assert.ok(missingPremise.errors.includes("candidate:0:source_evidence_premise_not_preserved:coordination_delay"));
    const covered = structuredClone(modularityCandidate);
    covered.evidence.unshift({ quote: "Da to utviklingsteam stadig endret den samme monolittiske kodebasen, ble små leveranser ofte forsinket av koordinering." });
    assert.equal(stability.validateStabilitySynthesis({ candidates: [covered] }, modularitySource).ok, true);
    const correction = stability.retryInstruction(missingPremise.errors);
    assert.match(correction, /MANDATORY EVIDENCE CORRECTION/i);
    assert.match(correction, /exactly three distinct evidence quotes/i);
    assert.match(correction, /forsinket av koordinering/i);
  }

  {
    const retrievalSource = "To elevgrupper brukte like lang tid på samme kapittel. Den ene leste teksten flere ganger, mens den andre forsøkte å hente fram innholdet fra hukommelsen mellom lesingene. Gruppen som testet seg selv opplevde arbeidet som vanskeligere, men husket mer en uke senere.";
    const retrievalCandidate = {
      insight: "Aktiv gjenhenting oppleves vanskeligere og er forbundet med bedre senere hukommelse.",
      abstraction: "Kobler gjenhentingsøvelse, vanskelighet og senere hukommelse.",
      uncertainty: "",
      evidence: [
        { quote: "To elevgrupper brukte like lang tid på samme kapittel." },
        { quote: "Gruppen som testet seg selv opplevde arbeidet som vanskeligere, men husket mer en uke senere." }
      ]
    };
    const missingMethod = stability.validateStabilitySynthesis({ candidates: [retrievalCandidate] }, retrievalSource);
    assert.equal(missingMethod.ok, false);
    assert.ok(missingMethod.errors.includes("candidate:0:source_evidence_premise_not_preserved:retrieval_method"));
    const covered = structuredClone(retrievalCandidate);
    covered.evidence = [
      { quote: "Den ene leste teksten flere ganger, mens den andre forsøkte å hente fram innholdet fra hukommelsen mellom lesingene." },
      { quote: "Gruppen som testet seg selv opplevde arbeidet som vanskeligere, men husket mer en uke senere." }
    ];
    assert.equal(stability.validateStabilitySynthesis({ candidates: [covered] }, retrievalSource).ok, true);
    const correction = stability.retryInstruction(missingMethod.errors);
    assert.match(correction, /MANDATORY RETRIEVAL EVIDENCE CORRECTION/i);
    assert.match(correction, /exactly two distinct evidence quotes/i);
  }

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
    let calls = 0;
    const captured = [];
    const causalContext = structuredClone(semanticContext);
    causalContext.relations = [{
      relation_type: "causes",
      from_label: "felles mal",
      to_label: "sammenligning enklere",
      epistemic_status: "source_explicit"
    }];
    const invalidCausal = structuredClone(valid);
    invalidCausal.candidates[0].causal_status = "source_explicit";
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: { responses: { create: async (req) => {
        calls += 1;
        captured.push(req);
        return calls === 1
          ? { id: "causal_bad_1", model: "gpt-test", output_parsed: invalidCausal }
          : { id: "causal_good_2", model: "gpt-test", output_parsed: valid };
      } } }
    });
    const res = await invoke(handler, { format: "aha_insight_synthesis_output_v2", text: source, semantic_context: causalContext });
    assert.equal(res.statusCode, 200);
    assert.equal(calls, 2);
    assert.match(captured[1].input[0].content, /MANDATORY CAUSAL CORRECTION/i);
    const retryPayload = JSON.parse(captured[1].input[1].content);
    assert.deepEqual(retryPayload.semantic_context.relations, []);
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
    const modularitySource = "Da to utviklingsteam stadig endret den samme monolittiske kodebasen, ble små leveranser ofte forsinket av koordinering. Etter at systemet ble delt i moduler med tydelige grensesnitt, kunne flere lokale endringer gjøres uavhengig. Samtidig oppstod en større andel av feilene i antakelsene teamene gjorde om grensesnittene mellom modulene.";
    const modularityContext = {
      entities: [],
      concepts: [{ label: "moduler" }, { label: "grensesnitt" }, { label: "koordinering" }],
      source_claims: [
        { text: "Da to utviklingsteam stadig endret den samme monolittiske kodebasen, ble små leveranser ofte forsinket av koordinering." },
        { text: "Etter at systemet ble delt i moduler med tydelige grensesnitt, kunne flere lokale endringer gjøres uavhengig." },
        { text: "Samtidig oppstod en større andel av feilene i antakelsene teamene gjorde om grensesnittene mellom modulene." }
      ],
      relations: []
    };
    const modularityCandidate = {
      insight: "Moduler er forbundet med uavhengige lokale endringer samtidig som feil samler seg ved grensesnittene.",
      type: "tension",
      abstraction: "Kobler lokal uavhengighet og grensesnittfeil med det tidligere koordineringspremisset.",
      evidence: [
        { quote: "Etter at systemet ble delt i moduler med tydelige grensesnitt, kunne flere lokale endringer gjøres uavhengig.", role: "supports" },
        { quote: "Samtidig oppstod en større andel av feilene i antakelsene teamene gjorde om grensesnittene mellom modulene.", role: "supports" }
      ],
      why_it_matters: "Synliggjør både lokal uavhengighet og grensesnittkostnaden.",
      confidence: "high",
      uncertainty: "",
      causal_status: "not_causal"
    };
    let calls = 0;
    const captured = [];
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: { responses: { create: async (req) => {
        calls += 1;
        captured.push(req);
        const candidate = structuredClone(modularityCandidate);
        if (calls > 1) {
          candidate.evidence.unshift({
            quote: "Da to utviklingsteam stadig endret den samme monolittiske kodebasen, ble små leveranser ofte forsinket av koordinering.",
            role: "supports"
          });
        }
        return { id: `modularity_${calls}`, model: "gpt-test", output_parsed: { schema: "aha_insight_synthesis_output_v2", candidates: [candidate] } };
      } } }
    });
    const res = await invoke(handler, { format: "aha_insight_synthesis_output_v2", text: modularitySource, semantic_context: modularityContext });
    assert.equal(res.statusCode, 200);
    assert.equal(calls, 2);
    assert.match(captured[1].input[0].content, /MANDATORY EVIDENCE CORRECTION/i);
    assert.equal(res.body.synthesis.candidates[0].evidence.length, 3);
  }

  {
    const retrievalSource = "To elevgrupper brukte like lang tid på samme kapittel. Den ene leste teksten flere ganger, mens den andre forsøkte å hente fram innholdet fra hukommelsen mellom lesingene. Gruppen som testet seg selv opplevde arbeidet som vanskeligere, men husket mer en uke senere.";
    const retrievalContext = {
      entities: [],
      concepts: [{ label: "aktiv gjenhenting" }, { label: "hukommelse" }],
      source_claims: [
        { text: "To elevgrupper brukte like lang tid på samme kapittel." },
        { text: "Den ene leste teksten flere ganger, mens den andre forsøkte å hente fram innholdet fra hukommelsen mellom lesingene." },
        { text: "Gruppen som testet seg selv opplevde arbeidet som vanskeligere, men husket mer en uke senere." }
      ],
      relations: []
    };
    const baseCandidate = {
      insight: "Aktiv gjenhenting oppleves vanskeligere og er forbundet med bedre senere hukommelse.",
      type: "tension",
      abstraction: "Kobler gjenhentingsøvelse, vanskelighet og senere hukommelse.",
      evidence: [
        { quote: "To elevgrupper brukte like lang tid på samme kapittel.", role: "supports" },
        { quote: "Gruppen som testet seg selv opplevde arbeidet som vanskeligere, men husket mer en uke senere.", role: "supports" }
      ],
      why_it_matters: "Synliggjør forholdet mellom læringsopplevelse og senere hukommelse.",
      confidence: "high",
      uncertainty: "",
      causal_status: "not_causal"
    };
    let calls = 0;
    const captured = [];
    const handler = createSemanticModelHandler({
      hasOpenAIKey: true,
      model: "gpt-test",
      openai: { responses: { create: async (req) => {
        calls += 1;
        captured.push(req);
        const candidate = structuredClone(baseCandidate);
        if (calls > 1) {
          candidate.evidence = [
            { quote: "Den ene leste teksten flere ganger, mens den andre forsøkte å hente fram innholdet fra hukommelsen mellom lesingene.", role: "supports" },
            { quote: "Gruppen som testet seg selv opplevde arbeidet som vanskeligere, men husket mer en uke senere.", role: "supports" }
          ];
        }
        return { id: `retrieval_${calls}`, model: "gpt-test", output_parsed: { schema: "aha_insight_synthesis_output_v2", candidates: [candidate] } };
      } } }
    });
    const res = await invoke(handler, { format: "aha_insight_synthesis_output_v2", text: retrievalSource, semantic_context: retrievalContext });
    assert.equal(res.statusCode, 200);
    assert.equal(calls, 2);
    assert.match(captured[1].input[0].content, /MANDATORY RETRIEVAL EVIDENCE CORRECTION/i);
    assert.equal(res.body.synthesis.candidates[0].evidence.length, 2);
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
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.validation_status, "blocked");
    assert.deepEqual(res.body.synthesis.candidates, []);
    assert.ok(res.body.validation_errors.some((item) => item.includes("quote_not_in_source")));
    assert.equal(calls, 4);
    assert.equal(res.body.policy.canonical_write, false);
  }

  console.log("aha-insight-synthesis-stability-v2 passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
