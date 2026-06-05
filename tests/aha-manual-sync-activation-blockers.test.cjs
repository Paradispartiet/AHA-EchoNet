const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const FORBIDDEN_RUNTIME_PATTERNS = [
  { label: 'fetch(', pattern: /\bfetch\s*\(/ },
  { label: 'supabase', pattern: /\bsupabase\b/i },
  { label: 'firebase', pattern: /\bfirebase\b/i },
  { label: 'localStorage.setItem', pattern: /\blocalStorage\s*\.\s*setItem\s*\(/ },
  { label: 'AHARepository.save', pattern: /\bAHARepository\s*\.\s*save\b/ },
  { label: 'AHARepository.load', pattern: /\bAHARepository\s*\.\s*load\b/ },
  { label: 'syncFromDatabase', pattern: /\bsyncFromDatabase\b/ },
  { label: 'executeSync', pattern: /\bexecuteSync\b/ },
  { label: 'autoSync', pattern: /\bautoSync\b/ }
];

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

function stripCommentsAndStrings(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

function assertNoForbiddenRuntimeCalls(label, code) {
  const executableCode = stripCommentsAndStrings(code);
  for (const { label: term, pattern } of FORBIDDEN_RUNTIME_PATTERNS) {
    assert.equal(pattern.test(executableCode), false, `${label} must not contain runtime ${term}`);
  }
}

function extractDashboardSyncHubCode(dashboardCode) {
  const start = dashboardCode.indexOf('const SYNC_HUB_DRY_RUN_SOURCES');
  assert.notEqual(start, -1, 'dashboard Sync Hub source block should exist');
  return dashboardCode.slice(start);
}

(function run() {
  const adapterCode = fs.readFileSync('js/ahaManualSyncAdapter.js', 'utf8');
  const stateMachineCode = fs.readFileSync('js/ahaManualSyncStateMachine.js', 'utf8');
  const dashboardCode = fs.readFileSync('js/ahaDashboard.js', 'utf8');
  const indexCode = fs.readFileSync('index.html', 'utf8');

  assertNoForbiddenRuntimeCalls('manual sync adapter', adapterCode);
  assertNoForbiddenRuntimeCalls('manual sync state machine', stateMachineCode);
  assertNoForbiddenRuntimeCalls('dashboard Sync Hub runtime block', extractDashboardSyncHubCode(dashboardCode));

  for (const file of FORBIDDEN_HOME_MODULE_LOADS) {
    assert.equal(indexCode.includes(file), false, `Home must not load ${file}`);
    assert.equal(dashboardCode.includes(file), false, `dashboard must not import/load ${file}`);
  }

  assert.ok(
    dashboardCode.includes('<button type="button" class="aha-sync-manual-button" disabled aria-disabled="true" aria-describedby="aha-sync-manual-disabled-reason">Manual sync</button>'),
    'Manual sync button must remain rendered as disabled/gated'
  );
  assert.ok(
    dashboardCode.includes('<button type="button" class="aha-sync-manual-button" disabled aria-disabled="true" title="Disabled until manual sync execution is implemented.">Confirm sync</button>'),
    'Confirm sync button must remain rendered as disabled/gated'
  );
  assert.ok(
    dashboardCode.includes('Changing this selector only updates in-memory preview text'),
    'target selector must remain preview-only and not activate sync'
  );

  const context = vm.createContext({
    window: {},
    module: { exports: {} },
    exports: {},
    console,
    Date,
    Object,
    Array,
    String,
    Math
  });

  loadScript('js/ahaManualSyncStateMachine.js', context);
  loadScript('js/ahaManualSyncAdapter.js', context);

  const stateMachine = context.window.AHAManualSyncStateMachine;
  const adapter = context.window.AHAManualSyncAdapter;
  assert.ok(stateMachine, 'state machine API is exposed without importing future sync modules');
  assert.ok(adapter, 'adapter API is exposed without importing future sync modules');

  assert.deepEqual(Object.values(stateMachine.AHA_MANUAL_SYNC_STATES), [
    'not_started',
    'blocked',
    'confirmed',
    'running',
    'partial_success',
    'success',
    'failed',
    'rolled_back'
  ]);

  const defaultRunState = stateMachine.createAhaManualSyncRunState();
  assert.equal(defaultRunState.currentState, 'blocked');
  assert.equal(defaultRunState.previousState, 'not_started');
  assert.equal(defaultRunState.target, 'not_configured');
  assert.equal(defaultRunState.canExecute, false);
  assert.equal(defaultRunState.canWrite, false);
  assert.equal(defaultRunState.writeStatus, 'disabled_stub_only');

  const status = stateMachine.getAhaManualSyncStateMachineStatus();
  assert.equal(status.currentState, 'blocked');
  assert.equal(status.canExecute, false);
  assert.equal(status.canWrite, false);
  assert.equal(status.writeStatus, 'disabled_stub_only');

  const blockedState = stateMachine.createAhaManualSyncRunState({
    target: { id: 'not_configured' },
    readinessStatus: 'ready',
    validationStatus: 'valid',
    checklistStatus: 'ready',
    payloadStatus: 'ready_preview_only'
  });

  for (const nextState of ['confirmed', 'running', 'success', 'partial_success']) {
    const decision = stateMachine.canTransitionAhaManualSyncState(blockedState, nextState);
    assert.equal(decision.allowed, false, `${nextState} transition must remain blocked`);
    assert.equal(decision.reason, 'Manual sync execution is disabled in state machine stub.');

    const beforeTransition = JSON.stringify(blockedState);
    const transitioned = stateMachine.transitionAhaManualSyncState(blockedState, nextState);
    assert.equal(JSON.stringify(blockedState), beforeTransition, `transition to ${nextState} must not mutate input state`);
    assert.notEqual(transitioned, blockedState, `transition to ${nextState} should return a copied state`);
    assert.equal(transitioned.currentState, 'blocked', `${nextState} transition must not advance execution`);
    assert.equal(transitioned.canExecute, false);
    assert.equal(transitioned.canWrite, false);
  }

  const blockedToRunning = stateMachine.canTransitionAhaManualSyncState({ currentState: 'blocked' }, 'running');
  assert.equal(blockedToRunning.allowed, false, 'blocked state cannot transition to running');

  const adapterStatus = adapter.getAhaManualSyncAdapterStatus();
  assert.equal(adapterStatus.adapterStatus, 'disabled_stub_only');
  assert.equal(adapterStatus.target, 'not_configured');
  assert.equal(adapterStatus.targetStatus, 'not_configured');
  assert.equal(adapterStatus.canExecute, false);
  assert.equal(adapterStatus.canWrite, false);
  assert.equal(adapterStatus.writeStatus, 'disabled_stub_only');

  for (const target of [undefined, null, 'not_configured', { id: 'aha_repository_future' }, { id: 'database_api_future' }, { id: 'custom_sync_backend_future' }]) {
    const validation = adapter.validateAhaManualSyncTarget(target);
    assert.equal(validation.status, 'blocked', `target ${JSON.stringify(target)} must validate as blocked`);
    assert.equal(validation.canExecute, false, `target ${JSON.stringify(target)} must not enable execution`);
    assert.equal(validation.canWrite, false, `target ${JSON.stringify(target)} must not enable writes`);
  }

  assert.equal(typeof adapter.runAhaManualSyncTargetDryRun, 'function', 'dry-run harness should be exposed');
  assert.equal(typeof adapter.dryRunAhaManualSyncTarget, 'function', 'adapter should expose dry-run alias');

  function assertDryRunAlwaysDisabled(result, label) {
    assert.equal(result.ok, false, `${label} ok must stay false`);
    assert.equal(result.mode, 'dry_run', `${label} must be dry-run mode`);
    assert.equal(result.canExecute, false, `${label} canExecute must always be false`);
    assert.equal(result.canWrite, false, `${label} canWrite must always be false`);
    assert.equal(result.wouldExecute, false, `${label} wouldExecute must always be false`);
    assert.equal(result.wouldWrite, false, `${label} wouldWrite must always be false`);
    assert.equal(result.writeStatus, 'disabled_dry_run_only', `${label} writeStatus must be dry-run disabled`);
    assert.equal(result.rollbackStatus, 'not_available_dry_run_only', `${label} rollbackStatus must be dry-run only`);
  }

  const readyDryRunInput = {
    target: { id: 'configured_preview_target', status: 'configured_preview' },
    payloadPreview: {
      modules: [
        { id: 'lists', included: true, itemCount: 2 },
        { id: 'paths', included: false, itemCount: 0 }
      ],
      modulesIncluded: 1,
      includedModules: ['lists'],
      excludedModules: ['paths'],
      totalPreviewItems: 2
    },
    validation: { status: 'valid', errorCount: 0, warningCount: 0 },
    readiness: { status: 'ready' },
    checklist: { summary: { passed: 3, warning: 0, blocked: 0 }, items: [] },
    auditPreview: { status: 'preview_only', warnings: [] },
    adapterStatus: { canExecute: true, canWrite: false },
    stateMachineStatus: { currentState: 'blocked', canExecute: true, canWrite: false }
  };

  const previewOnlyDryRun = adapter.runAhaManualSyncTargetDryRun(readyDryRunInput);
  assertDryRunAlwaysDisabled(previewOnlyDryRun, 'preview-only dry run');
  assert.equal(previewOnlyDryRun.status, 'preview_only');
  assert.equal(previewOnlyDryRun.target, 'configured_preview_target');
  assert.equal(previewOnlyDryRun.targetStatus, 'configured_preview');
  assert.deepEqual(previewOnlyDryRun.includedModules, ['lists']);
  assert.deepEqual(previewOnlyDryRun.excludedModules, ['paths']);
  assert.equal(previewOnlyDryRun.totalItems, 2);
  assert.equal(previewOnlyDryRun.blockers.length, 0);

  const dryRunBlockedCases = [
    {
      label: 'missing target',
      patch: { target: undefined },
      expectedBlocker: /target/i
    },
    {
      label: 'not_configured target',
      patch: { target: { id: 'not_configured' } },
      expectedBlocker: /not_configured|target/i
    },
    {
      label: 'future_only target',
      patch: { target: { id: 'database_api_future', status: 'future_only' } },
      expectedBlocker: /preview-only|future-only/i
    },
    {
      label: 'preview_only target',
      patch: { target: { id: 'custom_target', status: 'preview_only' } },
      expectedBlocker: /preview-only|future-only/i
    },
    {
      label: 'validation errors',
      patch: { validation: { status: 'invalid', errorCount: 1, warningCount: 0 } },
      expectedBlocker: /validation/i,
      expectedStatus: 'invalid'
    },
    {
      label: 'readiness blocked',
      patch: { readiness: { status: 'blocked' } },
      expectedBlocker: /readiness/i
    },
    {
      label: 'checklist blocked',
      patch: { checklist: { summary: { passed: 1, warning: 0, blocked: 1 }, items: [{ status: 'blocked' }] } },
      expectedBlocker: /checklist/i
    },
    {
      label: 'zero included modules',
      patch: { payloadPreview: { modules: [{ id: 'lists', included: false, itemCount: 0 }], modulesIncluded: 0, includedModules: [], excludedModules: ['lists'], totalPreviewItems: 0 } },
      expectedBlocker: /0 included modules/i
    },
    {
      label: 'adapter canExecute false',
      patch: { adapterStatus: { canExecute: false, canWrite: false } },
      expectedBlocker: /adapter canExecute/i
    },
    {
      label: 'state machine canExecute false',
      patch: { stateMachineStatus: { currentState: 'blocked', canExecute: false, canWrite: false } },
      expectedBlocker: /state machine canExecute/i
    }
  ];

  for (const { label, patch, expectedBlocker, expectedStatus = 'blocked' } of dryRunBlockedCases) {
    const result = adapter.runAhaManualSyncTargetDryRun({ ...readyDryRunInput, ...patch });
    assertDryRunAlwaysDisabled(result, label);
    assert.equal(result.status, expectedStatus, `${label} should return ${expectedStatus}`);
    assert.ok(result.blockers.some((blocker) => expectedBlocker.test(blocker)), `${label} should include matching blocker`);
  }

  const defaultDryRun = adapter.runAhaManualSyncTargetDryRun();
  assertDryRunAlwaysDisabled(defaultDryRun, 'default dry run');
  assert.equal(defaultDryRun.status, 'blocked');
  assert.equal(defaultDryRun.target, 'not_configured');
  assert.equal(defaultDryRun.targetStatus, 'not_configured');
  assert.ok(defaultDryRun.blockers.length >= 1, 'default dry run should explain why it is blocked');

  const input = {
    target: { id: 'database_api_future' },
    readinessStatus: 'ready',
    validationStatus: 'valid',
    checklistStatus: 'ready',
    payloadStatus: 'ready_preview_only',
    payload: { includedModules: ['lists'] },
    sendPayload() {
      throw new Error('executeAhaManualSyncRun must not send payload');
    },
    writeData() {
      throw new Error('executeAhaManualSyncRun must not write data');
    }
  };
  const inputSnapshot = JSON.stringify({
    target: input.target,
    readinessStatus: input.readinessStatus,
    validationStatus: input.validationStatus,
    checklistStatus: input.checklistStatus,
    payloadStatus: input.payloadStatus,
    payload: input.payload
  });

  const prepared = adapter.prepareAhaManualSyncRun(input);
  assert.equal(prepared.ok, false);
  assert.match(prepared.status, /blocked|disabled|preview/);
  assert.equal(prepared.canExecute, false);
  assert.equal(prepared.canWrite, false);
  assert.equal(prepared.writeStatus, 'disabled_stub_only');
  assert.equal(prepared.runState.currentState, 'blocked');
  assert.equal(prepared.runState.canExecute, false);

  const executed = adapter.executeAhaManualSyncRun(input);
  assert.equal(executed.ok, false);
  assert.equal(executed.status, 'blocked');
  assert.equal(executed.canExecute, false);
  assert.equal(executed.canWrite, false);
  assert.equal(executed.writeStatus, 'disabled_stub_only');
  assert.equal(executed.runState.currentState, 'blocked');
  assert.equal(executed.runState.canExecute, false);
  assert.equal(executed.runState.canWrite, false);
  assert.equal(JSON.stringify({
    target: input.target,
    readinessStatus: input.readinessStatus,
    validationStatus: input.validationStatus,
    checklistStatus: input.checklistStatus,
    payloadStatus: input.payloadStatus,
    payload: input.payload
  }), inputSnapshot, 'adapter prepare/execute must not mutate input payload state');

  // Dashboard builder functions are not exported as a small testable API yet; this PR keeps
  // those checks static so blocker coverage stays focused on adapter/state-machine safety.
})();
