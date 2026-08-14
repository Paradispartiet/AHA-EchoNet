const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { console, Date, JSON, String, Number, Array, Object, Math, Set, Map };
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaChatUiRuntime.js", "utf8"), context, { filename: "js/ahaChatUiRuntime.js" });

const api = context.AHAChatUiRuntime;
assert.equal(Object.isFrozen(api), true);
assert.equal(typeof api.createShell, "function");
assert.throws(() => api.createShell({}), /mangler avhengighet: loadChamberFromStorage/);

const elements = new Map([
  ["theme-id", { value: " th_source " }],
  ["out", { textContent: "" }],
  ["chat-status-note", { textContent: "" }],
  ["aha-chat-memory-status", { textContent: "" }],
  ["panel", { innerHTML: "" }],
  ["afterwork-panel", { innerHTML: "" }]
]);
const document = { getElementById: (id) => elements.get(id) || null };
const chamber = {
  insights: [
    { id: "fallback", subject_id: "sub_laring", theme_id: "th_source" }
  ]
};
const engineInsights = [
  {
    id: "keep",
    subject_id: "sub_laring",
    theme_id: "th_source",
    emner: ["Historie", "historie"],
    concepts: [{ label: "Kildekritikk" }],
    patterns: [{ key: "offentlighet" }]
  },
  { id: "wrong-theme", subject_id: "sub_laring", theme_id: "th_other" },
  { id: "wrong-subject", subject_id: "sub_other", theme_id: "th_source" },
  null
];
let persistenceApi = null;
let explorerBundle = null;
let nextTimerId = 1;
const timers = new Map();
const shell = api.createShell({
  subjectId: "sub_laring",
  document,
  loadChamberFromStorage: () => chamber,
  getInsightsApi: () => ({ getActiveInsights: () => engineInsights }),
  filterConceptLabels: (labels) => labels.map((label) => String(label || "").toLowerCase()).filter(Boolean),
  buildExportBundle: () => ({ contractVersion: "aha_analysis_run_v1" }),
  getExplorerApi: () => ({ render: (bundle) => { explorerBundle = bundle; } }),
  getPersistenceApi: () => persistenceApi,
  setTimeout: (handler) => {
    const id = nextTimerId++;
    timers.set(id, handler);
    return id;
  },
  clearTimeout: (id) => timers.delete(id)
});

assert.equal(Object.isFrozen(shell), true, "shell facade must be immutable");
assert.equal(shell.getThemeId(), "th_source");
assert.equal(shell.getFieldId(), null);
assert.deepEqual(JSON.parse(JSON.stringify(shell.currentInsights())), [engineInsights[0]]);

shell.out("Full analyse");
shell.setStatusNote("Klar");
shell.renderPanel("<p>Panel</p>");
shell.renderAuxPanel("afterwork-panel", "<p>Etterarbeid</p>");
assert.equal(elements.get("out").textContent, "Full analyse");
assert.equal(elements.get("chat-status-note").textContent, "Klar");
assert.equal(elements.get("panel").innerHTML, "<p>Panel</p>");
assert.equal(elements.get("afterwork-panel").innerHTML, "<p>Etterarbeid</p>");
assert.equal(shell.escHtml(`<a title="x&y">'test'</a>`), "&lt;a title=&quot;x&amp;y&quot;&gt;&#039;test&#039;&lt;/a&gt;");
assert.equal(shell.normalizeDisplayText("Teksten underviser viktigheten av kildekritikk"), "Teksten understreker viktigheten av kildekritikk");
assert.equal(shell.resolveConceptTerm({ subject_label: "Pressehistorie" }), "Pressehistorie");
assert.equal(shell.resolveConceptTerm(1814), "1814");
assert.deepEqual(
  JSON.parse(JSON.stringify(shell.suggestCategoryChips())),
  ["historie", "kildekritikk", "offentlighet"],
  "shell must filter and deduplicate category chips from active insights"
);

assert.equal(shell.renderChatMemoryStatus(), null);
assert.match(elements.get("aha-chat-memory-status").textContent, /Chat-minne er ikke aktivt/);
persistenceApi = {
  getOrCreateCurrentSession: () => ({ id: "session-1", messages: [{}, {}] }),
  collectChatStats: () => ({ messages: 7 })
};
assert.deepEqual(JSON.parse(JSON.stringify(shell.renderChatMemoryStatus())), { messages: 7 });
assert.match(elements.get("aha-chat-memory-status").textContent, /Session: session-1.*Totalt: 7/);

shell.refreshAhaExplorer();
shell.refreshAhaExplorer();
assert.equal(timers.size, 1, "Explorer refresh must remain debounced");
timers.values().next().value();
assert.deepEqual(explorerBundle, { contractVersion: "aha_analysis_run_v1" });

elements.get("theme-id").value = "";
assert.equal(shell.getThemeId(), "th_default");

elements.get("theme-id").value = "th_source";
const fallbackShell = api.createShell({
  subjectId: "sub_laring",
  document,
  loadChamberFromStorage: () => chamber,
  getInsightsApi: () => null,
  filterConceptLabels: (labels) => labels,
  buildExportBundle: () => ({})
});
assert.deepEqual(JSON.parse(JSON.stringify(fallbackShell.currentInsights())), [chamber.insights[0]], "shell must preserve chamber fallback");

console.log("aha-chat-shell-runtime.test.cjs passed");
