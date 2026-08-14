const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaChatInsightPipeline.js", "utf8");
const chatSource = fs.readFileSync("js/ahaChatAnalysisRunContract.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatAcademicInsightView.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatUiRuntime.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatProviderLoader.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatCapabilityBindings.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatRuntimeFacade.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatRuntimeComposition.js", "utf8") + "\n" + fs.readFileSync('js/ahaChatApplicationComposition.js', 'utf8') + "\n" + fs.readFileSync("js/ahaChat.js", "utf8");
const chatHtml = fs.readFileSync("chat.html", "utf8");
const context = { window: null, console };
context.window = context;
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

const candidates = pipeline.buildSemanticInsightCandidates("Lek og læring trenger trygghet i parker, torg, bibliotek og andre byrom.", {});
assert.equal(candidates.length, 3);
assert.ok(candidates.every((candidate) => candidate.candidate_type === "semantic"));

assert.ok(chatSource.includes('providerLoader.instantiate("insightPipeline", {'));
assert.equal(chatSource.includes("function buildPlayCityFallbackCandidates"), false, "candidate generation implementation must live outside ahaChat.js");
assert.doesNotMatch(chatSource, /AHA_INSIGHT_CONTRACT|INSIGHT_NOISE_PATTERN|LEADING_PUNCTUATION_PATTERN|LES_OGSA_TEASER_PATTERN|TEASER_TITLE_PATTERN/);
assert.doesNotMatch(chatSource, /function (?:getInsightPipeline|normalizeInsightCandidate|isWeakInsightCandidate|normalizeFunctionalType|normalizeCandidateConcepts)\s*\(/);
assert.ok(chatHtml.indexOf("js/ahaChatInsightPipeline.js") < chatHtml.indexOf("js/ahaChat.js"));

console.log("aha-chat-insight-pipeline passed");
