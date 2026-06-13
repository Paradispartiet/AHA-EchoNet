const assert = require('assert');
const fs = require('fs');

const REQUIREMENTS_FILE = 'docs/AHA_SYNC_HUB_DISABLED_EXECUTION_UI_BEFORE_ACTIVATION.md';
const CHECKLIST_FILE = 'docs/AHA_SYNC_HUB_ACTIVATION_CHECKLIST_REVIEW.md';
const DASHBOARD_FILE = 'js/ahaDashboard.js';
const DRY_RUN_ADAPTER_FILE = 'js/ahaManualSyncDryRunTargetAdapter.js';
const HOME_FILE = 'index.html';
const EXECUTION_PAGE_FILE = 'sync.html';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function assertIncludesAll(source, values, scope) {
  for (const value of values) {
    assert.ok(source.includes(value), `${scope} must retain: ${value}`);
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

assert.equal(fs.existsSync(REQUIREMENTS_FILE), true, 'disabled execution UI requirements document must exist');

const requirements = read(REQUIREMENTS_FILE);
const checklist = read(CHECKLIST_FILE);
const dashboard = read(DASHBOARD_FILE);
const dryRunAdapter = read(DRY_RUN_ADAPTER_FILE);
const home = read(HOME_FILE);

assertIncludesAll(requirements, [
  'Disabled execution UI requirements are reviewed, not implemented',
  'Manual sync execution remains **NO-GO**',
  'Dedicated execution page remains planned, not implemented',
  'Home remains preview-only',
  'No executable sync button may be shown on Home',
  'No enabled execution UI may exist before all gates are **GO**',
  'Audit write path remains not activated',
  'Rollback implementation remains not activated',
  'Supabase/session fallback implementation remains not activated',
  'Auto-sync is permanently forbidden'
], 'current decision');

assertIncludesAll(requirements, [
  'Home may show read-only preview and blocked status',
  'Home must not show enabled execution controls',
  'Dedicated execution page is planned, not implemented',
  'Future execution UI must default disabled',
  'Future execution UI may only become enabled after activation PR and all gates GO',
  'Future execution UI must require explicit operator action',
  'Future execution UI must require confirmation before execution'
], 'UI surface decision');

assertIncludesAll(requirements, [
  'hidden',
  'preview_only',
  'disabled_no_go',
  'disabled_missing_gate',
  'disabled_missing_session',
  'disabled_missing_supabase',
  'disabled_missing_audit',
  'disabled_missing_rollback',
  'disabled_missing_confirmation',
  'ready_but_not_activated',
  'activated_ready'
], 'disabled UI states');

assertIncludesAll(requirements, [
  'gates_not_go',
  'execution_page_not_implemented',
  'activation_pr_required',
  'missing_supabase_session',
  'supabase_not_ready',
  'audit_write_not_ready',
  'rollback_not_ready',
  'per_module_results_not_ready',
  'confirmation_not_available',
  'no_write_safety_not_locked',
  'auto_sync_forbidden'
], 'blocked reasons');

assertIncludesAll(requirements, [
  'execution status',
  'disabled reason',
  'gate summary',
  'missing gate list',
  'Supabase/session readiness',
  'audit/history readiness',
  'rollback/no-write readiness',
  'per-module readiness',
  'preview-only status',
  'activation PR requirement',
  'auto-sync forbidden status',
  'next required action'
], 'operator visibility');

assertIncludesAll(requirements, [
  'no enabled sync button on Home',
  'no hidden execution behind a disabled button',
  'no click handler that calls `syncFromDatabase`',
  'no click handler that calls Supabase write APIs',
  'no click handler that writes audit/history',
  'no click handler that performs rollback',
  'no execution on page load',
  'no execution on render',
  'no execution on auth-ready',
  'no execution on storage event',
  'no execution on timer/interval',
  'no publishing',
  'no source events',
  'no insights creation',
  'no social sharing'
], 'forbidden UI behavior');

assertIncludesAll(requirements, [
  'feat: activate manual AHA Sync Hub execution',
  'all gates A–J must be GO',
  'dedicated execution page must exist',
  'disabled UI must become enabled only through activation PR',
  'explicit operator click required',
  'explicit confirmation required',
  'dry-run summary visible before execution',
  'per-module result preview visible before execution',
  'audit/history readiness visible before execution',
  'rollback/no-write status visible before execution',
  'Supabase/session readiness visible before execution'
], 'future activation UI requirements');

for (const gate of ['E', 'F', 'G', 'H', 'I', 'J']) {
  assert.match(requirements, new RegExp(`Gate ${gate}(?:\\b|:)`), `requirements must connect disabled UI to Gate ${gate}`);
}

assertIncludesAll(requirements, [
  'disabled execution UI requirements reviewed',
  'disabled execution UI tests added',
  'Home preview-only boundary test-locked',
  'no enabled execution controls on Home test-locked',
  'no hidden click handler test-locked',
  'disabled status vocabulary test-locked',
  'blocked reasons test-locked',
  'operator visibility test-locked',
  'feat: activate manual AHA Sync Hub execution'
], 'required before activation');

const executionSurfaceRuntime = [
  extractFunction(dashboard, 'renderAhaManualSyncDryRunTargetPreview'),
  extractFunction(dashboard, 'renderSyncHubStatus'),
  dryRunAdapter,
  home
].join('\n');
const forbiddenExecutionPatterns = [
  'syncFromDatabase(',
  'AHARepository.save',
  'AHARepository.load',
  'supabase.from',
  '.insert(',
  '.upsert(',
  '.delete(',
  '.update(',
  'localStorage.setItem',
  'localStorage.removeItem',
  'onAuthStateChange',
  'auth.getSession',
  'auth.getUser',
  'addEventListener("storage"',
  "addEventListener('storage'",
  'setInterval(',
  'setTimeout(',
  'dispatchEvent(new CustomEvent',
  'source_events',
  'createInsight',
  'publish',
  'executeSync',
  'runSync',
  'performSync',
  'startSync',
  'enableExecution',
  'executeRollback',
  'performRollback',
  'writeAudit',
  'saveAudit',
  'recordAudit'
];
for (const pattern of forbiddenExecutionPatterns) {
  assert.equal(executionSurfaceRuntime.includes(pattern), false, `Home execution surfaces must not contain ${pattern}`);
}

for (const moduleFile of [
  'js/ahaLists.js',
  'js/ahaPaths.js',
  'js/ahaGroups.js',
  'js/ahaAvisa.js'
]) {
  assert.equal(home.includes(moduleFile), false, `Home must not load ${moduleFile}`);
}
assert.equal(fs.existsSync(EXECUTION_PAGE_FILE), false, 'sync.html must remain absent');

assertIncludesAll(checklist, [
  'Disabled execution UI review',
  'tests/aha-sync-hub-disabled-execution-ui-before-activation.test.cjs',
  '**Test-locked, not implemented; NO-GO for execution**',
  'Gate E is **test-locked, not implemented**',
  'Gates E, F, G, H, I, and J are not full GO for execution',
  'all gates A–J must be GO for execution',
  'dedicated activation PR still required',
  'Auto-sync: permanently forbidden'
], 'activation checklist review');

console.log('aha-sync-hub-disabled-execution-ui-before-activation.test.cjs passed');
