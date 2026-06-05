const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const FORBIDDEN_HOME_MODULE_LOADS = [
  'js/ahaLists.js',
  'js/ahaPaths.js',
  'js/ahaGroups.js',
  'js/ahaAvisa.js'
];

function loadScript(file, context) {
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, context, { filename: file });
}

function extractDashboardSyncHubCode(dashboardCode) {
  const start = dashboardCode.indexOf('const SYNC_HUB_DRY_RUN_SOURCES');
  assert.notEqual(start, -1, 'dashboard Sync Hub source block should exist');
  return dashboardCode.slice(start);
}

function repository() {
  const calls = [];
  return {
    calls,
    saveList(record) { calls.push(['saveList', record]); return { ok: true }; },
    savePath(record) { calls.push(['savePath', record]); return { ok: true }; },
    saveGroup(record) { calls.push(['saveGroup', record]); return { ok: true }; },
    saveArticle(record) { calls.push(['saveArticle', record]); return { ok: true }; }
  };
}

function readyInput(patch = {}) {
  return {
    target: { id: 'database_existing', status: 'configured' },
    readiness: { status: 'ready' },
    validation: { status: 'valid', errorCount: 0, warningCount: 0 },
    checklist: { summary: { passed: 3, warning: 0, blocked: 0 }, items: [] },
    payloadPreview: {
      modules: [
        { id: 'lists', included: true, itemCount: 1, items: [{ id: 'l1' }], errors: [], validationStatus: 'valid' }
      ],
      modulesIncluded: 1,
      modulesExcluded: 0,
      totalPreviewItems: 1
    },
    ...patch
  };
}

(async function run() {
  const adapterCode = fs.readFileSync('js/ahaManualSyncAdapter.js', 'utf8');
  const stateMachineCode = fs.readFileSync('js/ahaManualSyncStateMachine.js', 'utf8');
  const dashboardCode = fs.readFileSync('js/ahaDashboard.js', 'utf8');
  const syncHubCode = extractDashboardSyncHubCode(dashboardCode);
  const indexCode = fs.readFileSync('index.html', 'utf8');

  assert.equal(/localStorage\s*\.\s*setItem\s*\(/.test(adapterCode), false, 'manual sync adapter must not use localStorage.setItem for execution state');
  assert.equal(/localStorage\s*\.\s*setItem\s*\(/.test(stateMachineCode), false, 'state machine must not use localStorage.setItem for execution state');
  assert.equal(/AHARepository\s*\.\s*save/.test(syncHubCode), false, 'dashboard Sync Hub must not write directly to database/repository');
  assert.equal(/AHARepository\s*\.\s*load/.test(syncHubCode), false, 'dashboard Sync Hub must not load directly through repository');
  assert.equal(/executeAhaManualSyncRun/.test(syncHubCode), true, 'dashboard may only delegate explicit confirmation to adapter');
  assert.equal(/addEventListener\("change"[\s\S]{0,500}executeAhaManualSyncRun/.test(syncHubCode), false, 'target selection must not execute sync');
  assert.equal(/isAhaManualSyncConfirmationModalOpen = true[\s\S]{0,500}executeAhaManualSyncRun/.test(syncHubCode), false, 'modal open must not execute sync');

  for (const file of FORBIDDEN_HOME_MODULE_LOADS) {
    assert.equal(indexCode.includes(file), false, `Home must not load ${file}`);
    assert.equal(dashboardCode.includes(file), false, `dashboard must not import/load ${file}`);
  }

  assert.ok(dashboardCode.includes('id: "database_existing"'), 'target selector should include existing database target');
  assert.ok(dashboardCode.includes('id="aha-sync-confirm-run"'), 'confirm sync button should exist in modal');
  assert.ok(dashboardCode.includes('model.canConfirm ? "" : " disabled'), 'confirm sync button should be gated by canConfirm');

  const repo = repository();
  const context = vm.createContext({ window: { AHARepository: repo }, module: { exports: {} }, exports: {}, console, Date, Object, Array, String, Math, Promise, Error, Set });
  loadScript('js/ahaManualSyncStateMachine.js', context);
  loadScript('js/ahaManualSyncAdapter.js', context);
  const adapter = context.window.AHAManualSyncAdapter;

  const status = adapter.getAhaManualSyncAdapterStatus();
  assert.equal(status.adapterStatus, 'ready');
  assert.equal(status.target, 'database_existing');
  assert.equal(status.targetStatus, 'configured');
  assert.equal(status.canExecute, true);

  const dryRun = adapter.runAhaManualSyncTargetDryRun(readyInput());
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.wouldWrite, false, 'dry-run must not write');
  assert.equal(repo.calls.length, 0, 'dry-run must not call repository writes');

  const prepared = adapter.prepareAhaManualSyncRun(readyInput());
  assert.equal(prepared.status, 'prepared');
  assert.equal(repo.calls.length, 0, 'prepare must not call repository writes');

  const blocked = await adapter.executeAhaManualSyncRun(readyInput());
  assert.equal(blocked.status, 'blocked', 'execution without confirmation remains blocked');
  assert.equal(repo.calls.length, 0, 'blocked execution must not call repository writes');

  console.log('aha-manual-sync-activation-blockers.test.cjs passed');
})();
