const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaChatIngestRuntime.js", "utf8");
const context = { window: null, console };
context.window = context;
vm.runInNewContext(source, context, { filename: "js/ahaChatIngestRuntime.js" });

function makeEngine() {
  return {
    createSignalFromMessage(text, subjectId, themeId, meta) {
      return { text, subjectId, themeId, meta };
    },
    addSignalToChamber(chamber, signal) {
      return { ...chamber, signals: [...(chamber.signals || []), signal] };
    }
  };
}

{
  context.AHASemanticDocument.clearLastShadowSemanticDocument();
  const calls = [];
  const ingest = {
    ingest() {},
    ingestWithCandidates(payload, candidates) {
      calls.push({ payload, candidates });
      return {
        ok: true,
        sourceEvent: {
          id: "src_shadow_1",
          source_type: payload.source_type,
          source_app: payload.source_app,
          text: payload.text
        },
        items: candidates.map((candidate, index) => ({ candidate, index }))
      };
    }
  };
  const runtime = context.AHAChatIngestRuntime.create({
    subjectId: "sub_laring",
    getInsightsApi: () => makeEngine(),
    getIngestApi: () => ingest,
    getSourcesApi: () => null,
    getThemeId: () => "theme_shadow",
    getFieldId: () => "field_shadow",
    buildSemanticInsightCandidates: () => [{ text: "Kandidat én" }, { text: "Kandidat to" }],
    generateAIInsightCandidates: async () => [],
    buildAIState: () => ({}),
    loadChamber: () => ({ signals: [] }),
    saveChamber: () => {},
    now: () => "2026-08-19T21:12:00.000Z"
  });

  const count = runtime.handleUserMessage("Første avsnitt.\n\nAndre avsnitt.");
  assert.equal(count, 2, "eksisterende returkontrakt skal være uendret");
  assert.equal(calls.length, 1, "canonical ingest skal fortsatt kalles nøyaktig én gang");

  const shadow = context.AHASemanticDocument.getLastShadowSemanticDocument();
  assert.ok(shadow, "canonical chat ingest skal materialisere ett shadow-dokument");
  assert.equal(shadow.source_event_id, "src_shadow_1");
  assert.equal(shadow.source_type, "chat");
  assert.equal(shadow.language, "no");
  assert.equal(shadow.evidence_anchors.length, 2);
  assert.equal(shadow.entities.length, 0);
  assert.equal(shadow.candidate_insights.length, 0, "PR1 skal ikke kopiere dagens candidates inn i SemanticDocument");
  assert.equal(shadow.provenance.canonical_write, false);
}

{
  const canonicalCalls = [];
  const warnings = [];
  const originalWarn = context.console.warn;
  context.console.warn = (...args) => warnings.push(args);
  const brokenSemanticApi = {
    buildShadowSemanticDocument() {
      throw new Error("shadow_builder_failed");
    },
    recordShadowSemanticDocument() {
      throw new Error("should_not_reach_recorder");
    }
  };
  const runtime = context.AHAChatIngestRuntime.create({
    subjectId: "sub_laring",
    getInsightsApi: () => makeEngine(),
    getIngestApi: () => ({
      ingest() {},
      ingestWithCandidates(payload, candidates) {
        canonicalCalls.push({ payload, candidates });
        return { ok: true, sourceEvent: { id: "src_shadow_failure", source_type: "chat" }, items: [] };
      }
    }),
    getSourcesApi: () => null,
    getThemeId: () => "theme_shadow",
    getFieldId: () => "field_shadow",
    buildSemanticInsightCandidates: () => [{ text: "Kandidat" }],
    generateAIInsightCandidates: async () => [],
    buildAIState: () => ({}),
    loadChamber: () => ({ signals: [] }),
    saveChamber: () => {},
    getSemanticDocumentApi: () => brokenSemanticApi,
    now: () => "2026-08-19T21:13:00.000Z"
  });

  const count = runtime.handleUserMessage("Shadow-feil skal ikke stoppe canonical ingest.");
  assert.equal(count, 1);
  assert.equal(canonicalCalls.length, 1, "PR1 shadow-feil skal ikke stoppe dagens canonical ingest");
  assert.ok(warnings.some((entry) => String(entry[0]).includes("SemanticDocument shadow failed")));
  context.console.warn = originalWarn;
}

{
  let built = 0;
  let recorded = 0;
  const runtime = context.AHAChatIngestRuntime.create({
    subjectId: "sub_laring",
    getInsightsApi: () => makeEngine(),
    getIngestApi: () => null,
    getSourcesApi: () => ({
      addSourceEvent(payload) {
        return { id: "src_legacy_shadow", source_type: payload.source_type, text: payload.text };
      }
    }),
    getThemeId: () => "theme_shadow",
    getFieldId: () => "field_shadow",
    buildSemanticInsightCandidates: () => [{ text: "Kandidat" }],
    generateAIInsightCandidates: async () => [],
    buildAIState: () => ({}),
    loadChamber: () => ({ signals: [] }),
    saveChamber: () => {},
    getSemanticDocumentApi: () => ({
      buildShadowSemanticDocument(input) {
        built += 1;
        return { input };
      },
      validateSemanticDocument() {
        return { ok: true, errors: [] };
      },
      recordShadowSemanticDocument(document) {
        recorded += 1;
        return document;
      }
    }),
    now: () => "2026-08-19T21:14:00.000Z"
  });

  const count = runtime.handleUserMessage("Legacy fallback får også ett shadow-dokument.");
  assert.equal(count, 1);
  assert.equal(built, 1, "shadow-dokumentet skal bygges én gang per source event, ikke én gang per candidate");
  assert.equal(recorded, 1);
}

console.log("aha-chat-semantic-document-shadow-v1 passed");
