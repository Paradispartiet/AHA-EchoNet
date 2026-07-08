const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const ADAPTER_FILE = 'js/ahaManualSyncDryRunTargetAdapter.js';
const code = fs.readFileSync(ADAPTER_FILE, 'utf8');
const values = new Map();
const storageCalls = [];
const sideEffectCalls = [];
let syncCalls = 0;

const localStorage = {
  getItem(key) {
    storageCalls.push(['getItem', key]);
    return values.has(key) ? values.get(key) : null;
  },
  setItem(key, value) {
    storageCalls.push(['setItem', key, value]);
  },
  removeItem(key) {
    storageCalls.push(['removeItem', key]);
  }
};

const window = {
  localStorage,
  AHALists: {
    syncFromDatabase() {
      syncCalls += 1;
    }
  },
  AHAPaths: {},
  get AHARepository() {
    sideEffectCalls.push('repository');
    throw new Error('dry-run adapter must not access the repository');
  },
  get supabase() {
    sideEffectCalls.push('supabase');
    throw new Error('dry-run adapter must not access Supabase');
  },
  dispatchEvent() {
    sideEffectCalls.push('dispatchEvent');
  },
  createInsight() {
    sideEffectCalls.push('createInsight');
  },
  publish() {
    sideEffectCalls.push('publish');
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
    sideEffectCalls.push('fetch');
  }
});

vm.runInContext(code, context, { filename: ADAPTER_FILE });
const adapter = context.window.AHAManualSyncDryRunTargetAdapter;

assert.ok(adapter, 'adapter should export window.AHAManualSyncDryRunTargetAdapter');
assert.equal(typeof adapter.getManualSyncTargets, 'function');
assert.equal(typeof adapter.inspectManualSyncTarget, 'function');
assert.equal(typeof adapter.inspectAllManualSyncTargets, 'function');
assert.equal(typeof adapter.createManualSyncDryRunPlan, 'function');

const targets = adapter.getManualSyncTargets();
assert.deepEqual(
  targets.map((target) => target.targetId).join(','),
  'lists,paths,groups,avisa',
  'registry should contain Lists, Paths, Groups and AHAavisa'
);
assert.deepEqual(
  targets.map((target) => target.label).join(','),
  'Lister,Stier,Grupper,AHAavisa'
);
assert.equal(targets.every((target) => target.executionAllowed === false), true);
assert.equal(Object.isFrozen(targets), true, 'target registry should be read-only');
assert.equal(targets.every(Object.isFrozen), true, 'target definitions should be read-only');

values.set('aha_lists_v1', JSON.stringify([
  { id: 'active-1' },
  { id: 'active-2', deletedAt: null },
  { id: 'deleted-camel', deletedAt: '2026-06-01T00:00:00Z' },
  { id: 'deleted-snake', deleted_at: '2026-06-02T00:00:00Z' }
]));
const lists = adapter.inspectManualSyncTarget('lists');
assert.equal(lists.localTotal, 4);
assert.equal(lists.localActive, 2);
assert.equal(lists.localTombstones, 2, 'deletedAt and deleted_at should both count as tombstones');
assert.equal(lists.runtimeLoaded, true);
assert.equal(lists.syncFunctionAvailable, true);
assert.equal(lists.executionAllowed, false);
assert.equal(lists.dryRunOnly, true);
assert.equal(lists.blocked, true);
assert.equal(syncCalls, 0, 'sync availability inspection must not call the function');

values.set('aha_paths_v1', '{invalid json');
const paths = adapter.inspectManualSyncTarget('paths');
assert.equal(paths.localTotal, 0, 'invalid JSON should safely produce zero records');
assert.equal(paths.runtimeLoaded, true);
assert.equal(paths.syncFunctionAvailable, false);
assert.ok(paths.blockers.includes('sync_function_unavailable'));

const groups = adapter.inspectManualSyncTarget('groups');
assert.equal(groups.runtimeLoaded, false, 'missing runtime should be reported without crashing');
assert.equal(groups.syncFunctionAvailable, false);
assert.ok(groups.blockers.includes('target_runtime_not_loaded'));

storageCalls.length = 0;
const inspections = adapter.inspectAllManualSyncTargets();
assert.equal(inspections.length, 4);
assert.equal(storageCalls.filter(([method]) => method === 'getItem').length, 4);
assert.equal(storageCalls.some(([method]) => method !== 'getItem'), false);

const plan = adapter.createManualSyncDryRunPlan();
assert.equal(plan.ok, true);
assert.equal(plan.mode, 'planned_noop_dry_run');
assert.equal(plan.executionAllowed, false);
assert.equal(plan.autoSync, false);
assert.equal(plan.blocked, true);
assert.equal(plan.reason, 'manual_sync_execution_is_no_go');
assert.equal(plan.targets.length, 4);
assert.deepEqual(Array.from(plan.wouldRun), []);
assert.equal(plan.wouldWrite, false);
assert.equal(plan.wouldCallSyncFromDatabase, false);
assert.equal(plan.wouldCallRepository, false);
assert.ok(plan.blockers.includes('execution_not_allowed'));
assert.ok(plan.blockers.includes('manual_sync_execution_is_no_go'));
assert.ok(plan.blockers.includes('activation_pr_missing'));
assert.ok(plan.blockers.includes('auto_sync_permanently_forbidden'));

assert.equal(syncCalls, 0, 'adapter must never call syncFromDatabase');
assert.deepEqual(sideEffectCalls, [], 'adapter must not use repository, database, fetch, events, insights or publish');
assert.equal(storageCalls.some(([method]) => method === 'setItem' || method === 'removeItem'), false, 'adapter must not write localStorage');

const forbiddenSourceCalls = [
  [/\.syncFromDatabase\s*\(/, 'syncFromDatabase'],
  [/AHARepository\s*\.\s*(?:save|load)\s*\(/, 'AHARepository save/load'],
  [/\bsupabase\s*\.\s*from\s*\(/i, 'Supabase'],
  [/\bfetch\s*\(/, 'fetch'],
  [/localStorage\s*\.\s*(?:setItem|removeItem|clear)\s*\(/, 'localStorage write'],
  [/dispatchEvent\s*\(/, 'event dispatch'],
  [/\bcreateInsight\s*\(/, 'insight creation'],
  [/\bpublish\s*\(/, 'publication']
];
for (const [pattern, label] of forbiddenSourceCalls) {
  assert.equal(pattern.test(code), false, `adapter source must not contain a ${label} call`);
}

console.log('aha-manual-sync-dry-run-target-adapter.test.cjs passed');
