const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function start(moduleFile, seed = {}) {
  const records = new Map(Object.entries(seed));
  const read = (name) => records.has(name) ? JSON.parse(records.get(name)) : undefined;
  const storage = {
    getItem: (key) => records.get(key) || null,
    setItem: (key, value) => records.set(key, String(value))
  };
  const doc = {
    readyState: "loading", addEventListener() {},
    getElementById() { return null; }, querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const world = {
    console, Date, JSON, Math, Intl, localStorage: storage, document: doc,
    addEventListener() {}, fetch() { throw Error("Unexpected fetch"); },
    AHA_CONFIG: {}, AHAGroups: { getActiveGroups() { return []; } },
    AHAModules: { updatePageHealth() {}, localPageHealth() { return {}; },
      buildModuleEmptyState() { return ""; } },
    AHAContracts: { normalizeTags(v) { return Array.isArray(v) ? v : []; } },
    AHARepository: new Proxy({}, { get() { throw Error("Unexpected database call"); } })
  };
  world.window = world;
  vm.createContext(world);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", moduleFile), "utf8"), world);
  return { api: moduleFile.includes("Lists") ? world.AHALists : world.AHAPaths, read, world };
}

// Concepts: editorial corrections update definition + rename both ends of every
// relation, never create duplicates or change the IDs of confirmed knowledge.
{
  const { api: Lists, read } = start("ahaLists.js");
  const item = Lists.createConceptList({
    title: "Demokrati", terms: ["demokrati", "valg", "representasjon"]
  });
  const listId = item.id, key = "aha_concept_lists_v1";
  const before = Lists.loadConceptLists()[0];
  const democracy = before.terms.find(x => x.term === "demokrati");
  const election = before.terms.find(x => x.term === "valg");
  assert.equal(Lists.updateConceptTerm(listId, democracy.id, {
    term: "folkestyre", definition: "Prinsippet om politisk makt fra folket."
  }).ok, true);
  assert.equal(Lists.updateConceptTerm(listId, election.id, {
    term: "FOLKESTYRE", definition: "Skal ikke overstyre."
  }).reason, "duplicate");
  assert.equal(Lists.updateConceptTerm(listId, democracy.id, { term: "  " }).reason, "missing_term");
  const relation = Lists.addConceptRelation(listId, {
    from: "FOLKESTYRE", to: "valg", type: "supports",
    label: "støtter", explanation: "Valg er en sentral mekanisme."
  });
  assert.equal(relation.ok, true);
  assert.equal(relation.relation.from, "folkestyre");
  assert.equal(relation.relation.explanation, "Valg er en sentral mekanisme.");
  assert.equal(Lists.updateConceptTerm(listId, democracy.id, {
    term: "demokratiet", definition: "Makt fra folket."
  }).ok, true);
  const after = read(key)[0];
  assert.equal(after.terms.length, 3);
  assert.equal(after.terms.find(x => x.id === democracy.id).definition, "Makt fra folket.");
  assert.equal(after.relations[0].from, "demokratiet", "Rename must update existing relations");
  assert.equal(after.relations[0].to, "valg");
  assert.equal(after.relations[0].id, relation.relation.id, "Relation IDs must not rotate");
  assert.equal(Lists.addConceptRelation(listId, { from: "demokratiet", to: "demokratiet" }).reason, "invalid_relation");
  assert.equal(Lists.addConceptRelation(listId, { from: "demokratiet", to: "valg", type: "supports" }).reason, "duplicate");
  assert.equal(Lists.removeConceptTerm(listId, democracy.id).relations.length, 0,
    "Removing a concept must clean up dangling relationships");
  assert.equal(read(key)[0].local_only, true);
}

// Paths: progress must reflect persisted step status, not a cosmetic counter.
{
  const key = "aha_notes_v1", pathsKey = "aha_paths_v1";
  const notes = [{ id: "n1", title: "Kilde 1" }, { id: "n2", title: "Kilde 2" },
    { id: "n3", title: "Kilde 3" }];
  const { api: Paths, read } = start("ahaPaths.js", { [key]: JSON.stringify(notes) });
  const journey = Paths.createPath({ title: "Forstå saken", type: "learning" });
  assert.equal(Paths.pathProgress(journey).percent, 0);
  const steps = notes.map(n => Paths.addStepToPath(journey.id, {
    source: "aha_notes", refId: n.id, type: "note", narrative: "Les og vurder."
  }));
  for (const x of steps) assert.equal(x.ok, true);
  assert.equal(Paths.pathProgress(Paths.loadPaths()[0]).total, 3);
  const updated = Paths.updatePathStep(journey.id, steps[0].step.id, { status: "done" });
  assert.equal(updated.steps[0].status, "done");
  assert.equal(updated.steps[0].narrative, "Les og vurder.",
    "Status updates must not wipe learning text");
  Paths.updatePathStep(journey.id, steps[1].step.id, { status: "active" });
  Paths.updatePathStep(journey.id, steps[2].step.id, { status: "skipped" });
  let progress = Paths.pathProgress(Paths.loadPaths()[0]);
  assert.equal(progress.done, 1);
  assert.equal(progress.skipped, 1);
  assert.equal(progress.total, 3);
  assert.equal(progress.percent, 33);
  Paths.updatePathStep(journey.id, steps[0].step.id, { status: "planned" });
  progress = Paths.pathProgress(read(pathsKey)[0]);
  assert.equal(progress.done, 0, "Completion must be reversible");
  assert.equal(progress.skipped, 1);
  assert.equal(read(pathsKey)[0].local_only, true);
}

// A concept list should become a real, editable learning path only on request.
{
  const { api: Lists, read, world } = start("ahaLists.js");
  const concepts = Lists.createConceptList({ title: "Folkestyre", terms: ["valg", "mandat"] });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "ahaPaths.js"), "utf8"), world);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "ahaOrganizationFlow.js"), "utf8"), world);
  const result = world.AHAOrganizationFlow.createPathFromConceptList(concepts.id);
  assert.equal(result.ok, true, "Explicit concept-to-path action must work");
  assert.equal(result.path.steps.length, 1, "Path should contain a canonical concept-list reference");
  assert.equal(result.step.source, "aha_concept_lists");
  assert.equal(result.step.refId, concepts.id);
  assert.ok(result.step.narrative.length > 0, "Generated transition must explain why the list is included");
  assert.equal(read("aha_paths_v1").length, 1);
  assert.equal(read("aha_concept_lists_v1")[0].id, concepts.id, "Original concepts stay untouched");
  assert.equal(world.AHAOrganizationFlow.createPathFromConceptList("missing").reason, "concept_list_not_found");
}

console.log("AHA lists and paths usable-results regression: passed");
