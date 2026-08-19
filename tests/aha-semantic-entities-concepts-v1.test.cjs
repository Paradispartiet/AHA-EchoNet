const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const runtimeSource = fs.readFileSync("js/ahaChatIngestRuntime.js", "utf8");
const context = { window: null, console };
context.window = context;
vm.runInNewContext(runtimeSource, context, { filename: "js/ahaChatIngestRuntime.js" });

const api = context.AHASemanticDocument;
assert.ok(api);

const sourceText = [
  "Karl von Appen arbeidet med politisk økologi ved NRK.",
  "",
  "Politisk økologi undersøker makt og miljø i samfunn."
].join("\n");

const subjectMatches = [
  {
    subject_id: "sub_samfunn",
    subject_label: "Samfunnsvitenskap",
    emne_id: "emne_karl_von_appen",
    title: "Karl von Appen",
    type: "thinker",
    score: 8.2,
    matched_terms: ["Karl von Appen"],
    provenance: {
      kind: "canonical_fagverk",
      evidence_role: "reference_support_not_source_evidence",
      canonical_subject_id: "sub_samfunn",
      chapter_id: "chapter_people"
    }
  },
  {
    subject_id: "sub_samfunn",
    subject_label: "Samfunnsvitenskap",
    emne_id: "emne_politisk_okologi",
    title: "Politisk økologi",
    type: "concept",
    score: 11.4,
    matched_terms: ["politisk økologi", "økologi", "samfunn", "ressursknapphet"],
    provenance: {
      kind: "canonical_fagverk",
      evidence_role: "reference_support_not_source_evidence",
      canonical_subject_id: "sub_samfunn",
      chapter_id: "chapter_political_ecology"
    }
  }
];

