const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

class MemoryStorage {
  constructor(seed = {}) { this.data = new Map(Object.entries(seed)); this.writes = 0; }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.writes += 1; this.data.set(key, String(value)); }
  removeItem(key) { this.writes += 1; this.data.delete(key); }
}

const storage = new MemoryStorage({
  aha_lists_v1: "[]",
  aha_paths_v1: "[]",
  aha_concept_lists_v1: "[]"
});
let remoteWrites = 0;
const context = {
  console,
  localStorage: storage,
  AHA_CONFIG: { lists: { enableDatabaseSync: true }, paths: { enableDatabaseSync: true } },
  AHARepository: {
    saveList() { remoteWrites += 1; },
    savePath() { remoteWrites += 1; }
  },
  document: {
    readyState: "loading",
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return {}; }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of ["js/ahaProjectionMaterializerV2.js", "js/ahaLists.js", "js/ahaPaths.js"]) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

const model = {
  schema: "aha_projection_product_read_model_v2",
  mode: "read_only",
  status: "ready",
  projection_id: "projection_v2_test",
  identity: {
    analysis_id: "analysis_v2_test",
    analysis_run_id: "run_v2_test",
    source_id: "source_v2_test",
    source_sha256: "a".repeat(64)
  },
  validation: { valid: true, errors: [] },
  policy: Object.fromEntries([
    "product_surface_binding_authority", "product_store_write_authority", "automatic_projection_authority",
    "chamber_write", "canonical_write", "insights_write", "concepts_write", "lists_write", "paths_write",
    "mindmap_write", "meta_write", "persistent_write", "remote_write", "normal_chat_persistence_authority"
  ].map((key) => [key, false])),
  surfaces: {
    lists: [{
      id: "list_candidate",
      title: "Utforsk representasjon",
      type: "concepts",
      description: "To sider av samme tema.",
      tags: ["Representasjon"],
      source: "aha_semantic_v2",
      meta: {
        projection_id: "projection_v2_test", candidate_only: true, read_only: true,
        semantic_shape: "thematic_membership_v2", semantic_basis: "shared_concept", semantic_basis_label: "representasjon",
        membership_rule: "all_members_share_named_source_concept", member_ref_ids: ["i1", "i2"]
      },
      quality: { passed: true, score: 0.9 },
      items: [
        { id: "i1", refId: "i1", title: "Valg former representasjon", type: "insight", membership_reason: "Innsikten tilhører listen fordi kildebegrepet representasjon er eksplisitt felles.", meta: { member_ids: ["legacy_1"], quality_score: 0.9, membership_reason: "Innsikten tilhører listen fordi kildebegrepet representasjon er eksplisitt felles.", semantic_basis: "shared_concept", semantic_basis_label: "representasjon" } },
        { id: "i2", refId: "i2", title: "Deltakelse former legitimitet", type: "insight", membership_reason: "Innsikten tilhører listen fordi kildebegrepet representasjon er eksplisitt felles.", meta: { member_ids: ["legacy_2"], quality_score: 0.88, membership_reason: "Innsikten tilhører listen fordi kildebegrepet representasjon er eksplisitt felles.", semantic_basis: "shared_concept", semantic_basis_label: "representasjon" } }
      ]
    }],
    paths: [{
      id: "path_candidate",
      title: "Undersøk representasjon",
      type: "learning",
      mode: "learning",
      description: "Kontrollert progresjon.",
      goal: "Forstå sammenhengen.",
      learningOutcome: "Forklar med belegg.",
      source: "aha_semantic_v2",
      meta: { projection_id: "projection_v2_test", candidate_only: true, read_only: true, semantic_shape: "ordered_inquiry_v2", stage_selection: "semantic_role_ranked_not_round_robin", source_list_candidate_id: "list_candidate" },
      quality: { passed: true, score: 0.94 },
      steps: ["orientation", "claim_evidence", "tension_counterexample", "uncertainty", "synthesis_next_inquiry"].map((stage, index) => ({
        id: `s${index + 1}`,
        refId: `i${index % 2 + 1}`,
        title: `Steg ${index + 1}`,
        type: "insight",
        order: index,
        narrative: `Narrativ ${index + 1}`,
        learningOutcome: `Læringspunkt ${index + 1}`,
        meta: { stage, semantic_role: stage, semantic_basis: "shared_concept", selection_reason: `best_source_bound_fit_for_${stage}`, source_bound_narrative: true }
      }))
    }],
    mindmap: {
      read_only: true,
      nodes: [
        { id: "root", title: "Representasjon: oversikt", type: "theme" },
        { id: "concept", title: "Representasjon", type: "concept" },
        { id: "insight", title: "Valg former representasjon", type: "insight" }
      ],
      edges: [
        { id: "e1", from: "root", to: "concept", type: "theme_branch", label: "gren" },
        { id: "e2", from: "concept", to: "insight", type: "supports_insight", label: "belyser" }
      ],
      meta: { root_id: "root", projection_id: "projection_v2_test", candidate_only: true, read_only: true, semantic_shape: "ranked_hierarchy_v2", branch_assignment: "one_primary_hierarchy_parent_per_insight", branch_count: 1 },
      quality: { passed: true, score: 0.92 }
    }
  }
};

