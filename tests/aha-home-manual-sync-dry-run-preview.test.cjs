const assert = require('assert');
const fs = require('fs');

const homeCode = fs.readFileSync('index.html', 'utf8');
const dashboardCode = fs.readFileSync('js/ahaDashboard.js', 'utf8');
const adapterCode = fs.readFileSync('js/ahaManualSyncDryRunTargetAdapter.js', 'utf8');
const forbiddenHomeLoads = [
  'js/ahaLists.js',
  'js/ahaPaths.js',
  'js/ahaGroups.js',
  'js/ahaAvisa.js'
];

const syncHubScript = homeCode.indexOf('<script src="js/ahaSyncHub.js"></script>');
const dryRunAdapterScript = homeCode.indexOf('<script src="js/ahaManualSyncDryRunTargetAdapter.js"></script>');
const dashboardScript = homeCode.indexOf('<script src="js/ahaDashboard.js"></script>');
assert.ok(syncHubScript >= 0, 'Home should load the read-only Sync Hub adapter');
assert.ok(dryRunAdapterScript > syncHubScript, 'Home should load the dry-run target adapter after Sync Hub');
assert.ok(dryRunAdapterScript < dashboardScript, 'Home should load the dry-run target adapter before the dashboard');

for (const moduleFile of forbiddenHomeLoads) {
  assert.equal(homeCode.includes(moduleFile), false, `Home must not load ${moduleFile}`);
}

const renderStart = dashboardCode.indexOf('function renderSyncHubStatus()');
const renderEnd = dashboardCode.indexOf('function renderIdentity(', renderStart);
assert.ok(renderStart >= 0 && renderEnd > renderStart, 'dashboard should contain the active Sync Hub renderer');
const renderCode = dashboardCode.slice(renderStart, renderEnd);

assert.match(renderCode, /AHAManualSyncDryRunTargetAdapter/, 'renderer should use the dry-run target adapter');
assert.match(renderCode, /createManualSyncDryRunPlan\s*\(\s*\)/, 'renderer should create the adapter dry-run plan');
for (const label of [
  'Dry-run target preview',
  'Preview only',
  'Execution blocked',
  'Manual sync is NO-GO',
  'Auto-sync permanently forbidden'
]) {
  assert.ok(renderCode.includes(label), `preview should show ${label}`);
}

for (const field of [
  'Mode',
  'Execution allowed',
  'Auto-sync',
  'Blocked',
  'Reason',
  'Blockers',
  'Targets',
  'Local total',
  'Local active',
  'Local tombstones',
  'Runtime loaded',
  'Sync function available',
  'Dry-run only'
]) {
  assert.ok(renderCode.includes(field), `preview should show ${field}`);
}

for (const targetId of ['lists', 'paths', 'groups', 'avisa']) {
  assert.ok(adapterCode.includes(`targetId: "${targetId}"`), `adapter should expose ${targetId}`);
}
for (const targetLabel of ['Lister', 'Stier', 'Grupper', 'AHAavisa']) {
  assert.ok(adapterCode.includes(`label: "${targetLabel}"`), `adapter should expose ${targetLabel}`);
}

assert.ok(renderCode.includes('Dry-run target adapter not loaded'), 'renderer should safely handle a missing adapter');
assert.ok(renderCode.includes('Dry-run preview unavailable'), 'renderer should safely handle a failed preview plan');
assert.equal(/<button\b/i.test(renderCode), false, 'preview must not render an active sync button');
assert.equal(/syncFromDatabase\s*\(/.test(renderCode), false, 'preview must not call syncFromDatabase');
assert.equal(/AHARepository\s*\.\s*(?:save|load)/.test(renderCode), false, 'preview must not call repository save/load');
assert.equal(/localStorage\s*\.\s*(?:setItem|removeItem)\s*\(/.test(renderCode), false, 'preview must not write localStorage');
assert.equal(/\bfetch\s*\(|\bsupabase\s*\.\s*from\s*\(/i.test(renderCode), false, 'preview must not perform database/network calls');

console.log('aha-home-manual-sync-dry-run-preview.test.cjs passed');
