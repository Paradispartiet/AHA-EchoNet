// Kunstrommet V1 contract and smoke tests; deterministic, no backend or browser.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "kunstrommet.html"), "utf8");
const js = fs.readFileSync(path.join(root, "js/ahaKunstrommet.js"), "utf8");
const registry = fs.readFileSync(path.join(root, "js/ahaModules.js"), "utf8");
const nav = fs.readFileSync(path.join(root, "js/ahaGlobalNav.js"), "utf8");
const matrix = fs.readFileSync(path.join(root, "docs/AHA_MODULE_MATURITY_MATRIX.md"), "utf8");

for (const id of ["kunstrommet-canvas", "kunstrommet-title", "kunstrommet-note", "kunstrommet-projects",
  "kunstrommet-undo", "kunstrommet-redo", "kunstrommet-new", "kunstrommet-save",
  "kunstrommet-png", "kunstrommet-json", "kunstrommet-import", "kunstrommet-send-aha"]) {
  assert.ok(html.includes('id="' + id + '"'), "Missing UI element " + id);
}
assert.match(registry, /id: "kunstrommet"/);
assert.match(nav, /moduleId: "kunstrommet"/);
assert.match(matrix, /^\| kunstrommet \|/m);
assert.match(js, /indexedDB\.open\(DB_NAME, 1\)/);
assert.match(js, /"aha-kunstrommet-v1"/);
assert.match(js, /explicit_user_action: true/);
assert.match(js, /image_sent: false/);
assert.doesNotMatch(js, /\bfetch\s*\(/);
assert.doesNotMatch(js, /\bXMLHttpRequest\b/);
assert.doesNotMatch(js + html, /Psykologirommet|psykologirommet/i);

let autoIngestCount = 0;
let domReadyHandler = null;
const canvas = { getContext: () => ({
  fillRect() {}, beginPath() {}, arc() {}, fill() {}, moveTo() {}, lineTo() {}, stroke() {}
}) };
const document = {
  readyState: "loading",
  getElementById: (id) => id === "kunstrommet-canvas" ? canvas : null,
  addEventListener: (type, callback) => { if (type === "DOMContentLoaded") domReadyHandler = callback; }
};
const window = { AHAIngest: { ingest: () => { autoIngestCount++; } } };
vm.runInNewContext(js, { window, document, console }, { filename: "ahaKunstrommet.js" });
assert.ok(domReadyHandler, "Initializer must wait for DOM ready");
assert.equal(autoIngestCount, 0, "AHA must not ingest without user action");
assert.equal(window.AHAKunstrommet.storage, "aha_kunstrommet_v1");
assert.equal(window.AHAKunstrommet.format, "aha-kunstrommet-v1");
console.log("Kunstrommet contract: PASS");
