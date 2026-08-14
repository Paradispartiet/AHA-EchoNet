const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { console, window: null, globalThis: null, document: null };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaAdaptiveArtifacts.js", "utf8"), context, { filename: "js/ahaAdaptiveArtifacts.js" });

const api = context.AHAAdaptiveArtifacts;
assert.equal(api.VERSION, "aha_adaptive_artifacts_v1");
assert.deepEqual(Object.keys(api.RELATIONS), ["cause", "contrast", "support", "example", "uncertainty"]);

const cache = {
  sourceText: "Felles repertoar fører til identitetsdannelse. For eksempel brukes voggesanger i ritualer.",
  sourceHash: "source_1",
  payload: {
    canonicalAnalysis: {
      theme: "Sanglyrikk i barnekulturen",
      mainTension: "kulturell praksis ↔ instrumentell læring",
      keyInsight: "Felles repertoar fører til identitetsdannelse",
      fieldConnections: ["musikkvitenskap", "barnelitteratur"],
      warnings: ["Det er uklart hvor representativt materialet er."],
      suggestedActions: ["Skriv en fagartikkel med tydelig kildebelegg."]
    },
    keywords: ["tolkning", "ritual", "identitetsdannelse"],
    analysisQuality: {
      claims: [
        { kind: "source_evidence", text: "For eksempel brukes voggesanger i ritualer.", sourceMatch: "verbatim" },
        { kind: "interpretation", text: "Felles repertoar kan forme identitet.", evidenceText: "For eksempel brukes voggesanger i ritualer." }
      ]
    }
  }
};

const map = api.buildMindmapArtifact(cache);
assert.ok(map);
assert.equal(map.meta.genericNodesRemoved, true);
assert.deepEqual(Array.from(map.meta.relationTaxonomy), ["cause", "contrast", "support", "example", "uncertainty"]);
assert.equal(map.terms.some((item) => ["tolkning", "kildebelegg", "usikkerhet", "neste test", "hovedinnsikt"].includes(item.term.toLowerCase())), false);
const types = new Set(Array.from(map.relations, (relation) => relation.type));
["cause", "contrast", "support", "example", "uncertainty"].forEach((type) => assert.equal(types.has(type), true, `missing ${type}`));
map.relations.forEach((relation) => assert.ok(relation.label));

assert.equal(api.detectPathGoal(cache), "write");
assert.equal(api.detectPathGoal(cache, { goal: "undersøke" }), "investigate");
const writePath = api.buildPathArtifact(cache, { id: "map_1" }, { goal: "write" });
assert.equal(writePath.meta.goalMode, "write");
assert.equal(writePath.type, "publishing");
assert.match(writePath.title, /^Skrive:/);
assert.ok(writePath.steps.some((step) => /disposisjon|utkast/i.test(step.title)));

const firstSteps = ["understand", "investigate", "write", "learn", "execute"]
  .map((goal) => api.buildPathArtifact(cache, null, { goal }).steps[0].title);
assert.equal(new Set(firstSteps).size, 5);

const profile = fs.readFileSync("js/ahaAnalysisQualityProfile.js", "utf8");
assert.match(profile, /ahaAdaptiveArtifacts\.js/);
assert.match(profile, /adaptive-artifacts/);

console.log("aha-adaptive-artifacts.test.cjs passed");