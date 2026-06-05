const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function loadScript(file, context) {
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, context, { filename: file });
}

(function run() {
  const stateMachineCode = fs.readFileSync('js/ahaManualSyncStateMachine.js', 'utf8');
  assert.equal(stateMachineCode.includes('localStorage.setItem'), false, 'state machine must not persist execution state in localStorage');
  assert.equal(/\bfetch\s*\(/.test(stateMachineCode), false, 'state machine must not call backend/network directly');

  const context = vm.createContext({ window: {}, module: { exports: {} }, exports: {}, console, Date, Object, Array, String, Math, Set });
  loadScript('js/ahaManualSyncStateMachine.js', context);
  const stateMachine = context.window.AHAManualSyncStateMachine;

  assert.ok(stateMachine, 'state machine API is exposed');
  assert.deepEqual(Object.values(stateMachine.AHA_MANUAL_SYNC_STATES), [
    'not_started', 'blocked', 'confirmed', 'running', 'partial_success', 'success', 'failed', 'rolled_back'
  ]);

  const status = stateMachine.getAhaManualSyncStateMachineStatus();
  assert.equal(status.canExecute, true, 'state machine can execute only with per-run gates');
  assert.equal(status.canWrite, true, 'state machine can write only with per-run gates');
  assert.equal(status.isStub, false);
  assert.deepEqual(status.allowedTransitions.blocked, ['confirmed']);
  assert.deepEqual(status.allowedTransitions.confirmed, ['running']);
  assert.deepEqual(status.allowedTransitions.running, ['success', 'failed']);

  const blockedInput = {
    target: { id: 'not_configured', status: 'not_configured' },
    readinessStatus: 'ready',
    validation: { status: 'valid', errorCount: 0 },
    checklistSummary: { blockedCount: 0 },
    payloadPreview: { modulesIncluded: 1 }
  };
  const blockedState = stateMachine.createAhaManualSyncRunState(blockedInput);
  assert.equal(blockedState.currentState, 'blocked');
  assert.equal(blockedState.canExecute, false);
  assert.ok(blockedState.blockers.includes('Target is not configured.'));
  assert.equal(stateMachine.canTransitionAhaManualSyncState(blockedState, 'confirmed').allowed, false);

  const readyInput = {
    target: { id: 'database_existing', status: 'configured' },
    readinessStatus: 'ready',
    validation: { status: 'valid', errorCount: 0 },
    checklistSummary: { blockedCount: 0 },
    payloadPreview: { modulesIncluded: 1 }
  };
  const readySnapshot = JSON.stringify(readyInput);
  const readyState = stateMachine.createAhaManualSyncRunState(readyInput);
  assert.equal(JSON.stringify(readyInput), readySnapshot, 'createRunState must not mutate input');
  assert.equal(readyState.canExecute, true);
  assert.equal(readyState.canWrite, true);

  const confirmed = stateMachine.transitionAhaManualSyncState(readyState, 'confirmed');
  assert.equal(confirmed.currentState, 'confirmed');
  const runningBlocked = stateMachine.transitionAhaManualSyncState(confirmed, 'running');
  assert.notEqual(runningBlocked.currentState, 'running', 'running requires explicit confirmation');
  const running = stateMachine.transitionAhaManualSyncState(confirmed, 'running', { explicitConfirmation: true });
  assert.equal(running.currentState, 'running');
  assert.equal(stateMachine.transitionAhaManualSyncState(running, 'success').currentState, 'success');
  assert.equal(stateMachine.transitionAhaManualSyncState(running, 'failed').currentState, 'failed');

  const failed = stateMachine.transitionAhaManualSyncState(running, 'failed');
  const rolledBack = stateMachine.transitionAhaManualSyncState(failed, 'rolled_back');
  assert.notEqual(rolledBack.currentState, 'rolled_back', 'rollback must not be claimed when unavailable');

  loadScript('js/ahaManualSyncAdapter.js', context);
  assert.ok(context.window.AHAManualSyncAdapter, 'adapter should load with state machine');

  console.log('aha-manual-sync-state-machine.test.cjs passed');
})();