async function run() {
  const base = api.buildShadowSemanticDocument({
    source_event_id: "src_entities_concepts_fixture",
    source_text: sourceText,
    source_type: "chat",
    language: "no",
    generated_at: "2026-08-19T21:30:00.000Z"
  });

  const enriched = api.applyEntitiesConcepts(base, sourceText, subjectMatches, {
    subject_engine_status: "provided_matches"
  });
  const enrichedAgain = api.applyEntitiesConcepts(base, sourceText, subjectMatches, {
    subject_engine_status: "provided_matches"
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(enriched)),
    JSON.parse(JSON.stringify(enrichedAgain)),
    "samme source + Subject Engine-matches skal gi samme entities/concepts"
  );
  assert.equal(enriched.status, "entities_concepts_shadow");
  assert.equal(enriched.quality.status, "shadow_entities_concepts_ready");
  assert.equal(enriched.quality.entity_count, 2);
  assert.equal(enriched.quality.concept_count, 1);
  assert.equal(enriched.quality.canonical_subject_match_count, 2);
  assert.equal(enriched.claims.length, 0);
  assert.equal(enriched.relations.length, 0);
  assert.equal(enriched.tensions.length, 0);
  assert.equal(enriched.candidate_insights.length, 0, "Phase 1B skal ikke syntetisere canonical insights");

  const person = enriched.entities.find((item) => item.normalized_key === "karl von appen");
  assert.ok(person, "kilden skal gi entity for Karl von Appen");
  assert.equal(person.type, "person", "Subject Engine thinker-support skal klassifisere personen");
  assert.equal(person.canonical_matches.length, 1);
  assert.equal(person.canonical_matches[0].provenance.evidence_role, "reference_support_not_source_evidence");
  assert.equal(person.mentions.length, 1);
  assert.equal(sourceText.slice(person.mentions[0].start_offset, person.mentions[0].end_offset), person.mentions[0].text);

  const organization = enriched.entities.find((item) => item.normalized_key === "nrk");
  assert.ok(organization, "akronym i source skal kunne materialiseres som entity");
  assert.equal(organization.type, "organization");
  assert.equal(organization.canonical_matches.length, 0, "source entity trenger ikke oppdiktet canonical støtte");

  const concept = enriched.concepts.find((item) => item.normalized_key === "politisk økologi");
  assert.ok(concept, "canonical flerordsbegrep som faktisk finnes i source skal materialiseres");
  assert.equal(concept.mentions.length, 2, "gjentatt begrep skal samles som ett concept med flere source-mentions");
  assert.equal(concept.evidence_anchor_ids.length, 2);
  assert.equal(concept.canonical_matches.length, 1);
  assert.equal(concept.canonical_matches[0].subject_id, "sub_samfunn");
  concept.mentions.forEach((mention) => {
    assert.equal(sourceText.slice(mention.start_offset, mention.end_offset), mention.text);
  });

  assert.equal(enriched.concepts.some((item) => item.normalized_key === "økologi"), false, "svak single-token-del av et rikere phrase concept skal ikke dupliseres");
  assert.equal(enriched.concepts.some((item) => item.normalized_key === "samfunn"), false, "generisk Subject Engine-term skal ikke bli concept");
  assert.equal(enriched.concepts.some((item) => item.normalized_key === "ressursknapphet"), false, "canonical term uten literal source-evidence skal ikke bli concept");
  assert.equal(enriched.concepts.some((item) => item.normalized_key === "karl von appen"), false, "entity skal ikke samtidig bli concept");

  const validation = api.validateSemanticDocument(enriched, sourceText);
  assert.equal(validation.ok, true, validation.errors.join(", "));

  const tampered = JSON.parse(JSON.stringify(enriched));
  tampered.concepts[0].mentions[0].text = "ikke source";
  const tamperedValidation = api.validateSemanticDocument(tampered, sourceText);
  assert.equal(tamperedValidation.ok, false);
  assert.ok(tamperedValidation.errors.includes("concept_mention_not_exact_source_slice:0:0"));

  const unsupported = JSON.parse(JSON.stringify(enriched));
  unsupported.concepts[0].canonical_matches = [];
  const unsupportedValidation = api.validateSemanticDocument(unsupported, sourceText);
  assert.equal(unsupportedValidation.ok, false);
  assert.ok(unsupportedValidation.errors.includes("concept_without_reference_support:0"));

  const viaEngine = await api.buildEnrichedShadowSemanticDocument({
    source_event_id: "src_entities_concepts_engine",
    source_text: sourceText,
    source_type: "chat",
    language: "no",
    generated_at: "2026-08-19T21:31:00.000Z"
  }, {
    subjectEngine: {
      async matchText(text, options) {
        assert.equal(text, sourceText);
        assert.equal(options.source, "semantic_document_shadow");
        assert.equal(options.maxResults, 6);
        return subjectMatches;
      }
    }
  });
  assert.equal(viaEngine.entities.length, 2);
  assert.equal(viaEngine.concepts.length, 1);
  assert.equal(viaEngine.quality.subject_engine_status, "matched");

  const originalWarn = console.warn;
  console.warn = () => {};
  const failedEngine = await api.buildEnrichedShadowSemanticDocument({
    source_event_id: "src_entities_concepts_failure",
    source_text: sourceText,
    source_type: "chat",
    language: "no",
    generated_at: "2026-08-19T21:32:00.000Z"
  }, {
    subjectEngine: {
      async matchText() {
        throw new Error("subject_engine_fixture_failure");
      }
    }
  });
  console.warn = originalWarn;
  assert.equal(failedEngine.quality.subject_engine_status, "failed");
  assert.equal(failedEngine.concepts.length, 0, "Subject Engine-feil skal ikke finne på concepts uten canonical support");
  assert.ok(failedEngine.entities.some((item) => item.normalized_key === "karl von appen"), "source-grounded entity extraction kan fortsatt fungere uten Subject Engine");
  assert.equal(api.validateSemanticDocument(failedEngine, sourceText).ok, true);

  console.log("aha-semantic-entities-concepts-v1 passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
