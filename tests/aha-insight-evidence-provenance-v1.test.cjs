const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const context = { window: null, globalThis: null };
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of ["js/ahaAnalysisQualityEvaluator.js", "js/ahaChatInsightPipeline.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
}
const insight = context.AHAChatInsightPipeline.create({
  filterConceptLabels: (xs) => xs,
  normalizeSimpleStringList: (values, limit) => (Array.isArray(values) ? values : []).map(String).filter(Boolean).slice(0, limit),
  normalizeTheoreticalLinks: () => [],
  extractAcademicPhraseConcepts: () => []
});

const source = "Kommunen legger opp til å redusere antallet avganger i sentrum. I høringsnotatet omtales rutekostnader og kollektivtilbud.";
const claim = "Færre avganger vil redusere tilliten til kommunen.";
const auto = insight.enrichInsightCandidate({
  title: "Tilliten til kommunen", summary: claim, claim_kind: "source_observation",
  uncertainty: "supported", evidence_quotes: []
}, source);
assert.equal(auto.evidence_origin, "context_match", "semantic overlap must be labelled as context");
assert.equal(auto.uncertainty, "hypothesis", "unsourced inference is not supported fact");
assert.equal(auto.claim_kind, "hypothesis");
assert.equal(auto.candidate_quality.status, "needs_review");
assert.ok(auto.evidence.every((row) => row.role === "context" && row.relation === "related_source_context"));

const quoted = insight.enrichInsightCandidate({
  title: "Avganger og tilgjengelighet", summary: "En reduksjon kan påvirke tilgjengelighet for reisende.",
  evidence_quotes: ["Kommunen legger opp til å redusere antallet avganger i sentrum."],
  uncertainty: "supported", claim_kind: "interpretation"
}, source);
assert.equal(quoted.evidence_origin, "source_quoted");
assert.equal(quoted.uncertainty, "interpretive", "a real excerpt does not prove the interpretation");
assert.equal(quoted.evidence[0].role, "supports");

const hallucinated = insight.enrichInsightCandidate({
  title: "Påstått resultat", summary: claim,
  evidence_quotes: ["Kommunen har bevist at tilliten vil falle."],
  uncertainty: "supported", claim_kind: "source_observation"
}, source);
assert.notEqual(hallucinated.evidence_origin, "source_quoted", "invented quote cannot become grounded evidence");
assert.equal(hallucinated.candidate_quality.status, "needs_review");

const verbatim = insight.enrichInsightCandidate({
  title: "Kildeobservasjon", summary: "Kommunen legger opp til å redusere antallet avganger i sentrum.",
  claim_kind: "source_observation", uncertainty: "supported", evidence_quotes: []
}, source);
assert.equal(verbatim.claim_kind, "source_observation");
assert.equal(verbatim.uncertainty, "supported", "verbatim source observation remains supported");

const archive = fs.readFileSync(path.join(root, "js/ahaInsights.js"), "utf8");
const audit = fs.readFileSync(path.join(root, "js/ahaSourcesAudit.js"), "utf8");
assert.match(archive, /Kildebelegg og vurdering/);
assert.match(archive, /related_source_context/);
assert.match(archive, /Ingen etterprøvbar oppgave er lagret/);
assert.match(archive, /sources\.html#source-/);
assert.match(audit, /id="source-\$\{encodeURIComponent/);
assert.match(audit, /function revealLinkedSource/);
console.log("Insight provenance contract: contextual excerpts are not presented as verified facts; archive source links resolve.");
