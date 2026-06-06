const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function loadHistoryHelpers() {
  const context = vm.createContext({ console });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync('js/ahaManualSyncHistory.js', 'utf8'), context, { filename: 'js/ahaManualSyncHistory.js' });
  return context.AHAManualSyncHistory;
}

function auditRun(patch = {}) {
  return {
    meta: {
      runId: 'run-failed-1',
      timestamp: '2026-06-06T12:00:00.000Z',
      trigger: 'manual',
      target: 'database_existing',
      targetStatus: 'configured',
      resultStatus: 'failed',
      writeStatus: 'failed',
      rollbackStatus: 'not_supported',
      includedModules: ['lists', 'paths'],
      itemCounts: { lists: 2, paths: 1 },
      totalItems: 3,
      validationSummary: { status: 'valid', errorCount: 0, warningCount: 0 },
      payloadSummary: {
        includedModules: ['lists', 'paths'],
        itemCounts: { lists: 2, paths: 1 },
        totalItems: 3,
        checksum: 'safe-summary-only'
      },
      warnings: [],
      errors: ['database write failed'],
      ...patch
    }
  };
}

(async function run() {
  const helpers = loadHistoryHelpers();
  const build = (patch) => helpers.buildAhaManualSyncRetryEligibilityPreview(helpers.sanitizeAhaManualSyncHistoryDetails(auditRun(patch)));

  const eligible = build({});
  assert.equal(eligible.retryEligible, true, 'valid failed run should be eligible in preview');
  assert.equal(eligible.status, 'eligible_preview');
  assert.equal(eligible.retryMode, 'preview_only');

  const success = build({ resultStatus: 'success', writeStatus: 'completed' });
  assert.equal(success.retryEligible, false);
  assert.equal(success.status, 'not_eligible');
  assert.match(success.reason, /not applicable/i);

  const validationBlocked = build({ resultStatus: 'blocked', validationSummary: { status: 'errors', errorCount: 2, warningCount: 0 } });
  assert.equal(validationBlocked.status, 'blocked');
  assert.ok(validationBlocked.blockers.some((item) => /validation errors/i.test(item)));

  assert.equal(build({ targetStatus: 'not_configured' }).status, 'blocked');
  assert.equal(build({ target: '' }).status, 'blocked');
  assert.equal(build({ includedModules: [], payloadSummary: { includedModules: [], itemCounts: {}, totalItems: 3 } }).status, 'blocked');
  assert.equal(build({ totalItems: 0, payloadSummary: { includedModules: ['lists'], itemCounts: { lists: 0 }, totalItems: 0 } }).status, 'blocked');

  const noPayload = auditRun();
  delete noPayload.meta.payloadSummary;
  const noPayloadPreview = helpers.buildAhaManualSyncRetryEligibilityPreview(helpers.sanitizeAhaManualSyncHistoryDetails(noPayload));
  assert.equal(noPayloadPreview.retryEligible, false);
  assert.equal(noPayloadPreview.status, 'unknown');

  assert.equal(build({ runId: '' }).status, 'blocked');
  const securityBlocked = build({ warnings: ['security warning: token=super-secret-value'] });
  assert.equal(securityBlocked.status, 'blocked');
  assert.ok(securityBlocked.blockers.some((item) => /security or redaction/i.test(item)));
  assert.equal(JSON.stringify(securityBlocked).includes('super-secret-value'), false, 'preview must redact secret-like warning values');

  const sanitized = helpers.sanitizeAhaManualSyncHistoryDetails(auditRun({
    payload: { full: 'must-not-appear' },
    password: 'must-not-appear',
    connectionString: 'must-not-appear'
  }));
  const serialized = JSON.stringify(sanitized);
  assert.equal(serialized.includes('must-not-appear'), false, 'sanitized history must omit payloads and credentials');
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized, 'payload'), false);

  const sideEffects = [];
  const adapterContext = vm.createContext({ console });
  adapterContext.window = adapterContext;
  adapterContext.AHARepository = {
    loadSourceEvents() {
      sideEffects.push('loadSourceEvents');
      return Promise.resolve({ ok: true, data: [
        { source_type: 'aha_manual_sync', content_type: 'manual_sync_audit', ...auditRun() },
        { source_type: 'other', content_type: 'other', meta: {} }
      ] });
    },
    saveList() { sideEffects.push('saveList'); },
    writeAhaManualSyncAuditLog() { sideEffects.push('writeAhaManualSyncAuditLog'); }
  };
  vm.runInContext(fs.readFileSync('js/ahaManualSyncAdapter.js', 'utf8'), adapterContext, { filename: 'js/ahaManualSyncAdapter.js' });
  const historyResult = await adapterContext.AHAManualSyncAdapter.loadAhaManualSyncHistory({ limit: 10 });
  assert.equal(historyResult.ok, true);
  assert.equal(historyResult.entries.length, 1, 'history reader should return only manual sync audit entries');
  assert.deepEqual(sideEffects, ['loadSourceEvents'], 'history/retry preview must read only and never sync, execute, audit-write, or database-write');

  console.log('aha-manual-sync-retry-eligibility-preview.test.cjs passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
