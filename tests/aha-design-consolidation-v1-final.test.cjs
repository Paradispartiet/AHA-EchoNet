const assert = require("assert");
const fs = require("fs");

const productPages = [
  ["index.html", "dashboard"],
  ["chat.html", "chat"],
  ["profile.html", "dashboard"],
  ["notes.html", "dashboard"],
  ["feed.html", "dashboard"],
  ["gallery.html", "dashboard"],
  ["insta.html", "dashboard"],
  ["music.html", "dashboard"],
  ["search.html", "dashboard"],
  ["lists.html", "dashboard"],
  ["paths.html", "dashboard"],
  ["mindmap.html", "dashboard"],
  ["personal-ai.html", "dashboard"],
  ["knowledge-workbench.html", "dashboard"],
  ["historygo.html", "dashboard"]
];

assert.equal(
  fs.existsSync("css/ahaModule.css"),
  false,
  "the unused legacy ahaModule.css compatibility layer should be deleted"
);

const rootHtmlPages = fs.readdirSync(".").filter((name) => name.endsWith(".html"));

for (const path of rootHtmlPages) {
  const html = fs.readFileSync(path, "utf8");
  assert.doesNotMatch(html, /ahaModule\.css/i, path + " should not reference the removed legacy module stylesheet");
  const main = html.match(/<main\b[^>]*>/i)?.[0] || "";
  assert.doesNotMatch(main, /style=["'][^"']*max-width/i, path + " should not own main width through inline max-width");
}

for (const [path, shell] of productPages) {
  const html = fs.readFileSync(path, "utf8");
  assert.match(html, /<meta\s+name="viewport"[^>]*>/i, path + " should declare a mobile viewport");
  assert.match(html, /id="aha-global-nav"/, path + " should render shared global navigation");
  if (shell === "chat") {
    assert.match(html, /<div class="app-shell">/, "chat.html should retain the dedicated full-height conversation shell");
  } else {
    assert.match(html, /<main\b[^>]*class="[^"]*aha-dashboard\b[^"]*"/i, path + " should use the canonical AHA dashboard shell");
  }
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
for (const shell of ["aha-shell-compact", "aha-shell-reading", "aha-shell-content", "aha-shell-workspace", "aha-shell-wide"]) {
  assert.match(dashboard, new RegExp("\\." + shell + "\\b"), "dashboard should centrally define ." + shell);
}

for (const path of ["auth-callback.html", "authorize-fysen.html", "fysen.html"]) {
  const html = fs.readFileSync(path, "utf8");
  assert.match(html, /<main class="aha-dashboard aha-shell-compact">/, path + " should use the canonical compact shell");
}

const chatCss = fs.readFileSync("css/aha-chat.css", "utf8");
assert.match(chatCss, /^@import url\("\.\/aha-tokens\.css"\);/, "Chat shell should load canonical AHA tokens");
assert.match(chatCss, /\.app-shell\s*\{[\s\S]*?aha-app-background/, "Chat app-shell should use canonical app background");

const modulesJs = fs.readFileSync("js/ahaModules.js", "utf8");
assert.match(modulesJs, /aha-module-icon-svg/, "module registry should keep the canonical SVG icon system");
assert.doesNotMatch(modulesJs, /🕸|📰|⚙|⚑/, "mixed emoji module identity should not return");

const plan = fs.readFileSync("docs/AHA_DESIGN_CONSOLIDATION_V1.md", "utf8");
assert.match(plan, /Status: COMPLETE on merge of the final QA\/cleanup gate/, "design plan should record the final completion gate");
assert.match(plan, /Desktop Chrome and iPad Pro 11 WebKit/, "design plan should record the final browser QA targets");
assert.ok(plan.includes("dedicated full-height `.app-shell`"), "design plan should document the Chat shell exception");
assert.match(plan, /No History Go core behavior is part of this design consolidation/, "design plan should preserve the History Go core boundary");

console.log("AHA Design Consolidation V1 final cleanup contract passed.");
