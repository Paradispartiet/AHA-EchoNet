const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const activeCache = {
  sourceText: 'AI kan gi rask støtte, men eleven må kontrollere kilder og gjøre selvstendige vurderinger.',
  sourceHash: 'hash_ai_learning_2026',
  analysisRunId: 'run_ai_learning_1',
  payload: {
    canonicalAnalysis: {
      theme: 'AI og læring',
      mainTension: 'automatisering kontra selvstendig vurdering',
      keyInsight: 'AI er mest læringsfremmende når verktøyet støtter, men ikke erstatter, elevens egen vurdering.',
      fieldConnections: ['pedagogikk', 'teknologi', 'kunnskapsteori'],
      suggestedActions: [
        'Sammenlign en oppgave løst med og uten AI.',
        'Kontroller hvilke påstander som har kildebelegg.'
      ]
    },
    concepts: ['kildekritikk', 'metakognisjon'],
    path: ['La eleven begrunne hvilke AI-forslag som ble forkastet.']
  }
};

const store = new Map([['aha_chat_auto_outputs_v1', JSON.stringify(activeCache)]]);
const document = {
  readyState: 'loading',
  head: null,
  addEventListener() {},
  getElementById() { return null; },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  createElement() { return { appendChild() {} }; }
};
const context = {
  console,
  Date,
  Math,
  JSON,
  Array,
  Object,
  String,
  Number,
  Set,
  Map,
  document,
  localStorage: {
    getItem(key) { return store.get(key) || null; },
    setItem(key, value) { store.set(key, value); },
    removeItem(key) { store.delete(key); }
  },
  AHA_CONFIG: { paths: { enableDatabaseSync: false }, lists: { enableDatabaseSync: false } }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

for (const file of ['js/ahaLists.js', 'js/ahaPaths.js', 'js/ahaAnalysisArtifacts.js', 'js/ahaMindmap.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const api = context.AHAAnalysisArtifacts;
assert.equal(typeof api.saveMindmapFromActiveAnalysis, 'function');
assert.equal(typeof api.savePathFromActiveAnalysis, 'function');

const mapResult = api.saveMindmapFromActiveAnalysis();
assert.equal(mapResult.ok, true);
assert.equal(mapResult.existing, false);
assert.equal(mapResult.artifact.meta.analysisSourceHash, activeCache.sourceHash);
assert.ok(mapResult.artifact.terms.length >= 4, 'mindmap must contain enough semantic nodes');
assert.ok(mapResult.artifact.relations.some((relation) => relation.type === 'stands_in_tension_with'));
assert.ok(mapResult.artifact.relations.some((relation) => relation.type === 'illuminates'));

const repeatMap = api.saveMindmapFromActiveAnalysis();
assert.equal(repeatMap.ok, true);
assert.equal(repeatMap.existing, true, 'same source analysis must reuse its mindmap');
assert.equal(context.AHALists.loadConceptLists().length, 1, 'repeat click must not create duplicate mindmaps');

const pathResult = api.savePathFromActiveAnalysis();
assert.equal(pathResult.ok, true);
assert.equal(pathResult.existing, false);
assert.equal(pathResult.artifact.meta.analysisSourceHash, activeCache.sourceHash);
assert.ok(pathResult.artifact.steps.length >= 5, 'learning path must be substantial');
assert.equal(pathResult.artifact.steps[0].source, 'aha_concept_lists', 'path must begin from its semantic map');
assert.equal(pathResult.artifact.steps[0].refId, mapResult.artifact.id);
for (const step of pathResult.artifact.steps.slice(1)) {
  assert.equal(step.source, 'aha_analysis');
  assert.equal(step.meta.inline, true);
  assert.ok(step.meta.reason, 'generated step must explain why it exists');
  assert.ok(step.meta.completionCriterion, 'generated step must have a completion criterion');
  assert.ok(step.narrative);
  assert.ok(step.learningOutcome);
}

const repeatPath = api.savePathFromActiveAnalysis();
assert.equal(repeatPath.ok, true);
assert.equal(repeatPath.existing, true, 'same source analysis must reuse its path');
assert.equal(context.AHAPaths.loadPaths().length, 1, 'repeat click must not create duplicate paths');

const graph = context.AHAMindmap.collectGraphData();
assert.ok(graph.edges.some((edge) => edge.type === 'concept_relation'), 'semantic term relations must become graph edges');
assert.ok(graph.edges.some((edge) => edge.type === 'path_contains' && edge.to === `concept_list::aha_concept_lists::${mapResult.artifact.id}`), 'path must connect to its generated map');

assert.equal(/\bfetch\s*\(/.test(fs.readFileSync('js/ahaAnalysisArtifacts.js', 'utf8')), false, 'artifact action must stay local');
console.log('aha-analysis-artifacts.test.cjs passed');
