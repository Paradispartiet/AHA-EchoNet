const assert = require("assert");
const fs = require("fs");

const sourcesHtml = fs.readFileSync("sources.html", "utf8");
const sourcesCss = fs.readFileSync("css/aha-sources.css", "utf8");
const privacyHtml = fs.readFileSync("privacy.html", "utf8");
const privacyCss = fs.readFileSync("css/aha-privacy.css", "utf8");
const statusHtml = fs.readFileSync("status.html", "utf8");
const systemCss = fs.readFileSync("css/aha-system-surfaces.css", "utf8");

for (const [name, html, pageClass] of [
  ["Sources", sourcesHtml, "aha-sources-page"],
  ["Privacy", privacyHtml, "aha-privacy-page"],
  ["Status", statusHtml, "aha-status-page"]
]) {
  assert.match(html, /css\/aha-system-surfaces\.css/, `${name} should load the shared system surface layer`);
  assert.match(html, /aha-system-surface/, `${name} should opt into the shared system shell`);
  assert.match(html, /aha-system-hero/, `${name} should use the flattened system hero`);
  assert.match(html, new RegExp(pageClass), `${name} should expose its semantic page class`);
}

assert.doesNotMatch(sourcesHtml, /css\/ahaModule\.css/, "Sources must not restore the legacy module stylesheet");
assert.match(sourcesHtml, /aha-shell-wide aha-system-surface aha-sources-page/, "Sources should use the canonical wide shell");
assert.match(sourcesHtml, /aha-system-status-panel/, "Sources summary should use the canonical system status panel");
assert.doesNotMatch(
  sourcesCss,
  /background:\s*(?:#fff(?:fff)?\b|rgba\(255,\s*255,\s*255,\s*\.88\))/i,
  "Sources must not restore white legacy cards"
);
assert.doesNotMatch(sourcesCss, /#172554\b|#475569\b|#0f172a\b/i, "Sources must not restore the old blue-gray legacy palette");
assert.match(sourcesCss, /\.aha-audit-card,[\s\S]*?background:\s*var\(--aha-color-panel\)/, "Sources audit cards should use canonical dark panels");
assert.match(sourcesCss, /\.aha-filter-chip\.is-active\s*\{[^}]*sources-accent-soft/s, "Sources active filter should use the system accent");

assert.doesNotMatch(privacyHtml, /<main[^>]*style=["'][^"']*max-width/i, "Privacy must not own shell width inline");
assert.match(privacyHtml, /aha-shell-workspace aha-system-surface aha-privacy-page/, "Privacy should use the canonical workspace shell");
assert.match(privacyCss, /\.privacy-status-card,[\s\S]*?border-radius:\s*var\(--aha-radius-card\)/, "Privacy cards should use canonical card geometry");
assert.match(privacyCss, /\.privacy-pill\s*\{[\s\S]*?border-radius:\s*var\(--aha-radius-pill\)/, "Privacy status pills should use canonical pill geometry");
assert.match(privacyCss, /\.privacy-pill\.is-on\s*\{[^}]*aha-color-green-soft/s, "Privacy enabled state should use semantic green");

assert.match(statusHtml, /aha-shell-wide aha-status-page aha-system-surface/, "Status should use the canonical wide system shell");
assert.doesNotMatch(statusHtml, /class="aha-status-page-header"/, "Status should not restore the legacy local page header");
assert.match(statusHtml, /<details class="aha-tech-status">/, "Raw technical status should stay available but collapsed by default");
assert.doesNotMatch(statusHtml, /<details class="aha-tech-status"\s+open>/, "Raw technical status must not dominate the initial product surface");

for (const [pageClass, token] of [
  ["aha-sources-page", "aha-color-blue"],
  ["aha-privacy-page", "aha-color-cyan"],
  ["aha-status-page", "aha-color-green"]
]) {
  assert.match(
    systemCss,
    new RegExp(`\\.${pageClass}\\s*\\{[^}]*--system-accent:\\s*var\\(--${token}\\)`, "s"),
    `${pageClass} should keep its semantic system accent`
  );
}

assert.match(systemCss, /\.aha-system-primary-panel\s*\{[^}]*system-accent/s, "System primary panels should use the page accent");
assert.match(systemCss, /\.aha-system-status-panel\s*\{[^}]*system-accent/s, "System status panels should use the page accent");
assert.match(systemCss, /\.aha-system-surface \.aha-tech-status\s*\{[^}]*aha-color-violet/s, "Technical diagnostics should remain visually secondary");
assert.match(systemCss, /\.aha-system-surface input:not\(\[type="checkbox"\]\)/, "System forms should use the shared field contract");

for (const id of ["sources-main", "sources-summary", "sources-filters", "sources-events", "sources-insight-links"]) {
  assert.match(sourcesHtml, new RegExp(`id="${id}"`), `Sources should preserve runtime mount #${id}`);
}
for (const id of [
  "privacy-refresh",
  "privacy-export-complete",
  "privacy-settings-form",
  "privacy-storage-summary",
  "privacy-storage-report",
  "privacy-restore-file",
  "privacy-restore-preview-complete",
  "privacy-restore-apply-complete"
]) {
  assert.match(privacyHtml, new RegExp(`id="${id}"`), `Privacy should preserve runtime control #${id}`);
}
for (const id of [
  "aha-status-main",
  "aha-product-integration",
  "aha-product-overall",
  "aha-product-personal-ai",
  "aha-product-training",
  "aha-product-chat",
  "aha-product-primary-action",
  "aha-dashboard-stats",
  "aha-historygo-status",
  "aha-privacy-status",
  "aha-sync-hub-status",
  "aha-recent-activity",
  "out"
]) {
  assert.match(statusHtml, new RegExp(`id="${id}"`), `Status should preserve runtime mount #${id}`);
}

assert.doesNotMatch(sourcesHtml, /js\/ahaIngest\.js/, "Sources audit must remain read-only and must not load ingest");
assert.match(sourcesHtml, /js\/ahaSourcesAudit\.js/, "Sources should preserve its read-only audit renderer");
assert.match(privacyHtml, /js\/ahaPrivacy\.js/, "Privacy should preserve privacy runtime");
assert.match(statusHtml, /js\/ahaProductIntegration\.js/, "Status should preserve product integration runtime");

console.log("AHA system surfaces polish V1 contract passed.");
