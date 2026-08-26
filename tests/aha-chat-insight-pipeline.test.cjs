const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaChatInsightPipeline.js", "utf8");
const qualitySource = fs.readFileSync("js/ahaAnalysisQualityEvaluator.js", "utf8");
const chatSource = fs.readFileSync("js/ahaChatAnalysisRunContract.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatAcademicInsightView.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatUiRuntime.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatProviderLoader.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatCapabilityBindings.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatRuntimeFacade.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatRuntimeComposition.js", "utf8") + "\n" + fs.readFileSync('js/ahaChatApplicationComposition.js', 'utf8') + "\n" + fs.readFileSync("js/ahaChat.js", "utf8");
const chatHtml = fs.readFileSync("chat.html", "utf8");
const serverSource = fs.readFileSync("server.js", "utf8");
const synthesisContractSource = fs.readFileSync("server/ahaInsightSynthesisContractV2.js", "utf8");
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

const schemaAlignedCandidate = pipeline.normalizeInsightCandidate({
  title: "Situert fortolkning krever kritisk tilgangskompetanse",
  summary: "Fortellingens form og omsorgens brukskrav skaper et etisk tolkningsrom.",
  abstraction: "Dokumentformer fordeler tolkningsmakt mellom aktører",
  confidence: "medium",
  causal_status: "not_causal",
  concepts: ["fortolkning"],
  evidence: [
    { quote: "Fortellingen har en kontekst.", role: "supports" },
    { quote: "Konteksten setter også en grense.", role: "limits" }
  ],
  why_it_matters: "Det synliggjør hvem som får definere en livshistorie."
});
assert.equal(schemaAlignedCandidate.abstraction, "Dokumentformer fordeler tolkningsmakt mellom aktører");
assert.equal(schemaAlignedCandidate.confidence, "medium");
assert.equal(schemaAlignedCandidate.causal_status, "not_causal");
assert.deepEqual(JSON.parse(JSON.stringify(schemaAlignedCandidate.evidence)), [
  { quote: "Fortellingen har en kontekst.", role: "supports" },
  { quote: "Konteksten setter også en grense.", role: "limits" }
]);

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
    fetch: async (url, options = {}) => {
      if (String(url).endsWith('/health')) {
        return {
          ok: true,
          json: async () => ({ runtime: {
            analysis_contract: 'aha_active_analysis_contract_v3',
            synthesis_contract: 'aha_insight_synthesis_contract_v2',
            synthesis_output_schema: 'aha_insight_synthesis_output_v2',
            prompt_version: 'aha_insight_synthesis_prompt_v3',
            quality_gate_schema: 'aha_insight_quality_gate_v2',
            semantic_document_schema: 'aha_semantic_document_v2'
          } })
        };
      }
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({
        ok: true,
        schema: 'aha_insight_synthesis_contract_v2',
        synthesis: { schema: 'aha_insight_synthesis_output_v2', candidates: [] },
        runtime: {
          analysis_contract: 'aha_active_analysis_contract_v3',
          synthesis_contract: 'aha_insight_synthesis_contract_v2',
          synthesis_output_schema: 'aha_insight_synthesis_output_v2',
          prompt_version: 'aha_insight_synthesis_prompt_v3',
          quality_gate_schema: 'aha_insight_quality_gate_v2',
          semantic_document_schema: 'aha_semantic_document_v2'
        }
      }) };
    }
  };
  requestContext.window = requestContext;
  vm.createContext(requestContext);
  vm.runInContext(source, requestContext, { filename: "js/ahaChatInsightPipeline.js" });
  const requestPipeline = requestContext.AHAChatInsightPipeline.create(dependencies);
  await requestPipeline.generateAIInsightCandidates("Første påstand har ett poeng. Andre påstand setter en tydelig grense.", {
    theme_id: "tema",
    ai_state: { meta_profile: { forbidden: true }, top_insights: ["skal ikke krysse grensen"] },
    memory_context: { title: "skal heller ikke sendes" }
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].format, 'aha_insight_synthesis_output_v2');
  assert.ok(requests[0].semantic_context.source_claims.length >= 2);
  assert.equal(requests[0].context.active_analysis_contract, 'aha_active_analysis_contract_v3');
  assert.ok(Array.isArray(requests[0].context.deterministic_evidence_packets));
  assert.equal(requests[0].context.theme_id, "tema");
  assert.equal(requests[0].context.candidate_diversity_contract.source_sentence_count, 2);
  assert.equal(requests[0].context.candidate_diversity_contract.require_cross_sentence_evidence, true);
  assert.equal(requests[0].context.candidate_diversity_contract.require_distinct_primary_relation, true);
  assert.equal(Object.prototype.hasOwnProperty.call(requests[0].context, "ai_state"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(requests[0].context, "memory_context"), false);
  assert.equal(JSON.stringify(requests[0].context).includes("meta_profile"), false);
}

