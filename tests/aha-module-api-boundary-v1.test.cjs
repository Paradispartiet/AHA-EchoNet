const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const apiCode = fs.readFileSync('js/ahaModuleApi.js', 'utf8');
const ingestCode = fs.readFileSync('js/ahaIngest.js', 'utf8');

const context = {
  console,
  Map,
  Set,
  Array,
  Object,
  String,
  Number,
  JSON,
  Date,
  Math,
  CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
  dispatchEvent() {}
};
context.window = context;
vm.createContext(context);
vm.runInContext(apiCode, context, { filename: 'js/ahaModuleApi.js' });

assert.equal(context.AHAModuleApi.BOUNDARY_VERSION, 'aha_module_api_boundary_v1');
assert.equal(context.AHA.moduleApiVersion, 'aha_module_api_boundary_v1');

const source = {
  label: 'før',
  hidden: 'intern',
  greet(name) { return `${this.label}:${name}`; }
};
context.LegacyExample = source;
const facade = context.AHAModuleApi.register('example.core', source, {
  version: 1,
  legacyGlobal: 'LegacyExample',
  exports: ['label', 'greet']
});

assert.equal(Object.isFrozen(facade), true, 'public module facades must be immutable');
assert.deepEqual(Object.keys(facade).sort(), ['greet', 'label']);
assert.equal(Object.prototype.hasOwnProperty.call(facade, 'hidden'), false, 'only named exports may cross the boundary');
assert.strictEqual(facade.greet, facade.greet, 'public method identity must be stable');
assert.equal(facade.greet('AHA'), 'før:AHA');
source.label = 'etter';
source.greet = function greet(name) { return `${this.label.toUpperCase()}:${name}`; };
assert.equal(facade.label, 'etter', 'declared values may reflect legacy state during migration');
assert.equal(facade.greet('AHA'), 'ETTER:AHA', 'stable delegates must call the current implementation');
assert.strictEqual(context.AHA.getModule('example.core', { version: 1 }), facade);
assert.strictEqual(context.AHAModuleApi.resolve('missing', 'LegacyExample', { version: 1 }), source);
assert.throws(() => context.AHAModuleApi.get('example.core', { version: 2 }), /versjon 1/);
assert.throws(() => context.AHAModuleApi.register('example.core', {}, { version: 1, exports: ['x'] }), /allerede registrert|mangler deklarert eksport/);

const description = context.AHAModuleApi.describe('example.core');
assert.equal(description.name, 'example.core');
assert.equal(description.version, 1);
assert.equal(description.legacyGlobal, 'LegacyExample');
assert.equal(Object.prototype.hasOwnProperty.call(description, 'source'), false, 'registry metadata must not expose implementation objects');
assert.equal(Object.prototype.hasOwnProperty.call(description, 'facade'), false);

const registryIdentity = context.AHAModuleApi;
vm.runInContext(apiCode, context, { filename: 'js/ahaModuleApi.js' });
assert.strictEqual(context.AHAModuleApi, registryIdentity, 'loading the boundary twice must be idempotent');

const storage = new Map();
context.localStorage = {
  getItem(key) { return storage.get(key) || null; },
  setItem(key, value) { storage.set(key, String(value)); }
};
context.AHASources = {
  addSourceEvent(input) { return { ...input, id: 'src_boundary' }; }
};
context.InsightsEngine = {
  createEmptyChamber() { return { insights: [] }; },
  createSignalFromMessage(text, subjectId, themeId, extra) {
    return { text, subject_id: subjectId, theme_id: themeId, timestamp: '2026-08-13T10:00:00.000Z', ...extra };
  },
  addSignalToChamberWithMeta(chamber, signal) {
    chamber.insights.push({ id: `ins_${chamber.insights.length + 1}`, summary: signal.text });
    return { action: 'created', insight_id: chamber.insights.at(-1).id };
  }
};
context.AHAModuleApi.register('sources', context.AHASources, { version: 1, exports: ['addSourceEvent'] });
context.AHAModuleApi.register('insights', context.InsightsEngine, { version: 1, exports: Object.keys(context.InsightsEngine) });
vm.runInContext(ingestCode, context, { filename: 'js/ahaIngest.js' });

