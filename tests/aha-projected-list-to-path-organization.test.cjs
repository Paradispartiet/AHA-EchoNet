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
console.log("Approved AI List members survive promotion to editable Path steps with exact source identity.");
