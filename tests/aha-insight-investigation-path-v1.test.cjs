const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const store = new Map();
const storage = {
  getItem(key) { return store.get(key) ?? null; },
  setItem(key, value) { store.set(key, String(value)); },
  seed(key, data) { store.set(key, JSON.stringify(data)); }
};
const source = "Researchers observed that higher green coverage was associated with more insect visits. Yet different seasons were compared and causal effects remain unclear.";
const insight = {
  id: "green-1", title: "Grøntområder og insekter",
  summary: "Grøntområder henger sammen med flere insektbesøk, men effekt er ikke dokumentert.",
  source_event_id: "source-green-1",
  evidence: [{ quote: "Researchers observed that higher green coverage was associated with more insect visits.", role: "supports" }],
  uncertainty_detail: "Different seasons were compared.",
  next_test: "Sammenlign matchede steder i samme sesong.",
  why_it_matters: "Kan informere framtidige feltstudier."
};
storage.seed("aha_insight_chamber_v1", { insights: [insight] });
storage.seed("aha_source_events_v1", [{ id: "source-green-1", text: source }]);
let backendWrites = 0;
const c = {
  console, Date, Intl, JSON, Math, Promise, localStorage: storage,
  location: { hash: "" }, addEventListener() {},
  document: { readyState: "loading", addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } },
  AHA_CONFIG: { paths: { enableDatabaseSync: true } },
  AHARepository: { savePath() { backendWrites++; throw Error("Local-only review must never reach backend"); } },
  AHAModules: { localPageHealth() { return { status: "ready" }; }, updatePageHealth() {} },
  AHAGroups: { getActiveGroups() { return []; } },
  fetch() { throw Error("Source review path must not fetch"); }
};
c.window = c; vm.createContext(c);
function load(file) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), c, { filename: file });
}
const html = fs.readFileSync(path.join(__dirname, "..", "insights.html"), "utf8");
assert.match(html, /<script src="js\/ahaPaths\.js"><\/script>/);
assert.ok(html.indexOf('src="js/ahaPaths.js"') < html.indexOf('src="js/ahaInsights.js"'), "Insights must load AHAPaths before wiring actions");
load("js/ahaContracts.js");
load("js/ahaPaths.js");
load("js/ahaInsights.js");
const { AHAInsights: archive, AHAPaths: paths } = c;
assert.equal(archive.createInvestigationPathFromInsight({ id: "forged" }).reason, "insight_unavailable");
assert.equal(archive.createInvestigationPathFromInsight({ title: "No id" }).reason, "missing_stable_id");
const result = archive.createInvestigationPathFromInsight(archive.getInsights()[0]);
assert.equal(result.ok, true, result.message);
assert.equal(result.reused, undefined);
let stored = paths.loadPaths().find(x => x.id === result.pathId);
assert.equal(stored.meta.createdBy, "insight_review_path_v1");
assert.equal(stored.meta.source_insight_ref, "green-1");
assert.equal(stored.meta.source_event_id, "source-green-1");
assert.equal(stored.local_only, true);
assert.equal(stored.sync_enabled, false);
assert.equal(stored.published_external, false);
assert.equal(stored.steps.length, 3);
assert.deepEqual(Array.from(stored.steps.map(s => s.source)), ["aha_insights", "aha_analysis", "aha_analysis"]);
assert.deepEqual(Array.from(stored.steps.map(s => s.meta.review_stage)), ["claim", "evidence", "next_inquiry"]);
assert.match(stored.steps[1].narrative, /Ordrett sitat funnet/);
assert.match(stored.steps[1].narrative, /Different seasons/);
assert.match(stored.steps[2].narrative, /matchede steder/);
assert.equal(stored.steps.every(s => s.status === "planned"), true);
assert.equal(backendWrites, 0);
const dup = archive.createInvestigationPathFromInsight({ id: "green-1" });
assert.equal(dup.ok, true);
assert.equal(dup.reused, true);
assert.equal(dup.pathId, result.pathId);
assert.equal(paths.loadPaths().filter(x => !x.deletedAt).length, 1);

storage.seed("aha_source_events_v1", []);
paths.deletePath(result.pathId);
const noSource = archive.createInvestigationPathFromInsight({ id: "green-1" });
assert.equal(noSource.ok, true);
stored = paths.loadPaths().find(x => x.id === noSource.pathId);
assert.match(stored.steps[1].narrative, /Ingen ordrett kildebelegg/);
assert.equal(stored.meta.source_event_id, "");
assert.equal(stored.steps[0].refId, "green-1");
assert.equal(backendWrites, 0);

storage.seed("aha_insight_chamber_v1", { insights: [{ ...insight, status: "rejected" }] });
assert.equal(archive.createInvestigationPathFromInsight({ id: "green-1" }).reason, "insight_unavailable");
storage.seed("aha_insight_chamber_v1", { insights: [{ ...insight, archived: true }] });
assert.equal(archive.createInvestigationPathFromInsight({ id: "green-1" }).reason, "insight_unavailable");
storage.seed("aha_insight_chamber_v1", { insights: [] });
assert.equal(archive.createInvestigationPathFromInsight({ id: "green-1" }).reason, "insight_unavailable");
assert.equal(backendWrites, 0);
console.log("Insight -> explicit local-only 3-stage inquiry path: source proof, uncertainty, next test, idempotence and rejection passed.");
