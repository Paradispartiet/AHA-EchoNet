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

function makeInsight(id, insight, concepts) {
  return {
    id,
    source_event_id: `source_${id}`,
    source_text_hash: "a".repeat(64),
    semantic_concepts: concepts,
    candidate: {
      insight,
      type: "principle",
      causal_status: "not_causal",
      evidence: [
        { quote: `Første dokumenterte belegg for ${id}.`, role: "supports" },
        { quote: `Andre dokumenterte belegg for ${id}.`, role: "context" }
      ]
    },
    gate_decision: {
      eligible_for_insight_review: true,
      blocking_reasons: [],
      metrics: { quality_score: 0.86 }
    }
  };
}

function branchConceptKeys(result) {
  const mindmap = result.projections.mindmap;
  const branchIds = new Set(mindmap.edges.filter((edge) => edge.type === "theme_branch").map((edge) => edge.to));
  return mindmap.nodes
    .filter((node) => branchIds.has(node.id))
    .map((node) => node.meta?.concept_key)
    .filter(Boolean);
}

const specificity = api.project({ insights: [
  makeInsight("meal_a", "Gratis lunsj kan påvirke arbeidsroen etter pausen.", ["gratis", "gratis lunsj"]),
  makeInsight("meal_b", "Gratis lunsj alene løser ikke alle utfordringer rundt fravær.", ["gratis", "gratis lunsj"]),
  makeInsight("meal_c", "Lærere beskriver roligere oppstart etter måltidet.", ["lærere", "roligere oppstart"])
] });
assert.equal(specificity.validation.valid, true, JSON.stringify(specificity.validation));
const specificityConceptKeys = specificity.projections.concepts.map((concept) => concept.key);
assert.ok(specificityConceptKeys.includes("gratis"), "short source concept must remain available for traceability");
assert.ok(specificityConceptKeys.includes("gratis lunsj"), "specific source concept must remain available");
const specificityBranches = branchConceptKeys(specificity);
assert.ok(specificityBranches.includes("gratis lunsj"), "the more specific same-support concept must remain eligible as a primary branch");
assert.ok(!specificityBranches.includes("gratis"), "a short concept must not become a primary branch when a longer same-support concept subsumes it");

const functionWords = api.project({ insights: [
  makeInsight("housing_a", "Flere startlån kan øke kjøpekraften for enkelte førstegangskjøpere.", ["flere", "startlån"]),
  makeInsight("housing_b", "Flere lån løser ikke alene knappheten på boliger.", ["flere", "boligtilgang"]),
  makeInsight("housing_c", "Gjeldsrisiko bør vurderes mot husholdningens betalingsevne.", ["hvilke", "gjeldsrisiko"])
] });
assert.equal(functionWords.validation.valid, true, JSON.stringify(functionWords.validation));
const functionConceptKeys = functionWords.projections.concepts.map((concept) => concept.key);
assert.ok(functionConceptKeys.includes("flere"), "quantifier concept must remain visible in the traceable concept surface");
assert.ok(functionConceptKeys.includes("hvilke"), "interrogative concept must remain visible in the traceable concept surface");
const functionBranches = branchConceptKeys(functionWords);
assert.ok(!functionBranches.includes("flere"), "standalone quantifier must not become a primary product branch");
assert.ok(!functionBranches.includes("hvilke"), "standalone interrogative determiner must not become a primary product branch");
assert.ok(functionBranches.some((key) => ["startlan", "boligtilgang", "gjeldsrisiko"].includes(key)), "meaningful source concepts must remain eligible");

const listCompatibility = api.project({ insights: [
  makeInsight("compat_a", "Alene er ikke et godt tankekartanker, men kan fortsatt være et delt listegrunnlag.", ["alene", "første tema"]),
  makeInsight("compat_b", "Alene kan opptre i to kilder uten at listekontrakten skal omskrives her.", ["alene", "andre tema"])
] });
assert.ok(
  listCompatibility.projections.lists.some((list) => list.meta?.semantic_basis === "shared_concept" && list.meta?.semantic_basis_label === "alene"),
  "mindmap eligibility must not silently change the established shared-concept list contract"
);
assert.ok(!branchConceptKeys(listCompatibility).includes("alene"), "the same function token must remain ineligible as a mindmap branch");

const inflectionDuplicate = api.project({ insights: [
  makeInsight("patient_a", "Ventetid kan falle når pasientflyten mellom avdelinger blir tydeligere.", ["ventetid", "ventetiden"]),
  makeInsight("patient_b", "Ventetiden kan samtidig skjule viderehenviste pasienter hvis målegrunnlaget er snevert.", ["ventetid", "ventetiden"]),
  makeInsight("patient_c", "Pasientflyt bør vurderes separat fra selve ventetidsmålet.", ["pasientflyt"])
] });
assert.equal(inflectionDuplicate.validation.valid, true, JSON.stringify(inflectionDuplicate.validation));
const inflectionConcepts = new Map(inflectionDuplicate.projections.concepts.map((concept) => [concept.key, concept]));
assert.ok(inflectionConcepts.has("ventetid"), "base concept must remain traceable");
assert.ok(inflectionConcepts.has("ventetiden"), "inflected source concept must remain traceable");
assert.equal(inflectionConcepts.get("ventetid").meta?.primary_candidate_eligible, true, "base form must remain primary-eligible");
assert.equal(inflectionConcepts.get("ventetiden").meta?.primary_candidate_eligible, false, "same-support definite form must not duplicate a primary branch");
assert.equal(inflectionConcepts.get("ventetiden").meta?.primary_candidate_reason, "inflection_variant_of:ventetid");
const inflectionBranches = branchConceptKeys(inflectionDuplicate);
assert.ok(inflectionBranches.includes("ventetid"), "base form must represent the shared concept in the mindmap");
assert.ok(!inflectionBranches.includes("ventetiden"), "same-support inflection variant must not become a duplicate mindmap branch");
assert.ok(inflectionBranches.includes("pasientflyt"), "an independent concept must remain available as a separate branch");

const differentSupport = api.project({ insights: [
  makeInsight("work_a", "Arbeid brukes her som et generelt begrep for aktiviteten.", ["arbeid"]),
  makeInsight("work_b", "Arbeidet omtales i en annen innsikt med et annet kildegrunnlag.", ["arbeidet"])
] });
const differentSupportConcepts = new Map(differentSupport.projections.concepts.map((concept) => [concept.key, concept]));
assert.equal(differentSupportConcepts.get("arbeid").meta?.primary_candidate_eligible, true, "base form with different support must not suppress another concept");
assert.equal(differentSupportConcepts.get("arbeidet").meta?.primary_candidate_eligible, true, "inflected form with different support must remain eligible");

console.log("aha-projection-primary-concept-selection-v2.test.cjs: OK");
