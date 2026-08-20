const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const vm = require("vm");

const context = { window: null, console };
context.window = context;
vm.runInNewContext(fs.readFileSync("js/ahaInsightQualityGateV2.js", "utf8"), context, { filename: "js/ahaInsightQualityGateV2.js" });
vm.runInNewContext(fs.readFileSync("js/ahaInsightSynthesisRuntimeV2.js", "utf8"), context, { filename: "js/ahaInsightSynthesisRuntimeV2.js" });

const api = context.AHAInsightSynthesisRuntimeV2;
assert.ok(api);
assert.equal(api.SHADOW_SCHEMA, "aha_insight_synthesis_shadow_v2");
assert.equal(api.VERSION, 2);

const sourceText = "Et prosjekt brukte én felles mal for alle rapporter. Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur. Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken.";
const sourceHash = crypto.createHash("sha256").update(sourceText, "utf8").digest("hex");
const sentenceTexts = [
  "Et prosjekt brukte én felles mal for alle rapporter.",
  "Det gjorde sammenligning enklere, men tvang også svært ulike saker inn i samme struktur.",
  "Da malen fikk noen faste felt og noen valgfrie felt, beholdt rapportene en felles kjerne samtidig som de kunne tilpasses saken."
];
let cursor = 0;
const anchors = sentenceTexts.map((text, index) => {
  const start = sourceText.indexOf(text, cursor);
  cursor = start + text.length;
  return { id: `ev_${index + 1}`, index, start_offset: start, end_offset: start + text.length, text };
});
const doc = {
  id: "sem_std",
  source_event_id: "src_std",
  source_text_hash: sourceHash,
  source_type: "chat",
  language: "no",
  evidence_anchors: anchors
};
const modelShadow = {
  schema: "aha_semantic_model_shadow_v1",
  source_event_id: "src_std",
  source_text_hash: sourceHash,
  response_id: "resp_semantic_std",
  entities: [
    { source_surface: "prosjekt", canonical_label: "prosjekt", entity_type: "other" },
    { source_surface: "rapporter", canonical_label: "rapporter", entity_type: "other" }
  ],
  concepts: [
    { source_surface: "faste felt", canonical_label: "faste felt" },
    { source_surface: "valgfrie felt", canonical_label: "valgfrie felt" },
    { source_surface: "felles kjerne", canonical_label: "felles kjerne" }
  ],
  propositions: [
    { kind: "source_claim", text: sentenceTexts[0] },
    { kind: "source_claim", text: sentenceTexts[1] },
    { kind: "source_claim", text: sentenceTexts[2] },
    { kind: "interpretation", text: "Denne gamle interpretationen må ikke sendes til V2." }
  ],
  relations: [
    { relation_type: "associated_with", from_label: "faste felt", to_label: "felles kjerne", epistemic_status: "source_explicit" },
    { relation_type: "supports", from_label: "gammel interpretation", to_label: "felles kjerne", epistemic_status: "interpretation" }
  ]
};
const synthesisEnvelope = {
  ok: true,
  schema: "aha_insight_synthesis_contract_v2",
  model: "gpt-synthesis-test",
  response_id: "resp_synthesis_std",
  policy: {
    source_text_returned: false,
    raw_model_output_returned: false,
    shadow_synthesis_generated: true,
    production_gate_authority: false,
    synthesis_allowed: false,
    canonical_write: false,
    chamber_write: false,
    persistent_write: false,
    meta_write: false
  },
  synthesis: {
    schema: "aha_insight_synthesis_output_v2",
    candidates: [{
      insight: "Delvis standardisering kan bevare sammenlignbarhet samtidig som ulike saker får nødvendig fleksibilitet.",
      type: "tension",
      abstraction: "Kobler ulempen ved én fast struktur med løsningen der noen felt er faste og andre valgfrie.",
      evidence: [
        { quote: sentenceTexts[1], role: "supports" },
        { quote: sentenceTexts[2], role: "supports" }
      ],
      why_it_matters: "Prinsippet kan brukes når et system må kombinere en felles kjerne med lokal tilpasning.",
      confidence: "high",
      uncertainty: "",
      causal_status: "not_causal"
    }]
  }
};

