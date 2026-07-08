'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const ADAPTER_FILE = 'js/ahaManualSyncDryRunTargetAdapter.js';
const code = fs.readFileSync(ADAPTER_FILE, 'utf8');
const values = new Map();
const storageCalls = [];
const forbiddenRuntimeCalls = [];
let syncCalls = 0;

const localStorage = {
  getItem(key) {
    storageCalls.push(['getItem', key]);
    return values.has(key) ? values.get(key) : null;
  },
  setItem(key, value) {
    storageCalls.push(['setItem', key, value]);
    forbiddenRuntimeCalls.push('localStorage.setItem');
  },
  removeItem(key) {
    storageCalls.push(['removeItem', key]);
    forbiddenRuntimeCalls.push('localStorage.removeItem');
  }
};

const window = {
  localStorage,
  AHALists: {
    syncFromDatabase() {
      syncCalls += 1;
    }
  },
  get AHARepository() {
    forbiddenRuntimeCalls.push('AHARepository');
    throw new Error('dry-run evidence must not access AHARepository');
  },
  get supabase() {
    forbiddenRuntimeCalls.push('supabase');
    throw new Error('dry-run evidence must not access Supabase');
  },
  dispatchEvent() {
    forbiddenRuntimeCalls.push('dispatchEvent');
  },
  createInsight() {
    forbiddenRuntimeCalls.push('createInsight');
  },
  publish() {
    forbiddenRuntimeCalls.push('publish');
  }
};

const context = vm.createContext({
  window,
  console,
  JSON,
  Object,
  Array,
  Boolean,
  String,
  Set,
  fetch() {
    forbiddenRuntimeCalls.push('fetch');
  }
});

vm.runInContext(code, context, { filename: ADAPTER_FILE });
const adapter = context.window.AHAManualSyncDryRunTargetAdapter;

// A. Namespace/API
assert.ok(adapter, 'window.AHAManualSyncDryRunTargetAdapter should be exported');
for (const apiName of [
  'getManualSyncTargets',
  'inspectManualSyncTarget',
  'inspectAllManualSyncTargets',
  'createManualSyncDryRunPlan'
]) {
  assert.equal(typeof adapter[apiName], 'function', `${apiName} should be exported`);
}
assert.equal(Object.isFrozen(adapter), true, 'the public dry-run adapter API should be frozen');
assert.equal('execute' in adapter, false, 'the dry-run adapter must not expose an execution API');

// B. Target registry
const targets = adapter.getManualSyncTargets();
assert.deepEqual(
  Array.from(targets, (target) => target.targetId),
  ['lists', 'paths', 'groups', 'avisa'],
  'target registry should contain Lists, Paths, Groups and AHAavisa'
);
assert.equal(Object.isFrozen(targets), true, 'target registry should be frozen');
assert.equal(targets.every(Object.isFrozen), true, 'every target definition should be frozen');
for (const target of targets) {
  assert.equal(target.executionAllowed, false, `${target.targetId} execution must remain disabled`);
  for (const field of ['storageKey', 'table', 'syncModule', 'syncFunction']) {
    assert.equal(typeof target[field], 'string', `${target.targetId}.${field} should be defined`);
    assert.ok(target[field].length > 0, `${target.targetId}.${field} should not be empty`);
  }
}
assert.throws(() => targets.push({ targetId: 'new-target' }), /not extensible|read only/i, 'registry entries cannot be appended');
assert.throws(() => { targets[0].executionAllowed = true; }, /read only|Cannot assign/i, 'registry entries cannot enable execution');

