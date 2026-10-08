const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("historygo.html", "utf8");
const css = fs.readFileSync("css/aha-historygo-bridge.css", "utf8");

assert.match(html, /css\/aha-historygo-bridge\.css/, "AHA History Go bridge should load its dedicated presentation layer");
assert.match(html, /aha-shell-content aha-historygo-bridge-page/, "AHA History Go bridge should keep the canonical content shell");
assert.match(html, /aha-historygo-hero/, "bridge should use the flattened AHA hero");
assert.match(html, /href="\/History-Go\/"/, "AHA bridge should continue linking to History Go itself");

assert.match(html, /id="hg-import-consent"[^>]*type="checkbox"/, "private import should retain explicit checkbox consent");
assert.match(html, /id="btn-hg-import"[^>]*disabled/, "import button should remain disabled until consent");
assert.match(html, /aktiverer ikke offentlig deling eller modelltrening/, "private import boundary copy should remain visible");
assert.match(html, /confirmed:\s*true/, "import should still pass explicit confirmation");
assert.match(html, /historygo_page_checkbox/, "import should preserve the consent method");
assert.match(html, /consent\.checked\s*=\s*false/, "consent should still reset after import");

const advancedIndex = html.indexOf('id="hg-technical-details"');
assert.ok(advancedIndex >= 0, "bridge should keep a technical import control section");
assert.match(html, /<details id="hg-technical-details" class="aha-panel aha-historygo-advanced">/, "technical import controls should be collapsed by default");
assert.doesNotMatch(html, /<details id="hg-technical-details"[^>]*\sopen(?:\s|>)/, "technical import controls should not dominate initial view");

for (const id of ["hg-import-consent","hg-status-cards","hg-imported-insights-count","hg-music-audit","hg-nearby-music","hg-place-music-preview"]) {
  const index = html.indexOf('id="' + id + '"');
  assert.ok(index >= 0 && index < advancedIndex, 'primary bridge mount #' + id + ' should remain before technical details');
}

for (const id of [
  "hg-import-boundary",
  "hg-import-log-summary",
  "hg-payload-summary",
  "hg-imported-events-total",
  "hg-imported-source-type-counts",
  "hg-imported-events-list"
]) {
  const index = html.indexOf('id="' + id + '"');
  assert.ok(index > advancedIndex, 'technical bridge mount #' + id + ' should stay inside technical details');
}

assert.match(css, /\.aha-historygo-consent-panel\s*\{[^}]*rgba\(126,226,168,.18\)/s, "consent should use a restrained green semantic surface");
assert.match(css, /\.aha-historygo-status-panel\s*\{[^}]*aha-panel-background/s, "status should use the canonical dark panel system");
assert.match(css, /\.aha-historygo-insights-panel\s*\{[^}]*rgba\(116,173,255,.16\)/s, "imported insights should use a blue semantic surface");
assert.match(css, /\.aha-historygo-music-panel\s*\{[^}]*rgba\(126,226,168,.16\)/s, "music discovery should use a green semantic surface");
assert.match(css, /\.aha-historygo-advanced\s*\{[^}]*rgba\(170,145,247,.03\)/s, "technical bridge controls should remain visually secondary");
assert.match(css, /\.aha-historygo-bridge-page \.aha-historygo-music-card\s*\{[^}]*border-radius:\s*var\(--aha-radius-card\)/s, "music cards should use canonical card geometry");
assert.match(css, /\.aha-historygo-bridge-page \.aha-historygo-music-chip\s*\{[^}]*border-radius:\s*var\(--aha-radius-pill\)/s, "music chips should use canonical pill geometry");

for (const src of [
  "js/ahaHistoryGoImportContract.js",
  "js/ahaHistoryGoImport.js",
  "js/ahaMusicHistoryGoDiscovery.js",
  "js/ahaHistoryGoStatus.js"
]) {
  assert.ok(html.includes(src), 'bridge should preserve ' + src);
}

for (const jsPath of ["js/ahaHistoryGoStatus.js", "js/ahaMusicHistoryGoDiscovery.js"]) {
  const js = fs.readFileSync(jsPath, "utf8");
  assert.doesNotMatch(js, /aha-historygo-bridge\.css/, jsPath + " should remain presentation-agnostic");
}

console.log("AHA History Go bridge polish V1 contract passed.");
