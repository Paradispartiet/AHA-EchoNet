const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT = fs.readFileSync(path.join(ROOT, "js", "ahaOrganizationRoles.js"), "utf8");

function loadAdapter(ids = []) {
  const present = new Set(ids);
  const document = {
    readyState: "loading",
    addEventListener() {},
    getElementById(id) { return present.has(id) ? { id } : null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const context = { console, document, Promise, queueMicrotask };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(SCRIPT, context, { filename: "js/ahaOrganizationRoles.js" });
  return context.AHAOrganizationRoles;
}

const neutral = loadAdapter();
assert.ok(neutral, "organization role adapter should export its presentation API");
assert.equal(neutral.detectSurface(), "", "adapter should fail closed outside the three organization surfaces");

const listsApi = loadAdapter(["lists-module-title"]);
const pathsApi = loadAdapter(["paths-module-title"]);
const mindmapApi = loadAdapter(["mindmap-node-list"]);
assert.equal(listsApi.detectSurface(), "lists");
assert.equal(pathsApi.detectSurface(), "paths");
assert.equal(mindmapApi.detectSurface(), "mindmap");

const listModel = listsApi.buildRoleModel("lists");
const pathModel = pathsApi.buildRoleModel("paths");
const mindmapModel = mindmapApi.buildRoleModel("mindmap");
assert.equal(listModel.roles.length, 3, "all three organization roles should be visible together");
assert.match(listModel.activeDescription, /ingen innebygd rekkefølge/, "Lists should be defined as unordered collections");
assert.match(pathModel.activeDescription, /bevisst rekkefølge/, "Paths should be defined by sequence");
assert.match(pathModel.activeDescription, /kjører ikke automatisk/, "Paths must not imply automation");
assert.match(mindmapModel.activeDescription, /referansene som allerede finnes/, "Mindmap should visualize existing references only");
assert.match(mindmapModel.activeDescription, /read-only/, "Mindmap should stay read-only");
assert.equal(mindmapModel.creates_new_knowledge, false);
assert.equal(mindmapModel.writes_to_storage, false);
assert.equal(mindmapModel.runs_automation, false);

assert.equal(neutral.technicalMindmapLabel("Source: aha_notes"), true);
assert.equal(neutral.technicalMindmapLabel("refId: note_private_123"), true);
assert.equal(neutral.technicalMindmapLabel("source_key: aha_notes_v1"), true);
assert.equal(neutral.technicalMindmapLabel("local_only: true"), true);
assert.equal(neutral.technicalMindmapLabel("Inn: 2 · Ut: 1"), false);

for (const [page, moduleScript] of [
  ["lists.html", "js/ahaLists.js"],
  ["paths.html", "js/ahaPaths.js"],
  ["mindmap.html", "js/ahaMindmap.js"]
]) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  const moduleIndex = html.indexOf(moduleScript);
  const roleIndex = html.indexOf("js/ahaOrganizationRoles.js");
  assert.ok(moduleIndex >= 0, `${page} should keep its existing canonical module`);
  assert.ok(roleIndex > moduleIndex, `${page} should load role presentation after its canonical module`);
}

const listsSource = fs.readFileSync(path.join(ROOT, "js", "ahaLists.js"), "utf8");
const pathsSource = fs.readFileSync(path.join(ROOT, "js", "ahaPaths.js"), "utf8");
const mindmapSource = fs.readFileSync(path.join(ROOT, "js", "ahaMindmap.js"), "utf8");
assert.ok(listsSource.includes('const LISTS_KEY = "aha_lists_v1"'), "Lists should keep its existing store");
assert.ok(pathsSource.includes('const PATHS_KEY = "aha_paths_v1"'), "Paths should keep its existing store");
assert.ok(mindmapSource.includes("read-only"), "Mindmap canonical implementation should remain read-only");
assert.ok(mindmapSource.includes('lists: "aha_lists_v1"'), "Mindmap should continue deriving list references");
assert.ok(mindmapSource.includes('paths: "aha_paths_v1"'), "Mindmap should continue deriving path references");

assert.equal(/localStorage\.(?:setItem|removeItem)/.test(SCRIPT), false, "role adapter must not write storage");
assert.equal(/AHAIngest/.test(SCRIPT), false, "role adapter must not invoke ingest");
assert.equal(/AHARepository/.test(SCRIPT), false, "role adapter must not invoke repository persistence");
assert.equal(/\bfetch\s*\(/.test(SCRIPT), false, "role adapter must not fetch");
assert.equal(/new\s+(?:Map|Set)\s*\(/.test(SCRIPT), false, "role adapter must not create parallel graph/index state");
assert.ok(SCRIPT.includes("Lister samler uten rekkefølge"));
assert.ok(SCRIPT.includes("Stier ordner i rekkefølge"));
assert.ok(SCRIPT.includes("Tankekart viser eksisterende koblinger"));

console.log("aha-organization-roles.test.cjs passed");
