const assert = require('assert');
const fs = require('fs');

const nav = fs.readFileSync('js/ahaGlobalNav.js', 'utf8');
const css = fs.readFileSync('css/aha-global-nav.css', 'utf8');

// Top-level navigation is a small product map, not the internal module registry.
assert.match(nav, /label: "Start", href: "index\.html"/);
assert.match(nav, /label: "Chat", href: "chat\.html"/);
assert.match(nav, /label: "Bibliotek", href: "search\.html"/);
assert.match(nav, /label: "Personal AI", href: "personal-ai\.html"/);
assert.match(nav, /label: "Mitt AHA", href: "profile\.html"/);
assert.match(nav, /<span>Mer<\/span>/, 'secondary destinations should live under a human-facing Mer control');
assert.equal(/aha-global-nav-home" href="sync\.html">Sync Hub/.test(nav), false, 'Sync Hub must not compete in the primary bar');
assert.equal(/<span>Moduler<\/span>/.test(nav), false, 'internal module vocabulary must not be the main navigation label');

// The overlay remains an accessible, body-level dialog.
assert.match(nav, /id="aha-global-nav-overlay" hidden/, 'overlay should still render hidden by default');
assert.match(nav, /aria-label="Utforsk AHA"/, 'overlay should use a user-facing label');
assert.match(nav, /global\.document\.body\.appendChild\(overlay\)/, 'render should move the overlay to document.body');
assert.match(nav, /function bindEvents\(mount, overlay\)/, 'event binding should keep the moved overlay reference');
assert.match(nav, /function open\(\) \{[\s\S]*?overlay\.hidden = false;[\s\S]*?aha-global-nav-open/, 'open should expose the body-level overlay');
assert.match(nav, /function close\(\) \{[\s\S]*?overlay\.hidden = true;[\s\S]*?aha-global-nav-open/, 'close should restore the closed body state');
assert.match(nav, /event\.key === "Escape"/, 'Escape should close the overlay');
assert.match(css, /\.aha-global-nav-overlay\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*z-index:\s*1000;/, 'overlay should remain fixed fullscreen/sidepanel CSS');

// Advanced/system tools remain reachable without taking over the normal journey.
assert.match(nav, /<summary>Avanserte verktøy<\/summary>/);
assert.match(nav, /href="modules\.html">Se alle verktøy og moduler<\/a>/);
assert.match(nav, /moduleId: "sources"/);
assert.match(nav, /moduleId: "data-intake"/);
assert.match(nav, /moduleId: "training"/);
assert.match(nav, /moduleId: "sync-hub"/);

console.log('aha-global-nav-overlay.test.cjs passed');
