const assert = require("assert");
const fs = require("fs");

const css = fs.readFileSync("css/aha-knowledge-surfaces.css", "utf8");
const pages = {
  workbench: fs.readFileSync("knowledge-workbench.html", "utf8"),
  intake: fs.readFileSync("intake.html", "utf8"),
  curation: fs.readFileSync("curation.html", "utf8"),
  map: fs.readFileSync("knowledge-map.html", "utf8")
};

for (const [name, html] of Object.entries(pages)) {
  assert.match(html, /css\/aha-knowledge-surfaces\.css/, `${name} should load the shared Knowledge Surfaces layer`);
  assert.match(html, /aha-knowledge-surface/, `${name} should opt into the shared knowledge surface shell`);
  assert.match(html, /aha-knowledge-hero/, `${name} should use the flattened knowledge hero`);
}

assert.match(pages.workbench, /aha-shell-wide training-page aha-knowledge-surface aha-workbench-page/, "Workbench should use the wide knowledge shell");
assert.match(pages.intake, /aha-shell-workspace training-page aha-knowledge-surface aha-intake-page/, "Data Intake should use the workspace knowledge shell");
assert.match(pages.curation, /aha-shell-workspace training-page aha-knowledge-surface aha-curation-page/, "Curation should use the workspace knowledge shell");
assert.match(pages.map, /aha-shell-wide training-page aha-knowledge-surface aha-knowledge-map-page/, "Knowledge Map should use the wide knowledge shell");

for (const [pageClass, token] of [
  ["aha-workbench-page", "aha-color-blue"],
  ["aha-intake-page", "aha-color-cyan"],
  ["aha-curation-page", "aha-color-violet"],
  ["aha-knowledge-map-page", "aha-color-green"]
]) {
  assert.match(
    css,
    new RegExp(`\\.${pageClass}\\s*\\{[^}]*--knowledge-accent:\\s*var\\(--${token}\\)`, "s"),
    `${pageClass} should have its semantic accent`
  );
}

assert.match(css, /\.aha-knowledge-surface \.aha-training-stats\s*\{[^}]*display:\s*grid;/s, "knowledge stats should use a responsive grid");
assert.match(css, /\.aha-knowledge-surface \.aha-mini-stat\s*\{[^}]*background:\s*var\(--aha-color-panel-soft\)/s, "knowledge stats should use canonical dark surfaces");
assert.match(css, /\.aha-knowledge-surface \.aha-mini-stat::before\s*\{[^}]*background:\s*var\(--knowledge-accent\)/s, "knowledge stats should carry the page accent");
assert.match(css, /\.aha-knowledge-surface textarea,[\s\S]*?background:\s*var\(--aha-color-input\)/, "knowledge forms should use canonical field surfaces");
assert.match(css, /\.aha-knowledge-advanced\s*\{[^}]*background:\s*rgba\(170,145,247,.03\)/s, "advanced pipeline should remain visually secondary");
assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.aha-knowledge-surface \.aha-training-stats\s*\{[^}]*grid-template-columns:\s*1fr;/, "knowledge stats should collapse to one column on mobile");

const advancedIndex = pages.workbench.indexOf('<details id="workbench-advanced"');
assert.ok(advancedIndex >= 0, "Workbench should retain its advanced pipeline details");
for (const action of [
  "scan_sources",
  "build_curation_queue",
  "refresh_knowledge_map",
  "analyze_graph",
  "workbench_refresh",
  "safe_pipeline",
  "workflow_audit",
  "workflow_simulation"
]) {
  const actionIndex = pages.workbench.indexOf(`data-workbench-action="${action}"`);
  assert.ok(actionIndex > advancedIndex, `${action} should remain inside the advanced Workbench section`);
}

for (const [name, ids] of Object.entries({
  workbench: [
    "workbench-message",
    "workbench-queue",
    "workbench-overall",
    "workbench-progress",
    "workbench-advanced",
    "workbench-board",
    "workbench-result",
    "workbench-workflow-audit"
  ],
  intake: [
    "intake-scan-btn",
    "intake-import-btn",
    "intake-manual-form",
    "intake-source-filter",
    "intake-list",
    "source-connectors-list"
  ],
  curation: [
    "curation-build-btn",
    "curation-send-approved-btn",
    "curation-filter",
    "curation-list",
    "curation-graph-intelligence-status"
  ],
  map: [
    "knowledge-map-build-btn",
    "knowledge-map-search",
    "knowledge-map-filter",
    "knowledge-map-search-results",
    "knowledge-graph-intelligence-panel",
    "knowledge-map-graph",
    "knowledge-map-neighborhood"
  ]
})) {
  for (const id of ids) {
    assert.match(pages[name], new RegExp(`id="${id}"`), `${name} should preserve runtime mount #${id}`);
  }
}

for (const jsPath of [
  "js/ahaKnowledgeWorkbenchDashboard.js",
  "js/ahaDataIntakeDashboard.js",
  "js/ahaKnowledgeCurationDashboard.js",
  "js/ahaKnowledgeMapDashboard.js"
]) {
  const js = fs.readFileSync(jsPath, "utf8");
  assert.doesNotMatch(js, /aha-knowledge-surfaces/, `${jsPath} should remain presentation-agnostic`);
}

console.log("AHA Knowledge Surfaces polish V1 contract passed.");
