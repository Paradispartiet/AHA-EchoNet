const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function run(file, context) {
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

const context = { window: {}, globalThis: null, console };
context.globalThis = context.window;
run("js/ahaModules.js", context);
run("js/ahaReadyModulesDemo.js", context);

const api = context.window.AHAReadyModulesDemo;
assert.ok(api, "demo API should load");

const model = api.buildDemoPath();
assert.equal(model.version, "aha_ready_modules_demo_v1");
assert.equal(model.local_only, true);
assert.equal(model.read_only, true);
assert.equal(model.stores_progress, false);
assert.equal(model.all_ready, true);
assert.deepEqual(
  Array.from(model.steps, (step) => step.id),
  ["home", "chat", "library", "personal-ai", "profile"],
  "demo should follow the canonical five-step product path"
);
assert.deepEqual(
  Array.from(model.steps, (step) => step.href),
  ["index.html", "chat.html", "search.html", "personal-ai.html", "profile.html"]
);

const registry = new Map(context.window.AHA_MODULES.map((module) => [module.id, module]));
for (const moduleId of ["chat", "search", "personal-ai", "profile"]) {
  assert.equal(registry.get(moduleId)?.status, "active", moduleId + " must be active before appearing as ready in the demo");
}
assert.equal(model.steps.some((step) => ["meet", "sync-hub"].includes(step.moduleId)), false, "demo must not present shell/planned modules as ready steps");

const modelSource = fs.readFileSync("js/ahaReadyModulesDemo.js", "utf8");
const dashboardSource = fs.readFileSync("js/ahaReadyModulesDemoDashboard.js", "utf8");
for (const source of [modelSource, dashboardSource]) {
  assert.doesNotMatch(source, /localStorage\.(?:setItem|removeItem)/, "demo must not persist progress");
  assert.doesNotMatch(source, /fetch\s*\(/, "demo must not fetch remote data");
  assert.doesNotMatch(source, /XMLHttpRequest|sendBeacon/, "demo must not perform network actions");
  assert.doesNotMatch(source, /executeSync|runSync|performSync|startSync/, "demo must not activate sync");
}

const html = fs.readFileSync("demo.html", "utf8");
assert.match(html, /aha-dashboard aha-shell-content aha-demo-page/, "demo should use canonical content shell");
assert.match(html, /id="aha-global-nav"/, "demo should use shared global navigation");
assert.match(html, /id="aha-demo-path"/, "demo should expose the path mount");
assert.match(html, /lagrer ikke progresjon/i, "demo should explain that progress is not stored");
assert.match(html, /Meet er fortsatt shell/, "demo should preserve Meet boundary");
assert.match(html, /Sync Hub er fortsatt planned\/no-op/, "demo should preserve Sync Hub boundary");

const readinessDashboard = fs.readFileSync("js/ahaReleaseReadinessDashboard.js", "utf8");
assert.match(readinessDashboard, /href="demo\.html"[^>]*>Se kom-i-gang-flyt</, "release readiness should link to the demo");

console.log("AHA ready-modules demo V1 contract passed.");
