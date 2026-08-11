const assert = require('assert');
const fs = require('fs');

const read = (file) => fs.readFileSync(file, 'utf8');
const nav = read('js/ahaGlobalNav.js');
const css = read('css/aha-global-nav.css');

const primary = [
  ['Start', 'index.html'],
  ['Chat', 'chat.html'],
  ['Bibliotek', 'search.html'],
  ['Personal AI', 'personal-ai.html'],
  ['Mitt AHA', 'profile.html']
];
for (const [label, href] of primary) {
  assert.ok(nav.includes(`label: "${label}", href: "${href}"`), `${label} should remain a canonical primary destination`);
}
assert.equal((nav.match(/const PRIMARY_NAV/g) || []).length, 1, 'there should be one canonical primary nav definition');

const userFacingPages = [
  'index.html',
  'chat.html',
  'insights.html',
  'search.html',
  'personal-ai.html',
  'profile.html',
  'privacy.html',
  'notes.html',
  'gallery.html',
  'insta.html',
  'music.html',
  'feed.html',
  'lists.html',
  'paths.html',
  'mindmap.html',
  'knowledge-workbench.html'
];
for (const file of userFacingPages) {
  const html = read(file);
  assert.ok(html.includes('id="aha-global-nav"'), `${file} should expose the shared product-nav mount`);
  assert.ok(html.includes('js/ahaGlobalNav.js'), `${file} should load the shared product navigation`);
  assert.ok(html.includes('css/aha-global-nav.css'), `${file} should load the shared product navigation styles`);
}

// Every important existing destination stays reachable, but technical implementation
// vocabulary is intentionally subordinate to the normal journey.
for (const id of ['insights', 'knowledge-workbench', 'lists', 'paths', 'mindmap', 'notes', 'gallery', 'insta', 'music', 'feed', 'avisa', 'privacy', 'historygo']) {
  assert.ok(nav.includes(`moduleId: "${id}"`), `${id} should remain reachable from Mer`);
}
for (const id of ['sources', 'data-intake', 'knowledge-curation', 'knowledge-map', 'training', 'sync-hub']) {
  assert.ok(nav.includes(`moduleId: "${id}"`), `${id} should remain reachable in advanced tools`);
}
assert.ok(nav.includes('Disse er ikke del av den vanlige AHA-løypen.'), 'advanced tools should explain their subordinate role');

// Duplicate navigation maps are suppressed instead of creating another data model.
assert.match(nav, /querySelector\("\.aha-modules-panel"\)\?\.setAttribute\("hidden", ""\)/, 'Home module index should be suppressed by the shared shell');
assert.match(nav, /getElementById\("aha-modules-grid"\)\?\.closest\("section"\)\?\.setAttribute\("hidden", ""\)/, 'Profile duplicate module index should be suppressed');
assert.match(nav, /\.aha-module-actions a\[href="index\.html"\]/, 'redundant per-page Home actions should be normalized away');
assert.match(nav, /aha-chat-header-simplified/, 'Chat should receive the shared simplified header treatment');
assert.match(css, /\.aha-chat-header-simplified \.profile-indicator/, 'Chat module-link row should not compete with global nav');

// Mobile preserves the three essential actions even when the full five-link row cannot fit.
assert.match(css, /@media \(max-width: 520px\)/);
assert.match(css, /data-primary="home"[\s\S]*data-primary="personal-ai"[\s\S]*display:\s*none/, 'narrow layouts may hide duplicate Home and Personal AI links');
assert.equal(/data-primary="chat"[^}]*display:\s*none/.test(css), false, 'Chat must remain primary on narrow screens');
assert.equal(/data-primary="library"[^}]*display:\s*none/.test(css), false, 'Bibliotek must remain primary on narrow screens');
assert.equal(/data-primary="profile"[^}]*display:\s*none/.test(css), false, 'Mitt AHA must remain primary on narrow screens');

console.log('aha-unified-product-navigation.test.cjs passed');
