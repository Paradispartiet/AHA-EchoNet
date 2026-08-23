const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaChatInsightPipeline.js", "utf8");
const qualitySource = fs.readFileSync("js/ahaAnalysisQualityEvaluator.js", "utf8");
const chatSource = fs.readFileSync("js/ahaChatAnalysisRunContract.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatAcademicInsightView.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatUiRuntime.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatProviderLoader.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatCapabilityBindings.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatRuntimeFacade.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatRuntimeComposition.js", "utf8") + "\n" + fs.readFileSync('js/ahaChatApplicationComposition.js', 'utf8') + "\n" + fs.readFileSync("js/ahaChat.js", "utf8");
const chatHtml = fs.readFileSync("chat.html", "utf8");
const context = { window: null, console };
context.window = context;
vm.runInNewContext(qualitySource, context, { filename: "js/ahaAnalysisQualityEvaluator.js" });
vm.runInNewContext(source, context, { filename: "js/ahaChatInsightPipeline.js" });

assert.equal(typeof context.AHAChatInsightPipeline?.create, "function");
assert.equal(Object.isFrozen(context.AHAChatInsightPipeline), true);
assert.equal(Object.isFrozen(context.AHAChatInsightPipeline.FUNCTIONAL_TYPES), true);
assert.deepEqual(Array.from(context.AHAChatInsightPipeline.FUNCTIONAL_TYPES), [
  "observation", "question", "task", "problem", "solution",
  "decision", "definition", "contradiction", "learning_point", "pattern", "memory", "principle"
]);
const dependencies = {
  filterConceptLabels: (items) => items,
  normalizeSimpleStringList: (items, max) => (Array.isArray(items) ? items : []).slice(0, max),
  normalizeTheoreticalLinks: (items, max) => (Array.isArray(items) ? items : []).slice(0, max),
  extractAcademicPhraseConcepts: () => [],
  normalizeAfterworkConcept: (value) => String(value || "").toLowerCase(),
  weakConceptWords: new Set(["innsikt", "analyse"])
};
const pipeline = context.AHAChatInsightPipeline.create(dependencies);

for (const type of Array.from(context.AHAChatInsightPipeline.FUNCTIONAL_TYPES)) {
  assert.equal(pipeline.normalizeFunctionalType(type), type, `${type} must remain canonical`);
}
assert.equal(pipeline.normalizeFunctionalType("contrast"), "contradiction");
assert.equal(pipeline.normalizeFunctionalType("decision"), "decision");
assert.equal(pipeline.normalizeFunctionalType("unsupported"), "observation");
assert.equal(pipeline.isWeakInsightCandidate({ title: "Innsikt", summary: "Noe", concepts: ["tema"] }, "Kilde"), true);
assert.equal(pipeline.isWeakInsightCandidate({ title: "Institusjonell endring", summary: "En særskilt endring skaper nye rammer.", concepts: ["institusjon"] }, "Annen kilde"), false);

async function verifyCandidateDiversityContract() {
  const requests = [];
  const requestContext = {
    window: null,
    console,
    AHA_AGENT_API: "https://example.test/api/aha-agent",
    fetch: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ candidates: [] }) };
    }
  };
  requestContext.window = requestContext;
  vm.createContext(requestContext);
  vm.runInContext(source, requestContext, { filename: "js/ahaChatInsightPipeline.js" });
  const requestPipeline = requestContext.AHAChatInsightPipeline.create(dependencies);
  await requestPipeline.generateAIInsightCandidates("Første påstand har ett poeng. Andre påstand setter en tydelig grense.", { theme_id: "tema" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].context.theme_id, "tema");
  assert.equal(requests[0].context.candidate_diversity_contract.source_sentence_count, 2);
  assert.equal(requests[0].context.candidate_diversity_contract.require_cross_sentence_evidence, true);
  assert.equal(requests[0].context.candidate_diversity_contract.require_distinct_primary_relation, true);
}

const candidates = pipeline.buildSemanticInsightCandidates("Lek og læring trenger trygghet i parker, torg, bibliotek og andre byrom.", {});
assert.equal(candidates.length, 3);
assert.ok(candidates.every((candidate) => candidate.candidate_type === "semantic"));
assert.ok(candidates.every((candidate) => candidate.evidence_quotes.length >= 1));
assert.ok(candidates.every((candidate) => candidate.quality_score >= 0.42));
assert.ok(candidates.every((candidate) => ["source_observation", "interpretation", "hypothesis"].includes(candidate.claim_kind)));

const reviewed = pipeline.reviewInsightCandidates([
  {
    title: "Bemanning og risiko",
    summary: "Lav bemanning gjør fredagslanseringen til en operativ risikobeslutning.",
    evidence_quotes: ["Fredagslansering gir raskere tilbakemelding, men overvåkingen er bare bemannet i to timer."],
    why_it_matters: "Uten beredskap kan en feil bli stående gjennom helgen.",
    next_test: "Kontroller hvem som kan overvåke de første timene.",
    uncertainty: "interpretive",
    claim_kind: "interpretation"
  },
  {
    title: "Samme poeng",
    summary: "Fredagslanseringen er en risikobeslutning fordi bemanningen er lav.",
    evidence_quotes: ["Fredagslansering gir raskere tilbakemelding, men overvåkingen er bare bemannet i to timer."],
    uncertainty: "interpretive",
    claim_kind: "interpretation"
  },
  {
    title: "Udokumentert konklusjon",
    summary: "Mandagslanseringen vil garantert bli feilfri.",
    evidence_quotes: ["Dette sitatet finnes ikke i kilden."],
    uncertainty: "supported",
    claim_kind: "interpretation"
  }
], "Fredagslansering gir raskere tilbakemelding, men overvåkingen er bare bemannet i to timer. Mandagslansering gir full beredskap.", { minimumScore: 0.35 });
assert.equal(reviewed.selected.length, 1, "candidate review must keep only the strongest distinct source-bound insight");
assert.ok(reviewed.rejected.some((candidate) => candidate.rejection_reason === "semantic_duplicate"));
assert.ok(reviewed.rejected.some((candidate) => candidate.claim_kind === "hypothesis"));
assert.equal(reviewed.selected[0].evidence[0].relation, "supports_interpretation");

assert.ok(chatSource.includes('providerLoader.instantiate("insightPipeline", {'));
assert.equal(chatSource.includes("function buildPlayCityFallbackCandidates"), false, "candidate generation implementation must live outside ahaChat.js");
assert.doesNotMatch(chatSource, /AHA_INSIGHT_CONTRACT|INSIGHT_NOISE_PATTERN|LEADING_PUNCTUATION_PATTERN|LES_OGSA_TEASER_PATTERN|TEASER_TITLE_PATTERN/);
assert.doesNotMatch(chatSource, /function (?:getInsightPipeline|normalizeInsightCandidate|isWeakInsightCandidate|normalizeFunctionalType|normalizeCandidateConcepts)\s*\(/);
assert.ok(chatHtml.indexOf("js/ahaChatInsightPipeline.js") < chatHtml.indexOf("js/ahaChat.js"));

verifyCandidateDiversityContract().then(() => console.log("aha-chat-insight-pipeline passed"));
