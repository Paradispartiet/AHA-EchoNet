const validItems = Object.freeze({
  lists: Object.freeze({ id: 'list-valid-1', title: 'Verification list' }),
  paths: Object.freeze({ id: 'path-valid-1', title: 'Verification path' }),
  groups: Object.freeze({ id: 'group-valid-1', title: 'Verification group' }),
  ahaavisa: Object.freeze({ id: 'article-valid-1', title: 'Verification article' })
});

const invalidItems = Object.freeze({
  missingId: Object.freeze({ title: 'Missing id' }),
  duplicateId: Object.freeze([
    Object.freeze({ id: 'duplicate-1', title: 'First duplicate' }),
    Object.freeze({ id: 'duplicate-1', title: 'Second duplicate' })
  ])
});

function payloadWithExcludedModule() {
  return {
    modules: [
      { id: 'lists', included: true, itemCount: 1, items: [{ ...validItems.lists }], errors: [], validationStatus: 'valid' },
      { id: 'groups', included: false, itemCount: 1, items: [{ ...validItems.groups }], errors: [], validationStatus: 'valid' }
    ],
    modulesIncluded: 1,
    modulesExcluded: 1,
    totalPreviewItems: 1
  };
}

function auditEntry(resultStatus, timestamp, patch = {}) {
  return {
    source_type: 'aha_manual_sync',
    content_type: 'manual_sync_audit',
    created_at: timestamp,
    meta: {
      runId: `run-${resultStatus}`,
      timestamp,
      trigger: 'manual',
      target: 'database_existing',
      targetStatus: 'configured',
      resultStatus,
      writeStatus: resultStatus === 'success' ? 'written' : resultStatus,
      rollbackStatus: 'not_available',
      readinessStatus: resultStatus === 'blocked' ? 'blocked' : 'ready',
      includedModules: ['lists'],
      excludedModules: ['groups'],
      itemCounts: { lists: 1 },
      totalItems: 1,
      validationSummary: { status: 'valid', errorCount: 0, warningCount: 0 },
      checklistSummary: { passedCount: 3, warningCount: 0, blockedCount: resultStatus === 'blocked' ? 1 : 0 },
      payloadSummary: {
        includedModules: ['lists'],
        excludedModules: ['groups'],
        itemCounts: { lists: 1 },
        totalItems: 1,
        checksum: `checksum-${resultStatus}`
      },
      warnings: resultStatus === 'blocked' ? ['Operator checklist blocked the run.'] : [],
      errors: resultStatus === 'failed' ? ['Mock database write failed.'] : [],
      ...patch
    }
  };
}

const auditEntries = Object.freeze({
  success: auditEntry('success', '2026-06-06T12:00:00.000Z'),
  failed: auditEntry('failed', '2026-06-06T11:00:00.000Z'),
  blocked: auditEntry('blocked', '2026-06-06T10:00:00.000Z'),
  secretLike: auditEntry('failed', '2026-06-06T09:00:00.000Z', {
    password: 'fixture-password-value',
    connectionString: 'postgres://fixture-user:fixture-password@example.invalid/db',
    warnings: ['token=fixture-token-value'],
    errors: ['credential=fixture-credential-value'],
    payload: { records: [{ id: 'must-not-be-exposed', apiKey: 'fixture-api-key-value' }] }
  })
});

module.exports = {
  validItems,
  invalidItems,
  payloadWithExcludedModule,
  auditEntries
};
