const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const MATRIX_FILE = 'docs/AHA_SYNC_HUB_GO_NO_GO_MATRIX.md';
const SYNC_HUB_FILE = 'js/ahaSyncHub.js';
const ADAPTER_FILE = 'js/ahaManualSyncAdapter.js';
const STATE_MACHINE_FILE = 'js/ahaManualSyncStateMachine.js';
const DASHBOARD_FILE = 'js/ahaDashboard.js';
const HOME_FILE = 'index.html';
const ACTIVATION_PR = 'feat: activate manual AHA Sync Hub execution';
const HOME_SYNC_MODULES = [
  'js/ahaLists.js',
  'js/ahaPaths.js',
  'js/ahaGroups.js',
  'js/ahaAvisa.js'
];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function loadScript(file, context) {
  vm.runInContext(read(file), context, { filename: file });
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

function readyInput(patch = {}) {
  return {
    target: { id: 'database_existing', status: 'configured' },
    readiness: { status: 'ready' },
    validation: { status: 'valid', errorCount: 0, warningCount: 0 },
    checklist: { summary: { passed: 3, warning: 0, blocked: 0 }, items: [] },
    payloadPreview: {
      modules: [
        { id: 'lists', included: true, itemCount: 1, items: [{ id: 'list-1' }], errors: [], validationStatus: 'valid' }
      ],
      modulesIncluded: 1,
      modulesExcluded: 0,
      totalPreviewItems: 1
    },
    ...patch
  };
}

(async function run() {
  const matrixCode = read(MATRIX_FILE);
  const syncHubCode = read(SYNC_HUB_FILE);
  const adapterCode = read(ADAPTER_FILE);
  const stateMachineCode = read(STATE_MACHINE_FILE);
  const dashboardCode = read(DASHBOARD_FILE);
  const homeCode = read(HOME_FILE);

  // The decision document and its complete A-J activation boundary are required evidence.
  assert.match(matrixCode, /NO-GO/, 'matrix must retain the NO-GO decision');
  assert.match(matrixCode, /auto-sync/i, 'matrix must retain the auto-sync prohibition');
  assert.ok(matrixCode.includes(ACTIVATION_PR), 'matrix must name the dedicated activation PR exactly');
  assert.match(matrixCode, /egen fremtidig activation-PR/i, 'manual sync activation must require a separate future PR');
  for (const gate of 'ABCDEFGHIJ') {
    assert.match(matrixCode, new RegExp(`\\*\\*${gate}\\.`), `matrix must retain gate ${gate}`);
  }

  // The public Sync Hub runtime remains inspect-only and cannot perform side effects.
  const storageCalls = [];
  let syncCalls = 0;
  const syncContext = vm.createContext({
    window: {
      localStorage: {
        getItem(key) { storageCalls.push(['getItem', key]); return '[]'; },
        setItem(key, value) { storageCalls.push(['setItem', key, value]); },
        removeItem(key) { storageCalls.push(['removeItem', key]); }
      },
      AHALists: { syncFromDatabase() { syncCalls += 1; } },
      AHARepository: new Proxy({}, {
        get() { throw new Error('read-only Sync Hub must not access AHARepository'); }
      })
    },
    console
  });
  loadScript(SYNC_HUB_FILE, syncContext);
  const hub = syncContext.window.AHASyncHub;
  assert.ok(hub, 'Sync Hub must export window.AHASyncHub');
  assert.equal(typeof hub.inspectAll, 'function', 'Sync Hub must expose inspectAll');
  const inspection = hub.inspectAll();
  assert.equal(inspection.mode, 'read_only', 'inspectAll must report read_only mode');
  assert.equal(inspection.autoSync, false, 'inspectAll must keep auto-sync disabled');
  assert.equal(syncCalls, 0, 'inspectAll must not call a loaded syncFromDatabase function');
  assert.equal(storageCalls.some(([method]) => method !== 'getItem'), false, 'inspectAll must only read localStorage');

  const readOnlyRuntimeForbidden = [
    [/syncFromDatabase\s*\(/, 'syncFromDatabase call'],
    [/AHARepository\s*\.\s*(?:save|load)/, 'AHARepository save/load'],
    [/\bsupabase\s*\.\s*from\s*\(/i, 'Supabase query'],
    [/\bfetch\s*\(/, 'network fetch'],
    [/localStorage\s*\.\s*(?:setItem|removeItem)\s*\(/, 'localStorage write'],
    [/dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*["']aha:source-event/i, 'source-event dispatch'],
    [/\bsource_events\b/, 'source_events write path'],
    [/\bcreateInsight\b/, 'insight creation'],
    [/\bpublish\s*\(/, 'publication call']
  ];
  for (const [pattern, label] of readOnlyRuntimeForbidden) {
    assert.equal(pattern.test(syncHubCode), false, `read-only Sync Hub runtime must not contain ${label}`);
  }

  // Home must not load module runtimes whose init/bind side effects have not been approved.
  for (const moduleFile of HOME_SYNC_MODULES) {
    assert.equal(homeCode.includes(moduleFile), false, `Home must not load ${moduleFile}`);
  }

  // Only the active Home Sync Hub renderer is scanned; dormant preview helpers are a separate gated layer.
  const activeSyncHubRenderer = extractFunction(dashboardCode, 'renderSyncHubStatus');
  assert.match(activeSyncHubRenderer, /Read-only oversikt/, 'active Home Sync Hub renderer must identify itself as read-only');
  assert.match(activeSyncHubRenderer, /Ingen sync kjøres her ennå/, 'active renderer must say that no sync runs here');
  assert.equal(/<button\b/i.test(activeSyncHubRenderer), false, 'active Home Sync Hub renderer must not add a sync button');
  for (const [pattern, label] of readOnlyRuntimeForbidden) {
    assert.equal(pattern.test(activeSyncHubRenderer), false, `active Home Sync Hub renderer must not contain ${label}`);
  }

  const renderDashboardCode = extractFunction(dashboardCode, 'renderDashboard');
  assert.equal(/syncFromDatabase\s*\(/.test(renderDashboardCode), false, 'renderDashboard must not call syncFromDatabase');
  assert.equal(/executeAhaManualSyncRun\s*\(/.test(renderDashboardCode), false, 'renderDashboard must not execute manual sync');
  assert.equal(/AHARepository\s*\.\s*(?:save|load)/.test(renderDashboardCode), false, 'renderDashboard must not call repository save/load');
  assert.equal(/addEventListener\s*\(\s*["']storage["'][\s\S]{0,300}(?:syncFromDatabase|executeAhaManualSyncRun)\s*\(/.test(dashboardCode), false, 'storage events must not start sync');
  assert.equal(/addEventListener\s*\(\s*["']aha:auth-ready["'][\s\S]{0,300}(?:syncFromDatabase|executeAhaManualSyncRun)\s*\(/.test(dashboardCode), false, 'auth-ready must not start sync');

  // Blocked and dry-run adapter paths may report/audit, but must not write module data or call module sync.
  assert.equal(/syncFromDatabase\s*\(/.test(adapterCode), false, 'manual sync adapter must not call module syncFromDatabase');
  const repositoryCalls = [];
  const repository = {
    saveList(record) { repositoryCalls.push(['saveList', record]); return { ok: true }; },
    savePath(record) { repositoryCalls.push(['savePath', record]); return { ok: true }; },
    saveGroup(record) { repositoryCalls.push(['saveGroup', record]); return { ok: true }; },
    saveArticle(record) { repositoryCalls.push(['saveArticle', record]); return { ok: true }; },
    writeAhaManualSyncAuditLog(entry) { repositoryCalls.push(['audit', entry]); return { ok: true, status: 'success', auditId: entry.runId }; }
  };
  const manualContext = vm.createContext({
    window: { AHARepository: repository },
    module: { exports: {} },
    exports: {},
    console,
    Date,
    Object,
    Array,
    String,
    Math,
    Promise,
    Error,
    Set
  });
  loadScript(STATE_MACHINE_FILE, manualContext);
  loadScript(ADAPTER_FILE, manualContext);
  const adapter = manualContext.window.AHAManualSyncAdapter;
  const stateMachine = manualContext.window.AHAManualSyncStateMachine;

  const dryRun = adapter.runAhaManualSyncTargetDryRun(readyInput());
  assert.equal(dryRun.wouldWrite, false, 'dry-run must explicitly report no writes');
  assert.equal(repositoryCalls.length, 0, 'dry-run must not write module or audit data');

  const blocked = await adapter.executeAhaManualSyncRun(readyInput({
    readiness: { status: 'blocked' },
    explicitConfirmation: false,
    confirmationToken: null
  }));
  assert.equal(blocked.status, 'blocked', 'adapter must return blocked when green gates are absent');
  assert.equal(repositoryCalls.some(([method]) => method.startsWith('save')), false, 'blocked adapter execution must not write module data');

  assert.equal(/localStorage\s*\.\s*(?:setItem|removeItem)\s*\(/.test(stateMachineCode), false, 'state machine must not write localStorage');
  assert.equal(/\bfetch\s*\(|\bsupabase\s*\.\s*from\s*\(/i.test(stateMachineCode), false, 'state machine must not perform network/database calls');
  const blockedState = stateMachine.createAhaManualSyncRunState({
    target: { id: 'not_configured', status: 'not_configured' },
    readinessStatus: 'blocked',
    validation: { status: 'invalid', errorCount: 1 },
    checklistSummary: { blockedCount: 1 },
    payloadPreview: { modulesIncluded: 0 }
  });
  assert.equal(blockedState.currentState, 'blocked');
  assert.equal(blockedState.canExecute, false, 'blocked state must disable execution');
  assert.equal(blockedState.canWrite, false, 'blocked state must disable writes');
  assert.equal(stateMachine.canTransitionAhaManualSyncState(blockedState, 'confirmed').allowed, false, 'blocked state must not transition to confirmed');
  assert.notEqual(
    stateMachine.transitionAhaManualSyncState(blockedState, 'running', { explicitConfirmation: true }).currentState,
    'running',
    'explicit confirmation alone must not bypass blocked state'
  );

  console.log('aha-sync-hub-go-no-go-blockers.test.cjs passed');
})();
