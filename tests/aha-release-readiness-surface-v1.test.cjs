const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function run(file, context) {
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

const context = { window: {}, globalThis: null, console };
context.globalThis = context.window;
run("js/ahaModules.js", context);
run("js/ahaReleaseReadiness.js", context);

const api = context.window.AHAReleaseReadiness;
assert.ok(api, "release readiness API should load");
const status = api.buildReleaseReadinessStatus();

assert.equal(status.version, "aha_release_readiness_surface_v1");
assert.equal(status.snapshot_status, "local_only_ready_baseline");
assert.equal(status.counts.total, context.window.AHA_MODULES.length, "surface should cover the full registry");
assert.equal(status.counts.unknown, 0, "registry release states should all be known");
assert.equal(status.local_only_ready, true, "local-only baseline should be internally consistent");

const nonReadyIds = status.intentional_non_ready.map((item) => item.id).sort();
assert.deepEqual(nonReadyIds, ["meet", "sync-hub"], "only Meet and Sync Hub should remain intentionally non-ready");
assert.equal(status.intentional_non_ready.find((item) => item.id === "meet")?.release_state, "shell");
assert.equal(status.intentional_non_ready.find((item) => item.id === "sync-hub")?.release_state, "planned");

for (const [key, enabled] of Object.entries(status.global_boundaries)) {
  assert.equal(enabled, false, key + " must remain disabled");
}

const modelSource = fs.readFileSync("js/ahaReleaseReadiness.js", "utf8");
const dashboardSource = fs.readFileSync("js/ahaReleaseReadinessDashboard.js", "utf8");
for (const source of [modelSource, dashboardSource]) {
  assert.doesNotMatch(source, /localStorage\.(?:setItem|removeItem)/, "release readiness must not write localStorage");
  assert.doesNotMatch(source, /fetch\s*\(/, "release readiness must not fetch remote/runtime data");
  assert.doesNotMatch(source, /XMLHttpRequest|sendBeacon/, "release readiness must not perform network writes");
  assert.doesNotMatch(source, /executeSync|runSync|performSync|startSync/, "release readiness must not activate sync");
}

const html = fs.readFileSync("status.html", "utf8");
assert.match(html, /id="aha-release-readiness"/, "System Status should mount release readiness");
assert.match(html, /js\/ahaReleaseReadiness\.js/, "System Status should load the readiness model");
assert.match(html, /js\/ahaReleaseReadinessDashboard\.js/, "System Status should load the readiness renderer");
assert.ok(
  html.indexOf("js/ahaModules.js") < html.indexOf("js/ahaReleaseReadiness.js"),
  "module registry should load before readiness model"
);

const css = fs.readFileSync("css/aha-system-surfaces.css", "utf8");
assert.match(css, /\.aha-status-page \.aha-release-readiness-panel/, "readiness should use the system surface");
assert.match(css, /\.aha-release-readiness-grid\s*\{[^}]*grid-template-columns:/s, "readiness should use a responsive grid");
assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.aha-release-readiness-grid\s*\{[^}]*grid-template-columns:\s*1fr;/, "readiness grid should collapse on mobile");

const readme = fs.readFileSync("README.md", "utf8");
assert.match(readme, /AHA Local Insight Home V1 is implemented/, "README should not claim Local Insight Home runtime is missing");

console.log("AHA Release Readiness Surface V1 contract passed.");
