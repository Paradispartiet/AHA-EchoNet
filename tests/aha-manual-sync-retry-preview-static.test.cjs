const assert = require('assert');
const fs = require('fs');

const dashboard = fs.readFileSync('js/ahaDashboard.js', 'utf8');
const helper = fs.readFileSync('js/ahaManualSyncHistory.js', 'utf8');
const adapter = fs.readFileSync('js/ahaManualSyncAdapter.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const previewStart = dashboard.indexOf('function getAhaManualSyncHistoryHelpers');
const previewEnd = dashboard.indexOf('function renderSyncHubPrepPanel', previewStart);
const previewCode = dashboard.slice(previewStart, previewEnd);
const forbiddenHomeModules = ['js/ahaLists.js', 'js/ahaPaths.js', 'js/ahaGroups.js', 'js/ahaAvisa.js'];

(function run() {
  assert.notEqual(previewStart, -1, 'history/retry preview UI block should exist');
  assert.ok(previewCode.includes('Retry eligibility'));
  assert.ok(previewCode.includes('Read-only eligibility preview. Retry is not available.'));
  assert.equal(previewCode.includes('Retry now'), false, 'preview must not show a Retry now action');

  for (const code of [previewCode, helper]) {
    assert.equal(/executeAhaManualSyncRun\s*\(/.test(code), false, 'retry preview must not execute manual sync');
    assert.equal(/\.execute\s*\(/.test(code), false, 'retry preview must not call adapter execute');
    assert.equal(/writeAhaManualSyncAuditLog\s*\(/.test(code), false, 'retry preview must not write audit logs');
    assert.equal(/localStorage\s*\.\s*setItem\s*\(/.test(code), false, 'retry preview must not persist retry state');
    assert.equal(/syncFromDatabase|autoSync/.test(code), false, 'retry preview must not add auto-sync');
  }

  assert.equal(/AHARepository\s*\.\s*save/.test(previewCode), false, 'dashboard preview must not write through repository');
  assert.equal(/supabase|createClient|credentials/i.test(helper), false, 'history helper must not add a database client or credentials');
  assert.ok(adapter.includes('loadAhaManualSyncHistory'), 'adapter should expose the approved read-only history boundary');
  assert.equal(/function loadAhaManualSyncHistory[\s\S]*?writeAhaManualSyncAuditLog\s*\(/.test(adapter), false, 'history reader must not call audit writer');

  for (const modulePath of forbiddenHomeModules) {
    assert.equal(index.includes(modulePath), false, `Home must not load ${modulePath}`);
    assert.equal(dashboard.includes(modulePath), false, `dashboard must not load ${modulePath}`);
  }

  console.log('aha-manual-sync-retry-preview-static.test.cjs passed');
})();
