const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaSemanticModelShadowBridge.js", "utf8");
const context = { window: null, console };
context.window = context;
vm.runInNewContext(source, context, { filename: "js/ahaSemanticModelShadowBridge.js" });

const bridgeApi = context.AHASemanticModelShadowBridge;
assert.ok(bridgeApi);
assert.equal(bridgeApi.SCHEMA, "aha_semantic_model_shadow_v1");
assert.equal(bridgeApi.VERSION, 1);

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeFixture(suffix = "a") {
  const sourceText = suffix === "b"
    ? "Hannah Arendt skrev om offentlighet og handling.\n\nOffentlighet gjør politisk handling synlig."
    : "Karl von Appen arbeidet med politisk økologi ved NRK.\n\nPolitisk økologi undersøker makt og miljø i samfunn.";
  const sourceHash = crypto.createHash("sha256").update(sourceText, "utf8").digest("hex");
  const split = sourceText.indexOf("\n\n");
  const anchors = [
    { id: `ev_${suffix}_1`, index: 0, start_offset: 0, end_offset: split, text: sourceText.slice(0, split) },
    { id: `ev_${suffix}_2`, index: 1, start_offset: split + 2, end_offset: sourceText.length, text: sourceText.slice(split + 2) }
  ];

  if (suffix === "b") {
    const personText = "Hannah Arendt";
    const conceptText = "offentlighet";
    const claimText = "Offentlighet gjør politisk handling synlig.";
    const personStart = sourceText.indexOf(personText);
    const conceptStart = sourceText.toLowerCase().indexOf(conceptText);
    const claimStart = sourceText.indexOf(claimText);
    return {
      sourceText,
      sourceHash,
      sourceEvent: { id: "src_bridge_b", source_type: "chat", text: sourceText },
      doc: {
        id: `sem_${sourceHash.slice(0, 24)}`,
        source_event_id: "src_bridge_b",
        source_text_hash: sourceHash,
        source_type: "chat",
        language: "no",
        evidence_anchors: anchors,
        entities: [{
          id: "ent_b_1", label: personText, normalized_key: normalizeKey(personText),
          mentions: [{ anchor_id: anchors[0].id, start_offset: personStart, end_offset: personStart + personText.length, text: personText }]
        }],
        concepts: [{
          id: "con_b_1", label: conceptText, normalized_key: normalizeKey(conceptText),
          mentions: [{ anchor_id: anchors[0].id, start_offset: conceptStart, end_offset: conceptStart + conceptText.length, text: sourceText.slice(conceptStart, conceptStart + conceptText.length) }]
        }],
        claims: [{ id: "clm_b_1", text: claimText, normalized_key: normalizeKey(claimText) }],
        relations: []
      },
      envelope: {
        ok: true,
        schema: "aha_semantic_model_contract_v1",
        model: "gpt-semantic-b",
        response_id: "resp_bridge_b",
        policy: {
          source_text_returned: false,
          canonical_write: false,
          persistent_write: false,
          meta_write: false,
          synthesis_allowed: false
        },
        analysis: {
          schema: "aha_semantic_model_output_v1",
          entities: [{
            source_surface: personText,
            canonical_label: personText,
            entity_type: "person",
            evidence_quotes: [sourceText.slice(0, split)],
            confidence: "high"
          }],
          concepts: [{
            source_surface: "Offentlighet",
            canonical_label: "Offentlighet",
            evidence_quotes: [claimText],
            confidence: "high"
          }],
          propositions: [{
            kind: "source_claim",
            text: claimText,
            evidence_quotes: [claimText],
            confidence: "high"
          }],
          relations: [],
          unresolved_inferences: []
        }
      }
    };
  }

  const personText = "Karl von Appen";
  const orgText = "NRK";
  const conceptText = "politisk økologi";
  const firstClaim = sourceText.slice(0, split);
  const secondClaim = sourceText.slice(split + 2);
  const personStart = sourceText.indexOf(personText);
  const orgStart = sourceText.indexOf(orgText);
  const conceptFirst = sourceText.indexOf(conceptText);
  const conceptSecond = sourceText.toLowerCase().indexOf(conceptText, conceptFirst + 1);

  return {
    sourceText,
    sourceHash,
    sourceEvent: { id: "src_bridge_a", source_type: "chat", text: sourceText },
    doc: {
      id: `sem_${sourceHash.slice(0, 24)}`,
      source_event_id: "src_bridge_a",
      source_text_hash: sourceHash,
      source_type: "chat",
      language: "no",
      evidence_anchors: anchors,
      entities: [
        {
          id: "ent_a_1", label: personText, normalized_key: normalizeKey(personText),
          mentions: [{ anchor_id: anchors[0].id, start_offset: personStart, end_offset: personStart + personText.length, text: personText }]
        },
        {
          id: "ent_a_2", label: orgText, normalized_key: normalizeKey(orgText),
          mentions: [{ anchor_id: anchors[0].id, start_offset: orgStart, end_offset: orgStart + orgText.length, text: orgText }]
        }
      ],
      concepts: [{
        id: "con_a_1", label: conceptText, normalized_key: normalizeKey(conceptText),
        mentions: [
          { anchor_id: anchors[0].id, start_offset: conceptFirst, end_offset: conceptFirst + conceptText.length, text: sourceText.slice(conceptFirst, conceptFirst + conceptText.length) },
          { anchor_id: anchors[1].id, start_offset: conceptSecond, end_offset: conceptSecond + conceptText.length, text: sourceText.slice(conceptSecond, conceptSecond + conceptText.length) }
        ]
      }],
      claims: [
        { id: "clm_a_1", text: firstClaim, normalized_key: normalizeKey(firstClaim) },
        { id: "clm_a_2", text: secondClaim, normalized_key: normalizeKey(secondClaim) }
      ],
      relations: [{}, {}, {}, {}]
    },
    envelope: {
      ok: true,
      schema: "aha_semantic_model_contract_v1",
      model: "gpt-semantic-a",
      response_id: "resp_bridge_a",
      policy: {
        source_text_returned: false,
        canonical_write: false,
        persistent_write: false,
        meta_write: false,
        synthesis_allowed: false
      },
      analysis: {
        schema: "aha_semantic_model_output_v1",
        entities: [
          {
            source_surface: personText,
            canonical_label: personText,
            entity_type: "person",
            evidence_quotes: [firstClaim],
            confidence: "high"
          },
          {
            source_surface: orgText,
            canonical_label: orgText,
            entity_type: "organization",
            evidence_quotes: ["NRK"],
            confidence: "high"
          }
        ],
        concepts: [{
          source_surface: conceptText,
          canonical_label: "Politisk økologi",
          evidence_quotes: [secondClaim],
          confidence: "high"
        }],
        propositions: [
          {
            kind: "source_claim",
            text: secondClaim,
            evidence_quotes: [secondClaim],
            confidence: "high"
          },
          {
            kind: "interpretation",
            text: "Teksten setter politisk økologi i forbindelse med maktforhold.",
            evidence_quotes: ["makt og miljø"],
            confidence: "medium"
          },
          {
            kind: "inference",
            text: "NRK kan være en institusjonell kontekst for arbeidet.",
            evidence_quotes: ["NRK"],
            confidence: "low"
          }
        ],
        relations: [{
          relation_type: "influences",
          from_label: "makt",
          to_label: "miljø",
          epistemic_status: "interpretation",
          evidence_quotes: ["makt og miljø"],
          confidence: "medium"
        }],
        unresolved_inferences: [{
          text: "Det er uavklart hvilken rolle NRK hadde.",
          evidence_quotes: ["NRK"],
          confidence: "low"
        }]
      }
    }
  };
}

