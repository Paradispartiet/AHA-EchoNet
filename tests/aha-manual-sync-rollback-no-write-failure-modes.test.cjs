const assert = require('assert');
const fs = require('fs');

const REQUIREMENTS_FILE = 'docs/AHA_SYNC_HUB_ROLLBACK_NO_WRITE_FAILURE_MODES.md';
const CHECKLIST_FILE = 'docs/AHA_SYNC_HUB_ACTIVATION_CHECKLIST_REVIEW.md';
const STATUS_FILE = 'docs/AHA_IMPLEMENTATION_STATUS.md';
const BLOCKER_TEST_FILE = 'tests/aha-sync-hub-go-no-go-blockers.test.cjs';
const DASHBOARD_FILE = 'js/ahaDashboard.js';
const DRY_RUN_TARGET_ADAPTER_FILE = 'js/ahaManualSyncDryRunTargetAdapter.js';
const HOME_FILE = 'index.html';
const EXECUTION_PAGE = 'sync.html';
const ACTIVATION_PR = 'feat: activate manual AHA Sync Hub execution';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assertIncludesAll(source, values, label) {
  for (const value of values) {
    assert.ok(source.toLowerCase().includes(value.toLowerCase()), `${label} must include: ${value}`);
  }
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

assert.ok(fs.existsSync(REQUIREMENTS_FILE), `${REQUIREMENTS_FILE} must exist`);

const requirements = read(REQUIREMENTS_FILE);
const checklist = read(CHECKLIST_FILE);
const status = read(STATUS_FILE);
const blockerTest = read(BLOCKER_TEST_FILE);
const dashboard = read(DASHBOARD_FILE);
const dryRunTargetAdapter = read(DRY_RUN_TARGET_ADAPTER_FILE);
const home = read(HOME_FILE);

assertIncludesAll(requirements, [
  'Rollback/no-write failure modes are reviewed, not implemented',
  'Manual sync execution remains **NO-GO**',
  'Dedicated execution page remains planned, not implemented',
  'Home remains preview-only',
  'Audit write path remains not activated',
  'Auto-sync is permanently forbidden',
  'No rollback/write path may activate before all gates are **GO**'
], 'current decision');

assertIncludesAll(requirements, [
  'Dry-run must never write',
  'Preview must never write',
  'Home must never write',
  'Module inspection must never write',
  'Readiness checks must never write',
  'Failed remote sync must not delete `localStorage`',
  'Missing Supabase or session must not delete `localStorage`',
  'Audit/history failure must not delete `localStorage`',
  'Rollback planning must not write',
  'Rollback review must not write'
], 'no-write policy');

assertIncludesAll(requirements, [
  'Missing Supabase session',
  'Supabase unavailable',
  'Network failure',
  'Partial module failure',
  'Module runtime missing',
  'Sync function missing',
  'Audit write failed',
  '`localStorage` parse failure',
  'Tombstone conflict',
  'Stale remote data',
  'Duplicate record',
  'Permission denied',
  'Timeout',
  'Unknown exception',
  'Operator cancels confirmation',
  'Activation gates not green'
], 'failure mode table');

assertIncludesAll(requirements, ['`lists`', '`paths`', '`groups`', '`avisa`'], 'per-module rollback expectations');
assertIncludesAll(requirements, [
  'Records planned',
  'records attempted',
  'records written',
  'records skipped',
  'tombstones detected',
  'errors',
  'rollback required',
  'rollback available',
  'rollback not available',
  'local data preserved',
  'audit status'
], 'per-module rollback evidence');

assertIncludesAll(requirements, [
  '`not_needed`',
  '`not_configured`',
  '`preview_only`',
  '`disabled_no_go`',
  '`pending`',
  '`rollback_required`',
  '`rollback_not_available`',
  '`rollback_available`',
  '`rolling_back`',
  '`rollback_complete`',
  '`rollback_failed`',
  '`manual_review_required`'
], 'rollback status model');

assertIncludesAll(requirements, [
  'no-write status',
  'dry-run status',
  'write status',
  'per-module failure status',
  'rollback required status',
  'rollback availability',
  'rollback result',
  'local data preserved warning',
  'remote write failure warning',
  'audit write failure warning',
  'manual review required warning'
], 'required operator visibility');

assertIncludesAll(requirements, [
  'no deleting `localStorage` on remote failure',
  'no hiding partial failures',
  'no marking success if any required module failed',
  'no marking success if audit write failed',
  'no rollback during preview',
  'no rollback during dry-run plan creation',
  'no rollback on Home',
  'no automatic rollback on page load',
  'no automatic rollback on render',
  'no automatic rollback on storage/auth-ready',
  'no timer/interval rollback',
  'no source events from rollback review',
  'no insights creation',
  'no publishing',
  'no social sharing'
], 'forbidden behavior');

assertIncludesAll(requirements, ['Gate F', 'Gate G', 'Gate H', 'Gate I', 'Gate J'], 'activation gate impact');
assert.ok(requirements.includes(ACTIVATION_PR), 'requirements must retain the exact activation PR name');
assert.match(requirements, /## Test coverage[\s\S]*aha-manual-sync-rollback-no-write-failure-modes\.test\.cjs/, 'requirements must document test coverage');

const syncHubDashboardSurface = [
  extractFunction(dashboard, 'renderSyncHubStatus'),
  extractFunction(dashboard, 'renderAhaManualSyncDryRunTargetPreview')
].join('\n');
const runtimeSurfaces = [
  ['Home Sync Hub renderer', syncHubDashboardSurface],
  [DRY_RUN_TARGET_ADAPTER_FILE, dryRunTargetAdapter],
  [HOME_FILE, home]
];
const forbiddenExecutionPatterns = [
  [/\brollback\s*\(/i, 'rollback('],
  [/\brollbackRequired\s*=\s*true/i, 'rollbackRequired = true'],
  [/\bperformRollback\b/i, 'performRollback'],
  [/\bexecuteRollback\b/i, 'executeRollback'],
  [/\bwriteRollback\b/i, 'writeRollback'],
  [/\bauditHistory\s*\.\s*write\b/i, 'auditHistory.write'],
  [/\bwriteAudit\b/i, 'writeAudit'],
  [/\bsaveAudit\b/i, 'saveAudit'],
  [/\brecordAudit\b/i, 'recordAudit'],
  [/\bsyncFromDatabase\s*\(/, 'syncFromDatabase('],
  [/\bAHARepository\s*\.\s*(?:save|load)/, 'AHARepository.save/load'],
  [/\bsupabase\s*\.\s*from\b/i, 'supabase.from'],
  [/\bfetch\s*\(/, 'fetch('],
  [/\blocalStorage\s*\.\s*setItem\b/, 'localStorage.setItem'],
  [/\blocalStorage\s*\.\s*removeItem\b/, 'localStorage.removeItem'],
  [/\bdispatchEvent\s*\(\s*new\s+CustomEvent\b/, 'dispatchEvent(new CustomEvent'],
  [/\bsource_events\b/, 'source_events'],
  [/\bcreateInsight\b/, 'createInsight'],
  [/\bpublish\b/i, 'publish']
];
for (const [surfaceName, source] of runtimeSurfaces) {
  for (const [pattern, label] of forbiddenExecutionPatterns) {
    assert.equal(pattern.test(source), false, `${surfaceName} must not contain executing ${label}`);
  }
}

assert.equal(fs.existsSync(EXECUTION_PAGE), false, 'sync.html must remain absent');

assert.match(checklist, /Rollback\/no-write failure modes[\s\S]*Test-locked, not implemented; NO-GO for execution/i, 'checklist must test-lock rollback/no-write without implementation');
assert.match(checklist, /\*\*G\*\*[\s\S]*\*\*TEST-LOCKED, NOT IMPLEMENTED\*\*/, 'Gate G must be test-locked and not implemented');
assert.match(checklist, /Manual sync execution: NO-GO/, 'checklist must keep execution NO-GO');
assert.match(checklist, /Auto-sync: permanently forbidden/, 'checklist must keep auto-sync permanently forbidden');
assert.ok(checklist.includes(ACTIVATION_PR), 'checklist must retain the activation PR');

assertIncludesAll(status, [
  'Rollback/no-write requirements: test-locked',
  'Rollback implementation: not activated',
  'Audit write path: not activated',
  'Execution: NO-GO',
  'Home: preview-only',
  'Auto-sync: permanently forbidden',
  'docs: review Sync Hub Supabase session fallback before execution'
], 'implementation status');

assertIncludesAll(blockerTest, [
  'rollback/no-write requirements must remain test-locked',
  'rollback implementation must remain inactive',
  'audit write path must remain inactive',
  'rollback/no-write execution must still require the activation PR',
  'rollback/no-write requirements must retain manual sync NO-GO',
  'rollback/no-write requirements must retain the permanent auto-sync prohibition'
], 'go/no-go blocker coverage');

console.log('aha-manual-sync-rollback-no-write-failure-modes.test.cjs passed');