const api = context.AHAProjectionMaterializerV2;
assert.equal(api.POLICY.one_artifact_per_call, true);
assert.equal(api.POLICY.automatic_write, false);
assert.equal(api.POLICY.remote_write, false);
assert.deepEqual(JSON.parse(JSON.stringify(api.getMaterializationState({ artifact_type: "list", artifact_id: "list_candidate", projection_id: model.projection_id }))), {
  state: "absent", materialized: false, undo_available: false, record_id: null
});

const beforeConfirmation = storage.writes;
assert.equal(api.materialize({ model, artifact_type: "list", artifact_id: "list_candidate" }).reason, "explicit_user_confirmation_required");
assert.equal(storage.writes, beforeConfirmation);
assert.equal(api.materialize({ model, artifact_type: "list", artifact_id: ["list_candidate", "other"], user_confirmed: true }).reason, "artifact_not_found");
assert.equal(storage.writes, beforeConfirmation);

const listBefore = storage.getItem("aha_lists_v1");
const listResult = api.materialize({ model, artifact_type: "list", artifact_id: "list_candidate", user_confirmed: true });
assert.equal(listResult.ok, true);
assert.equal(listResult.existing, false);
const listRecords = JSON.parse(storage.getItem("aha_lists_v1"));
assert.equal(listRecords.length, 1);
assert.equal(listRecords[0].items.length, 2);
assert.ok(listRecords[0].items.every((item) => item.source === "aha_projection_v2" && item.meta.inline === true && item.meta.immutable === true));
assert.equal(listRecords[0].meta.sync_enabled, false);
assert.equal(listRecords[0].meta.semantic_shape, "thematic_membership_v2");
assert.equal(listRecords[0].meta.source_sha256, model.identity.source_sha256);
assert.equal(listRecords[0].items[0].membership_reason, model.surfaces.lists[0].items[0].membership_reason);
assert.equal(listRecords[0].items[0].meta.membership_reason, model.surfaces.lists[0].items[0].membership_reason);
assert.deepEqual(JSON.parse(JSON.stringify(api.getMaterializationState({ artifact_type: "list", artifact_id: "list_candidate", projection_id: model.projection_id }))), {
  state: "unchanged", materialized: true, undo_available: true, record_id: listRecords[0].id
});
assert.equal(context.AHALists.validateListReference(listRecords[0].items[0], []).ok, true);
assert.equal(context.AHALists.validateListReference({ source: "aha_projection_v2", refId: "broken", meta: { inline: true } }, []).reason, "incomplete_projection_snapshot");
assert.equal(context.AHALists.validateListReference({ source: "unknown", refId: "x" }, []).reason, "unknown_source");

const writesAfterList = storage.writes;
const duplicateList = api.materialize({ model, artifact_type: "list", artifact_id: "list_candidate", user_confirmed: true });
assert.equal(duplicateList.existing, true);
assert.equal(storage.writes, writesAfterList, "idempotent materialization must not rewrite the store");
assert.equal(api.undo(listResult.receipt, { user_confirmed: true }).ok, true);
assert.equal(storage.getItem("aha_lists_v1"), listBefore, "undo must restore the prior list store exactly");

const pathResult = api.materialize({ model, artifact_type: "path", artifact_id: "path_candidate", user_confirmed: true });
assert.equal(pathResult.ok, true);
const pathRecords = JSON.parse(storage.getItem("aha_paths_v1"));
assert.equal(pathRecords.length, 1);
assert.equal(pathRecords[0].steps.length, 5);
assert.equal(new Set(pathRecords[0].steps.map((step) => step.id)).size, 5);
assert.equal(pathRecords[0].meta.semantic_shape, "ordered_inquiry_v2");
assert.ok(pathRecords[0].steps.every((step) => step.meta.semantic_role === step.meta.stage && step.meta.source_bound_narrative === true));
assert.equal(api.getMaterializationState({ artifact_type: "path", artifact_id: "path_candidate", projection_id: model.projection_id }).state, "unchanged");
assert.equal(context.AHAPaths.validatePathStepReference(pathRecords[0].steps[0], []).ok, true);
assert.equal(context.AHAPaths.validatePathStepReference({ source: "aha_projection_v2", refId: "broken", meta: { inline: true } }, []).reason, "incomplete_projection_snapshot");
assert.equal(context.AHAPaths.validatePathStepReference({ source: "unknown", refId: "x" }, []).reason, "unknown_source");
assert.equal(api.undo(pathResult.receipt, { user_confirmed: true }).ok, true);
assert.equal(storage.getItem("aha_paths_v1"), "[]");

