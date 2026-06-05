const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function loadScript(file, context) {
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, context, { filename: file });
}

function createContext(repository) {
  const context = vm.createContext({
    window: {},
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
  if (repository) context.window.AHARepository = repository;
  loadScript('js/ahaManualSyncStateMachine.js', context);
  loadScript('js/ahaManualSyncAdapter.js', context);
  return context;
}

function createRepository(options = {}) {
  const calls = [];
  const result = options.result || { ok: true };
  const maybeThrow = (method, record) => {
    calls.push({ method, record });
    if (options.throwOn === method) throw new Error(`${method} failed`);
    return result;
  };
  return {
    calls,
    saveList(record) { return maybeThrow('saveList', record); },
    savePath(record) { return maybeThrow('savePath', record); },
    saveGroup(record) { return maybeThrow('saveGroup', record); },
    saveArticle(record) { return maybeThrow('saveArticle', record); }
  };
}

function readyInput(overrides = {}) {
  return {
    target: { id: 'database_existing', status: 'configured' },
    readiness: { status: 'ready' },
    validation: { status: 'valid', errorCount: 0, warningCount: 0, validCount: 4 },
    checklist: { summary: { passed: 3, warning: 0, blocked: 0 }, items: [] },
    auditPreview: { status: 'not_configured' },
    payloadPreview: {
      modules: [
        { id: 'lists', name: 'Lists', included: true, itemCount: 1, items: [{ id: 'list-1', title: 'List' }], errors: [], validationStatus: 'valid' },
        { id: 'paths', name: 'Paths', included: true, itemCount: 1, items: [{ id: 'path-1', title: 'Path' }], errors: [], validationStatus: 'valid' },
        { id: 'groups', name: 'Groups', included: false, itemCount: 1, items: [{ id: 'group-excluded' }], errors: [], validationStatus: 'valid' },
        { id: 'ahaavisa', name: 'AHAavisa', included: true, itemCount: 1, items: [{ id: 'article-1', title: 'Article' }], errors: [], validationStatus: 'valid' }
      ],
      modulesIncluded: 3,
      modulesExcluded: 1,
      totalPreviewItems: 3
    },
    ...overrides
  };
}

(async function run() {
  const noRepoContext = createContext();
  const noRepoAdapter = noRepoContext.window.AHAManualSyncAdapter;
  const missingTarget = noRepoAdapter.validateAhaManualSyncTarget({ id: 'not_configured', status: 'not_configured' });
  assert.equal(missingTarget.ok, false, 'target not_configured should block validation');
  assert.equal(missingTarget.status, 'blocked');

  const repository = createRepository();
  const context = createContext(repository);
  const adapter = context.window.AHAManualSyncAdapter;

  const targetValidation = adapter.validateAhaManualSyncTarget({ id: 'database_existing', status: 'configured' });
  assert.equal(targetValidation.ok, true, 'database_existing/configured target should validate when repository writes exist');
  assert.equal(targetValidation.targetStatus, 'configured');

  const missingConfirmation = await adapter.executeAhaManualSyncRun(readyInput());
  assert.equal(missingConfirmation.status, 'blocked', 'executeRun should block without confirmation');
  assert.equal(repository.calls.length, 0, 'missing confirmation must not write');

  const validationBlocked = await adapter.executeAhaManualSyncRun(readyInput({
    validation: { status: 'invalid', errorCount: 1, warningCount: 0 },
    explicitConfirmation: true
  }));
  assert.equal(validationBlocked.status, 'blocked', 'executeRun should block validation errors');
  assert.equal(repository.calls.length, 0, 'validation errors must not write');

  const readinessBlocked = await adapter.executeAhaManualSyncRun(readyInput({
    readiness: { status: 'blocked' },
    explicitConfirmation: true
  }));
  assert.equal(readinessBlocked.status, 'blocked', 'executeRun should block readiness blocked');
  assert.equal(repository.calls.length, 0, 'readiness blocked must not write');

  const emptyPayload = await adapter.executeAhaManualSyncRun(readyInput({
    payloadPreview: { modules: [], modulesIncluded: 0, modulesExcluded: 0, totalPreviewItems: 0 },
    explicitConfirmation: true
  }));
  assert.equal(emptyPayload.status, 'blocked', 'executeRun should block 0 included modules');
  assert.equal(repository.calls.length, 0, 'empty payload must not write');

  const success = await adapter.executeAhaManualSyncRun(readyInput({ explicitConfirmation: true }));
  assert.equal(success.status, 'success', 'executeRun should return success after mocked writes');
  assert.equal(success.writeCount, 3, 'executeRun should write only included modules');
  assert.deepEqual(repository.calls.map((call) => call.method), ['saveList', 'savePath', 'saveArticle']);
  assert.equal(repository.calls.some((call) => call.record.id === 'group-excluded'), false, 'excluded modules must not be written');

  const failingRepository = createRepository({ throwOn: 'savePath' });
  const failingContext = createContext(failingRepository);
  const failed = await failingContext.window.AHAManualSyncAdapter.executeAhaManualSyncRun(readyInput({ explicitConfirmation: true }));
  assert.equal(failed.status, 'failed', 'executeRun should return failed on mocked write error');
  assert.equal(failed.rollbackStatus, 'not_available', 'rollback should not be claimed when unavailable');

  const stateMachine = context.window.AHAManualSyncStateMachine;
  const runState = stateMachine.createAhaManualSyncRunState(readyInput());
  const confirmed = stateMachine.transitionAhaManualSyncState(runState, 'confirmed');
  assert.equal(confirmed.currentState, 'confirmed', 'blocked -> confirmed should be allowed when gates pass');
  const runningWithoutConfirm = stateMachine.transitionAhaManualSyncState(confirmed, 'running');
  assert.notEqual(runningWithoutConfirm.currentState, 'running', 'confirmed -> running requires explicit confirmation');
  const running = stateMachine.transitionAhaManualSyncState(confirmed, 'running', { explicitConfirmation: true });
  assert.equal(running.currentState, 'running', 'confirmed -> running should allow explicit confirmation');

  const adapterCode = fs.readFileSync('js/ahaManualSyncAdapter.js', 'utf8');
  const dashboardSyncHubCode = fs.readFileSync('js/ahaDashboard.js', 'utf8').slice(fs.readFileSync('js/ahaDashboard.js', 'utf8').indexOf('const SYNC_HUB_DRY_RUN_SOURCES'));
  assert.equal(/localStorage\s*\.\s*setItem\s*\(/.test(adapterCode), false, 'localStorage.setItem must not be used for sync execution state');
  assert.equal(/AHARepository\s*\.\s*save/.test(dashboardSyncHubCode), false, 'dashboard must not write directly to repository');
  assert.equal(/executeAhaManualSyncRun/.test(dashboardSyncHubCode), true, 'dashboard should delegate execution to adapter only from confirm handler');
  assert.equal(/addEventListener\("change"[\s\S]{0,400}executeAhaManualSyncRun/.test(dashboardSyncHubCode), false, 'target select must not execute sync');
  assert.equal(/isAhaManualSyncConfirmationModalOpen = true[\s\S]{0,300}executeAhaManualSyncRun/.test(dashboardSyncHubCode), false, 'modal open must not execute sync');

  console.log('aha-manual-sync-database-target.test.cjs passed');
})();
