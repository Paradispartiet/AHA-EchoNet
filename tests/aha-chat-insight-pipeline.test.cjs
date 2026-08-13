const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaChatInsightPipeline.js", "utf8");
const chatSource = fs.readFileSync("js/ahaChat.js", "utf8");
const chatHtml = fs.readFileSync("chat.html", "utf8");
const context = { window: null, console };
context.window = context;
vm.runInNewContext(source, context, { filename: "js/ahaChatInsightPipeline.js" });

assert.equal(typeof context.AHAChatInsightPipeline?.create, "function");
const pipeline = context.AHAChatInsightPipeline.create({
  filterConceptLabels: (items) => items,
  normalizeSimpleStringList: (items, max) => (Array.isArray(items) ? items : []).slice(0, max),
  normalizeTheoreticalLinks: (items, max) => (Array.isArray(items) ? items : []).slice(0, max),
  extractAcademicPhraseConcepts: () => [],
  normalizeAfterworkConcept: (value) => String(value || "").toLowerCase(),
  functionalTypes: new Set(["observation", "principle", "pattern", "contradiction"]),
  weakConceptWords: new Set(["innsikt", "analyse"])
});

assert.equal(pipeline.normalizeFunctionalType("contrast"), "contradiction");
assert.equal(pipeline.normalizeFunctionalType("unsupported"), "observation");
assert.equal(pipeline.isWeakInsightCandidate({ title: "Innsikt", summary: "Noe", concepts: ["tema"] }, "Kilde"), true);
assert.equal(pipeline.isWeakInsightCandidate({ title: "Institusjonell endring", summary: "En særskilt endring skaper nye rammer.", concepts: ["institusjon"] }, "Annen kilde"), false);

const candidates = pipeline.buildSemanticInsightCandidates("Lek og læring trenger trygghet i parker, torg, bibliotek og andre byrom.", {});
assert.equal(candidates.length, 3);
assert.ok(candidates.every((candidate) => candidate.candidate_type === "semantic"));

assert.ok(chatSource.includes('chatModule("insightPipeline", "AHAChatInsightPipeline")?.create?.('));
assert.equal(chatSource.includes("function buildPlayCityFallbackCandidates"), false, "candidate generation implementation must live outside ahaChat.js");
assert.ok(chatHtml.indexOf("js/ahaChatInsightPipeline.js") < chatHtml.indexOf("js/ahaChat.js"));

console.log("aha-chat-insight-pipeline passed");
