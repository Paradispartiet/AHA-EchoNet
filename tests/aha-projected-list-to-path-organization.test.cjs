const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const parentMeta = Object.freeze({
  createdBy: "aha_projection_materializer_v2",
  projection_id: "projection_approved_source",
  projection_artifact_id: "list_semantic_members",
  analysis_id: "analysis_approved_source",
  analysis_run_id: "run_approved_source",
  source_id: "source_approved_source",
  source_sha256: "b".repeat(64),
  member_ref_ids: ["insight_one", "insight_two"]
});

function projectedItem(id, title, reason) {
  return {
    id: "list_member_" + id, title, type: "insight",
    source: "aha_projection_v2", refId: id,
    membership_reason: reason,
    meta: {
      ...parentMeta, inline: true, immutable: true,
      snapshot: { id, title, source: "aha_semantic_v2", type: "insight", quality_score: 0.94 }
    }
  };
}

function savedAiList() {
  return {
    id: "list_projection_saved",
    title: "Kildebundne innsikter",
    description: "Godkjente V2-innsikter fra samme analyse",
    status: "materialized_v2",
    source: "aha_lists", local_only: true,
    createdAt: "2026-10-30T10:00:00Z",
    updatedAt: "2026-10-30T10:00:00Z",
    meta: { ...parentMeta },
    items: [
      projectedItem("insight_one", "Kildebasert hovedspenning", "Denne innsikten kobler kildeutsagn om påstand og motbelegg."),
      projectedItem("insight_two", "Usikkerhet i kildegrunnlaget", "Denne innsikten synliggjør grensene for hva kilden kan bære.")
    ]
  };
}

function setup(initialLists, backing = new Map()) {
  if (initialLists !== undefined) backing.set("aha_lists_v1", JSON.stringify(initialLists));
  const writes = [];
  const document = { readyState: "loading", addEventListener() {}, getElementById() { return null; } };
  const localStorage = {
    getItem(key) { return backing.has(key) ? backing.get(key) : null; },
    setItem(key, value) { writes.push(key); backing.set(key, String(value)); },
    removeItem(key) { writes.push(key); backing.delete(key); }
  };
  const context = { console, Date, Math, JSON, document, localStorage };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["js/ahaLists.js", "js/ahaPaths.js", "js/ahaOrganizationFlow.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  return { context, backing, writes };
}

function identityMatches(step) {
  assert.equal(step.source, "aha_projection_v2");
  assert.equal(step.meta.inline, true);
  assert.equal(step.meta.immutable, true);
  assert.equal(step.meta.snapshot.source, "aha_semantic_v2");
  for (const key of ["projection_id", "projection_artifact_id", "analysis_id", "analysis_run_id", "source_id", "source_sha256"]) {
    assert.equal(step.meta[key], parentMeta[key], key);
  }
  assert.equal(step.meta.snapshot.id, step.refId);
}

{
  const app = setup([savedAiList()]);
  const flow = app.context.AHAOrganizationFlow;
  const items = app.context.AHALists.loadLists()[0].items;
  assert.equal(app.context.AHAPaths.validatePathStepReference(items[0]).ok, true);
  const promoted = flow.createPathFromList("list_projection_saved");
  assert.equal(promoted.ok, true);
  assert.equal(promoted.promoted, 2, "Both approved inline AI insights must become real Path steps");
  assert.equal(promoted.skipped, 0);
  let paths = app.context.AHAPaths.loadPaths();
  assert.equal(paths.length, 1);
  assert.equal(paths[0].steps.length, 3, "List itself + two approved AI insights");
  assert.equal(paths[0].steps[0].source, "aha_lists");
  paths[0].steps.slice(1).forEach(identityMatches);
  assert.match(paths[0].steps[1].narrative, /kobler kildeutsagn/);
  assert.match(paths[0].steps[2].narrative, /grensene/);
  assert.equal(paths[0].steps[1].status, "planned");
  assert.deepEqual(app.writes, ["aha_paths_v1"], "A complete List-to-Path promotion must make one atomic local write");
  const pathId = paths[0].id;
  const firstStepId = paths[0].steps[1].id;

  // Simulate a hard page reload with the exact same local storage.
  const reloaded = setup(undefined, app.backing);
  paths = reloaded.context.AHAPaths.loadPaths();
  assert.equal(paths.length, 1);
  assert.equal(paths[0].id, pathId);
  paths[0].steps.slice(1).forEach(identityMatches);
  const completed = reloaded.context.AHAPaths.updatePathStep(pathId, firstStepId, { status: "done" });
  assert.equal(completed.steps.find((step) => step.id === firstStepId).status, "done");
  assert.equal(reloaded.context.AHAPaths.loadPaths()[0].steps.length, 3);
  assert.deepEqual(Array.from(reloaded.backing.keys()).sort(), ["aha_lists_v1", "aha_paths_v1"]);
}

for (const invalid of [
  { name: "wrong member source SHA", change: (list) => { list.items[0].meta.source_sha256 = "c".repeat(64); } },
  { name: "mismatched snapshot ID", change: (list) => { list.items[0].meta.snapshot.id = "other_insight"; } },
  { name: "different projection", change: (list) => { list.items[0].meta.projection_id = "projection_other"; } },
  { name: "missing approved manifest", change: (list) => { list.meta.member_ref_ids = []; } },
  { name: "missing immutable snapshot", change: (list) => { delete list.items[0].meta.snapshot; } }
]) {
  const list = savedAiList();
  invalid.change(list);
  const app = setup([list]);
  const before = app.backing.get("aha_lists_v1");
  const result = app.context.AHAOrganizationFlow.createPathFromList(list.id);
  assert.equal(result.ok, false, invalid.name);
  assert.equal(result.reason, "projection_member_invalid", invalid.name);
  assert.equal(app.writes.length, 0, invalid.name + ": must fail before any Path write");
  assert.equal(app.backing.get("aha_paths_v1"), undefined, invalid.name);
  assert.equal(app.backing.get("aha_lists_v1"), before, invalid.name);
}

{
  const app = setup([savedAiList()]);
  const originalList = app.backing.get("aha_lists_v1");
  app.context.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  const result = app.context.AHAOrganizationFlow.createPathFromList("list_projection_saved");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "path_storage_failed");
  assert.equal(app.backing.has("aha_paths_v1"), false, "No partial Path may survive storage failure");
  assert.equal(app.backing.get("aha_lists_v1"), originalList, "Original AI List remains safe");
  assert.equal(app.writes.length, 0);
}

