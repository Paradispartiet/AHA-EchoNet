const assert = require('assert');
const fs = require('fs');

const indexCode = fs.readFileSync('index.html', 'utf8');
const dashboardCode = fs.readFileSync('js/ahaDashboard.js', 'utf8');
const modulesCode = fs.readFileSync('js/ahaModules.js', 'utf8');
const dashboardCss = fs.readFileSync('css/aha-dashboard.css', 'utf8');

for (const title of ['System health', 'Data readiness', 'Blockers', 'Sync Hub', 'Manual sync history', 'Advanced diagnostics']) {
  assert.ok(dashboardCode.includes(title), `AHA Home should include the normalized title: ${title}`);
}
assert.ok(indexCode.includes('<h2 id="aha-modules-title">Modules</h2>'), 'the module menu should use the normalized, labelled Modules title');
assert.ok(indexCode.includes('<h3>Activity</h3>'), 'the activity card should use the normalized Activity title');

for (const copy of [
  'Manual only. No auto-sync.',
  'Read-only diagnostics.',
  'Latest manual sync runs. Read-only.',
  'Module status at a glance.',
  'No manual sync runs yet.',
  'No active blockers.',
  'Target not configured.',
  'No warnings.',
  'No module data found.',
  'Could not read sync history.',
  'Could not inspect local data.'
]) {
  assert.ok(dashboardCode.includes(copy) || indexCode.includes(copy), `AHA Home should include normalized copy: ${copy}`);
}

for (const action of ['Open Sync Hub', 'View details', 'Close', 'Cancel', 'Prepare sync', 'Manual sync', 'Confirm sync']) {
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
assert.equal(/autoSync|syncFromDatabase/.test(dashboardCode), false, 'Home must not introduce auto-sync entry points');
assert.equal(/createClient\s*\(/.test(dashboardCode), false, 'Home must not create a database client');
assert.equal(/JSON\.stringify\s*\([^)]*(payload|audit)/i.test(dashboardCode), false, 'Home must not dump full payload or audit JSON');

console.log('aha-home-copy-normalization.test.cjs passed');
