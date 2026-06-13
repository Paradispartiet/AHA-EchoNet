const assert = require('assert');
const fs = require('fs');

const SKELETON_FILE = 'docs/AHA_SYNC_HUB_DISABLED_EXECUTION_PAGE_SKELETON.md';
const CHECKLIST_FILE = 'docs/AHA_SYNC_HUB_ACTIVATION_CHECKLIST_REVIEW.md';
const HOME_FILE = 'index.html';
const DASHBOARD_FILE = 'js/ahaDashboard.js';
const DRY_RUN_TARGET_ADAPTER_FILE = 'js/ahaManualSyncDryRunTargetAdapter.js';
const ACTIVATION_PR = 'feat: activate manual AHA Sync Hub execution';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function requirePhrases(source, phrases, label) {
  const normalized = source.toLowerCase();
  for (const phrase of phrases) {
    assert.ok(normalized.includes(phrase.toLowerCase()), `${label} must include: ${phrase}`);
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

assert.ok(fs.existsSync(SKELETON_FILE), 'disabled execution page skeleton document must exist');

const skeleton = read(SKELETON_FILE);
const checklist = read(CHECKLIST_FILE);
const home = read(HOME_FILE);
const dashboard = read(DASHBOARD_FILE);
const dryRunTargetAdapter = read(DRY_RUN_TARGET_ADAPTER_FILE);

requirePhrases(skeleton, [
  'Disabled execution page skeleton is defined, not implemented',
  '`sync.html` must not be created in this PR',
  'Manual sync execution remains **NO-GO**',
  'Home remains preview-only',
  'No executable sync button may exist',
  'No enabled execution UI may exist before all gates are **GO**',
  'Audit write path remains not activated',
  'Rollback implementation remains not activated',
  'Supabase/session fallback implementation remains not activated',
  'Auto-sync is permanently forbidden'
], 'current decision');

requirePhrases(skeleton, [
  'sync.html',
  'not created yet',
  'not linked from Home yet as an executable execution surface',
  'must be disabled by default when later created',
  'must not execute anything on load',
  'must not execute anything on render',
  'must not execute anything on auth-ready',
  'must not execute anything on storage events',
  'must not execute anything by timer/interval'
], 'proposed future file');

requirePhrases(skeleton, [
  'Header / title',
  'Current NO-GO status',
  'Gate summary',
  'Missing gates',
  'Supabase/session readiness',
  'Audit/history readiness',
  'Rollback/no-write readiness',
  'Per-module readiness',
  'Dry-run summary',
  'Per-module result preview',
  'Disabled execution controls',
  'Confirmation requirements',
  'Operator next action',
  'Auto-sync forbidden notice'
], 'proposed page sections');

requirePhrases(skeleton, [
  'Run manual sync',
  'Confirm execution',
  'Retry failed module',
  'Rollback module',
  'Write audit/history',
  'Publish AHAavisa',
  'Share Groups result',
  'disabled until activation PR',
  'disabled until all gates GO',
  'must not have hidden click handlers',
  'must not write',
  'must not sync',
  'must not rollback',
  'must not publish',
  'must not dispatch source events'
], 'disabled controls');

requirePhrases(skeleton, [
  'activation_pr_required',
  'gates_not_go',
  'execution_page_not_implemented',
  'disabled_ui_not_test_locked',
  'supabase_session_not_ready',
  'audit_history_not_ready',
  'rollback_not_ready',
  'no_write_safety_not_ready',
  'per_module_results_not_ready',
  'confirmation_not_ready',
  'auto_sync_forbidden'
], 'required blocked reasons');

requirePhrases(skeleton, [
  'future sync.html may load preview-safe shared scripts',
  'future sync.html must not load module runtime scripts before activation',
  'future sync.html must not import or execute module sync functions before activation',
  'future sync.html must not write audit/history before activation',
  'future sync.html must not write remote data before activation',
  'future sync.html must not write or delete localStorage before activation'
], 'future page loading rules');

requirePhrases(skeleton, [
  'Home remains preview-only',
  'Home may link to a future disabled page only as a non-executable review surface',
  'Home must not load module runtime scripts',
  'Home must not contain enabled execution controls',
  'Home must not execute sync',
  'Home must not write',
  'Home must not auto-sync'
], 'Home boundary');

assert.ok(skeleton.includes(ACTIVATION_PR), 'activation PR name must be exact');
requirePhrases(skeleton, [
  'all gates A–J must be **GO**',
  'the activation PR must be separate',
  'the activation PR must explicitly enable execution',
  'the activation PR must explicitly document what becomes writable',
  'the activation PR must explicitly document rollback and audit write behavior',
  'the activation PR must explicitly document Supabase/session readiness behavior',
  'the activation PR must include tests before any execution is enabled'
], 'activation boundary');

for (const gate of ['Gate E', 'Gate F', 'Gate G', 'Gate H', 'Gate I', 'Gate J']) {
  assert.ok(skeleton.includes(gate), `skeleton must document ${gate} impact`);
}

requirePhrases(skeleton, [
  'disabled execution page skeleton defined',
  'disabled execution page skeleton tests added',
  '`sync.html` absence currently test-locked',
  'future page loading rules documented',
  'Home boundary documented',
  'disabled controls documented',
  'blocked reasons documented',
  'activation boundary documented',
  'all gates A–J still required before activation'
], 'required before implementation');

const executablePatterns = [
  ['sync.html', /sync\.html/i],
  ['syncFromDatabase call', /syncFromDatabase\s*\(/],
  ['AHARepository save/load', /AHARepository\s*\.\s*(?:save|load)/],
  ['Supabase query', /\bsupabase\s*\.\s*from\s*\(/i],
  ['database mutation', /\.(?:insert|upsert|delete|update)\s*\(/],
  ['localStorage mutation', /localStorage\s*\.\s*(?:setItem|removeItem)\s*\(/],
  ['auth listener/session lookup', /(?:onAuthStateChange|auth\s*\.\s*(?:getSession|getUser))/],
  ['storage listener', /addEventListener\s*\(\s*["']storage["']/],
  ['timer/interval', /\b(?:setInterval|setTimeout)\s*\(/],
  ['custom source event', /dispatchEvent\s*\(\s*new\s+CustomEvent/],
  ['source events path', /\bsource_events\b/],
  ['insight creation', /\bcreateInsight\b/],
  ['publish path', /\bpublish\b/i],
  ['execution helper', /\b(?:executeSync|runSync|performSync|startSync|enableExecution)\b/],
  ['rollback helper', /\b(?:executeRollback|performRollback)\b/],
  ['audit helper', /\b(?:writeAudit|saveAudit|recordAudit)\b/]
];

// index.html and the dedicated dry-run target adapter must contain no execution-page path.
for (const [label, pattern] of executablePatterns) {
  assert.equal(pattern.test(home), false, `Home HTML must not contain ${label}`);
  assert.equal(pattern.test(dryRunTargetAdapter), false, `dry-run target adapter must not contain ${label}`);
}

// The dashboard has unrelated legacy auth/storage/status behavior. Lock the active Sync Hub
// render and dry-run preview surfaces, plus page/execution helper names across the whole file.
assert.equal(/sync\.html/i.test(dashboard), false, 'dashboard must not reference sync.html');
assert.equal(/\b(?:executeSync|runSync|performSync|startSync|enableExecution|executeRollback|performRollback|writeAudit|saveAudit|recordAudit)\b/.test(dashboard), false, 'dashboard must not expose execution, rollback, or audit helpers');
for (const functionName of ['renderSyncHubStatus', 'renderAhaManualSyncDryRunTargetPreview']) {
  const source = extractFunction(dashboard, functionName);
  for (const [label, pattern] of executablePatterns) {
    assert.equal(pattern.test(source), false, `${functionName} must not contain ${label}`);
  }
}

assert.equal(fs.existsSync('sync.html'), false, 'sync.html must remain absent');
for (const moduleFile of ['js/ahaLists.js', 'js/ahaPaths.js', 'js/ahaGroups.js', 'js/ahaAvisa.js']) {
  assert.equal(home.includes(moduleFile), false, `Home must not load ${moduleFile}`);
}

requirePhrases(checklist, [
  'Disabled execution page skeleton',
  'Test-locked, not implemented; NO-GO for execution',
  'Gate E',
  'Gates E, F, G, H, I, and J are not full GO for execution',
  'all gates A–J must be GO for execution',
  'activation PR',
  'auto-sync remains permanently forbidden'
], 'activation checklist review');
assert.ok(checklist.includes(ACTIVATION_PR), 'checklist must retain the exact activation PR');

console.log('aha-sync-hub-disabled-execution-page-skeleton-boundary.test.cjs passed');