{
  const list = savedAiList();
  list.items = [];
  const app = setup([list]);
  const result = app.context.AHAOrganizationFlow.createPathFromList(list.id);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "projection_members_unavailable");
  assert.equal(app.writes.length, 0);
}
// The older Concept List → Path bridge must obey the same atomic creation rule.
const conceptSeed = new Map([["aha_concept_lists_v1", JSON.stringify([{
  id: "concept_list_durable", title: "Sentrale begreper",
  terms: [{ term: "sammenheng" }, { term: "belegg" }]
}])]]);
{
  const app = setup([], new Map(conceptSeed));
  const result = app.context.AHAOrganizationFlow.createPathFromConceptList("concept_list_durable");
  assert.equal(result.ok, true);
  assert.equal(result.path.steps.length, 1);
  assert.equal(result.path.steps[0].source, "aha_concept_lists");
  assert.equal(result.path.steps[0].refId, "concept_list_durable");
  assert.equal(result.path.steps[0].meta.organization_flow, "concept_list_to_path");
  assert.deepEqual(app.writes, ["aha_paths_v1"], "Concept List → Path must write once");
  assert.equal(setup(undefined, app.backing).context.AHAPaths.loadPaths()[0].steps.length, 1);
}
{
  const app = setup([], new Map(conceptSeed));
  app.context.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
  const result = app.context.AHAOrganizationFlow.createPathFromConceptList("concept_list_durable");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "path_storage_failed");
  assert.equal(app.writes.length, 0);
  assert.equal(app.backing.has("aha_paths_v1"), false);
}
// Both public deletion APIs must protect active Path references, including
// direct updateList tombstones that bypass the UI's Delete button.
{
  const app = setup([savedAiList()]);
  const result = app.context.AHAOrganizationFlow.createPathFromList("list_projection_saved");
  assert.equal(result.ok, true);
  const listBefore = app.backing.get("aha_lists_v1");
  const beforeWrites = app.writes.length;
  const denied = app.context.AHALists.deleteList("list_projection_saved");
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "list_referenced_by_active_path");
  assert.equal(app.context.AHALists.updateList("list_projection_saved", {
    deletedAt: "2026-10-30T20:00:00Z"
  }).reason, "list_referenced_by_active_path");
  assert.equal(app.writes.length, beforeWrites, "Denied List deletion must not touch storage");
  assert.equal(app.backing.get("aha_lists_v1"), listBefore);
  app.context.AHAPaths.deletePath(result.path.id);
  const deleted = app.context.AHALists.deleteList("list_projection_saved");
  assert.ok(deleted.deletedAt, "Delete is allowed once no active Path references the List");
}
{
  const app = setup([], new Map(conceptSeed));
  const result = app.context.AHAOrganizationFlow.createPathFromConceptList("concept_list_durable");
  assert.equal(result.ok, true);
  const conceptBefore = app.backing.get("aha_concept_lists_v1");
  const writesBefore = app.writes.length;
  assert.equal(app.context.AHALists.deleteConceptList("concept_list_durable").reason, "list_referenced_by_active_path");
  assert.equal(app.backing.get("aha_concept_lists_v1"), conceptBefore);
  assert.equal(app.writes.length, writesBefore, "Denied Concept List deletion must not touch storage");
  app.context.AHAPaths.deletePath(result.path.id);
  const deleted = app.context.AHALists.deleteConceptList("concept_list_durable");
  assert.ok(deleted.deletedAt);
}
for (const malformed of ["{bad", "{}", "false"]) {
  const app = setup([savedAiList()]);
  app.backing.set("aha_paths_v1", malformed);
  const before = app.backing.get("aha_lists_v1");
  const result = app.context.AHALists.deleteList("list_projection_saved");
  assert.equal(result.reason, "path_store_unavailable", "Malformed Path store must block destructive List deletion");
  assert.equal(app.backing.get("aha_lists_v1"), before);
  assert.deepEqual(app.writes, [], "Failed safety checks are read-only");
}

console.log("Approved AI List members survive promotion to editable Path steps with exact source identity.");
