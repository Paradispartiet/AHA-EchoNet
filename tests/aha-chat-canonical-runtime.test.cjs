const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { console, Date, JSON, String, Number, Array, Object, Math, Set, Map };
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaChatCanonicalAnalysis.js", "utf8"), context, {
  filename: "js/ahaChatCanonicalAnalysis.js"
});

const api = context.AHAChatCanonicalAnalysis;
assert.equal(typeof api.create, "function");
assert.throws(() => api.create({}), /mangler avhengighet: buildAhaSerCard/);

const runtime = api.create({
  buildAhaSerCard: () => ({}),
  AHA_RUNTIME_KNOWLEDGE_POLICY: {},
  detectTextType: () => "note",
  detectAutoAnalysisDomain: () => "general",
  normalizeSubjectMatches: (items) => items,
  normalizeFagkoblinger: (items) => items,
  normalizeConceptKey: (value) => String(value || "").toLowerCase().replace(/[^a-z0-9æøå]+/gi, " ").trim(),
  buildAcademicConceptCandidates: () => []
});

assert.equal(Object.isFrozen(runtime), true);
assert.deepEqual(
  JSON.parse(JSON.stringify(runtime.normalizeHistoryGoLinks([
    "Eidsvoll 1814",
    { kind: "place", slug: "bislett", label: "Bislett stadion", why: "Byhistorie" },
    { title: "Morgenbladet", explanation: "Pressehistorie" },
    { title: "Morgenbladet", explanation: "Duplikat" },
    ""
  ]))),
  [
    { type: "topic", id: "eidsvoll_1814", title: "Eidsvoll 1814", reason: "" },
    { type: "place", id: "bislett", title: "Bislett stadion", reason: "Byhistorie" },
    { type: "topic", id: "Morgenbladet", title: "Morgenbladet", reason: "Pressehistorie" }
  ],
  "canonical runtime must normalize aliases and remove duplicate History Go links"
);

console.log("aha-chat-canonical-runtime.test.cjs passed");
