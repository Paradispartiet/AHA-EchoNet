const assert = require("assert");
const fs = require("fs");

const searchHtml = fs.readFileSync("search.html", "utf8");
const avisaHtml = fs.readFileSync("avisa.html", "utf8");
const searchCss = fs.readFileSync("css/aha-search.css", "utf8");
const avisaCss = fs.readFileSync("css/aha-avisa.css", "utf8");

assert.match(searchHtml, /<main class="aha-dashboard aha-shell-content aha-search-page">/, "Search should use the canonical content shell");
assert.match(avisaHtml, /<main class="aha-dashboard aha-shell-content aha-avisa-page">/, "AHAavisa should use the canonical content shell");
assert.doesNotMatch(searchHtml, /<main[^>]*style=["'][^"']*max-width/i, "Search should not own shell width inline");
assert.doesNotMatch(avisaHtml, /<main[^>]*style=["'][^"']*max-width/i, "AHAavisa should not own shell width inline");

const forbiddenLightPalette = /#(?:fff|ffffff|eef3ff|eef2ff|e2e4ea|d6d8de|d8def8|fff5d6|e7f8e9|e7f0ff|f2edff|e8f6ef|1c2b4a|27324a|46238a|185d36|4864e8)\b/i;
assert.doesNotMatch(searchCss, forbiddenLightPalette, "Search should not restore its old light-theme palette");
assert.doesNotMatch(avisaCss, forbiddenLightPalette, "AHAavisa should not restore its old light-theme palette");

assert.match(searchCss, /\.aha-search-card\s*\{[^}]*background:[\s\S]*var\(--aha-color-panel\)/, "Search result cards should use canonical dark panels");
assert.match(searchCss, /\.aha-search-badge\s*\{[^}]*aha-color-violet-soft/s, "Search badges should use an AHA semantic accent");
assert.match(searchCss, /#search-query\s*\{[^}]*min-height:\s*52px;/s, "Search should keep one prominent search input");

assert.match(avisaCss, /\.avisa-badge\s*\{[^}]*aha-color-blue-soft/s, "AHAavisa stats should use dark-mode AHA tokens");
assert.match(avisaCss, /\.section-filter button\.is-active\s*\{[^}]*aha-color-blue-soft/s, "AHAavisa active filters should use the canonical active treatment");
assert.match(avisaCss, /\.status-badge\.status-ready\s*\{[^}]*aha-color-green-soft/s, "AHAavisa ready status should keep a semantic green state");
assert.match(avisaCss, /\.aha-avisa-page \.avisa-article\s*\{[^}]*aha-color-panel/s, "AHAavisa article cards should use canonical dark panels");

for (const [path, ids] of [
  ["search.html", ["search-query", "search-library-groups", "search-results", "search-advanced"]],
  ["avisa.html", ["avisa-create", "avisa-articles", "avisa-refresh-btn", "avisa-create-btn"]]
]) {
  const html = fs.readFileSync(path, "utf8");
  for (const id of ids) assert.match(html, new RegExp(`id="${id}"`), `${path} should preserve runtime mount #${id}`);
}

console.log("AHA Search/AHAavisa dark cleanup V1 contract passed.");
