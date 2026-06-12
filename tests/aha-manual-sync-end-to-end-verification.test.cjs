const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const fixtures = require('./fixtures/aha-manual-sync-verification-fixtures.cjs');

const FORBIDDEN_HOME_MODULE_LOADS = [
  'js/ahaLists.js',
  'js/ahaPaths.js',
  'js/ahaGroups.js',
  'js/ahaAvisa.js'
];

function loadScript(file, context) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

function createContext(repository) {
  const context = vm.createContext({
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
  loadScript('js/ahaManualSyncStateMachine.js', context);
  loadScript('js/ahaManualSyncAdapter.js', context);
  loadScript('js/ahaManualSyncHistory.js', context);
  return context;
}

function createRepository(options = {}) {
  const writeCalls = [];
  const auditCalls = [];
  const historyEntries = options.historyEntries || [];

  function write(method, item) {
    writeCalls.push({ method, item });
    if (options.failWrite === method) throw new Error(`mock ${method} database failure`);
    return { ok: true, data: { id: item.id } };
  }

  return {
    writeCalls,
    auditCalls,
    saveList(item) { return write('saveList', item); },
    savePath(item) { return write('savePath', item); },
    saveGroup(item) { return write('saveGroup', item); },
    saveArticle(item) { return write('saveArticle', item); },
    writeAhaManualSyncAuditLog(entry) {
      auditCalls.push(entry);
      if (options.failAudit) return { ok: false, status: 'failed', errors: ['mock audit failure'] };
      return { ok: true, status: 'success', auditId: `audit-${entry.runId}`, writtenAt: entry.timestamp };
    },
    loadSourceEvents() {
      return { ok: true, data: historyEntries };
    }
  };
}

function readyInput(patch = {}) {
  return {
    target: { id: 'database_existing', status: 'configured' },
    readiness: { status: 'ready' },
    validation: { status: 'valid', errorCount: 0, warningCount: 0, validCount: 1 },
    checklist: { summary: { passed: 3, warning: 0, blocked: 0 }, items: [] },
    auditPreview: { status: 'configured' },
    payloadPreview: fixtures.payloadWithExcludedModule(),
    explicitConfirmation: true,
    ...patch
  };
}

function json(value) {
  return JSON.parse(JSON.stringify(value));
}

async function verifyBlockedCase(name, patch, expectedReason) {
  const repository = createRepository();
  const adapter = createContext(repository).window.AHAManualSyncAdapter;
  const result = await adapter.executeAhaManualSyncRun(readyInput(patch));
  assert.equal(result.status, 'blocked', `${name}: structured result should be blocked`);
  assert.equal(result.writeStatus, 'blocked', `${name}: writeStatus should remain blocked`);
  assert.equal(repository.writeCalls.length, 0, `${name}: database boundary must not be called`);
  assert.equal(repository.auditCalls.length, 1, `${name}: blocked attempt should be audited`);
  assert.equal(repository.auditCalls[0].resultStatus, 'blocked', `${name}: audit outcome should be blocked`);
  const explanation = [result.reason, ...(result.blockers || []), ...(result.prepared?.blockers || [])].join(' ');
  assert.match(explanation, expectedReason, `${name}: structured result should explain the blocker`);
}

(async function run() {
  const happyRepository = createRepository();
  const happyContext = createContext(happyRepository);
  const happy = await happyContext.window.AHAManualSyncAdapter.executeAhaManualSyncRun(readyInput());

  assert.equal(happy.status, 'success', 'happy path should return success');
  assert.equal(happy.writeStatus, 'written', 'happy path should report successful database write');
  assert.equal(happy.auditStatus, 'success', 'happy path should report successful audit write');
  assert.equal(happyRepository.writeCalls.length, 1, 'one included item should cross the database boundary once');
  assert.deepEqual(json(happyRepository.writeCalls[0]), {
    method: 'saveList',
    item: fixtures.validItems.lists
  }, 'database write should receive the expected included item');
  assert.equal(happyRepository.auditCalls.length, 1, 'happy path should write one audit outcome');
  assert.equal(happyRepository.auditCalls[0].resultStatus, 'success');
  assert.equal(happyRepository.auditCalls[0].writeResult.writeCount, 1);
  assert.deepEqual(json(happyRepository.auditCalls[0].payloadSummary.includedModules), ['lists']);
  assert.equal(happyRepository.auditCalls[0].payloadSummary.totalItems, 1);
  assert.equal(happyRepository.writeCalls.some((call) => call.item.id === fixtures.validItems.groups.id), false, 'excluded modules must not be written');

  await verifyBlockedCase('missing confirmation', { explicitConfirmation: false }, /confirmation/i);
  await verifyBlockedCase('target not configured', { target: { id: 'not_configured', status: 'not_configured' } }, /target/i);
  await verifyBlockedCase('readiness blocked', { readiness: { status: 'blocked' } }, /readiness/i);
  await verifyBlockedCase('validation errors', { validation: { status: 'invalid', errorCount: 1 } }, /validation/i);
  await verifyBlockedCase('checklist blocked item', {
    checklist: { summary: { passed: 2, warning: 0, blocked: 0 }, items: [{ id: 'approval', status: 'blocked' }] }
  }, /checklist/i);
  await verifyBlockedCase('zero included modules', {
    payloadPreview: { modules: [], modulesIncluded: 0, modulesExcluded: 0, totalPreviewItems: 0 }
  }, /0 included modules|no included valid modules/i);
  await verifyBlockedCase('excluded module write attempt', {
    payloadPreview: {
      modules: [{ id: 'groups', included: false, items: [{ ...fixtures.validItems.groups }], itemCount: 1 }],
      includedModules: ['groups'],
      excludedModules: ['groups'],
      modulesIncluded: 1,
      totalPreviewItems: 1
    }
  }, /no included valid modules/i);
  await verifyBlockedCase('invalid payload shape', { payloadPreview: 'not-an-object' }, /0 included modules|no included valid modules/i);

  const failedRepository = createRepository({ failWrite: 'saveList' });
  const failed = await createContext(failedRepository).window.AHAManualSyncAdapter.executeAhaManualSyncRun(readyInput());
  assert.equal(failed.status, 'failed', 'database failure must not report success');
  assert.equal(failed.writeStatus, 'failed');
  assert.equal(failed.auditStatus, 'success', 'failed database write should still be audited when possible');
  assert.match(failed.reason, /mock saveList database failure/);
  assert.equal(failedRepository.auditCalls[0].resultStatus, 'failed');
  assert.match(failedRepository.auditCalls[0].errors.join(' '), /mock saveList database failure/);

  const auditFailureRepository = createRepository({ failAudit: true });
  const auditFailure = await createContext(auditFailureRepository).window.AHAManualSyncAdapter.executeAhaManualSyncRun(readyInput());
  assert.equal(auditFailure.status, 'partial_success', 'domain success plus audit failure should use the supported partial_success contract');
  assert.equal(auditFailure.writeStatus, 'written');
  assert.equal(auditFailure.auditStatus, 'failed');
  assert.match(auditFailure.reason, /audit log write failed/i);
  assert.match(auditFailure.errors.join(' '), /mock audit failure/);

  const historyRepository = createRepository({
    historyEntries: [fixtures.auditEntries.success, fixtures.auditEntries.failed, fixtures.auditEntries.blocked]
  });
  const historyContext = createContext(historyRepository);
  const historyResult = await historyContext.window.AHAManualSyncAdapter.loadAhaManualSyncHistory({ limit: 20 });
  assert.equal(historyResult.ok, true);
  assert.deepEqual(historyResult.entries.map((entry) => entry.meta.resultStatus), ['success', 'failed', 'blocked'], 'history should retain newest-first repository ordering and all outcomes');

  const sanitizer = historyContext.window.AHAManualSyncHistory.sanitizeAhaManualSyncHistoryDetails;
  const history = historyResult.entries.map(sanitizer);
  assert.deepEqual(json(history.map((entry) => entry.resultStatus)), ['success', 'failed', 'blocked']);
  assert.deepEqual(json(history.map((entry) => entry.runId)), ['run-success', 'run-failed', 'run-blocked']);
  assert.equal(history[0].timestamp, '2026-06-06T12:00:00.000Z');
  assert.equal(history[0].target, 'database_existing');
  assert.deepEqual(json(history[0].itemCounts), { lists: 1 });
  assert.equal(history[0].totalItems, 1);

  const details = sanitizer(fixtures.auditEntries.failed);
  assert.equal(details.runId, 'run-failed');
  assert.equal(details.target, 'database_existing');
  assert.equal(details.resultStatus, 'failed');
  assert.deepEqual(json(details.includedModules), ['lists']);
  assert.deepEqual(json(details.itemCounts), { lists: 1 });
  assert.equal(details.readinessStatus, 'ready');
  assert.deepEqual(json(details.validationSummary), { status: 'valid', errorCount: 0, warningCount: 0 });
  assert.deepEqual(json(details.checklistSummary), { passedCount: 3, warningCount: 0, blockedCount: 0 });
  assert.match(details.errors.join(' '), /Mock database write failed/);
  assert.doesNotThrow(() => sanitizer({ meta: { resultStatus: 'blocked' } }), 'details sanitizer should tolerate missing fields');

  const secretDetails = sanitizer(fixtures.auditEntries.secretLike);
  const serializedDetails = JSON.stringify(secretDetails);
  for (const forbidden of ['fixture-password-value', 'postgres://', 'fixture-token-value', 'fixture-credential-value', 'must-not-be-exposed', 'fixture-api-key-value']) {
    assert.equal(serializedDetails.includes(forbidden), false, `sanitized history/details must not expose ${forbidden}`);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(secretDetails, 'payload'), false, 'sanitized details must not expose a full payload field');
  assert.equal(secretDetails.securityWarning, true);

  const adapterCode = fs.readFileSync('js/ahaManualSyncAdapter.js', 'utf8');
  const dashboardCode = fs.readFileSync('js/ahaDashboard.js', 'utf8');
  const indexCode = fs.readFileSync('index.html', 'utf8');
  const syncHubCode = dashboardCode.slice(dashboardCode.indexOf('const SYNC_HUB_DRY_RUN_SOURCES'));
  const executeOccurrences = syncHubCode.match(/executeAhaManualSyncRun/g) || [];

  assert.equal(executeOccurrences.length, 2, 'dashboard should only reference adapter execution in the guarded confirm handler');
  assert.match(syncHubCode, /aha-sync-confirm-run[\s\S]*addEventListener\("click"[\s\S]*executeAhaManualSyncRun/, 'explicit Confirm sync click should be the execution trigger');
  assert.equal(/function renderDashboard\([\s\S]{0,1800}executeAhaManualSyncRun/.test(dashboardCode), false, 'page render/init must not execute sync');
  assert.equal(/addEventListener\("change"[\s\S]{0,600}executeAhaManualSyncRun/.test(syncHubCode), false, 'target selection must not execute sync');
  assert.equal(/isAhaManualSyncConfirmationModalOpen = true[\s\S]{0,600}executeAhaManualSyncRun/.test(syncHubCode), false, 'opening confirmation modal must not execute sync');
  assert.equal(/(?:start|enable|run)AutoSync\s*\(|autoSync\s*=\s*true/i.test(adapterCode + dashboardCode), false, 'auto-sync execution must not be introduced');
  assert.equal(/\bsyncFromDatabase\s*\(/.test(syncHubCode), false, 'Sync Hub/dashboard must not invoke module syncFromDatabase');

  assert.equal(/AHARepository\s*\.\s*save/.test(syncHubCode), false, 'dashboard must not write directly to the database repository');
  assert.equal(/writeAhaManualSyncAuditLog|createAhaManualSyncAuditEntry/.test(syncHubCode), false, 'dashboard must not call the audit writer directly');
  assert.equal(/createClient\s*\(|supabase\.createClient|new\s+Supabase/.test(adapterCode + syncHubCode), false, 'verification must not add a database client');
  assert.equal(/(?:password|secret|token|connectionString)\s*[:=]\s*["'][^"']+["']/.test(adapterCode + syncHubCode), false, 'runtime boundary must not hardcode credentials or secrets');
  assert.match(syncHubCode, /AHAManualSyncAdapter/, 'dashboard should use the adapter/service boundary');

  for (const file of FORBIDDEN_HOME_MODULE_LOADS) {
    assert.equal(indexCode.includes(file), false, `Home must not load ${file}`);
    assert.equal(dashboardCode.includes(file), false, `dashboard must not import ${file}`);
  }

  assert.ok(fixtures.invalidItems.missingId && fixtures.invalidItems.duplicateId, 'small invalid-item fixtures should remain available for validation regressions');
  console.log('aha-manual-sync-end-to-end-verification.test.cjs passed');
})();
