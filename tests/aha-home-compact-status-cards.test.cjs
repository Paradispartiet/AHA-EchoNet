const assert = require('assert');
const fs = require('fs');

const indexCode = fs.readFileSync('index.html', 'utf8');
const dashboardCode = fs.readFileSync('js/ahaDashboard.js', 'utf8');
const dashboardCss = fs.readFileSync('css/aha-dashboard.css', 'utf8');
const forbiddenHomeLoads = [
  'js/ahaLists.js',
  'js/ahaPaths.js',
  'js/ahaGroups.js',
  'js/ahaAvisa.js'
];

assert.ok(indexCode.includes('aside class="aha-panel aha-status-panel"'), 'Home should render the right status panel');
assert.ok(indexCode.includes('id="aha-dashboard-stats"'), 'Home should mount dashboard status cards');
assert.ok(indexCode.includes('id="aha-sync-hub-status"'), 'Home should mount the compact Sync Hub card');

for (const file of forbiddenHomeLoads) {
  assert.equal(indexCode.includes(file), false, `Home must not load ${file}`);
  assert.equal(dashboardCode.includes(file), false, `dashboard must not load ${file}`);
}

for (const label of ['System health', 'Data readiness', 'Blockers']) {
  assert.ok(dashboardCode.includes(label), `compact Home status should include ${label}`);
}

for (const label of ['Sync Hub', 'Target', 'Included', 'Last run', 'Open Sync Hub']) {
  assert.ok(dashboardCode.includes(label), `compact Sync Hub card should include ${label}`);
}

assert.ok(dashboardCode.includes('renderAhaSyncCompactBlockers(blockers, lastRun)'), 'critical Sync Hub blockers should remain visible in the compact card');
assert.ok(dashboardCode.includes('health?.status === "blocked"'), 'blocked modules should remain visible in the Active blockers summary');
assert.ok(dashboardCode.includes('Last manual sync audit failed.'), 'audit failures should remain visible without opening advanced diagnostics');
assert.ok(dashboardCode.includes('No manual sync runs yet.'), 'manual sync history should have a short empty state');
assert.ok(dashboardCode.includes('No active blockers.'), 'blockers should have a short empty state');

assert.ok(dashboardCode.includes('aria-label="AHA Sync Hub advanced diagnostics"'), 'advanced diagnostics should remain available');
assert.ok(dashboardCode.includes('${renderSyncHubPrepPanel(plan)}'), 'advanced diagnostics should retain the existing prep panel');
assert.ok(dashboardCode.includes('${renderAhaManualSyncHistoryPanel()}'), 'advanced diagnostics should retain history and details');
assert.ok(dashboardCode.includes('data-aha-sync-history-run-id'), 'history details action should remain available');

const compactRenderStart = dashboardCode.indexOf('function renderSyncHubStatus()');
const compactRenderEnd = dashboardCode.indexOf('function renderIdentity(', compactRenderStart);
const compactRender = dashboardCode.slice(compactRenderStart, compactRenderEnd);
assert.equal(compactRender.includes('JSON.stringify'), false, 'compact Sync Hub rendering must not stringify full payloads');
assert.equal(/secret|token|password|connection string/i.test(compactRender), false, 'compact Sync Hub rendering must not expose secret fields');
assert.ok(dashboardCss.includes('.aha-compact-status-card'), 'compact card styling should exist');
assert.ok(dashboardCss.includes('.aha-status-badge-blocked'), 'blocked badge styling should exist');
assert.ok(dashboardCss.includes('.aha-sync-hub-advanced'), 'advanced diagnostics styling should exist');

console.log('aha-home-compact-status-cards.test.cjs passed');
