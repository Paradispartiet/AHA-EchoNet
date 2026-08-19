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
  "Politisk økologi undersøker makt og miljø i samfunn.",
  "Hva betyr dette?",
  "Kort fragment.",
  "",
  "Dette avsnittet har en lengre eksplisitt påstand uten et canonical begrep."
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
    matched_terms: ["politisk økologi", "økologi", "samfunn"],
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
    source_event_id: "src_claims_relations_fixture",
    source_text: sourceText,
    source_type: "chat",
    language: "no",
    generated_at: "2026-08-19T21:45:00.000Z"
  });
  const semantic = api.applyEntitiesConcepts(base, sourceText, subjectMatches, {
    subject_engine_status: "provided_matches"
  });
  const enriched = api.applyClaimsRelations(semantic, sourceText);
  const enrichedAgain = api.applyClaimsRelations(semantic, sourceText);

  assert.deepEqual(
    JSON.parse(JSON.stringify(enriched)),
    JSON.parse(JSON.stringify(enrichedAgain)),
    "samme source og semantisk grunnlag skal gi deterministiske claims/relations"
  );
  assert.equal(enriched.status, "claims_relations_shadow");
  assert.equal(enriched.quality.status, "shadow_claims_relations_ready");
  assert.equal(enriched.quality.claim_count, 3, "to faglige setninger + én lengre source-påstand skal bli claims");
  assert.equal(enriched.quality.relation_count, 4, "relasjoner skal bare følge entity/concept mentions i samme claim");
  assert.equal(enriched.quality.semantic_quality_gate.stage, "claims_relations_shadow");
  assert.equal(enriched.quality.semantic_quality_gate.source_grounded, true);
  assert.equal(enriched.quality.semantic_quality_gate.structural_relations_only, true);
  assert.equal(enriched.quality.semantic_quality_gate.interpretation_count, 0);
  assert.equal(enriched.quality.semantic_quality_gate.unresolved_inference_count, 0);
  assert.equal(enriched.quality.semantic_quality_gate.synthesis_allowed, false);
  assert.ok(enriched.quality.semantic_quality_gate.blocking_reasons.includes("dedicated_semantic_model_not_authoritative"));
  assert.equal(enriched.tensions.length, 0);
  assert.equal(enriched.candidate_insights.length, 0, "Phase 1C skal fortsatt ikke opprette synthesized Insights");

  assert.equal(enriched.claims.some((claim) => claim.text.includes("Hva betyr dette?")), false, "spørsmål skal ikke bli source claims");
  assert.equal(enriched.claims.some((claim) => claim.text === "Kort fragment."), false, "korte fragmenter skal ikke bli source claims");
  enriched.claims.forEach((claim) => {
    assert.equal(claim.kind, "source_claim");
    assert.equal(claim.epistemic_status, "source_explicit");
    assert.equal(claim.interpretation_status, "not_interpreted");
    assert.equal(claim.spans.length, 1);
    const span = claim.spans[0];
    assert.equal(sourceText.slice(span.start_offset, span.end_offset), claim.text);
    assert.equal(span.text, claim.text);
  });

  const firstClaim = enriched.claims.find((claim) => claim.text.startsWith("Karl von Appen"));
  assert.ok(firstClaim);
  assert.equal(firstClaim.mentioned_entity_ids.length, 2, "Karl von Appen og NRK skal bindes strukturelt til første claim");
  assert.equal(firstClaim.mentioned_concept_ids.length, 1, "politisk økologi skal bindes strukturelt til første claim");

  const secondClaim = enriched.claims.find((claim) => claim.text.startsWith("Politisk økologi undersøker"));
  assert.ok(secondClaim);
  assert.equal(secondClaim.mentioned_entity_ids.length, 0);
  assert.equal(secondClaim.mentioned_concept_ids.length, 1);

  const lastClaim = enriched.claims.find((claim) => claim.text.startsWith("Dette avsnittet"));
  assert.ok(lastClaim);
  assert.equal(lastClaim.mentioned_entity_ids.length, 0);
  assert.equal(lastClaim.mentioned_concept_ids.length, 0);
  assert.equal(enriched.relations.some((relation) => relation.from_id === lastClaim.id), false, "claim uten semantiske mentions skal ikke få oppdiktede relasjoner");

  const allowedTypes = new Set(["claim_mentions_entity", "claim_mentions_concept"]);
  enriched.relations.forEach((relation) => {
    assert.ok(allowedTypes.has(relation.type));
    assert.equal(relation.epistemic_status, "source_structural");
    assert.equal(relation.source, "co_occurrence_within_source_claim");
    assert.ok(relation.evidence_spans.length >= 2);
    relation.evidence_spans.forEach((span) => {
      assert.equal(sourceText.slice(span.start_offset, span.end_offset), span.text);
    });
  });
  assert.equal(enriched.relations.some((relation) => ["causes", "supports", "contradicts"].includes(relation.type)), false);

  const validation = api.validateSemanticDocument(enriched, sourceText);
  assert.equal(validation.ok, true, validation.errors.join(", "));

  const tamperedClaim = JSON.parse(JSON.stringify(enriched));
  tamperedClaim.claims[0].spans[0].text = "ikke source";
  const tamperedClaimValidation = api.validateSemanticDocument(tamperedClaim, sourceText);
  assert.equal(tamperedClaimValidation.ok, false);
  assert.ok(tamperedClaimValidation.errors.includes("claim_span:0:0_not_exact_source_slice"));

  const causalRelation = JSON.parse(JSON.stringify(enriched));
  causalRelation.relations[0].type = "causes";
  const causalValidation = api.validateSemanticDocument(causalRelation, sourceText);
  assert.equal(causalValidation.ok, false);
  assert.ok(causalValidation.errors.includes("invalid_relation_type:0"), "kausal relasjon skal være eksplisitt forbudt i Phase 1C");

  const wrongTarget = JSON.parse(JSON.stringify(enriched));
  wrongTarget.relations[0].to_id = "con_missing";
  const targetValidation = api.validateSemanticDocument(wrongTarget, sourceText);
  assert.equal(targetValidation.ok, false);
  assert.ok(targetValidation.errors.includes("unknown_relation_target:0"));

  const candidateLeak = JSON.parse(JSON.stringify(enriched));
  candidateLeak.candidate_insights.push({ text: "for tidlig syntese" });
  const candidateValidation = api.validateSemanticDocument(candidateLeak, sourceText);
  assert.equal(candidateValidation.ok, false);
  assert.ok(candidateValidation.errors.includes("shadow_semantic_array_not_empty:candidate_insights"));

  const viaEngine = await api.buildEnrichedShadowSemanticDocument({
    source_event_id: "src_claims_relations_engine",
    source_text: sourceText,
    source_type: "chat",
    language: "no",
    generated_at: "2026-08-19T21:46:00.000Z"
  }, { subjectMatches });
  assert.equal(viaEngine.claims.length, 3);
  assert.equal(viaEngine.relations.length, 4);
  assert.equal(viaEngine.candidate_insights.length, 0);
  assert.equal(api.validateSemanticDocument(viaEngine, sourceText).ok, true);

  console.log("aha-semantic-claims-relations-v1 passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
