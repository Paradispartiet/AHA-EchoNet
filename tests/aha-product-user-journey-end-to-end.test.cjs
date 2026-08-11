const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class StorageMock {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed).map(([k, v]) => [k, String(v)])); }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
  clear() { this.map.clear(); }
}

function source(path) { return fs.readFileSync(path, 'utf8'); }
function load(context, path) { vm.runInContext(source(path), context, { filename: path }); }

const chamber = {
  version: 'v1',
  insights: [
    {
      id: 'ins_keep', title: 'Makt og byrom', summary: 'Institusjoner former offentligheten i byrom.',
      status: 'suggested', tags: ['makt', 'byrom'], local_only: true,
      strength: { evidence_count: 3, total_score: 60 }, depth_score: 4, concepts: [{ key: 'makt', label: 'makt' }]
    },
    {
      id: 'ins_reject', title: 'Generisk observasjon', summary: 'Noe skjer.',
      status: 'suggested', tags: ['generisk'], local_only: true,
      strength: { evidence_count: 1, total_score: 5 }, depth_score: 0, concepts: []
    }
  ]
};
const storage = new StorageMock({
  aha_insight_chamber_v1: JSON.stringify(chamber),
  aha_notes_v1: JSON.stringify([{ id: 'note_1', title: 'Notat om byrom', text: 'Makt og institusjoner i byrom.', tags: ['makt', 'byrom'], local_only: true }])
});
const document = {
  readyState: 'loading', body: null, head: null,
  addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }
};
const context = {
  console, Date, Math, JSON, Array, Object, String, Number, Set, Map, Promise,
  document, localStorage: storage, Blob,
  URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
  addEventListener() {}, dispatchEvent() {}, CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
  setTimeout() {}, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {}
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

[
  'js/ahaContracts.js',
  'js/ahaInsightQualityFeedback.js',
  'js/ahaInsightAvailabilityBridge.js',
  'js/ahaSearch.js',
  'js/ahaLists.js',
  'js/ahaPaths.js',
  'js/ahaOrganizationFlow.js',
  'js/ahaMindmap.js',
  'js/metaInsightsMemory.js',
  'js/ahaPersonalRetrieval.js',
  'js/ahaSemanticRetrieval.js',
  'js/ahaHomeContinueExperience.js'
].forEach((path) => load(context, path));

let home = context.AHAHomeContinueExperience.buildExperience({
  home: { counts: {} },
  latestInsight: { mode: 'chat_provenance', text: 'Makt og byrom bør utforskes videre', createdCount: 1 },
  loop: { nextBestAction: { id: 'run_workflow_audit', label: 'Kjør Workflow Audit' } }
});
assert.equal(home.mode, 'continue_insight');
assert.equal(home.primaryAction.href, 'chat.html');
assert.doesNotMatch(home.primaryAction.label, /audit|workflow/i);

let result = context.AHAInsightQualityFeedback.applyFeedback('ins_reject', 'not_insight');
assert.equal(result.ok, true);
let storedChamber = JSON.parse(storage.getItem('aha_insight_chamber_v1'));
assert.equal(storedChamber.insights.find((i) => i.id === 'ins_reject').status, 'rejected');
context.AHAInsightAvailabilityBridge.reconcile();
storedChamber = JSON.parse(storage.getItem('aha_insight_chamber_v1'));
assert.equal(storedChamber.insights.find((i) => i.id === 'ins_reject').archived, true, 'user rejection must propagate to existing availability boundary');

let searchItems = context.AHASearch.collectSearchItems();
assert.equal(searchItems.some((item) => item.refId === 'ins_reject'), false);
assert.equal(searchItems.some((item) => item.refId === 'ins_keep'), true);
assert.equal(searchItems.some((item) => item.refId === 'note_1'), true);

const list = context.AHALists.createList({ title: 'By og makt', type: 'concepts', description: 'Arbeidsliste', tags: ['makt'] });
assert.ok(list?.id);
const activeSearchItem = searchItems.find((item) => item.refId === 'ins_keep');
result = context.AHAOrganizationFlow.addLibraryItemToList(activeSearchItem.id, list.id);
assert.equal(result.ok, true);
let lists = context.AHALists.loadLists();
assert.equal(lists.length, 1, 'journey: canonical Lists store should contain the created list');
assert.equal(lists[0].items.length, 1, 'journey: canonical list should contain the Library insight reference');
assert.equal(lists[0].items[0].refId, 'ins_keep');
assert.equal(lists[0].items.some((item) => item.refId === 'ins_reject'), false);

result = context.AHAOrganizationFlow.createPathFromList(list.id, 'By og makt – læringssti');
assert.equal(result.ok, true);
let paths = context.AHAPaths.loadPaths();
assert.equal(paths.length, 1, 'journey: canonical Paths store should contain the created path');
assert.equal(paths[0].steps.length, 1, 'journey: created path should contain the source List step');
assert.equal(paths[0].steps[0].source, 'aha_lists');
assert.equal(paths[0].steps[0].refId, list.id);

result = context.AHAPaths.addStepToPath(paths[0].id, { source: 'aha_notes', refId: 'note_1', type: 'note', title: 'Notat om byrom' });
assert.equal(result.ok, true);
paths = context.AHAPaths.loadPaths();
const noteStep = paths[0].steps.find((step) => step.refId === 'note_1');
result = context.AHAOrganizationFlow.movePathStep(paths[0].id, noteStep.id, -1);
assert.equal(result.ok, true);
paths = context.AHAPaths.loadPaths();
assert.equal(paths[0].steps[0].refId, 'note_1');
assert.equal(paths[0].steps[1].refId, list.id);

const graph = context.AHAMindmap.collectGraphData();
assert.ok(graph.nodes.some((node) => node.type === 'list' && node.refId === list.id));
assert.ok(graph.nodes.some((node) => node.type === 'path' && node.refId === paths[0].id));
assert.ok(graph.nodes.some((node) => node.type === 'insight' && node.refId === 'ins_keep'));
assert.equal(graph.nodes.some((node) => node.type === 'insight' && node.refId === 'ins_reject'), false);
assert.ok(graph.edges.some((edge) => edge.type === 'list_contains'));
assert.ok(graph.edges.some((edge) => edge.type === 'path_contains'));

context.AHAMetaInsightsMemory.addFeedback({ claimId: 'claim_city', claimText: 'Jeg jobber bare i Oslo', response: 'stemmer' });
context.AHAPersonalRetrieval.refreshRetrievalIndex();
context.AHASemanticRetrieval.refreshSemanticIndex();
result = context.AHAMetaInsightsMemory.replaceClaim('Jeg jobber bare i Oslo', 'Jeg jobber hovedsakelig i Tromsø', { createdAt: '2026-08-12T00:40:00.000Z' });
assert.equal(result.ok, true);
const memorySummary = context.AHAMetaInsightsMemory.summarizeMemory();
assert.equal(memorySummary.confirmedClaims.some((claim) => claim.claimText === 'Jeg jobber hovedsakelig i Tromsø'), true);
assert.equal(memorySummary.confirmedClaims.some((claim) => claim.claimText === 'Jeg jobber bare i Oslo'), false);
assert.equal(memorySummary.outdatedClaims.some((claim) => claim.claimText === 'Jeg jobber bare i Oslo'), true);
context.AHAPersonalRetrieval.refreshRetrievalIndex();
context.AHASemanticRetrieval.refreshSemanticIndex();
let retrieval = context.AHAPersonalRetrieval.searchPersonalKnowledge('Tromsø', { sources: ['meta_insights_memory'] });
assert.equal(retrieval.results.some((item) => String(item.excerpt || '').includes('Tromsø')), true);
assert.equal(retrieval.results.some((item) => String(item.excerpt || '').includes('bare i Oslo')), false);

['js/ahaPrivacy.js', 'js/ahaPrivacyRestore.js', 'js/ahaPrivacyPersonalAiMemory.js'].forEach((path) => load(context, path));
const backup = context.AHAPrivacyPersonalAiMemory.buildExportPayload();
assert.ok(backup.data.aha_meta_insights_memory_v1);
assert.equal(backup.data.aha_meta_insights_memory_v1.selfModel.confirmedClaims.some((claim) => claim.claimText === 'Jeg jobber hovedsakelig i Tromsø'), true);
assert.equal(backup.data.aha_meta_insights_memory_v1.selfModel.outdatedClaims.some((claim) => claim.claimText === 'Jeg jobber bare i Oslo'), true);

const nav = source('js/ahaGlobalNav.js');
const modules = source('js/ahaModules.js');
const productReachability = nav + modules + source('index.html') + source('profile.html');
for (const destination of ['index.html', 'chat.html', 'search.html', 'personal-ai.html', 'profile.html', 'privacy.html', 'lists.html', 'paths.html', 'mindmap.html']) {
  assert.match(productReachability, new RegExp(destination.replace('.', '\\.')), `${destination} must remain reachable through canonical product navigation or module registry`);
}
assert.match(nav, /Start/);
assert.match(nav, /Chat/);
assert.match(nav, /Bibliotek/);
assert.match(nav, /Personal AI/);
assert.match(nav, /Mitt AHA/);
assert.match(nav, /Avanserte verktøy/);
assert.match(nav, /moduleId: "lists"/);
assert.match(nav, /moduleId: "paths"/);
assert.match(nav, /moduleId: "mindmap"/);
assert.match(modules, /id: "lists"[\s\S]*href: "lists\.html"/);
assert.match(modules, /id: "paths"[\s\S]*href: "paths\.html"/);
assert.match(modules, /id: "mindmap"[\s\S]*href: "mindmap\.html"/);

const orgSource = source('js/ahaOrganizationFlow.js');
const mindmapSource = source('js/ahaMindmap.js');
assert.equal(/aha_organization_[a-z0-9_]+_v\d+/i.test(orgSource), false);
assert.equal(/localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(orgSource), false);
assert.equal(/localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(mindmapSource), false);
assert.match(mindmapSource, /read-only/);
assert.equal(/\bfetch\s*\(/.test(orgSource), false);
assert.equal(/echonet_shared\s*=\s*true|sync_enabled\s*=\s*true|historygo_writeback_enabled\s*=\s*true/i.test(orgSource), false);

console.log('aha-product-user-journey-end-to-end.test.cjs passed');
