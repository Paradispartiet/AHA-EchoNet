const assert = require('assert');
const fs = require('fs');

const index = fs.readFileSync('index.html', 'utf8');
const dashboard = fs.readFileSync('js/ahaDashboard.js', 'utf8');
const modules = fs.readFileSync('js/ahaModules.js', 'utf8');
const css = fs.readFileSync('css/aha-dashboard.css', 'utf8');

assert.ok(index.includes('class="aha-skip-link" href="#aha-home-main"'), 'Home should provide a skip link');
assert.ok(index.includes('<main id="aha-home-main"'), 'Home should expose a labelled main target');
assert.ok(index.includes('<nav id="aha-modules-grid"'), 'module menu should use navigation semantics');
assert.ok(index.includes('aria-labelledby="aha-modules-title"'), 'module menu landmark should have a visible title');
assert.ok(index.includes('aria-labelledby="aha-status-title"'), 'status landmark should have a visible title');

assert.ok(index.includes('id="aha-sync-hub-status" aria-label="AHA Sync Hub status"'), 'read-only Sync Hub should expose a labelled status section');
assert.ok(dashboard.includes('Read-only oversikt. Ingen sync kjøres automatisk.'), 'read-only Sync Hub should explain that it does not auto-sync');
assert.ok(dashboard.includes('role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="aha-sync-confirmation-title"'), 'confirmation modal should be labelled and focusable');
assert.ok(dashboard.includes('disabled aria-disabled=\\"true\\"'), 'Confirm sync should remain disabled when gates fail');
assert.ok(dashboard.includes('id="aha-sync-history-drawer"') && dashboard.includes('aria-labelledby="aha-sync-history-details-title"'), 'details drawer should have a labelled region');
assert.ok(dashboard.includes('aria-label="Close sync run details"'), 'details drawer should have a clear Close action');
assert.ok(dashboard.includes('Read-only summary. Payload and credentials are not shown.'), 'details should clarify sanitized read-only content');
assert.ok(dashboard.includes('event.key !== "Escape"'), 'modal and details drawer should support Escape');
assert.ok(dashboard.includes('No active blockers.'), 'critical blocker empty state should stay explicit');
assert.ok(dashboard.includes('Could not read sync history.'), 'history error should stay clear and sanitized');
assert.ok(dashboard.includes('Modul ikke lastet på Home'), 'missing Home runtimes should remain explicit');
assert.ok(dashboard.includes('No manual sync runs yet.'), 'history empty state should remain clear');

assert.ok(modules.includes('<article class="${tileClass} aha-home-tile"'), 'History Go grouping should remain a non-interactive card');
assert.equal(modules.includes('role="link" tabindex="0"'), false, 'a card containing controls must not impersonate a nested link');
assert.ok(modules.includes('<span>${statusLabel}</span>'), 'module health badges should keep visible status text');
assert.ok(css.includes(':focus-visible'), 'dark theme should provide visible keyboard focus');
assert.ok(css.includes('min-height: 44px'), 'important compact controls should meet the touch-target baseline');
assert.ok(css.includes('max-height: calc(100dvh - 16px)'), 'confirmation modal should fit small viewports');

for (const code of [dashboard, modules]) {
  assert.equal(/autoSync|syncFromDatabase\s*\(/.test(code), false, 'Home UI must not add or call auto-sync');
  assert.equal(/setItem\s*\(\s*["'](?:sync|drawer|modal|diagnostic|selected)/i.test(code), false, 'Home UI must not persist Sync Hub UI state');
}
assert.equal(/AHARepository\s*\.\s*(save|write)|writeAhaManualSyncAuditLog\s*\(/.test(dashboard), false, 'dashboard must not write directly to repository or audit');
assert.equal(/full payload|raw audit json/i.test(index), false, 'Home markup must not expose raw payload or audit data');
for (const file of ['js/ahaLists.js', 'js/ahaPaths.js', 'js/ahaGroups.js', 'js/ahaAvisa.js']) {
  assert.equal(index.includes(file), false, `Home must not load ${file}`);
}

console.log('aha-home-accessibility-polish.test.cjs passed');
