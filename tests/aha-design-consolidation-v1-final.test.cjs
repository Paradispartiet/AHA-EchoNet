const assert = require("assert");
const fs = require("fs");

const productPages = [
  "index.html",
  "chat.html",
  "profile.html",
  "notes.html",
  "feed.html",
  "gallery.html",
  "insta.html",
  "music.html",
  "search.html",
  "lists.html",
  "paths.html",
  "mindmap.html",
  "personal-ai.html",
  "knowledge-workbench.html",
  "historygo.html"
];

assert.equal(
  fs.existsSync("css/ahaModule.css"),
  false,
  "the unused legacy ahaModule.css compatibility layer should be deleted"
);

for (const path of productPages) {
  const html = fs.readFileSync(path, "utf8");
  assert.match(html, /<meta\s+name="viewport"[^>]*>/i, path + " should declare a mobile viewport");
  assert.match(html, /<main\b[^>]*class="[^"]*aha-dashboard\b[^"]*"/i, path + " should use the canonical AHA dashboard shell");
  assert.doesNotMatch(html, /ahaModule\.css/i, path + " should not restore the legacy module stylesheet");
  assert.doesNotMatch(
    html,
    /<main\b[^>]*style=["'][^"']*max-width/i,
    path + " should not own product width through inline max-width"
  );
}

const tokens = fs.readFileSync("css/aha-tokens.css", "utf8");
for (const contract of [
  "--aha-color-bg: #07080d",
  "--aha-radius-control: 12px",
  "--aha-radius-card: 16px",
  "--aha-radius-panel: 20px",
  "--aha-control-min-height: 42px",
  "--aha-field-min-height: 44px",
  "--aha-focus-ring:"
]) {
  assert.ok(tokens.includes(contract), "canonical token contract should include " + contract);
}

const dashboard = fs.readFileSync("css/aha-dashboard.css", "utf8");
for (const shell of ["aha-shell-reading", "aha-shell-content", "aha-shell-workspace", "aha-shell-wide"]) {
  assert.match(dashboard, new RegExp("\\." + shell + "\\b"), "dashboard should centrally define ." + shell);
}

const modulesJs = fs.readFileSync("js/ahaModules.js", "utf8");
assert.match(modulesJs, /aha-module-icon-svg/, "module registry should keep the canonical SVG icon system");
assert.doesNotMatch(modulesJs, /🕸|📰|⚙|⚑/, "mixed emoji module identity should not return");

const plan = fs.readFileSync("docs/AHA_DESIGN_CONSOLIDATION_V1.md", "utf8");
assert.match(plan, /Status: COMPLETE on merge of the final QA\/cleanup gate/, "design plan should record the final completion gate");
assert.match(plan, /Desktop Chrome and iPad Pro 11 WebKit/, "design plan should record the final browser QA targets");
assert.match(plan, /No History Go core behavior is part of this design consolidation/, "design plan should preserve the History Go core boundary");

console.log("AHA Design Consolidation V1 final cleanup contract passed.");
