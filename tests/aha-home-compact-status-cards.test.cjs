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

for (const label of ['AHA Sync-status', 'Read-only oversikt. Ingen sync kjøres automatisk.', 'Ingen sync kjøres her ennå.', 'Manuell sync kommer senere.']) {
  assert.ok(dashboardCode.includes(label) || indexCode.includes(label), `read-only Sync Hub should include ${label}`);
}

for (const key of ['aha_lists_v1', 'aha_paths_v1', 'aha_groups_v1', 'aha_articles_v1']) {
  assert.ok(dashboardCode.includes(key), `read-only Sync Hub should inspect ${key}`);
}

for (const table of ['aha_lists', 'aha_paths', 'aha_groups', 'aha_articles']) {
  assert.ok(dashboardCode.includes(`table: "${table}"`), `read-only Sync Hub should document ${table}`);
}

assert.ok(dashboardCode.includes('function isDeletedRecord(record)'), 'Sync Hub should define a tombstone helper');
assert.ok(dashboardCode.includes('record?.deletedAt || record?.deleted_at'), 'Sync Hub should filter both tombstone field variants');
assert.ok(dashboardCode.includes('function countLocalActiveRecords(key)'), 'Sync Hub should count active local records');
assert.ok(dashboardCode.includes('detail: "Modul ikke lastet på Home"'), 'missing runtimes should be explained');
assert.ok(dashboardCode.includes('label: "Sync-klar"'), 'loaded runtimes with sync capability should be marked sync-ready');

const compactRenderStart = dashboardCode.indexOf('function renderSyncHubStatus()');
const compactRenderEnd = dashboardCode.indexOf('function renderIdentity(', compactRenderStart);
const compactRender = dashboardCode.slice(compactRenderStart, compactRenderEnd);
assert.equal(compactRender.includes('<button'), false, 'read-only Sync Hub must not render a sync button');
assert.equal(compactRender.includes('syncFromDatabase('), false, 'read-only Sync Hub must not call syncFromDatabase');
assert.equal(compactRender.includes('AHARepository'), false, 'read-only Sync Hub must not call AHARepository');
assert.equal(compactRender.includes('localStorage.setItem'), false, 'read-only Sync Hub must not write localStorage');
assert.equal(compactRender.includes('JSON.stringify'), false, 'read-only Sync Hub rendering must not stringify full payloads');
assert.equal(/secret|token|password|connection string/i.test(compactRender), false, 'read-only Sync Hub rendering must not expose secret fields');
assert.ok(dashboardCss.includes('.aha-compact-status-card'), 'compact card styling should exist');
assert.ok(dashboardCss.includes('.aha-status-badge-blocked'), 'blocked badge styling should exist');
assert.ok(dashboardCss.includes('.aha-sync-hub-list'), 'read-only Sync Hub list styling should exist');

console.log('aha-home-compact-status-cards.test.cjs passed');
