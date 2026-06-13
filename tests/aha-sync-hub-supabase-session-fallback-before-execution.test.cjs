const assert = require('assert');
const fs = require('fs');

const FALLBACK_DOC = 'docs/AHA_SYNC_HUB_SUPABASE_SESSION_FALLBACK_BEFORE_EXECUTION.md';
const CHECKLIST_DOC = 'docs/AHA_SYNC_HUB_ACTIVATION_CHECKLIST_REVIEW.md';
const RUNTIME_FILES = [
  'js/ahaDashboard.js',
  'js/ahaManualSyncDryRunTargetAdapter.js',
  'index.html'
];
const ACTIVATION_PR = 'feat: activate manual AHA Sync Hub execution';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function normalized(source) {
  return source.toLowerCase().replace(/[`*]/g, '');
}

function requirePhrases(source, phrases, scope) {
  const text = normalized(source);
  for (const phrase of phrases) {
    assert.ok(text.includes(phrase.toLowerCase()), `${scope} must retain: ${phrase}`);
  }
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
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

(function run() {
  assert.ok(fs.existsSync(FALLBACK_DOC), 'Supabase/session fallback requirements document must exist');

  const fallbackDoc = read(FALLBACK_DOC);
  const checklistDoc = read(CHECKLIST_DOC);

  requirePhrases(fallbackDoc, [
    'Supabase/session fallback requirements are reviewed, not implemented',
    'Manual sync execution remains NO-GO',
    'Dedicated execution page remains planned, not implemented',
    'Home remains preview-only',
    'Audit write path remains not activated',
    'Rollback implementation remains not activated',
    'Auto-sync is permanently forbidden',
    'Missing Supabase/session must never delete or overwrite local-first data',
    'No Supabase/session-dependent execution may activate before all gates are GO'
  ], 'current decision');

  requirePhrases(fallbackDoc, [
    'unknown',
    'not_configured',
    'unavailable',
    'anonymous',
    'unauthenticated',
    'authenticated',
    'expired',
    'permission_denied',
    'ready',
    'blocked_no_go'
  ], 'session states');

  requirePhrases(fallbackDoc, [
    'unknown',
    'not_configured',
    'missing_client',
    'missing_url',
    'missing_key',
    'unavailable',
    'reachable',
    'unreachable',
    'permission_denied',
    'ready',
    'blocked_no_go'
  ], 'Supabase availability states');

  requirePhrases(fallbackDoc, [
    'Supabase client missing',
    'Supabase URL/key missing',
    'Supabase unavailable',
    'network failure',
    'unauthenticated user',
    'expired session',
    'permission denied',
    'anonymous session',
    'remote table unavailable',
    'remote schema mismatch',
    'remote write rejected',
    'audit write unavailable',
    'rollback unavailable',
    'localStorage parse failure',
    'activation gates not green'
  ], 'required fallback behavior');

  requirePhrases(fallbackDoc, [
    'preview must work without Supabase',
    'dry-run target inspection must work without Supabase',
    'dry-run plan may show remote unavailable',
    'dry-run must not write',
    'dry-run must not call Supabase write APIs',
    'missing Supabase/session must not delete localStorage',
    'missing Supabase/session must not hide local counts',
    'missing Supabase/session must show blocked remote execution state'
  ], 'preview and dry-run behavior');

  requirePhrases(fallbackDoc, [
    'no execution without authenticated/authorized session',
    'no remote write without Supabase ready state',
    'no audit write without audit readiness',
    'no rollback attempt without rollback readiness',
    'no fallback may convert NO-GO into GO',
    'no Home action may trigger session-based execution',
    'no page-load/session-ready event may trigger execution',
    'no auth-ready event may trigger execution',
    'no storage event may trigger execution',
    'no timer/interval may trigger execution'
  ], 'execution blocking rules');

  requirePhrases(fallbackDoc, [
    'Supabase configured/not configured',
    'session status',
    'authentication status',
    'authorization status',
    'remote readiness status',
    'remote write availability',
    'audit write availability',
    'rollback availability',
    'local-only mode',
    'blocked reason',
    'next required action'
  ], 'operator visibility');

  requirePhrases(fallbackDoc, [
    'no auto-sync after session becomes ready',
    'no execution on auth-ready',
    'no execution on page load',
    'no execution on render',
    'no execution on storage event',
    'no execution on visibilitychange',
    'no execution by timer/interval',
    'no deleting localStorage when Supabase unavailable',
    'no deleting localStorage when session missing',
    'no writing audit/history during preview',
    'no writing remote data during dry-run',
    'no source events',
    'no insights creation',
    'no publishing',
    'no social sharing'
  ], 'forbidden behavior');

  for (const gate of ['Gate E', 'Gate F', 'Gate G', 'Gate H', 'Gate I', 'Gate J']) {
    assert.ok(fallbackDoc.includes(gate), `fallback requirements must retain ${gate} impact`);
  }
  assert.ok(fallbackDoc.includes(ACTIVATION_PR), 'fallback requirements must name the activation PR exactly');
  assert.match(fallbackDoc, /activation PR (?:is )?still required/i, 'activation PR must remain required before execution');

  const forbiddenRuntimePatterns = [
    'supabase.from',
    '.insert(',
    '.upsert(',
    '.delete(',
    '.update(',
    'syncFromDatabase(',
    'AHARepository.save',
    'AHARepository.load',
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
    'publish'
  ];
  const runtimeExecutionSurfaces = new Map(RUNTIME_FILES.map((file) => [file, read(file)]));
  const dashboardSource = runtimeExecutionSurfaces.get('js/ahaDashboard.js');
  runtimeExecutionSurfaces.set(
    'js/ahaDashboard.js',
    [
      extractFunction(dashboardSource, 'renderAhaManualSyncDryRunTargetPreview'),
      extractFunction(dashboardSource, 'renderSyncHubStatus')
    ].join('\n')
  );
  for (const [file, source] of runtimeExecutionSurfaces) {
    for (const pattern of forbiddenRuntimePatterns) {
      assert.equal(source.includes(pattern), false, `${file} must not contain execution pattern ${pattern}`);
    }
  }

  assert.equal(fs.existsSync('sync.html'), false, 'sync.html must remain unimplemented');

  requirePhrases(checklistDoc, [
    'Supabase/session fallback review',
    'test-locked, not implemented',
    'all gates A–J must be GO for execution',
    'auto-sync remains permanently forbidden'
  ], 'activation checklist');
  assert.match(checklistDoc, /Gate I[\s\S]*?TEST-LOCKED, NOT IMPLEMENTED/i, 'Gate I must be test-locked, not implemented');
  for (const gate of ['E', 'F', 'G', 'H', 'I', 'J']) {
    assert.match(checklistDoc, new RegExp(`\\| \\*\\*${gate}\\*\\*[\\s\\S]*?NO-GO for execution`, 'i'), `Gate ${gate} must not be full GO for execution`);
  }

  console.log('aha-sync-hub-supabase-session-fallback-before-execution.test.cjs passed');
})();