async function verifyRuntimeRecoveryContract() {
  let healthCalls = 0;
  let synthesisCalls = 0;
  const retryContext = {
    window: null,
    console,
    AHA_AGENT_API: "https://example.test/api/aha-agent",
    fetch: async (url) => {
      if (String(url).endsWith('/health')) {
        healthCalls += 1;
        if (healthCalls === 1) return { ok: false, status: 503 };
        return { ok: true, json: async () => ({ runtime: {
          analysis_contract: 'aha_active_analysis_contract_v3',
          synthesis_contract: 'aha_insight_synthesis_contract_v2',
          synthesis_output_schema: 'aha_insight_synthesis_output_v2',
          prompt_version: 'aha_insight_synthesis_prompt_v3',
          quality_gate_schema: 'aha_insight_quality_gate_v2',
          semantic_document_schema: 'aha_semantic_document_v2'
        } }) };
      }
      synthesisCalls += 1;
      return { ok: true, json: async () => ({
        ok: true,
        schema: 'aha_insight_synthesis_contract_v2',
        synthesis: { schema: 'aha_insight_synthesis_output_v2', candidates: [] },
        runtime: {
          analysis_contract: 'aha_active_analysis_contract_v3',
          synthesis_contract: 'aha_insight_synthesis_contract_v2',
          synthesis_output_schema: 'aha_insight_synthesis_output_v2',
          prompt_version: 'aha_insight_synthesis_prompt_v3',
          quality_gate_schema: 'aha_insight_quality_gate_v2',
          semantic_document_schema: 'aha_semantic_document_v2'
        }
      }) };
    }
  };
  retryContext.window = retryContext;
  vm.createContext(retryContext);
  vm.runInContext(source, retryContext, { filename: "js/ahaChatInsightPipeline.js" });
  const retryPipeline = retryContext.AHAChatInsightPipeline.create(dependencies);
  const retrySource = "Første kildepåstand dokumenterer rammen. Andre kildepåstand dokumenterer en tydelig avgrensning.";
  assert.deepEqual(Array.from(await retryPipeline.generateAIInsightCandidates(retrySource, {})), []);
  assert.deepEqual(Array.from(await retryPipeline.generateAIInsightCandidates(retrySource, {})), []);
  assert.equal(healthCalls, 2, "a failed runtime check must be retried by the next analysis");
  assert.equal(synthesisCalls, 1, "the recovered analysis may call synthesis only after runtime compatibility is restored");
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

const projectionDiversityReviewed = pipeline.reviewProjectionDiversityCandidates([
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
    title: "Avgrenset gevinst",
    summary: "Fredagslanseringen er en risikobeslutning fordi bemanningen er lav.",
    evidence_quotes: ["Fredagslansering gir raskere tilbakemelding, men overvåkingen er bare bemannet i to timer."],
    why_it_matters: "Rask tilbakemelding må veies mot begrenset overvåking.",
    next_test: "Sammenlign gevinst og beredskap før beslutningen.",
    uncertainty: "interpretive",
    claim_kind: "interpretation"
  },
  {
    title: "Eksakt kopi",
    summary: "Fredagslanseringen er en risikobeslutning fordi bemanningen er lav.",
    evidence_quotes: ["Fredagslansering gir raskere tilbakemelding, men overvåkingen er bare bemannet i to timer."],
    uncertainty: "interpretive",
    claim_kind: "interpretation"
  }
], "Fredagslansering gir raskere tilbakemelding, men overvåkingen er bare bemannet i to timer. Mandagslansering gir full beredskap.", { minimumScore: 0.35 });
assert.equal(projectionDiversityReviewed.selected.length, 2, "projection expansion must preserve lexical overlap for authoritative semantic classification");
assert.ok(projectionDiversityReviewed.rejected.some((candidate) => candidate.rejection_reason === "exact_duplicate"));

assert.ok(chatSource.includes('providerLoader.instantiate("insightPipeline", {'));
assert.equal(chatSource.includes("function buildPlayCityFallbackCandidates"), false, "candidate generation implementation must live outside ahaChat.js");
assert.doesNotMatch(chatSource, /AHA_INSIGHT_CONTRACT|INSIGHT_NOISE_PATTERN|LEADING_PUNCTUATION_PATTERN|LES_OGSA_TEASER_PATTERN|TEASER_TITLE_PATTERN/);
assert.doesNotMatch(chatSource, /function (?:getInsightPipeline|normalizeInsightCandidate|isWeakInsightCandidate|normalizeFunctionalType|normalizeCandidateConcepts)\s*\(/);
assert.ok(chatHtml.indexOf("js/ahaChatInsightPipeline.js") < chatHtml.indexOf("js/ahaChat.js"));
assert.match(serverSource, /evidence_quotes skal inneholde 2–3 korte, ordrette sitater fra minst to forskjellige setninger/);
assert.match(serverSource, /abstraction: normalizeWhitespace\(candidate\.abstraction, 240\)/);
assert.match(serverSource, /authoritative_quality_retry/);
assert.match(synthesisContractSource, /projection_diversity_expansion/);

Promise.all([
  verifyCandidateDiversityContract(),
  verifyRuntimeRecoveryContract()
]).then(() => console.log("aha-chat-insight-pipeline passed"));
