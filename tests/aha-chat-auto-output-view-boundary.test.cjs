const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const host = {
  dataset: { sourceText: "Aktiv kildetekst" },
  innerHTML: "",
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
const context = {
  console,
  document: { getElementById: (id) => id === "aha-auto-output" ? host : null },
  Date,
  JSON,
  String,
  Number,
  Array,
  Object,
  Math,
  Set,
  Map
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaChatAutoOutputView.js", "utf8"), context, { filename: "js/ahaChatAutoOutputView.js" });

const api = context.AHAChatAutoOutputView;
assert.equal(typeof api.create, "function");
assert.throws(() => api.create({}), /mangler avhengighet: enforceCanonicalSourceGrounding/);

let mismatchArgs = null;
let exportEnabled = null;
const literarySubjects = [{ subject_id: "sub_litteratur", title: "Litteratur" }];
const deps = {
  enforceCanonicalSourceGrounding: (payload) => payload,
  getActiveAnalysisRun: () => ({ runId: "run_current" }),
  artifactMatchesActiveRun: () => true,
  analysisTopicMismatch: (...args) => { mismatchArgs = args; return true; },
  renderAnalysisDebugPanel: () => "",
  setExportButtonsEnabled: (value) => { exportEnabled = value; },
  escHtml: (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  cleanArticleText: (value) => String(value || ""),
  detectTextType: () => "academic_article",
  saveAutoOutputAsAfterwork: () => ({ saved: false }),
  setStatusNote() {},
  refreshAhaExplorer() {},
  updateAnalysisRun() {},
  normalizeConceptKey: (value) => String(value || "").toLowerCase(),
  detectPublicAdministrationReformSignal: (value) => ({ strong: /nav-reform/i.test(String(value || "")) }),
  detectAutoAnalysisDomain: () => "literary_attachment",
  detectLiteraryAttachmentSignal: (value) => ({ strong: /litteratur/i.test(String(value || "")) }),
  filterConceptLabels: (values) => values,
  canonicalizeDisplayConcept: (value) => value,
  detectInstitutionalMediaHistorySignal: () => ({ strong: false }),
  parseLabeledInsightCards: () => ({}),
  getSongLyricChildCultureSubjectMatches: () => [],
  getLiterarySubjectMatches: () => literarySubjects,
  getLiteraryAttachmentLearningPath: () => ["Les teksten som litterær form"]
};

const view = api.create(deps);
assert.equal(Object.isFrozen(view), true, "auto-output view facade must be immutable");
assert.equal(view.safeMarkupText("<script>fare</script>\nvidere"), "&lt;script&gt;fare&lt;/script&gt; videre");
assert.match(view.buildHistoryGoSuggestion({}, "NAV-reform i offentlig forvaltning"), /Politikk & samfunn/);

const contaminated = {
  reflection: "Sahel og politisk økologi",
  list: ["Litterær form", "Klima som konfliktforklaring i Mali"],
  path: ["Gammel sti"],
  subjectMatches: [{ subject_id: "sub_geografi" }],
  thoughts: { hovedspor: "Mali", lose_tanker: "Fortellerform", neste_steg: "Les romanen" }
};
const filtered = view.filterCrossDomainAutoPayload(contaminated, "Litterær tekst om tilknytning");
assert.notEqual(filtered, contaminated, "cross-domain filtering must not mutate the payload envelope");
assert.equal(filtered.reflection, "");
assert.deepEqual(Array.from(filtered.list), ["Litterær form"]);
assert.deepEqual(Array.from(filtered.path), ["Les teksten som litterær form"]);
assert.deepEqual(JSON.parse(JSON.stringify(filtered.subjectMatches)), literarySubjects);
assert.deepEqual(contaminated.path, ["Gammel sti"], "source payload must remain unchanged");

view.renderAutoOutputPayload({ runId: "run_current", reflection: "Analyse" });
assert.equal(mismatchArgs[2], "Aktiv kildetekst", "topic mismatch must receive the rendered source text");
assert.equal(exportEnabled, false, "mismatched output must fail closed");
assert.match(host.innerHTML, /matcher ikke aktiv tekst/);

console.log("aha-chat-auto-output-view-boundary.test.cjs passed");
