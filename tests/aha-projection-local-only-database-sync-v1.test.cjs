const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const aiList = {
  id: "list_generated_ai",
  title: "Godkjent AI-samling",
  source: "aha_lists",
  meta: { createdBy: "aha_projection_materializer_v2", local_only: true, sync_enabled: false },
  items: []
};
const ordinaryList = { id: "list_manual", title: "Min lokale samling", type: "favorites", items: [] };
const generatedPathMarkers = [
  "aha_analysis_artifacts_v1",
  "aha_projection_materializer_v2",
  "insight_review_path_v1"
];
const generatedPaths = generatedPathMarkers.map((createdBy, i) => ({
  id: "path_generated_" + i,
  title: "Kildebundet AI-sti " + i,
  type: "learning",
  steps: [],
  meta: { createdBy, local_only: true, sync_enabled: false }
}));
const ordinaryPath = {
  id: "path_manual",
  title: "Min vanlige sti",
  type: "learning",
  steps: [],
  meta: { createdBy: "paths_ui" }
};
const seed = new Map([
  ["aha_lists_v1", JSON.stringify([aiList, ordinaryList])],
  ["aha_paths_v1", JSON.stringify([...generatedPaths, ordinaryPath])]
]);
const writes = [];
const future = "2099-01-01T00:00:00.000Z";
const database = {
  lists: [], paths: [], listLoads: 0, pathLoads: 0,
  remoteLists: [
    { id: aiList.id, title: "Serveren forsøker å erstatte AI-innsikten", meta: { createdBy: "lists_ui" }, updatedAt: future },
    { id: "leaked_remote_ai_list", title: "Eldre lekket AI-liste", meta: { createdBy: "aha_projection_materializer_v2" }, updatedAt: future },
    { ...ordinaryList, title: "Normal liste oppdatert fra server", updatedAt: future },
    { id: "remote_regular_list", title: "Ekstra vanlig serverliste", type: "todo", updatedAt: future }
  ],
  remotePaths: [
    { id: generatedPaths[0].id, title: "Serveren forsøker å erstatte AI-sti", type: "learning", meta: { createdBy: "paths_ui" }, updatedAt: future, steps: [] },
    { id: "leaked_remote_ai_path", title: "Eldre lekket AI-sti", meta: { createdBy: "aha_projection_materializer_v2" }, updatedAt: future, steps: [] },
    { ...ordinaryPath, title: "Normal sti oppdatert fra server", updatedAt: future },
    { id: "remote_regular_path", title: "Ekstra vanlig serversti", type: "learning", updatedAt: future, steps: [] }
  ]
};
const storage = {
  getItem(key) { return seed.has(key) ? seed.get(key) : null; },
  setItem(key, value) { writes.push(key); seed.set(key, String(value)); }
};
const document = { readyState: "loading", addEventListener() {}, getElementById() { return null; } };
const ctx = {
  console, document, localStorage: storage,
  AHA_CONFIG: { lists: { enableDatabaseSync: true }, paths: { enableDatabaseSync: true } },
  AHARepository: {
    async saveList(item) { database.lists.push(JSON.parse(JSON.stringify(item))); return { ok: true }; },
    async savePath(item) { database.paths.push(JSON.parse(JSON.stringify(item))); return { ok: true }; },
    async loadLists() { database.listLoads++; return { ok: true, data: database.remoteLists }; },
    async loadPaths() { database.pathLoads++; return { ok: true, data: database.remotePaths }; }
  }
};
ctx.window = ctx;
vm.createContext(ctx);
for (const file of ["js/ahaLists.js", "js/ahaPaths.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx, { filename: file });
}

(async () => {
  // Manual sync uses a separate bulk-upload method. Local-only V2 artifacts
  // must be filtered there, not only in per-item persistList/persistPath.
  const listSync = await ctx.AHALists.syncFromDatabase();
  const pathSync = await ctx.AHAPaths.syncFromDatabase();
  assert.equal(listSync.ok, true);
  assert.equal(pathSync.ok, true);
  assert.equal(database.listLoads, 1);
  assert.equal(database.pathLoads, 1);
  assert.deepEqual(database.lists.map((item) => item.id), ["list_manual"]);
  assert.deepEqual(database.paths.map((item) => item.id), ["path_manual"]);
  assert.ok(!database.lists.some((item) => item.meta?.createdBy === "aha_projection_materializer_v2"));
  assert.ok(!database.paths.some((item) => generatedPathMarkers.includes(item.meta?.createdBy)));

  const mergedLists = ctx.AHALists.loadLists();
  const mergedPaths = ctx.AHAPaths.loadPaths();
  assert.equal(mergedLists.length, 3, "Only ordinary new server lists may be imported");
  assert.equal(mergedPaths.length, generatedPaths.length + 2, "Only ordinary new server paths may be imported");
  assert.equal(mergedLists.find((item) => item.id === aiList.id).title, aiList.title,
    "A forged newer server record cannot overwrite a locally approved AI List");
  assert.equal(mergedPaths.find((item) => item.id === generatedPaths[0].id).title,
    generatedPaths[0].title, "A forged newer server record cannot overwrite AI Path");
  assert.equal(mergedLists.some((item) => item.id === "leaked_remote_ai_list"), false,
    "Previously leaked AI Lists must not be restored from remote");
  assert.equal(mergedPaths.some((item) => item.id === "leaked_remote_ai_path"), false,
    "Previously leaked AI Paths must not be restored from remote");
  assert.equal(mergedLists.find((item) => item.id === ordinaryList.id).title,
    "Normal liste oppdatert fra server", "Ordinary Lists retain timestamp-based sync");
  assert.equal(mergedPaths.find((item) => item.id === ordinaryPath.id).title,
    "Normal sti oppdatert fra server", "Ordinary Paths retain timestamp-based sync");
  assert.ok(mergedLists.some((item) => item.id === "remote_regular_list"));
  assert.ok(mergedPaths.some((item) => item.id === "remote_regular_path"));

  const remoteListsBefore = database.lists.length;
  const remotePathsBefore = database.paths.length;
  const modifiedList = ctx.AHALists.updateList("list_generated_ai", { title: "Redigert AI-samling" });
  const modifiedPath = ctx.AHAPaths.updatePath("path_generated_1", { title: "Redigert AI-sti" });
  assert.ok(modifiedList);
  assert.ok(modifiedPath);
  assert.equal(database.lists.length, remoteListsBefore, "Single-list update must not leak AI data");
  assert.equal(database.paths.length, remotePathsBefore, "Single-path update must not leak AI data");

  // AI provenance can appear inside a manually created collection or Path,
  // even when its top-level createdBy still says "lists_ui" or "paths_ui".
  const inline = {
    id: "inline_ai_member", source: "aha_projection_v2", refId: "i-1",
    meta: { inline: true, snapshot: { source: "aha_semantic_v2" } }
  };
  const mixedList = {
    id: "manual_list_with_ai_member", title: "Personlig AI-samling",
    meta: { createdBy: "lists_ui" }, items: [inline]
  };
  const mixedPath = {
    id: "manual_path_with_ai_step", title: "Personlig AI-sti",
    meta: { createdBy: "paths_ui" }, steps: [inline]
  };
  const linkedPath = {
    id: "manual_path_with_ai_list_ref", title: "Sti til godkjent AI-samling",
    meta: { createdBy: "paths_ui" },
    steps: [{ source: "aha_lists", refId: aiList.id, title: aiList.title }]
  };
  const nestedPath = {
    id: "manual_path_with_mixed_list_ref", title: "Sti til egen AI-samling",
    meta: { createdBy: "paths_ui" },
    steps: [{ source: "aha_lists", refId: mixedList.id, title: mixedList.title }]
  };
  const concept = {
    id: "ai_materialized_concept", title: "AI-begreper",
    meta: { createdBy: "aha_projection_materializer_v2" }, terms: []
  };
  const conceptPath = {
    id: "manual_path_with_ai_concept_ref", title: "Sti til AI-begreper",
    meta: { createdBy: "paths_ui" },
    steps: [{ source: "aha_concept_lists", refId: concept.id, title: concept.title }]
  };
  seed.set("aha_concept_lists_v1", JSON.stringify([concept]));
  ctx.AHALists.saveLists([...ctx.AHALists.loadLists(), mixedList]);
  ctx.AHAPaths.savePaths([...ctx.AHAPaths.loadPaths(), mixedPath, linkedPath, nestedPath, conceptPath]);
  database.remoteLists.push({ ...mixedList, title: "Replace sensitive mixed list", updatedAt: future, items: [] });
  database.remoteLists.push({ id: "remote_mixed_ai_list", title: "Old uploaded AI member",
    updatedAt: future, meta: { createdBy: "lists_ui" }, items: [inline] });
  database.remotePaths.push({ ...mixedPath, title: "Replace sensitive mixed path", updatedAt: future, steps: [] });
  database.remotePaths.push({ id: "remote_mixed_ai_path", title: "Old uploaded AI step",
    updatedAt: future, meta: { createdBy: "paths_ui" }, steps: [inline] });
  const listsUploadedBefore = database.lists.length;
  const pathsUploadedBefore = database.paths.length;
  await ctx.AHALists.syncFromDatabase();
  await ctx.AHAPaths.syncFromDatabase();
  assert.ok(database.lists.slice(listsUploadedBefore).every((item) =>
    ![mixedList.id, aiList.id, "remote_mixed_ai_list"].includes(item.id)),
    "AI members inside manual Lists must not be uploaded");
  assert.ok(database.paths.slice(pathsUploadedBefore).every((item) =>
    ![mixedPath.id, linkedPath.id, nestedPath.id, conceptPath.id, "remote_mixed_ai_path"].includes(item.id)),
    "Manual Paths containing or referencing AI content must not be uploaded");
  assert.equal(ctx.AHALists.loadLists().find((item) => item.id === mixedList.id).title, mixedList.title);
  assert.equal(ctx.AHAPaths.loadPaths().find((item) => item.id === mixedPath.id).title, mixedPath.title);
  assert.equal(ctx.AHALists.loadLists().some((item) => item.id === "remote_mixed_ai_list"), false,
    "Old remote copies containing inline AI members must not be re-imported");
  assert.equal(ctx.AHAPaths.loadPaths().some((item) => item.id === "remote_mixed_ai_path"), false,
    "Old remote copies containing inline AI steps must not be re-imported");
  const pathsSentBeforeEdits = database.paths.length;
  const listsSentBeforeEdits = database.lists.length;
  assert.ok(ctx.AHALists.updateList(mixedList.id, { title: "Oppdatert egen AI-samling" }));
  assert.ok(ctx.AHAPaths.updatePath(linkedPath.id, { title: "Oppdatert sti til AI-samling" }));
  assert.equal(database.lists.length, listsSentBeforeEdits, "Editing manually created AI List stays local");
  assert.equal(database.paths.length, pathsSentBeforeEdits, "Editing a Path referencing a local AI List stays local");

  assert.ok(writes.every((key) => ["aha_lists_v1", "aha_paths_v1"].includes(key)),
    "No new stores or unrelated user data must be written");
  console.log("Generated AI Lists and Paths stay local during manual and per-item database sync.");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