const mindmapResult = api.materialize({ model, artifact_type: "mindmap", artifact_id: model.projection_id, user_confirmed: true });
assert.equal(mindmapResult.ok, true);
const conceptRecords = JSON.parse(storage.getItem("aha_concept_lists_v1"));
assert.equal(conceptRecords.length, 1);
assert.equal(conceptRecords[0].terms.length, 3);
assert.equal(conceptRecords[0].relations.length, 2);
assert.equal(conceptRecords[0].meta.graph_snapshot.quality.passed, true);
assert.equal(conceptRecords[0].meta.semantic_shape, "ranked_hierarchy_v2");
assert.equal(conceptRecords[0].meta.source_sha256, model.identity.source_sha256);
const normalizedConceptRecord = context.AHALists.loadConceptLists()[0];
assert.equal(normalizedConceptRecord.terms[0].meta.source_node_id, model.surfaces.mindmap.nodes[0].id);
assert.equal(normalizedConceptRecord.relations[0].meta.source_edge_id, model.surfaces.mindmap.edges[0].id);
assert.equal(api.canUndoMaterialized({ artifact_type: "mindmap", artifact_id: model.projection_id, projection_id: model.projection_id }), true);

const durableUndo = api.undoMaterialized({ artifact_type: "mindmap", artifact_id: model.projection_id, projection_id: model.projection_id, user_confirmed: true });
assert.equal(durableUndo.ok, true, "undo must survive a page reload without an in-memory receipt");
assert.equal(storage.getItem("aha_concept_lists_v1"), "[]");

const rematerializedMindmap = api.materialize({ model, artifact_type: "mindmap", artifact_id: model.projection_id, user_confirmed: true });
assert.equal(rematerializedMindmap.ok, true);
const modifiedConceptRecords = JSON.parse(storage.getItem("aha_concept_lists_v1"));

modifiedConceptRecords[0].description = "Brukeren endret grafen";
modifiedConceptRecords[0].updatedAt = new Date().toISOString();
storage.setItem("aha_concept_lists_v1", JSON.stringify(modifiedConceptRecords));
assert.deepEqual(JSON.parse(JSON.stringify(api.getMaterializationState({ artifact_type: "mindmap", artifact_id: model.projection_id, projection_id: model.projection_id }))), {
  state: "modified", materialized: true, undo_available: false, record_id: modifiedConceptRecords[0].id
});
assert.equal(api.undoMaterialized({ artifact_type: "mindmap", artifact_id: model.projection_id, projection_id: model.projection_id, user_confirmed: true }).reason, "artifact_modified_since_materialization");
assert.equal(remoteWrites, 0, "materializer must never call repository writes");

const weakModel = JSON.parse(JSON.stringify(model));
weakModel.surfaces.lists[0].quality.passed = false;
assert.equal(api.materialize({ model: weakModel, artifact_type: "list", artifact_id: "list_candidate", user_confirmed: true }).reason, "artifact_quality_failed");
const legacyShapeModel = JSON.parse(JSON.stringify(model));
legacyShapeModel.surfaces.paths[0].meta.semantic_shape = "generic_round_robin";
assert.equal(api.materialize({ model: legacyShapeModel, artifact_type: "path", artifact_id: "path_candidate", user_confirmed: true }).reason, "artifact_quality_failed");
const identitylessModel = JSON.parse(JSON.stringify(model));
delete identitylessModel.identity.source_sha256;
assert.equal(api.materialize({ model: identitylessModel, artifact_type: "path", artifact_id: "path_candidate", user_confirmed: true }).reason, "read_model_invalid");
const openPolicy = JSON.parse(JSON.stringify(model));
openPolicy.policy.remote_write = true;
assert.equal(api.materialize({ model: openPolicy, artifact_type: "path", artifact_id: "path_candidate", user_confirmed: true }).reason, "read_model_invalid");

storage.setItem("aha_paths_v1", "[]");
context.AHAProjectionRuntimeSourceV2 = { build() { return model; } };
vm.runInContext(fs.readFileSync("js/ahaAnalysisArtifacts.js", "utf8"), context, { filename: "js/ahaAnalysisArtifacts.js" });
const wrappedV2 = context.AHAAnalysisArtifacts.saveV2ProjectionArtifact("path");
assert.equal(wrappedV2.ok, false, "Chat artifact entry point must remain preview-only");
assert.equal(wrappedV2.reason, "chat_projection_is_preview_only");
assert.deepEqual(JSON.parse(storage.getItem("aha_paths_v1")), [], "Chat must not materialize the first product candidate");
assert.equal(remoteWrites, 0);

for (const [page, marker] of [
  ["lists.html", "ahaProjectionMaterializerV2.js"],
  ["paths.html", "ahaProjectionMaterializerV2.js"],
  ["mindmap.html", "mindmap-v2-materialize"]
]) assert.match(fs.readFileSync(page, "utf8"), new RegExp(marker.replaceAll(".", "\\.")));

console.log("aha-projection-materializer-v2.test.cjs: OK");
