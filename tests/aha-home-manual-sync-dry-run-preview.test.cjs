const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const HOME_FILE = 'index.html';
const DASHBOARD_FILE = 'js/ahaDashboard.js';
const ADAPTER_FILE = 'js/ahaManualSyncDryRunTargetAdapter.js';
const HOME_SYNC_MODULES = [
  'js/ahaLists.js',
  'js/ahaPaths.js',
  'js/ahaGroups.js',
  'js/ahaAvisa.js'
];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`could not extract ${name}`);
}

const homeCode = read(HOME_FILE);
const dashboardCode = read(DASHBOARD_FILE);
const adapterCode = read(ADAPTER_FILE);
const syncHubIndex = homeCode.indexOf('js/ahaSyncHub.js');
const dryRunAdapterIndex = homeCode.indexOf('js/ahaManualSyncDryRunTargetAdapter.js');
const dashboardIndex = homeCode.indexOf('js/ahaDashboard.js');

assert.notEqual(dryRunAdapterIndex, -1, 'Home should load the dry-run target adapter');
assert.ok(syncHubIndex < dryRunAdapterIndex, 'dry-run target adapter should load after ahaSyncHub.js');
assert.ok(dryRunAdapterIndex < dashboardIndex, 'dry-run target adapter should load before ahaDashboard.js');
for (const moduleFile of HOME_SYNC_MODULES) {
  assert.equal(homeCode.includes(moduleFile), false, `Home must not load ${moduleFile}`);
}

const previewRenderer = extractFunction(dashboardCode, 'renderAhaManualSyncDryRunTargetPreview');
const syncHubRenderer = extractFunction(dashboardCode, 'renderSyncHubStatus');
assert.match(previewRenderer, /AHAManualSyncDryRunTargetAdapter/);
assert.match(previewRenderer, /createManualSyncDryRunPlan\s*\(\s*\)/);
assert.match(syncHubRenderer, /renderAhaManualSyncDryRunTargetPreview\s*\(\s*\)/);
assert.match(previewRenderer, /Dry-run target preview/);
assert.match(previewRenderer, /Preview only/);
assert.match(previewRenderer, /Execution blocked/);
assert.match(previewRenderer, /Manual sync is NO-GO/);
assert.match(previewRenderer, /Auto-sync permanently forbidden/);
assert.match(previewRenderer, /Dry-run target adapter not loaded/);
assert.match(previewRenderer, /Dry-run preview unavailable/);

const context = vm.createContext({
  window: {
    localStorage: {
      getItem(key) {
        const records = {
          aha_lists_v1: [{ id: 'list-active' }, { id: 'list-deleted', deletedAt: '2026-06-01' }],
          aha_paths_v1: [{ id: 'path-active' }],
          aha_groups_v1: [],
          aha_articles_v1: [{ id: 'article-active' }]
        };
        return JSON.stringify(records[key] || []);
      }
    }
  },
  console,
  JSON,
  Object,
  Array,
  Boolean,
  String,
  Set
});
vm.runInContext(adapterCode, context, { filename: ADAPTER_FILE });
vm.runInContext(`
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[character]);
  }
  ${extractFunction(dashboardCode, 'formatAhaSyncPreviewValue')}
  ${previewRenderer}
  window.__renderPreview = renderAhaManualSyncDryRunTargetPreview;
`, context, { filename: DASHBOARD_FILE });

const previewHtml = context.window.__renderPreview();
for (const [targetId, label] of [['lists', 'Lister'], ['paths', 'Stier'], ['groups', 'Grupper'], ['avisa', 'AHAavisa']]) {
  assert.match(previewHtml, new RegExp(`>${targetId}<`), `preview should show ${targetId} targetId`);
  assert.match(previewHtml, new RegExp(`>${label}<`), `preview should show ${label} label`);
}
for (const field of [
  'mode', 'executionAllowed', 'autoSync', 'blocked', 'reason', 'blockers', 'targets',
  'localTotal', 'localActive', 'localTombstones', 'runtimeLoaded',
  'syncFunctionAvailable', 'dryRunOnly'
]) {
  assert.match(previewHtml, new RegExp(`>${field}<`), `preview should show ${field}`);
}
assert.match(previewHtml, />2<\/dd>/, 'preview should show local list total from the adapter plan');
assert.equal(/<button\b/i.test(previewRenderer), false, 'preview must not contain an active or disabled sync button');

const forbiddenPreviewCalls = [
  [/syncFromDatabase\s*\(/, 'syncFromDatabase'],
  [/AHARepository\s*\.\s*(?:save|load)/, 'AHARepository save/load'],
  [/\bsupabase\s*\.\s*from\s*\(/i, 'Supabase'],
  [/\bfetch\s*\(/, 'fetch'],
  [/localStorage\s*\.\s*(?:setItem|removeItem)\s*\(/, 'localStorage write']
];
for (const [pattern, label] of forbiddenPreviewCalls) {
  assert.equal(pattern.test(previewRenderer), false, `preview renderer must not contain ${label}`);
  assert.equal(pattern.test(syncHubRenderer), false, `Sync Hub renderer must not contain ${label}`);
}

console.log('aha-home-manual-sync-dry-run-preview.test.cjs passed');