const ingestFacade = context.AHAModuleApi.get('ingest', { version: 1 });
assert.equal(Object.isFrozen(ingestFacade), true);
assert.notStrictEqual(ingestFacade, context.AHAIngest, 'legacy implementation and public facade must be separate objects');
assert.strictEqual(ingestFacade.ingestWithCandidates, ingestFacade.ingestWithCandidates);

const order = [];
ingestFacade.useCandidateMiddleware('test.low', (middlewareContext, next) => {
  order.push('low:before');
  const result = next(middlewareContext.input, middlewareContext.candidates);
  order.push('low:after');
  return result;
}, { priority: 10 });
ingestFacade.useCandidateMiddleware('test.high', (middlewareContext, next) => {
  order.push('high:before');
  const result = next(middlewareContext.input, middlewareContext.candidates);
  order.push('high:after');
  return result;
}, { priority: 20 });

const result = ingestFacade.ingestWithCandidates({
  source_type: 'chat',
  text: 'Modulgrense',
  subject_id: 'sub_test',
  theme_id: 'theme_test'
}, [{ text: 'Navngitt kandidat' }]);
assert.equal(result.ok, true);
assert.deepEqual(order, ['low:before', 'high:before', 'high:after', 'low:after']);
assert.deepEqual(
  Array.from(ingestFacade.listCandidateMiddlewares(), (entry) => entry.id),
  ['test.low', 'test.high']
);
assert.throws(
  () => ingestFacade.useCandidateMiddleware('test.high', () => {}),
  /allerede registrert/,
  'middleware ids must not be silently overwritten'
);

const chatModules = [
  ['chat.textUtils', 'AHAChatTextUtils', 'js/ahaChatTextUtils.js'],
  ['chat.chamberStore', 'AHAChatChamberStore', 'js/ahaChatChamberStore.js'],
  ['chat.signals', 'AHAChatSignals', 'js/ahaChatSignals.js'],
  ['chat.analysisPolicy', 'AHAChatAnalysisPolicy', 'js/ahaChatAnalysisPolicy.js'],
  ['chat.conceptPolicy', 'AHAChatConceptPolicy', 'js/ahaChatConceptPolicy.js'],
  ['chat.analysisRunContract', 'AHAChatAnalysisRunContract', 'js/ahaChatAnalysisRunContract.js'],
  ['chat.academicInsightView', 'AHAChatAcademicInsightView', 'js/ahaChatAcademicInsightView.js'],
  ['chat.subjects', 'AHAChatSubjects', 'js/ahaChatSubjects.js'],
  ['chat.analysis', 'AHAChatAnalysis', 'js/ahaChatAnalysis.js'],
  ['chat.export', 'AHAChatExport', 'js/ahaChatExport.js'],
  ['chat.replyFormat', 'AHAChatReplyFormat', 'js/ahaChatReplyFormat.js'],
  ['chat.memoryControls', 'AHAChatMemoryControls', 'js/ahaChatMemoryControls.js'],
  ['chat.afterwork', 'AHAChatAfterwork', 'js/ahaChatAfterwork.js'],
  ['chat.memoryRuntime', 'AHAChatMemoryRuntime', 'js/ahaChatMemoryRuntime.js'],
  ['chat.runContext', 'AHAChatRunContext', 'js/ahaChatRunContext.js'],
  ['chat.insightView', 'AHAChatInsightView', 'js/ahaChatInsightView.js'],
  ['chat.knowledgeView', 'AHAChatKnowledgeView', 'js/ahaChatKnowledgeView.js'],
  ['chat.insightPipeline', 'AHAChatInsightPipeline', 'js/ahaChatInsightPipeline.js'],
  ['chat.agentRuntime', 'AHAChatAgentRuntime', 'js/ahaChatAgentRuntime.js'],
  ['chat.ingestRuntime', 'AHAChatIngestRuntime', 'js/ahaChatIngestRuntime.js'],
  ['chat.personalUi', 'AHAChatPersonalUi', 'js/ahaChatPersonalUi.js'],
  ['chat.conversationView', 'AHAChatConversationView', 'js/ahaChatConversationView.js'],
  ['chat.autoAnalysis', 'AHAChatAutoAnalysis', 'js/ahaChatAutoAnalysis.js'],
  ['chat.autoOutputView', 'AHAChatAutoOutputView', 'js/ahaChatAutoOutputView.js'],
  ['chat.analysisStateView', 'AHAChatAnalysisStateView', 'js/ahaChatAnalysisStateView.js'],
  ['chat.canonicalAnalysis', 'AHAChatCanonicalAnalysis', 'js/ahaChatCanonicalAnalysis.js'],
  ['chat.uiRuntime', 'AHAChatUiRuntime', 'js/ahaChatUiRuntime.js']
];
for (const [moduleName, legacyGlobal, file] of chatModules) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  const registered = context.AHAModuleApi.get(moduleName, { version: 1 });
  assert.ok(registered, `${moduleName} must register`);
  assert.equal(Object.isFrozen(registered), true, `${moduleName} facade must be frozen`);
  assert.ok(context[legacyGlobal], `${legacyGlobal} compatibility alias must remain`);
}
for (const name of ['shortHash', 'takeKeywords', 'sourceHash']) {
  assert.equal(typeof context.AHAModuleApi.get('chat.textUtils', { version: 1 })[name], 'function', `chat.textUtils must expose ${name}`);
}
const autoOutputStore = context.AHAModuleApi.get('chat.autoOutputStore', { version: 1 });
assert.equal(Object.isFrozen(autoOutputStore), true, 'chat.autoOutputStore facade must be frozen');
assert.equal(autoOutputStore.STORAGE_KEY, 'aha_chat_auto_outputs_v1');
assert.equal(typeof autoOutputStore.create, 'function');
const chamberStore = context.AHAModuleApi.get('chat.chamberStore', { version: 1 });
assert.equal(chamberStore.STORAGE_KEY, 'aha_insight_chamber_v1');
assert.equal(chamberStore.SAVED_EVENT, 'aha:chamber-saved');
assert.equal(typeof chamberStore.create, 'function');
const insightPipeline = context.AHAModuleApi.get('chat.insightPipeline', { version: 1 });
assert.equal(Object.isFrozen(insightPipeline.FUNCTIONAL_TYPES), true);
assert.equal(insightPipeline.FUNCTIONAL_TYPES.includes('contradiction'), true);
const agentRuntime = context.AHAModuleApi.get('chat.agentRuntime', { version: 1 });
assert.equal(typeof agentRuntime.create, 'function');
const ingestRuntime = context.AHAModuleApi.get('chat.ingestRuntime', { version: 1 });
assert.equal(typeof ingestRuntime.create, 'function');

