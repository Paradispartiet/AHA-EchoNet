const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(
  fs.readFileSync("js/ahaProjectionArtifactQualityV2.js", "utf8"),
  context,
  { filename: "js/ahaProjectionArtifactQualityV2.js" }
);

const api = context.AHAProjectionArtifactQualityV2;
assert.ok(api);

function listWithAnchor(anchor) {
  const ids = ["a", "b", "c"];
  return {
    id: `list_${anchor}`,
    title: `Utforsk ${anchor}`,
    type: "concepts",
    items: ids.map((id) => ({
      id: `item_${id}`,
      title: `Kildebundet innsikt ${id}`,
      type: "insight",
      refId: id,
      membership_reason: `Innsikten deler kildebegrepet «${anchor}» og er derfor et eksplisitt begrunnet medlem av temaet.`,
      meta: {
        concept_keys: [anchor],
        semantic_basis: "shared_concept",
        semantic_basis_label: anchor,
        membership_reason: `Innsikten deler kildebegrepet «${anchor}» og er derfor et eksplisitt begrunnet medlem av temaet.`
      }
    })),
    meta: {
      semantic_shape: "thematic_membership_v2",
      semantic_basis: "shared_concept",
      semantic_basis_label: anchor,
      member_ref_ids: ids
    }
  };
}

const insights = [
  {
    id: "a",
    insight: "Kortere ventetid til første konsultasjon må vurderes mot hvilke pasienter som faktisk inngår i målingen.",
    provenance: { evidence: [{ quote: "første konsultasjon" }], source_refs: [{ field: "source_id", value: "a" }] }
  },
  {
    id: "b",
    insight: "Lengre åpningstid på biblioteket sammenfalt med flere besøk i forsøksperioden.",
    provenance: { evidence: [{ quote: "lengre åpningstid" }], source_refs: [{ field: "source_id", value: "b" }] }
  },
  {
    id: "c",
    insight: "Resultatene må leses sammen med den konkrete utformingen av forsøket og kildegrunnlaget.",
    provenance: { evidence: [{ quote: "konkrete utformingen" }], source_refs: [{ field: "source_id", value: "c" }] }
  }
];

const meaningful = api.evaluateList(listWithAnchor("arbeidsro"), { insights });
assert.equal(meaningful.passed, true, "a meaningful noun anchor must remain eligible");
assert.ok(!meaningful.reasons.includes("list_display_anchor_low_information"));

for (const anchor of ["første", "lengre", "hvilke", "oppgaver", "uventede", "deltakere", "grader"]) {
  const raw = listWithAnchor(anchor);
  const quality = api.evaluateList(raw, { insights });
  assert.equal(
    quality.passed,
    false,
    `${anchor} must fail closed as an unrefined grammatical-fragment list anchor`
  );
  assert.ok(
    quality.reasons.includes("list_display_anchor_low_information"),
    `${anchor} must expose the low-information list-anchor reason`
  );

  const refined = api.refineReadModel({
    status: "ready",
    validation: { valid: true },
    projection_id: `projection_${anchor}`,
    surfaces: {
      insights,
      concepts: [],
      lists: [raw],
      paths: [],
      mindmap: { nodes: [], edges: [], read_only: true }
    }
  });
  const list = refined.surfaces.lists[0];
  assert.equal(list.meta.display_theme_source, "source_bound_insight_text");
  assert.notEqual(list.title, `Utforsk ${anchor}`);
  const refinedQuality = api.evaluateList(list, { insights });
  assert.equal(refinedQuality.passed, true, "source-bound display refinement must recover the list");
  assert.ok(!refinedQuality.reasons.includes("list_display_anchor_low_information"));
}

console.log("aha-projection-list-low-information-anchor-v2.test.cjs: OK");
