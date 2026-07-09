const assert = require('assert');
const fs = require('fs');

const indexCode = fs.readFileSync('index.html', 'utf8');
const dashboardCode = fs.readFileSync('js/ahaDashboard.js', 'utf8');
const modulesCode = fs.readFileSync('js/ahaModules.js', 'utf8');
const dashboardCss = fs.readFileSync('css/aha-dashboard.css', 'utf8');

const hasHomeCopy = (...copies) => copies.some((copy) =>
  dashboardCode.includes(copy) || indexCode.includes(copy) || modulesCode.includes(copy)
);

for (const title of ['System health', 'Data readiness', 'Blockers', 'Sync Hub', 'AHA Sync-status', 'Manual sync history']) {
  assert.ok(dashboardCode.includes(title), `AHA Home should include the normalized title: ${title}`);
}
assert.ok(
  indexCode.includes('<h2 id="aha-modules-title">Moduler</h2>') || indexCode.includes('<h2 id="aha-modules-title">Modules</h2>'),
  'the module menu should use the normalized, labelled module title'
);
assert.ok(indexCode.includes('<h3>Activity</h3>'), 'the activity card should use the normalized Activity title');

for (const copyGroup of [
  ['Read-only oversikt. Ingen sync kjøres automatisk.', 'Preview only. No data is written and no sync is performed.'],
  ['Ingen sync kjøres her ennå.', 'Manual sync is gated; no auto-sync exists.'],
  ['Latest manual sync runs. Read-only.'],
  ['Module status at a glance.', 'Module status at a glance in the app menu.'],
  ['No manual sync runs yet.'],
  ['No active blockers.'],
  ['Modul ikke lastet på Home', 'This module is listed as a shell and has no Home health source.'],
  ['No warnings.'],
  ['No module data found.'],
  ['Could not read sync history.'],
  ['Manuell sync kommer senere.', 'Manual sync is gated; no auto-sync exists.']
]) {
  assert.ok(hasHomeCopy(...copyGroup), `AHA Home should include normalized copy: ${copyGroup.join(' / ')}`);
}

for (const action of ['View details', 'Close', 'Cancel', 'Prepare sync', 'Manual sync', 'Confirm sync']) {
  assert.ok(dashboardCode.includes(action), `AHA Home should include the normalized action: ${action}`);
}

for (const status of ['Ready', 'Needs review', 'Blocked', 'Warning', 'Missing', 'Empty', 'Unknown', 'Success', 'Failed']) {
  assert.ok(dashboardCode.includes(status) || modulesCode.includes(status), `AHA Home should include the normalized status: ${status}`);
}

const historyRenderStart = dashboardCode.indexOf('function renderAhaManualSyncHistoryList()');
const historyRenderEnd = dashboardCode.indexOf('function renderAhaManualSyncHistoryDetailsDrawer()', historyRenderStart);
const historyRender = dashboardCode.slice(historyRenderStart, historyRenderEnd);
assert.equal(historyRender.includes('state.reason'), false, 'history errors must not render raw/internal reasons');
assert.ok(dashboardCss.includes('.aha-compact-state-error'), 'compact error-state styling should exist');

const compactBlockerStart = dashboardCode.indexOf('function renderAhaSyncCompactBlockers(');
const compactBlockerEnd = dashboardCode.indexOf('function renderSyncHubStatus()', compactBlockerStart);
const compactBlockerRender = dashboardCode.slice(compactBlockerStart, compactBlockerEnd);
assert.equal(compactBlockerRender.includes('lastRun.reason'), false, 'compact blockers must not expose raw last-run errors');
assert.ok(compactBlockerRender.includes('Last manual sync audit failed.'), 'critical audit failures must remain visible');
assert.ok(dashboardCode.includes('health?.status === "blocked"'), 'blocked modules must remain visible');

for (const file of ['js/ahaLists.js', 'js/ahaPaths.js', 'js/ahaGroups.js', 'js/ahaAvisa.js']) {
  assert.equal(indexCode.includes(file), false, `Home must not load ${file}`);
}
assert.equal(/localStorage\.setItem\([^)]*(sync|hub|prep|target|modal)/i.test(dashboardCode), false, 'Home must not persist Sync Hub UI state');
assert.equal(/(?:start|enable|run)AutoSync\s*\(|autoSync\s*=\s*true|syncFromDatabase\s*\(/i.test(dashboardCode), false, 'Home must not introduce or call auto-sync entry points');
assert.equal(/createClient\s*\(/.test(dashboardCode), false, 'Home must not create a database client');
assert.equal(/JSON\.stringify\s*\([^)]*(payload|audit)/i.test(dashboardCode), false, 'Home must not dump full payload or audit JSON');

console.log('aha-home-copy-normalization.test.cjs passed');