function createRuntime(fixture, options = {}) {
  const fetchCalls = [];
  const events = [];
  const semanticApi = {
    getLastShadowSemanticDocument: () => options.getCurrentDoc ? options.getCurrentDoc() : fixture.doc,
    sha256Hex: (text) => options.hashOverride ? options.hashOverride(text) : crypto.createHash("sha256").update(text, "utf8").digest("hex"),
    normalizeSemanticKey: normalizeKey
  };
  const sourcesApi = {
    loadSourceEvents: () => options.getSourceEvents ? options.getSourceEvents() : [fixture.sourceEvent]
  };
  const runtime = bridgeApi.create({
    getSourcesApi: () => sourcesApi,
    getSemanticDocumentApi: () => semanticApi,
    getAgentUrl: () => "https://agent.example/api/aha-agent/semantic-document",
    fetchImpl: options.fetchImpl || (async (url, init) => {
      fetchCalls.push({ url, init });
      return { ok: true, json: async () => structuredClone(fixture.envelope) };
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
  const fixture = makeFixture("a");

  {
    const { runtime, fetchCalls, events } = createRuntime(fixture);
    const shadow = await runtime.handleSemanticDocumentShadow({
      detail: { source_event_id: fixture.doc.source_event_id, source_text_hash: fixture.sourceHash }
    });
    assert.ok(shadow);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://agent.example/api/aha-agent/semantic-document");
    const requestBody = JSON.parse(fetchCalls[0].init.body);
    assert.equal(requestBody.text, fixture.sourceText);
    assert.equal(requestBody.format, "aha_semantic_model_output_v1");
    assert.deepEqual(requestBody.context, {
      source_event_id: "src_bridge_a",
      source_type: "chat",
      language: "no"
    });
    assert.equal(Object.prototype.hasOwnProperty.call(requestBody.context, "ai_state"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(requestBody.context, "assistant_reply"), false);

    assert.equal(shadow.schema, "aha_semantic_model_shadow_v1");
    assert.equal(shadow.source_event_id, "src_bridge_a");
    assert.equal(shadow.source_text_hash, fixture.sourceHash);
    assert.equal(shadow.model, "gpt-semantic-a");
    assert.equal(shadow.entities.length, 2);
    assert.equal(shadow.concepts.length, 1);
    assert.equal(shadow.propositions.length, 3);
    assert.equal(shadow.relations.length, 1);
    assert.equal(shadow.unresolved_inferences.length, 1);
    assert.equal(shadow.comparison.entity_overlap_count, 2);
    assert.equal(shadow.comparison.concept_overlap_count, 1);
    assert.equal(shadow.comparison.source_claim_overlap_count, 1);
    assert.equal(shadow.comparison.interpretation_count, 1);
    assert.equal(shadow.comparison.inference_count, 1);
    assert.equal(shadow.comparison.semantic_relation_count, 1);
    assert.equal(shadow.comparison.unresolved_inference_count, 1);
    assert.equal(shadow.policy.canonical_write, false);
    assert.equal(shadow.policy.persistent_write, false);
    assert.equal(shadow.policy.meta_write, false);
    assert.equal(shadow.policy.visible_output_changed, false);
    assert.equal(shadow.policy.synthesis_allowed, false);
    assert.equal(shadow.policy.source_text_stored, false);
    assert.equal(Object.prototype.hasOwnProperty.call(shadow, "source_text"), false);

    const everySpan = [];
    shadow.entities.forEach((item) => {
      everySpan.push(...item.source_surface_spans);
      item.evidence.forEach((evidence) => everySpan.push(...evidence.spans));
    });
    shadow.concepts.forEach((item) => {
      everySpan.push(...item.source_surface_spans);
      item.evidence.forEach((evidence) => everySpan.push(...evidence.spans));
    });
    shadow.propositions.forEach((item) => {
      item.evidence.forEach((evidence) => everySpan.push(...evidence.spans));
      if (item.source_claim_spans) everySpan.push(...item.source_claim_spans);
    });
    shadow.relations.forEach((item) => item.evidence.forEach((evidence) => everySpan.push(...evidence.spans)));
    shadow.unresolved_inferences.forEach((item) => item.evidence.forEach((evidence) => everySpan.push(...evidence.spans)));
    everySpan.forEach((span) => {
      assert.equal(fixture.sourceText.slice(span.start_offset, span.end_offset), span.text);
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].type, "aha:semantic-model-shadow");
    assert.equal(events[0].detail.source_event_id, "src_bridge_a");
    assert.equal(events[0].detail.entity_count, 2);
    assert.equal(events[0].detail.synthesis_allowed, false);
    assert.equal(JSON.stringify(events[0].detail).includes(fixture.sourceText), false, "metadata-event skal ikke inneholde full source");
    assert.equal(Object.prototype.hasOwnProperty.call(events[0].detail, "analysis"), false);

    const readBack = runtime.getLastModelShadow();
    readBack.entities[0].canonical_label = "mutert kopi";
    assert.notEqual(runtime.getLastModelShadow().entities[0].canonical_label, "mutert kopi", "bridge skal returnere defensive kopier");
    runtime.clearLastModelShadow();
    assert.equal(runtime.getLastModelShadow(), null);
  }

  {
    let fetchCount = 0;
    const { runtime } = createRuntime(fixture, {
      isEnabled: () => false,
      fetchImpl: async () => { fetchCount += 1; throw new Error("should not fetch"); }
    });
    const result = await runtime.handleSemanticDocumentShadow({
      source_event_id: fixture.doc.source_event_id,
      source_text_hash: fixture.sourceHash
    });
    assert.equal(result, null);
    assert.equal(fetchCount, 0, "disabled shadow bridge skal ikke gjøre nettverkskall");
    assert.equal(runtime.getStatus().enabled, false);
  }

  {
    let fetchCount = 0;
    const { runtime } = createRuntime(fixture, {
      hashOverride: () => "0".repeat(64),
      fetchImpl: async () => { fetchCount += 1; throw new Error("should not fetch"); }
    });
    const result = await runtime.handleSemanticDocumentShadow({
      source_event_id: fixture.doc.source_event_id,
      source_text_hash: fixture.sourceHash
    });
    assert.equal(result, null);
    assert.equal(fetchCount, 0, "source hash mismatch skal stoppe før endpoint-kall");
  }

  {
    const unsafe = structuredClone(fixture.envelope);
    unsafe.policy.synthesis_allowed = true;
    const { runtime } = createRuntime(fixture, {
      fetchImpl: async () => ({ ok: true, json: async () => unsafe })
    });
    const result = await runtime.handleSemanticDocumentShadow({
      source_event_id: fixture.doc.source_event_id,
      source_text_hash: fixture.sourceHash
    });
    assert.equal(result, null);
    assert.equal(runtime.getLastModelShadow(), null, "unsafe endpoint policy skal aldri lagres");
  }

  {
    const badEvidence = structuredClone(fixture.envelope);
    badEvidence.analysis.propositions[1].evidence_quotes = ["Dette finnes ikke i source."];
    const originalWarn = console.warn;
    console.warn = () => {};
    const { runtime } = createRuntime(fixture, {
      fetchImpl: async () => ({ ok: true, json: async () => badEvidence })
    });
    const result = await runtime.handleSemanticDocumentShadow({
      source_event_id: fixture.doc.source_event_id,
      source_text_hash: fixture.sourceHash
    });
    console.warn = originalWarn;
    assert.equal(result, null);
    assert.equal(runtime.getLastModelShadow(), null, "browser-side evidence mapping skal fail-closed");
  }

  {
    const fixtureB = makeFixture("b");
    let currentDoc = fixture.doc;
    const sourceEvents = [fixture.sourceEvent, fixtureB.sourceEvent];
    let resolveFirst;
    let call = 0;
    const firstPromise = new Promise((resolve) => { resolveFirst = resolve; });
    const { runtime } = createRuntime(fixture, {
      getCurrentDoc: () => currentDoc,
      getSourceEvents: () => sourceEvents,
      fetchImpl: async () => {
        call += 1;
        if (call === 1) {
          await firstPromise;
          return { ok: true, json: async () => structuredClone(fixture.envelope) };
        }
        return { ok: true, json: async () => structuredClone(fixtureB.envelope) };
      }
    });

    const firstRun = runtime.handleSemanticDocumentShadow({
      source_event_id: fixture.doc.source_event_id,
      source_text_hash: fixture.sourceHash
    });
    await new Promise((resolve) => setImmediate(resolve));
    currentDoc = fixtureB.doc;
    const secondRun = await runtime.handleSemanticDocumentShadow({
      source_event_id: fixtureB.doc.source_event_id,
      source_text_hash: fixtureB.sourceHash
    });
    assert.ok(secondRun);
    assert.equal(secondRun.source_event_id, "src_bridge_b");
    resolveFirst();
    const staleResult = await firstRun;
    assert.equal(staleResult, null, "eldre async completion skal forkastes");
    assert.equal(runtime.getLastModelShadow().source_event_id, "src_bridge_b", "eldre completion skal ikke overskrive nyere shadow");
  }

  console.log("aha-semantic-model-shadow-bridge-v1 passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
