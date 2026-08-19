const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaChatIngestRuntime.js", "utf8");
const events = [];
const context = {
  window: null,
  console,
  CustomEvent: function CustomEvent(type, init) {
    this.type = type;
    this.detail = init?.detail;
  },
  dispatchEvent(event) {
    events.push(event);
    return true;
  }
};
context.window = context;
vm.runInNewContext(source, context, { filename: "js/ahaChatIngestRuntime.js" });

const api = context.AHASemanticDocument;
assert.ok(api, "AHASemanticDocument skal eksponeres");
assert.equal(api.SCHEMA, "aha_semantic_document_v1");
assert.equal(api.VERSION, 1);

const sourceText = [
  "Karl von Appen arbeidet med scenografi og form.",
  "Han var opptatt av forholdet mellom rammer og frihet.",
  "",
  "Et annet avsnitt undersøker hvordan gitte forutsetninger kan åpne for variasjon.",
  "Dette er kildebelegg, ikke automatisk en ferdig innsikt."
].join("\n");
const expectedHash = crypto.createHash("sha256").update(sourceText, "utf8").digest("hex");

assert.equal(api.sha256Hex(sourceText), expectedHash, "source_text_hash skal være ekte SHA-256 også for norsk/unicode tekst");

const first = api.buildShadowSemanticDocument({
  source_event_id: "src_fixture_1",
  source_text: sourceText,
  source_type: "chat",
  language: "no",
  generated_at: "2026-08-19T21:10:00.000Z"
});
const second = api.buildShadowSemanticDocument({
  source_event_id: "src_fixture_1",
  source_text: sourceText,
  source_type: "chat",
  language: "no",
  generated_at: "2026-08-19T21:10:00.000Z"
});

assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)), "samme kilde og metadata skal gi deterministisk shadow-dokument");
assert.equal(first.source_text_hash, expectedHash);
assert.equal(first.source_text_hash_algorithm, "sha256");
assert.equal(first.mode, "shadow");
assert.equal(first.status, "evidence_only");
assert.equal(first.source_event_id, "src_fixture_1");
assert.equal(first.evidence_anchors.length, 2, "blanklinje skal gi to stabile avsnittsankre");
assert.equal(first.quality.source_coverage_non_whitespace, 1);

for (const anchor of first.evidence_anchors) {
  assert.equal(
    sourceText.slice(anchor.start_offset, anchor.end_offset),
    anchor.text,
    "hvert evidence anchor skal være en eksakt source slice"
  );
}
assert.equal(new Set(first.evidence_anchors.map((anchor) => anchor.id)).size, first.evidence_anchors.length, "anchor-id-er skal være unike");
assert.deepEqual(Array.from(first.entities), []);
assert.deepEqual(Array.from(first.concepts), []);
assert.deepEqual(Array.from(first.claims), []);
assert.deepEqual(Array.from(first.relations), []);
assert.deepEqual(Array.from(first.tensions), []);
assert.deepEqual(Array.from(first.candidate_insights), []);
assert.equal(first.provenance.canonical_write, false);
assert.equal(first.provenance.persistent_write, false);
assert.equal(first.provenance.visible_output_changed, false);

const valid = api.validateSemanticDocument(first, sourceText);
assert.equal(valid.ok, true, valid.errors.join(", "));

const tampered = JSON.parse(JSON.stringify(first));
tampered.evidence_anchors[0].text += " manipulert";
const tamperedValidation = api.validateSemanticDocument(tampered, sourceText);
assert.equal(tamperedValidation.ok, false);
assert.ok(tamperedValidation.errors.includes("anchor_not_exact_source_slice:0"));

const responseDependent = JSON.parse(JSON.stringify(first));
responseDependent.provenance.assistantReply = "Dette skal aldri inn i canonical semantic input";
const responseValidation = api.validateSemanticDocument(responseDependent, sourceText);
assert.equal(responseValidation.ok, false);
assert.ok(responseValidation.errors.includes("forbidden_chat_response_dependency"));

api.clearLastShadowSemanticDocument();
assert.equal(api.getLastShadowSemanticDocument(), null);
const recorded = api.recordShadowSemanticDocument(first);
assert.equal(recorded.source_text_hash, expectedHash);
assert.equal(events.length, 1);
assert.equal(events[0].type, "aha:semantic-document-shadow");
assert.equal(events[0].detail.source_text_hash, expectedHash);
assert.equal(events[0].detail.evidence_anchor_count, 2);
assert.equal(Object.prototype.hasOwnProperty.call(events[0].detail, "text"), false, "shadow-eventet skal ikke eksponere rå kildetekst");

const readBack = api.getLastShadowSemanticDocument();
readBack.evidence_anchors[0].text = "mutert kopi";
assert.notEqual(api.getLastShadowSemanticDocument().evidence_anchors[0].text, "mutert kopi", "shadow-recorder skal returnere defensive kopier");

assert.equal(Object.prototype.hasOwnProperty.call(first, "assistantReply"), false);
assert.equal(Object.prototype.hasOwnProperty.call(first, "chat_response"), false);

console.log("aha-semantic-document-v1 passed");
