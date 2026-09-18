const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);

for (const file of [
  "js/ahaInsightRelationClassifierV2.js",
  "js/ahaInsightSaturationV2.js",
  "js/ahaSemanticProjectionsV2.js",
  "js/ahaProjectionArtifactQualityV2.js"
]) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

const projection = context.AHASemanticProjectionsV2;
const quality = context.AHAProjectionArtifactQualityV2;
assert.ok(projection);
assert.ok(quality);

function insight({ id, text, concepts, sourceHash, sourceId, sharedQuote, uniqueQuote }) {
  return {
    id,
    source_event_id: sourceId,
    source_text_hash: sourceHash,
    semantic_concepts: concepts,
    candidate: {
      insight: text,
      type: "generalization",
      causal_status: "not_causal",
      evidence: [
        { quote: sharedQuote, role: "supports", exact_source_match: true },
        { quote: uniqueQuote, role: "supports", exact_source_match: true }
      ]
    },
    gate_decision: {
      eligible_for_insight_review: true,
      blocking_reasons: [],
      metrics: { quality_score: 0.82 }
    }
  };
}

function readModel(projected) {
  const adapters = projection.adapters(projected);
  return {
    schema: "aha_projection_product_read_model_v2",
    version: 2,
    mode: "read_only",
    status: "ready",
    projection_id: projected.projection_id,
    validation: { valid: true, errors: [] },
    surfaces: {
      insights: adapters.insights,
      concepts: adapters.concepts,
      lists: adapters.lists,
      paths: adapters.paths,
      mindmap: adapters.mindmap
    },
    policy: { persistent_write: false, remote_write: false }
  };
}

const sourceHash = "a".repeat(64);
const sharedQuote = "Jeg forstår stoffet mens jeg leser, men blir usikker når jeg skal forklare det selv.";

const sameSource = [
  insight({
    id: "learning_a",
    text: "Små muntlige oppsummeringer kan avdekke kunnskapshull som lesing alene ikke viser.",
    concepts: ["muntlige", "oppsummeringer"],
    sourceHash,
    sourceId: "source_learning",
    sharedQuote,
    uniqueQuote: "Små muntlige oppsummeringer avslører hva jeg faktisk mangler."
  }),
  insight({
    id: "learning_b",
    text: "Usikkerhet kan oppstå når forstått stoff skal forklares uten støtte.",
    concepts: ["stoffet", "usikker"],
    sourceHash,
    sourceId: "source_learning",
    sharedQuote,
    uniqueQuote: "Forklaringen må formuleres uten støtte fra teksten."
  })
];

const projected = projection.project({ insights: sameSource });
assert.equal(projected.validation.valid, true, JSON.stringify(projected.validation));
const sharedEvidenceList = projected.projections.lists.find((entry) => entry.meta?.semantic_basis === "shared_evidence");
assert.ok(sharedEvidenceList, "same-source exact evidence shared by two trusted insights must form an explicit shared_evidence List basis");
assert.equal(sharedEvidenceList.meta.membership_rule, "every_member_explicitly_shares_the_same_exact_source_evidence");
assert.equal(sharedEvidenceList.meta.shared_source_text_hash, sourceHash);
assert.equal(sharedEvidenceList.meta.shared_evidence_quote, sharedQuote);
assert.equal(sharedEvidenceList.items.length, 2);
assert.ok(sharedEvidenceList.items.every((item) => item.meta?.semantic_basis === "shared_evidence"));
assert.ok(sharedEvidenceList.items.every((item) => item.meta?.shared_source_text_hash === sourceHash));
assert.ok(sharedEvidenceList.items.every((item) => item.meta?.shared_evidence_quote === sharedQuote));

const filtered = quality.filterReadModel(readModel(projected));
const accepted = filtered.surfaces.lists.find((entry) => entry.meta?.semantic_basis === "shared_evidence");
assert.ok(accepted, "quality filter must accept a provenance-verified shared_evidence List");
assert.equal(accepted.quality.passed, true, JSON.stringify(accepted.quality));
assert.deepEqual(Array.from(accepted.quality.reasons), []);

const nestedSourceRefInputs = sameSource.map((entry) => {
  const next = JSON.parse(JSON.stringify(entry));
  delete next.source_text_hash;
  next.provenance = {
    source_refs: [
      { field: "source_id", value: next.source_event_id },
      { field: "source_text_hash", value: sourceHash }
    ]
  };
  return next;
});
const nestedSourceProjection = projection.project({ insights: nestedSourceRefInputs });
const nestedSharedEvidenceList = nestedSourceProjection.projections.lists.find((entry) => entry.meta?.semantic_basis === "shared_evidence");
assert.ok(nestedSharedEvidenceList, "canonical nested provenance.source_refs must preserve the shared source hash for evidence membership");
assert.equal(nestedSharedEvidenceList.meta.shared_source_text_hash, sourceHash);

const differentSource = [
  sameSource[0],
  insight({
    id: "learning_other_source",
    text: "Usikkerhet kan oppstå når forstått stoff skal forklares uten støtte.",
    concepts: ["stoffet", "usikker"],
    sourceHash: "b".repeat(64),
    sourceId: "source_other",
    sharedQuote,
    uniqueQuote: "Forklaringen må formuleres uten støtte fra teksten."
  })
];

const nonExactInputs = sameSource.map((entry) => {
  const next = JSON.parse(JSON.stringify(entry));
  next.candidate.evidence[0].exact_source_match = false;
  return next;
});
const nonExactProjection = projection.project({ insights: nonExactInputs });
assert.ok(nonExactProjection.projections.lists.every((entry) => entry.meta?.semantic_basis !== "shared_evidence"),
  "matching evidence text without exact_source_match must not qualify as shared_evidence");

const crossSourceProjection = projection.project({ insights: differentSource });
assert.ok(crossSourceProjection.projections.lists.every((entry) => entry.meta?.semantic_basis !== "shared_evidence"),
  "identical quote text from different source hashes must not create shared_evidence membership");
const crossSourceFiltered = quality.filterReadModel(readModel(crossSourceProjection));
assert.equal(crossSourceFiltered.surfaces.lists.length, 0,
  "without shared concept, typed resonance or same-source shared evidence, the fallback List must remain filtered out");

console.log("aha-projection-list-shared-evidence-v2.test.cjs: OK");
