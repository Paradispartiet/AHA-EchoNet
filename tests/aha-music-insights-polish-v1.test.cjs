const assert = require("assert");
const fs = require("fs");

const musicHtml = fs.readFileSync("music.html", "utf8");
const musicCss = fs.readFileSync("css/aha-music.css", "utf8");
const insightsHtml = fs.readFileSync("insights.html", "utf8");
const insightsCss = fs.readFileSync("css/aha-insights.css", "utf8");

assert.match(
  musicHtml,
  /<main class="aha-dashboard aha-shell-wide aha-music-shell aha-music-page" id="aha-music-main">/,
  "Music should use the canonical wide shell"
);
assert.doesNotMatch(musicHtml, /← AHA Dashboard/, "Music should not keep a redundant legacy back link above global navigation");
assert.match(musicHtml, /aha-music-hero/, "Music should use a flattened product hero");
assert.match(musicCss, /\.aha-music-shell\s*\{[^}]*--music-accent:\s*var\(--aha-color-green\)/s, "Music should have a semantic green accent");
assert.match(musicCss, /\.aha-music-controls input,[\s\S]*?background:\s*var\(--aha-color-input\)/, "Music filters should use canonical input surfaces");
assert.match(musicCss, /\.aha-music-tabs button\s*\{[^}]*border-radius:\s*var\(--aha-radius-control\)/s, "Music tabs should use canonical control geometry");
assert.doesNotMatch(musicCss, /\.aha-music-tabs button\s*\{[^}]*border-radius:\s*999px/s, "Music navigation tabs should not render as generic pills");
assert.match(musicCss, /\.aha-music-tabs button\.is-active\s*\{[^}]*aha-color-green-soft/s, "Music active tab should use the green semantic accent");
assert.match(musicCss, /\.aha-music-card,[\s\S]*?background:\s*var\(--aha-color-panel\)/, "Music cards should use canonical black panels");
assert.match(musicCss, /\.aha-music-canon-panel\s*\{[^}]*aha-color-violet/s, "Music Canon should use the violet secondary identity");

for (const id of [
  "spotify-connect-button",
  "spotify-auth-status",
  "spotify-playlists",
  "music-library-controls",
  "music-search",
  "music-filter-playlist",
  "music-filter-artist",
  "music-filter-album",
  "music-filter-year",
  "imported-tracks",
  "aha-music-canon"
]) {
  assert.match(musicHtml, new RegExp(`id="${id}"`), `Music should preserve runtime mount #${id}`);
}

assert.match(insightsHtml, /aha-insights-hero/, "Insights should use the flattened product hero");
assert.match(insightsHtml, /aha-insights-controls-panel/, "Insights should expose a dedicated controls surface");
assert.match(insightsHtml, /aha-insights-meta-panel/, "Insights should expose a dedicated meta surface");
assert.match(insightsCss, /\.insights-controls input,[\s\S]*?background:\s*var\(--aha-color-input\)/, "Insights controls should use canonical field surfaces");
assert.match(insightsCss, /\.insights-page \.insight-card\s*\{[^}]*background:\s*var\(--aha-color-panel\)/s, "Insights archive cards should override old Chat marine cards with canonical black panels");
assert.match(insightsCss, /\.insights-page \.insight-card::before\s*\{[^}]*aha-color-violet/s, "Insights cards should use a restrained violet identity marker");
assert.match(insightsCss, /\.insights-page \.insight-chip\s*\{[^}]*aha-color-cyan-soft/s, "Insights chips should use cyan semantic accents");
assert.match(insightsCss, /\.knowledge-card\s*\{[^}]*rgba\(116,173,255,.04\)/s, "knowledge cards should use a subtle blue accent on black");
assert.match(insightsCss, /@media \(max-width: 720px\)[\s\S]*?\.insights-controls\s*\{[^}]*grid-template-columns:\s*1fr;/, "Insights controls should collapse to one column on mobile");

for (const id of ["insights-refresh", "insights-stats", "insights-search", "insights-filter", "insights-list", "insights-meta"]) {
  assert.match(insightsHtml, new RegExp(`id="${id}"`), `Insights should preserve runtime mount #${id}`);
}

for (const jsPath of ["js/ahaMusic.js", "js/ahaInsights.js"]) {
  const js = fs.readFileSync(jsPath, "utf8");
  assert.doesNotMatch(js, /aha-music-insights-polish-v1/, `${jsPath} should remain presentation-agnostic`);
}

console.log("AHA Music/Insights polish V1 contract passed.");