const chatSource = fs.readFileSync('js/ahaChat.js', 'utf8');
assert.match(chatSource, /function chatModule\(/, 'Chat must resolve extracted modules through the boundary');
for (const [, legacyGlobal] of chatModules) {
  assert.doesNotMatch(chatSource, new RegExp(`global\\.${legacyGlobal}\\b`), `Chat must not reach directly into ${legacyGlobal}`);
}
assert.doesNotMatch(chatSource, /global\.AHAChatAutoOutputStore\b/, 'Chat must resolve the auto-output store through the module boundary');

for (const file of ['js/ahaContracts.js', 'js/ahaChatInsightFeedback.js']) {
  const code = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(code, /ingestWithCandidates\s*=/, `${file} must not monkeypatch canonical ingest`);
  assert.match(code, /useCandidateMiddleware\(/, `${file} must use the public extension point`);
}

for (const page of ['chat.html', 'feed.html', 'gallery.html', 'historygo.html', 'index.html', 'insights.html', 'insta.html', 'music.html', 'notes.html', 'sources.html', 'status.html']) {
  const html = fs.readFileSync(page, 'utf8');
  const boundary = html.indexOf('src="js/ahaModuleApi.js"');
  const firstModule = Math.min(...['js/insightsChamber.js', 'js/ahaSources.js', 'js/ahaRepository.js']
    .map((src) => html.indexOf(`src="${src}"`))
    .filter((index) => index >= 0));
  assert.ok(boundary >= 0 && boundary < firstModule, `${page} must load the API boundary before registered modules`);
}

console.log('aha-module-api-boundary-v1.test.cjs passed');