// C. Dry-run plan
const plan = adapter.createManualSyncDryRunPlan();
assert.equal(plan.mode, 'planned_noop_dry_run');
assert.equal(plan.executionAllowed, false);
assert.equal(plan.autoSync, false);
assert.equal(plan.blocked, true);
assert.equal(plan.wouldWrite, false);
assert.equal(plan.wouldCallSyncFromDatabase, false);
assert.equal(plan.wouldCallRepository, false);
assert.deepEqual(Array.from(plan.wouldRun), [], 'dry-run evidence must not schedule execution');
assert.ok(Array.isArray(plan.blockers), 'dry-run plan should expose blockers');
assert.ok(plan.blockers.length > 0, 'dry-run plan should remain blocked by explicit evidence');
assert.ok(plan.blockers.includes('manual_sync_execution_is_no_go'));
assert.ok(plan.blockers.includes('activation_pr_missing'));
assert.ok(plan.blockers.includes('auto_sync_permanently_forbidden'));

// D. Counts and safe localStorage reads
values.set('aha_lists_v1', JSON.stringify([
  { id: 'active-1' },
  { id: 'active-2', deletedAt: null },
  { id: 'deleted-camel', deletedAt: '2026-06-01T00:00:00Z' },
  { id: 'deleted-snake', deleted_at: '2026-06-02T00:00:00Z' }
]));
const lists = adapter.inspectManualSyncTarget('lists');
assert.equal(lists.localTotal, 4, 'localTotal should count every local record');
assert.equal(lists.localActive, 2, 'localActive should exclude tombstones');
assert.equal(lists.localTombstones, 2, 'deletedAt and deleted_at should count as tombstones');

values.set('aha_paths_v1', '{invalid json');
const invalidJson = adapter.inspectManualSyncTarget('paths');
assert.equal(invalidJson.localTotal, 0, 'invalid JSON should not crash and should count as empty');
assert.equal(invalidJson.localActive, 0);
assert.equal(invalidJson.localTombstones, 0);

const missingKey = adapter.inspectManualSyncTarget('groups');
assert.equal(missingKey.localTotal, 0, 'a missing storage key should not crash and should count as empty');
assert.equal(missingKey.localActive, 0);
assert.equal(missingKey.localTombstones, 0);

// E. Runtime availability inspection without invocation
assert.equal(lists.syncFunctionAvailable, true, 'loaded sync function should be reported as available');
assert.equal(lists.executionAllowed, false, 'runtime availability must not allow execution');
assert.equal(lists.blocked, true, 'runtime availability must not remove the execution block');
assert.equal(syncCalls, 0, 'availability inspection must not call syncFromDatabase');

adapter.inspectAllManualSyncTargets();
adapter.createManualSyncDryRunPlan({ targetIds: ['lists'] });
assert.equal(syncCalls, 0, 'all dry-run inspection paths must leave syncFromDatabase uncalled');
assert.equal(
  storageCalls.some(([method]) => method === 'setItem' || method === 'removeItem'),
  false,
  'dry-run inspection must not write localStorage'
);
assert.deepEqual(forbiddenRuntimeCalls, [], 'dry-run inspection must not perform forbidden runtime side effects');

// F. Static forbidden execution/write/network/event patterns. Registry strings remain allowed.
const forbiddenSourceCalls = [
  [/\bsyncFromDatabase\s*\(/, 'syncFromDatabase call'],
  [/\bAHARepository\s*\.\s*save\s*\(/, 'AHARepository.save call'],
  [/\bAHARepository\s*\.\s*load\s*\(/, 'AHARepository.load call'],
  [/\bsupabase\s*\.\s*from\s*\(/i, 'supabase.from call'],
  [/\bfetch\s*\(/, 'fetch call'],
  [/\blocalStorage\s*\.\s*setItem\s*\(/, 'localStorage.setItem call'],
  [/\blocalStorage\s*\.\s*removeItem\s*\(/, 'localStorage.removeItem call'],
  [/dispatchEvent\s*\(\s*new\s+CustomEvent\b/, 'CustomEvent dispatch'],
  [/\bsource_events\b/, 'source_events path'],
  [/\bcreateInsight\s*\(/, 'createInsight call'],
  [/\bpublish\s*\(/, 'publish call']
];
for (const [pattern, label] of forbiddenSourceCalls) {
  assert.equal(pattern.test(code), false, `adapter source must not contain ${label}`);
}

console.log('aha-manual-sync-dry-run-target-evidence.test.cjs passed');
