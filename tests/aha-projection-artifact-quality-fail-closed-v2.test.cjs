const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaProjectionArtifactQualityV2.js", "utf8"), context, { filename: "js/ahaProjectionArtifactQualityV2.js" });

const api = context.AHAProjectionArtifactQualityV2;
const stages = ["orientation", "claim_evidence", "tension_counterexample", "uncertainty", "synthesis_next_inquiry"];
const path = {
  id: "path_missing_context",
  title: "Undersøk: kildebundet tema",
  steps: stages.map((stage, index) => ({
    refId: `missing_${index}`,
    order: index,
    narrative: `Dette er en tilstrekkelig lang, kildeorientert overgang for steg ${index + 1}, men referansen finnes ikke i context.`,
    learningOutcome: "Kunne kontrollere påstanden mot den konkrete kilden.",
    meta: { stage }
  }))
};

const withoutContext = api.evaluatePath(path);
assert.equal(withoutContext.passed, false, "direct path evaluation must fail closed without an insight context");
assert.ok(withoutContext.reasons.includes("path_unresolved_reference"));

const withWrongContext = api.evaluatePath(path, { insights: [{ id: "other", insight: "En annen innsikt." }] });
assert.equal(withWrongContext.passed, false);
assert.ok(withWrongContext.reasons.includes("path_unresolved_reference"));

console.log("aha-projection-artifact-quality-fail-closed-v2.test.cjs: OK (missing insight context blocks path quality)");
