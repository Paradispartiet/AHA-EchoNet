const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { console, window: null, globalThis: null, document: null };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaQualityCompletion.js", "utf8"), context, { filename: "js/ahaQualityCompletion.js" });

const api = context.AHAQualityCompletion;
assert.equal(api.VERSION, "aha_quality_completion_v1");
assert.equal(api.confidenceForClaim({ evidenceText: "Sitat", sourceOverlap: 0.72 }).level, "high");
assert.equal(api.confidenceForClaim({ evidenceText: "Sitat", sourceOverlap: 0.25 }).level, "medium");
assert.equal(api.confidenceForClaim({ confidence: "high", evidenceText: "" }).level, "low");
assert.match(api.buildConfidenceMarkup({ evidenceText: "Sitat", sourceOverlap: 0.72 }), /Sikkerhetsnivå:<\/strong> Høy/);
assert.match(api.buildConfidenceMarkup({ evidenceText: "Sitat", sourceOverlap: 0.72 }), /kildeoverlapp 72 %/);

assert.equal(
  api.dedupeSentences("Dette er konkret. Dette er konkret. Et annet poeng følger."),
  "Dette er konkret. Et annet poeng følger."
);
assert.equal(
  api.editGeneratedText("Det er viktig å merke seg at dette kan sies å være nyttig. Dette kan sies å være nyttig."),
  "Dette være nyttig."
);
assert.deepEqual(
  Array.from(api.filterWeakKeywords(["analyse", "maktfordeling", "tolkning", "institusjonell kontinuitet"])),
  ["maktfordeling", "institusjonell kontinuitet"]
);

const profileSource = fs.readFileSync("js/ahaAnalysisQualityProfile.js", "utf8");
assert.match(profileSource, /ahaQualityCompletion\.js/);
assert.match(profileSource, /loadQualityCompletion/);
const serviceWorker = fs.readFileSync("sw.js", "utf8");
assert.match(serviceWorker, /aha-chat-v4\.0\.423/);
assert.match(serviceWorker, /js\/ahaQualityCompletion\.js/);
assert.match(serviceWorker, /js\/ahaAdaptiveArtifacts\.js/);

console.log("aha-quality-completion.test.cjs passed");