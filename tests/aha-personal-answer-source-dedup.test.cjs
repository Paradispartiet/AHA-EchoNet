const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { console, Date, Math, JSON };
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/ahaPersonalAnswerComposer.js"), "utf8"), context);
const select = context.AHAPersonalAnswerComposer.selectSourcesForAnswer;

const ranked = Array.from(select([
  { id: "lexical-1", source: "training_corpus", sourceId: "corp-1", sourceType: "corpus_item", title: "Kilde A", excerpt: "Kort utdrag", hybridScore: 0.2 },
  { id: "semantic-77", source: "training_corpus", sourceId: "corp-1", sourceType: "corpus_item", title: "Kilde A", excerpt: "Det samme dokumentet med mer innhold", hybridScore: 0.9 },
  { id: "separate", source: "training_corpus", sourceId: "corp-2", sourceType: "corpus_item", title: "Kilde B", excerpt: "Uavhengig dokument", hybridScore: 0.4 },
  {},
  { id: "empty", sourceType: "corpus_item" },
  { id: "different-type", sourceType: "training_example", title: "Eksempel", excerpt: "Et godkjent eksempel", hybridScore: 0.1 }
], { intent: "project_status" }));

assert.equal(ranked.length, 3, "duplicate references and empty phantom sources are excluded");
assert.equal(ranked[0].id, "semantic-77", "highest-ranked variant of the same canonical source wins");
assert.equal(ranked.filter((s) => s.sourceId === "corp-1").length, 1);
assert.ok(ranked.some((s) => s.sourceId === "corp-2"), "different source IDs stay separate");
assert.ok(ranked.some((s) => s.id === "different-type"), "valid independent type is retained");
assert.ok(ranked.every((s) => s.excerpt && !Object.hasOwn(s, "_dedupeKey") && !Object.hasOwn(s, "_rank")));

const duplicatesWithoutCanonicalRefs = Array.from(select([
  { id: "same-1", sourceType: "note", title: "Notat", excerpt: "Viktig notat", hybridScore: 0.1 },
  { id: "same-1", sourceType: "note", title: "Notat", excerpt: "Viktig notat", hybridScore: 0.6 }
]));
assert.equal(duplicatesWithoutCanonicalRefs.length, 1);
assert.equal(duplicatesWithoutCanonicalRefs[0].hybridScore, 0.6);
assert.equal(Array.from(select([{}, { title: "Personlig kilde" }])).length, 0);
console.log("AHA Personal Answer Composer: source dedupe and empty evidence guards pass.");
