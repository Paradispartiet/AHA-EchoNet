const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const blockedTerms = [
  'fetch',
  'supabase',
  'firebase',
  'localStorage.setItem',
  'AHARepository.save',
  'AHARepository.load',
  'syncFromDatabase'
];

function loadScript(file, context) {
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, context, { filename: file });
}

(function run() {
  const stateMachineCode = fs.readFileSync('js/ahaManualSyncStateMachine.js', 'utf8');
  const adapterCode = fs.readFileSync('js/ahaManualSyncAdapter.js', 'utf8');

  for (const term of blockedTerms) {
    assert.equal(stateMachineCode.includes(term), false, `state machine must not contain ${term}`);
    assert.equal(adapterCode.includes(term), false, `adapter must not contain ${term}`);
  }

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
  const stateMachine = context.window.AHAManualSyncStateMachine;

  assert.ok(stateMachine, 'state machine API is exposed');
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

  const status = stateMachine.getAhaManualSyncStateMachineStatus();
  assert.equal(status.currentState, 'blocked');
  assert.equal(status.previousState, 'not_started');
  assert.equal(status.reason, 'Manual sync execution is not implemented.');
  assert.equal(status.canExecute, false);
  assert.equal(status.canWrite, false);
  assert.equal(status.isStub, true);
  assert.equal(status.writeStatus, 'disabled_stub_only');

  const input = {
    target: { id: 'database_api_future' },
    readinessStatus: 'warning',
    validationStatus: 'valid',
    checklistStatus: 'blocked',
    payloadStatus: 'preview_only',
    warnings: ['review payload'],
    errors: []
  };
  const inputSnapshot = JSON.stringify(input);
  const runState = stateMachine.createAhaManualSyncRunState(input);
  assert.equal(JSON.stringify(input), inputSnapshot, 'createRunState must not mutate input');
  assert.equal(runState.currentState, 'blocked');
  assert.equal(runState.previousState, 'not_started');
  assert.equal(runState.target, 'database_api_future');
  assert.equal(runState.canExecute, false);
  assert.equal(runState.canWrite, false);
  assert.equal(runState.writeStatus, 'disabled_stub_only');
  assert.ok(runState.createdAt);

  for (const nextState of ['confirmed', 'running', 'success', 'partial_success']) {
    const decision = stateMachine.canTransitionAhaManualSyncState(runState, nextState);
    assert.equal(decision.allowed, false, `${nextState} must be blocked`);
    assert.equal(decision.reason, 'Manual sync execution is disabled in state machine stub.');
  }

  const beforeTransition = JSON.stringify(runState);
  const blockedTransition = stateMachine.transitionAhaManualSyncState(runState, 'running');
  assert.equal(JSON.stringify(runState), beforeTransition, 'transitionState must not mutate input');
  assert.notEqual(blockedTransition, runState);
  assert.equal(blockedTransition.currentState, 'blocked');
  assert.equal(blockedTransition.attemptedState, 'running');
  assert.equal(blockedTransition.canExecute, false);
  assert.equal(blockedTransition.canWrite, false);
  assert.ok(blockedTransition.errors.includes('Manual sync execution is disabled in state machine stub.'));

  const allowedPreview = stateMachine.transitionAhaManualSyncState(runState, 'not_started');
  assert.equal(allowedPreview.previousState, 'blocked');
  assert.equal(allowedPreview.currentState, 'not_started');
  assert.equal(allowedPreview.canExecute, false);
  assert.equal(allowedPreview.canWrite, false);

  loadScript('js/ahaManualSyncAdapter.js', context);
  const adapter = context.window.AHAManualSyncAdapter;
  const prepared = adapter.prepareRun(input);
  assert.equal(prepared.canExecute, false);
  assert.equal(prepared.canWrite, false);
  assert.equal(prepared.runState.currentState, 'blocked');

  const executed = adapter.executeRun(input);
  assert.equal(executed.ok, false);
  assert.equal(executed.status, 'blocked');
  assert.equal(executed.canExecute, false);
  assert.equal(executed.canWrite, false);
  assert.equal(executed.runState.currentState, 'blocked');
})();