function makeRuntime(options = {}) {
  const fetchCalls = [];
  const events = [];
  const runtime = api.create({
    getSourcesApi: () => ({ loadSourceEvents: () => [{ id: "src_std", source_type: "chat", text: sourceText }] }),
    getSemanticDocumentApi: () => ({
      getLastShadowSemanticDocument: () => options.doc || doc,
      sha256Hex: (text) => options.hashOverride ? options.hashOverride(text) : crypto.createHash("sha256").update(text, "utf8").digest("hex")
    }),
    getModelShadowRuntime: () => ({ getLastModelShadow: () => options.modelShadow || modelShadow }),
    getQualityGateApi: () => context.AHAInsightQualityGateV2,
    getAgentUrl: () => "https://agent.example/api/aha-agent/semantic-document",
    fetchImpl: options.fetchImpl || (async (url, init) => {
      fetchCalls.push({ url, init });
      return { ok: true, json: async () => structuredClone(synthesisEnvelope) };
    }),
    isEnabled: options.isEnabled || (() => true),
    dispatchEvent: (event) => { events.push(event); return true; },
    CustomEventImpl: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    addEventListener: () => {},
    removeEventListener: () => {}
  });
  return { runtime, fetchCalls, events };
}

async function run() {
  {
    const { runtime, fetchCalls, events } = makeRuntime();
    const result = await runtime.handleModelShadow({ detail: { source_event_id: "src_std", source_text_hash: sourceHash } });
    assert.ok(result);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://agent.example/api/aha-agent/semantic-document");
    const body = JSON.parse(fetchCalls[0].init.body);
    assert.equal(body.text, sourceText);
    assert.equal(body.format, "aha_insight_synthesis_output_v2");
    assert.equal(body.semantic_context.source_claims.length, 3);
    assert.equal(body.semantic_context.relations.length, 1);
    assert.equal(JSON.stringify(body.semantic_context).includes("gamle interpretationen"), false);
    assert.equal(JSON.stringify(body.semantic_context).includes("gammel interpretation"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(body.semantic_context, "interpretations"), false);

    const shadow = result.synthesis_shadow;
    assert.equal(shadow.schema, "aha_insight_synthesis_shadow_v2");
    assert.equal(shadow.candidates.length, 1);
    assert.equal(shadow.candidates[0].evidence.length, 2);
    assert.equal(shadow.candidates[0].evidence[0].spans[0].anchor_id, "ev_2");
    assert.equal(shadow.candidates[0].evidence[1].spans[0].anchor_id, "ev_3");
    assert.equal(shadow.policy.production_gate_authority, false);
    assert.equal(shadow.policy.synthesis_allowed, false);
    assert.equal(shadow.policy.canonical_write, false);
    assert.equal(shadow.policy.chamber_write, false);
    assert.equal(shadow.policy.meta_write, false);
    assert.equal(shadow.policy.persistent_write, false);

    const gate = result.gate_evaluation;
    assert.equal(gate.valid, true);
    assert.equal(gate.eligible_count, 1, JSON.stringify(gate));
    assert.equal(gate.gate.authoritative, false);
    assert.equal(gate.gate.live_gold_required, true);
    assert.equal(gate.gate.chamber_write, false);

    assert.equal(events.length, 2);
    assert.equal(events[0].type, "aha:insight-synthesis-shadow");
    assert.equal(events[1].type, "aha:insight-quality-v2-shadow");
    const serializedEvents = JSON.stringify(events);
    assert.equal(serializedEvents.includes(sourceText), false);
    assert.equal(serializedEvents.includes(shadow.candidates[0].insight), false);

    const status = runtime.getStatus();
    assert.equal(status.has_synthesis_shadow, true);
    assert.equal(status.has_gate_evaluation, true);
    assert.equal(status.eligible_count, 1);
    assert.equal(status.production_gate_authority, false);
    assert.equal(status.chamber_write, false);
  }

  {
    const { runtime, fetchCalls } = makeRuntime({ isEnabled: () => false });
    const result = await runtime.handleModelShadow({ detail: { source_event_id: "src_std", source_text_hash: sourceHash } });
    assert.equal(result, null);
    assert.equal(fetchCalls.length, 0);
  }

  {
    const { runtime, fetchCalls } = makeRuntime({ hashOverride: () => "wrong_hash" });
    const result = await runtime.handleModelShadow({ detail: { source_event_id: "src_std", source_text_hash: sourceHash } });
    assert.equal(result, null);
    assert.equal(fetchCalls.length, 0);
  }

  console.log("aha-insight-synthesis-runtime-v2 passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
