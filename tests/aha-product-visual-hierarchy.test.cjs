const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const nav = fs.readFileSync('js/ahaGlobalNav.js', 'utf8');
const css = fs.readFileSync('css/aha-global-nav.css', 'utf8');

// Load the presentation helper without rendering a DOM.
const document = {
  readyState: 'loading',
  addEventListener() {},
  getElementById() { return null; }
};
const window = { document, location: { pathname: '/notes.html' } };
vm.runInNewContext(nav, { window }, { filename: 'js/ahaGlobalNav.js' });
const api = window.AHAGlobalNav;

assert.equal(typeof api.isTechnicalEyebrow, 'function', 'technical-label classification should be inspectable');
for (const label of ['AHA Modul', 'AHA System · Fase 3H', 'AHA System', 'Fase 2']) {
  assert.equal(api.isTechnicalEyebrow(label), true, `${label} should be treated as implementation scaffolding`);
}
for (const label of ['Profil', 'Søk / Bibliotek', 'AHA Knowledge Workbench', 'AHA Innsiktsarkiv', 'Min Personal AI', 'Din selvmodell']) {
  assert.equal(api.isTechnicalEyebrow(label), false, `${label} should remain meaningful user-facing hierarchy`);
}

assert.match(nav, /querySelectorAll\("\.aha-module-shell \.eyebrow"\)/, 'shared shell should inspect existing eyebrows instead of editing every page separately');
assert.match(nav, /eyebrow\.classList\.add\("aha-technical-eyebrow"\)/, 'technical eyebrow should receive one shared presentation class');
assert.match(nav, /eyebrow\.setAttribute\("aria-hidden", "true"\)/, 'hidden implementation labels should also leave the accessibility hierarchy');

assert.match(css, /\.aha-technical-eyebrow\s*\{?[^}]*display:\s*none\s*!important;/, 'generic implementation labels should be visually removed');
assert.match(css, /body\.aha-product-shell \.aha-module-shell-header h1\s*\{[^}]*font-size:\s*clamp\([^}]*line-height:\s*1\.08;/, 'shared pages should have one strong heading scale');
assert.match(css, /body\.aha-product-shell \.aha-module-shell \.aha-module-purpose\s*\{[^}]*max-width:\s*74ch;[^}]*line-height:\s*1\.55;/, 'shared purpose copy should have a readable line length');
assert.match(css, /body\.aha-product-shell \.aha-module-shell \.aha-module-actions\s*\{[^}]*margin-top:\s*14px;[^}]*gap:\s*8px;/, 'module actions should share a compact rhythm');
assert.match(css, /@media \(max-width: 520px\)[\s\S]*body\.aha-product-shell main\.aha-dashboard\s*\{\s*padding-top:\s*16px;/, 'narrow screens should get tighter top rhythm');

// This layer is presentation-only: it must not acquire persistence or integration behavior.
for (const source of [nav, css]) {
  assert.equal(/localStorage\.(setItem|removeItem)/.test(source), false, 'visual shell must not write localStorage');
  assert.equal(/sessionStorage\.(setItem|removeItem)/.test(source), false, 'visual shell must not write sessionStorage');
  assert.equal(/\bfetch\s*\(/.test(source), false, 'visual shell must not call backend/network APIs');
  assert.equal(/supabase|createClient\s*\(/i.test(source), false, 'visual shell must not acquire database behavior');
}

console.log('aha-product-visual-hierarchy.test.cjs passed');
