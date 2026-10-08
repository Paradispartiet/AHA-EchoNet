const assert = require("assert");
const fs = require("fs");

const moduleCss = fs.readFileSync("css/ahaModule.css", "utf8");
const tokens = fs.readFileSync("css/aha-tokens.css", "utf8");
const navCss = fs.readFileSync("css/aha-global-nav.css", "utf8");
const dashboardCss = fs.readFileSync("css/aha-dashboard.css", "utf8");
const chatCss = fs.readFileSync("css/aha-chat.css", "utf8");
const plan = fs.readFileSync("docs/AHA_DESIGN_CONSOLIDATION_V1.md", "utf8");

// Legacy module CSS may style module-local primitives, but the shared AHA shell
// owns page width, centering and outer padding.
assert.doesNotMatch(
  moduleCss,
  /(^|\n)\s*body\s*\{[\s\S]*?\}/,
  "ahaModule.css must not own global body layout"
);

for (const selector of [".module-form", ".module-list", ".module-card", ".module-meta"]) {
  assert.match(moduleCss, new RegExp(selector.replace(".", "\\.")), `${selector} should remain available during controlled migration`);
}

for (const [name, css] of [["global nav", navCss], ["dashboard", dashboardCss], ["chat", chatCss]]) {
  assert.match(css, /^@import url\("\.\/aha-tokens\.css"\);/, `${name} should load canonical AHA tokens`);
}
for (const token of [
  "--aha-color-bg",
  "--aha-color-surface",
  "--aha-color-text",
  "--aha-color-blue",
  "--aha-color-cyan",
  "--aha-color-violet",
  "--aha-color-green",
  "--aha-color-coral",
  "--aha-app-background",
  "--aha-radius-control",
  "--aha-radius-card",
  "--aha-radius-panel",
  "--aha-control-min-height",
  "--aha-field-min-height"
]) {
  assert.match(tokens, new RegExp(token), `${token} should be defined in canonical tokens`);
}
assert.match(tokens, /--aha-color-bg:\s*#07080d;/, "AHA should keep its black base");
assert.match(tokens, /linear-gradient\(160deg, #050608 0%, #0a0b10 52%, #050608 100%\)/, "canonical app background should remain black-first");
assert.match(dashboardCss, /background:\s*var\(--aha-app-background\)/, "Dashboard should use the canonical app background");
assert.match(chatCss, /background:\s*var\(--aha-app-background/, "Chat should use the canonical app background");
assert.match(chatCss, /chat-line-user[^}]*aha-color-blue-soft/s, "Chat user messages should use the blue secondary accent");
assert.match(dashboardCss, /button\s*\{[^}]*border-radius:\s*var\(--aha-radius-control\)/s, "Dashboard buttons should use canonical control radius");
assert.match(dashboardCss, /\.aha-status-pill[\s\S]*?border-radius:\s*999px;/, "Status should remain pill-shaped");
assert.match(chatCss, /button\s*\{[^}]*aha-radius-control/s, "Chat buttons should use canonical control radius");
assert.match(moduleCss, /\.module-form input,[\s\S]*?aha-field-min-height/s, "Legacy module fields should use canonical field height");
assert.match(moduleCss, /\.module-card\s*\{[^}]*aha-radius-card/s, "Legacy module cards should use canonical card radius");

const shellPages = [
  "profile.html",
  "knowledge-workbench.html",
  "intake.html",
  "curation.html",
  "knowledge-map.html",
  "personal-ai.html",
  "training.html",
  "insights.html",
  "lists.html",
  "paths.html",
  "mindmap.html",
  "historygo.html",
  "gallery.html",
  "notes.html",
  "feed.html",
  "meet.html"
];

for (const page of shellPages) {
  const html = fs.readFileSync(page, "utf8");
  const main = html.match(/<main\b[^>]*>/i)?.[0] || "";
  assert.ok(main.includes("aha-dashboard"), `${page} should use the shared AHA dashboard shell`);
  assert.doesNotMatch(main, /style=["'][^"']*max-width/i, `${page} should not own shell width inline`);
  assert.match(main, /aha-shell-(reading|content|workspace|wide)/, `${page} should use a named shell width`);
}

for (const shellClass of ["aha-shell-reading", "aha-shell-content", "aha-shell-workspace", "aha-shell-wide"]) {
  assert.match(dashboardCss, new RegExp(`\\.${shellClass}\\b`), `${shellClass} should be defined centrally`);
}

assert.match(plan, /Phase 1 — Shell ownership/, "design plan should record shell consolidation first");
assert.match(plan, /Existing functionality is preserved/, "design plan should preserve runtime behavior during presentation consolidation");

console.log("AHA Design Consolidation V1 shell contract passed.");
