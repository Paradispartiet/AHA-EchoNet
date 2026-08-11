const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const flowCode = fs.readFileSync('js/ahaOrganizationFlow.js', 'utf8');
const bridgeCode = fs.readFileSync('js/ahaInsightAvailabilityBridge.js', 'utf8');
const navCode = fs.readFileSync('js/ahaGlobalNav.js', 'utf8');
const searchHtml = fs.readFileSync('search.html', 'utf8');
const listsHtml = fs.readFileSync('lists.html', 'utf8');
const pathsHtml = fs.readFileSync('paths.html', 'utf8');
const mindmapHtml = fs.readFileSync('mindmap.html', 'utf8');
const mindmapCode = fs.readFileSync('js/ahaMindmap.js', 'utf8');

const calls = { listAdds: [], pathCreates: [], pathAdds: [], pathUpdates: [] };
let paths = [];
const searchItems = [
  { id: 'ins_1', title: 'Makt i byen', type: 'insight', source: 'aha_insights', refId: 'ins_1', local_only: true, read_only: true },
  { id: 'article_1', title: 'Artikkel', type: 'article', source: 'aha_avisa', refId: 'article_1', local_only: true, read_only: true }
];
const list = { id: 'list_1', title: 'Makt og by', description: 'Samlet materiale', tags: ['makt'], items: [] };
const context = {
  console,
  Date,
  Array,
  Object,
  String,
  Number,
  Set,
  Map,
  document: null,
  AHASearch: { collectSearchItems: () => searchItems },
  AHALists: {
    loadLists: () => [list],
    addItemToList(listId, item) { calls.listAdds.push({ listId, item }); return { ok: true, item }; }
  },
  AHAPaths: {
    loadPaths: () => paths,
    createPath(input) {
      const path = { id: 'path_1', title: input.title, description: input.description, steps: [] };
      paths = [path]; calls.pathCreates.push(input); return path;
    },
    addStepToPath(pathId, step) {
      calls.pathAdds.push({ pathId, step });
      const path = paths.find((item) => item.id === pathId);
      const created = { id: 'step_list', ...step, order: path.steps.length };
      path.steps.push(created);
      return { ok: true, step: created, path };
    },
    updatePath(pathId, changes) {
      const index = paths.findIndex((item) => item.id === pathId);
      if (index < 0) return null;
      paths[index] = { ...paths[index], ...changes };
      calls.pathUpdates.push({ pathId, changes });
      return paths[index];
    },
    deletePath() {},
    refresh() {}
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(flowCode, context, { filename: 'js/ahaOrganizationFlow.js' });
const flow = context.AHAOrganizationFlow;
assert.ok(flow);

let result = flow.addLibraryItemToList('ins_1', 'list_1');
assert.equal(result.ok, true);
assert.equal(calls.listAdds.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(calls.listAdds[0])), {
  listId: 'list_1',
  item: { source: 'aha_insights', refId: 'ins_1', type: 'insight', title: 'Makt i byen' }
});
result = flow.addLibraryItemToList('article_1', 'list_1');
assert.equal(result.ok, false, 'unsupported Library types must not bypass canonical Lists reference rules');
assert.equal(result.reason, 'unsupported_source');

result = flow.createPathFromList('list_1');
assert.equal(result.ok, true);
assert.equal(calls.pathCreates.length, 1);
assert.match(calls.pathCreates[0].title, /Makt og by/);
assert.equal(calls.pathAdds[0].step.source, 'aha_lists');
assert.equal(calls.pathAdds[0].step.refId, 'list_1');
assert.equal(calls.pathAdds[0].step.meta.organization_flow, 'list_to_path');

paths[0].steps.push({ id: 'step_note', title: 'Notat', source: 'aha_notes', refId: 'note_1', order: 1 });
result = flow.movePathStep('path_1', 'step_note', -1);
assert.equal(result.ok, true);
assert.equal(paths[0].steps[0].id, 'step_note');
assert.equal(paths[0].steps[0].order, 0);
assert.equal(paths[0].steps[1].order, 1);
assert.equal(calls.pathUpdates.length, 1, 'reordering must go through canonical AHAPaths.updatePath');

class StorageMock {
  constructor(value) { this.value = value; }
  getItem(key) { return key === 'aha_insight_chamber_v1' ? this.value : null; }
  setItem(key, value) { if (key === 'aha_insight_chamber_v1') this.value = String(value); }
}
const chamber = { insights: [
  { id: 'rejected', status: 'rejected', rejection_reason: 'user_not_insight' },
  { id: 'active', status: 'suggested' }
] };
const storage = new StorageMock(JSON.stringify(chamber));
const bridgeContext = { console, Date, JSON, Array, Object, String, localStorage: storage, addEventListener() {} };
bridgeContext.window = bridgeContext;
bridgeContext.globalThis = bridgeContext;
vm.createContext(bridgeContext);
vm.runInContext(bridgeCode, bridgeContext, { filename: 'js/ahaInsightAvailabilityBridge.js' });
let stored = JSON.parse(storage.value);
assert.equal(stored.insights[0].archived, true, 'user rejection must use the existing Lists/Paths unavailable marker');
assert.equal(stored.insights[0].user_quality_unavailable, true);
assert.equal(stored.insights[1].archived, undefined);
stored.insights[0].status = 'suggested';
delete stored.insights[0].rejection_reason;
storage.value = JSON.stringify(stored);
bridgeContext.AHAInsightAvailabilityBridge.reconcile();
stored = JSON.parse(storage.value);
assert.equal(stored.insights[0].archived, undefined, 'undo/restored insight must recover its prior availability');
assert.equal(stored.insights[0].user_quality_unavailable, undefined);

assert.match(navCode, /ahaInsightAvailabilityBridge\.js/);
assert.match(navCode, /script\.addEventListener\("load", loadInsightAvailabilityBridge/);
assert.ok(searchHtml.indexOf('js/ahaLists.js') < searchHtml.indexOf('js/ahaOrganizationFlow.js'));
assert.ok(listsHtml.indexOf('js/ahaLists.js') < listsHtml.indexOf('js/ahaPaths.js'));
assert.ok(listsHtml.indexOf('js/ahaPaths.js') < listsHtml.indexOf('js/ahaOrganizationFlow.js'));
assert.ok(pathsHtml.indexOf('js/ahaPaths.js') < pathsHtml.indexOf('js/ahaOrganizationFlow.js'));
assert.ok(mindmapHtml.indexOf('js/ahaMindmap.js') < mindmapHtml.indexOf('js/ahaOrganizationFlow.js'));
assert.match(flowCode, /Samle → Ordne → Se koblinger/);
assert.match(flowCode, /data-org-move-step/);
assert.match(flowCode, /data-org-list-to-path/);
assert.match(flowCode, /data-org-add-library-to-list/);
assert.equal(/localStorage\s*\./.test(flowCode), false, 'organization adapter must not create or mutate storage directly');
assert.equal(/\bfetch\s*\(/.test(flowCode), false);
assert.equal(/localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(mindmapCode), false, 'Mindmap must remain read-only derived presentation');

console.log('aha-organization-flow-end-to-end.test.cjs passed');
