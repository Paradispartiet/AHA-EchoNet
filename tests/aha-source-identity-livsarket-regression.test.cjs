const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class ElementStub {
  constructor() {
    this.dataset = {};
    this._html = '';
    this.textContent = '';
    this.disabled = false;
    this.hidden = false;
    this.className = '';
    this.classList = { toggle() {}, add() {}, remove() {} };
  }
  set innerHTML(value) { this._html = String(value || ''); }
  get innerHTML() { return this._html; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
  appendChild() {}
}

const chatFiles = [
  'js/ahaChatIngestRuntime.js',
  'js/ahaChatTextUtils.js',
  'js/ahaChatSignals.js',
  'js/ahaChatSubjects.js',
  'js/ahaChatAnalysis.js',
  'js/ahaChatReplyFormat.js',
  'js/ahaChatExport.js',
  'js/ahaChatMemoryControls.js',
  'js/ahaChatAfterwork.js',
  'js/ahaChatMemoryRuntime.js',
  'js/ahaChatRunContext.js',
  'js/ahaChatInsightView.js',
  'js/ahaChatAutoAnalysis.js',
  'js/ahaAnalysisQualityEvaluator.js',
  'js/ahaAnalysisQualityProfile.js',
  'js/ahaChatAutoOutputView.js',
  'js/ahaChatAnalysisStateView.js',
  'js/ahaChatChamberStore.js',
  'js/ahaChatAnalysisPolicy.js',
  'js/ahaChatConceptPolicy.js',
  'js/ahaChatCanonicalAnalysis.js',
  'js/ahaChatKnowledgeView.js',
  'js/ahaChatInsightPipeline.js',
  'js/ahaChatAgentRuntime.js',
  'js/ahaChatPersonalUi.js',
  'js/ahaChatConversationView.js',
  'js/ahaChatAnalysisRunContract.js',
  'js/ahaSemanticModelShadowBridge.js',
  'js/ahaChatAcademicInsightView.js',
  'js/ahaChatUiRuntime.js',
  'js/ahaChatProviderLoader.js',
  'js/ahaChatCapabilityBindings.js',
  'js/ahaChatRuntimeFacade.js',
  'js/ahaChatRuntimeComposition.js',
  'js/ahaChatApplicationComposition.js',
  'js/ahaChat.js'
];

function createChatContext(sharedStore = new Map()) {
  const elements = new Map();
  [
    'aha-auto-output', 'aha-answer-composer-status', 'aha-answer-composer-details',
    'aha-answer-evaluation-status', 'aha-processing-indicator', 'aha-processing-text',
    'btn-send'
  ].forEach((id) => elements.set(id, new ElementStub()));
  const context = {
    window: null,
    console,
    document: {
      readyState: 'loading',
      addEventListener() {},
      body: new ElementStub(),
      getElementById: (id) => elements.get(id) || null,
      querySelectorAll: () => [],
      createElement: () => new ElementStub()
    },
    localStorage: {
      getItem: (key) => sharedStore.has(key) ? sharedStore.get(key) : null,
      setItem: (key, value) => sharedStore.set(key, String(value)),
      removeItem: (key) => sharedStore.delete(key)
    },
    navigator: { clipboard: {} },
    Event: function Event(type) { this.type = type; },
    CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options?.detail; },
    dispatchEvent() {},
    setTimeout,
    clearTimeout,
    Date,
    Math,
    URL: { createObjectURL() {}, revokeObjectURL() {} },
    Blob: function Blob() {},
    fetch: async () => { throw new Error('no remote request is allowed in the source-identity regression'); },
    AHALists: { add() { throw new Error('list write is forbidden'); } },
    AHAPaths: { add() { throw new Error('path write is forbidden'); } },
    AHAMindmap: { add() { throw new Error('mindmap write is forbidden'); } },
    InsightsEngine: { createEmptyChamber: () => ({ insights: [], meta: {} }), buildMetaProfile: () => ({}) }
  };
  context.window = context;
  context.globalThis = context;
  chatFiles.forEach((file) => vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file }));
  return { context, elements, sharedStore };
}

function assertCleanLivsarketAnalysis(html) {
  assert.match(html, /Livsarket|kunnskapsark|kildebelegg/i);
  assert.doesNotMatch(html, /Morgenbladet|mediehistorie|pressehistorie|redaksjonell uavhengighet|eierskapsskifter/i);
  assert.doesNotMatch(html, /\[object Object\]/i);
  assert.doesNotMatch(html, /Kilde registrert/i);
}

function assertMetadataNeverBecomesInsight() {
  let engineCalls = 0;
  const storage = new Map();
  const context = {
    window: null,
    console,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options?.detail; },
    dispatchEvent() {},
    AHASources: { addSourceEvent: (input) => ({ id: 'source_event_1', ...input }) },
    InsightsEngine: {
      createEmptyChamber: () => ({ insights: [] }),
      createSignalFromMessage() { engineCalls += 1; return {}; },
      addSignalToChamberWithMeta() { engineCalls += 1; return {}; }
    }
  };
  context.window = context;
  vm.runInNewContext(fs.readFileSync('js/ahaIngest.js', 'utf8'), context, { filename: 'js/ahaIngest.js' });
  const result = context.AHAIngest.ingestWithCandidates({
    content_type: 'article_metadata',
    title: 'Kilde registrert',
    text: 'Kilde registrert fra metadata: https://example.invalid',
    meta: { access_status: 'metadata_only', source_event_only: true, semantic_insight_eligible: false }
  }, [{ text: 'Kilde registrert' }]);
  assert.equal(result.ok, true);
  assert.equal(result.skipped_insight, true);
  assert.deepEqual(Array.from(result.items), []);
  assert.equal(engineCalls, 0, 'metadata candidates must never enter Chamber');
}

function assertLinkPrimarySourcePolicy() {
  const context = { window: null, console, Date, URL, fetch: async () => ({ ok: false, json: async () => ({}) }) };
  context.window = context;
  vm.runInNewContext(fs.readFileSync('js/ahaLinkReader.js', 'utf8'), context, { filename: 'js/ahaLinkReader.js' });
  const source = { title: 'Artikkel', url: 'https://example.invalid/a', publisher: 'Eksempel' };
  const fullPrimary = context.AHALinkReader.buildSafeSourcePayload({ source, access_status: 'full' }, { reference_only: false });
  const fullReference = context.AHALinkReader.buildSafeSourcePayload({ source, access_status: 'full' }, { reference_only: true });
  const metadata = context.AHALinkReader.buildSafeSourcePayload({ source, access_status: 'metadata_only' }, { reference_only: false });
  assert.equal(fullPrimary.content_type, 'transient_article_analysis');
  assert.equal(fullPrimary.meta.semantic_insight_eligible, true);
  assert.equal(fullReference.content_type, 'article_reference');
  assert.equal(fullReference.meta.semantic_insight_eligible, false);
  assert.equal(metadata.content_type, 'article_metadata');
  assert.equal(metadata.meta.source_event_only, true);
}

(async () => {
  const sharedStore = new Map();
  const first = createChatContext(sharedStore);
  const hooks = first.context.AHATestHooks;
  const morgenbladetText = 'Morgenbladet er en norsk avis. Teksten drøfter pressehistorie, redaksjonell uavhengighet, eierskapsskifter og akademisk offentlighet.';
  const livsarketText = 'Livsarket er et personlig kunnskapsark som organiserer erfaringer, kilder og ideer. Hver påstand skal kunne spores til konkret kildebelegg, og åpne spørsmål skal holdes adskilt fra sikre innsikter.';

  const morgenRun = hooks.createAnalysisRun(morgenbladetText, { sourceKind: 'pasted_text' });
  hooks.clearActiveAnalysisState(morgenRun);
  await hooks.renderAutoOutputs(morgenbladetText, 'Morgenbladet analyseres som mediehistorie.', { analysisRun: morgenRun });

  const livsarketRun = hooks.createAnalysisRun(livsarketText, { sourceKind: 'pasted_text' });
  hooks.clearActiveAnalysisState(livsarketRun);
  await hooks.renderAutoOutputs(livsarketText, 'Livsarket krever kildeforankret analyse.', { analysisRun: livsarketRun });

  sharedStore.set('aha_afterwork_v1', JSON.stringify([{ sourceTextHash: morgenRun.sourceTextHash, summary: 'Morgenbladet og pressehistorie' }]));
  const beforeReloadHtml = first.elements.get('aha-auto-output').innerHTML;
  assertCleanLivsarketAnalysis(beforeReloadHtml);

  const cacheBeforeReload = JSON.parse(sharedStore.get('aha_chat_auto_outputs_v1'));
  const semanticSha = first.context.AHASemanticDocument.sha256Hex(livsarketText);
  assert.equal(cacheBeforeReload.sourceSha256, semanticSha);
  assert.equal(cacheBeforeReload.payload.source_sha256, semanticSha);
  assert.equal(cacheBeforeReload.payload.analysisRunId, livsarketRun.analysisRunId);
  assert.equal(cacheBeforeReload.payload.source_binding.valid, true);
  assert.equal(cacheBeforeReload.payload.analysisBundleV2.schema, 'aha_analysis_bundle_v2');
  assert.equal(cacheBeforeReload.payload.analysisBundleV2.identity.source_sha256, semanticSha);
  assert.equal(cacheBeforeReload.payload.analysisBundleV2.identity.analysis_run_id, livsarketRun.analysisRunId);
  assert.equal(cacheBeforeReload.payload.analysisBundleV2.validation.valid, true);
  assert.equal(cacheBeforeReload.payload.semanticDocumentV2.schema, 'aha_semantic_document_v2');
  assert.equal(cacheBeforeReload.payload.semanticDocumentV2.source_sha256, semanticSha);
  assert.equal(cacheBeforeReload.payload.semanticDocumentV2.analysis_run_id, livsarketRun.analysisRunId);
  assert.equal(cacheBeforeReload.payload.semanticDocumentV2.validation.valid, true);
  assert.ok(cacheBeforeReload.payload.semanticDocumentV2.claims.length >= 2, 'live SemanticDocumentV2 must contain source claims from the actual Livsarket input');
  assert.ok(cacheBeforeReload.payload.semanticDocumentV2.concepts.length >= 1, 'live SemanticDocumentV2 must contain literal source-grounded concepts');
  assert.ok(cacheBeforeReload.payload.semanticDocumentV2.candidate_insights.length >= 1, 'current Chat analysis candidates must reach the live quality gate');
  assert.ok(cacheBeforeReload.payload.semanticDocumentV2.candidate_insights.every((item) => ['approved', 'blocked'].includes(item.status)));
  assert.equal(JSON.stringify(cacheBeforeReload.payload.semanticDocumentV2).includes('Kilde registrert'), false);
  assert.equal(cacheBeforeReload.payload.analysisBundleV2.semantic_document.schema, 'aha_semantic_document_v2');
  assert.ok(cacheBeforeReload.payload.analysisBundleV2.semantic_document.claim_ids.length >= 2);
  assert.equal(cacheBeforeReload.payload.analysisBundleV2.semantic_document.synthesis_gate.authoritative, true);
  assert.equal(JSON.stringify(cacheBeforeReload.payload.analysisBundleV2).includes(morgenbladetText), false);

  const reloaded = createChatContext(sharedStore);
  reloaded.context.AHATestHooks.restoreAutoOutputFromStorage();
  const afterReloadHtml = reloaded.elements.get('aha-auto-output').innerHTML;
  assertCleanLivsarketAnalysis(afterReloadHtml);
  assert.equal(afterReloadHtml, beforeReloadHtml, 'hard reload must render the same Livsarket analysis');
  assert.equal(reloaded.context.AHAActiveRun.get().sourceSha256, semanticSha);
  assert.equal(Object.isFrozen(reloaded.context.AHAActiveRun.get().analysisBundleV2), true, 'reload must hydrate an immutable AnalysisBundleV2');
  assert.equal(Object.isFrozen(reloaded.context.AHAActiveRun.get().rawAutoPayload.semanticDocumentV2), true, 'reload must hydrate an immutable live SemanticDocumentV2');

  const unknownQuality = reloaded.context.AHAChatAutoOutputView.finalizeAnalysisQuality({
    reflection: 'En ellers god analyse uten eksplisitt kildebinding.',
    canonicalAnalysis: { theme: 'Livsarket', keyInsight: 'Kildebelegg må kunne spores.' }
  }, livsarketText);
  assert.notEqual(unknownQuality.analysisQuality.status, 'passed', 'unknown isolation must never pass quality');
  assert.equal(unknownQuality.analysisQuality.analysisIsolation.status, 'unknown');

  assertMetadataNeverBecomesInsight();
  assertLinkPrimarySourcePolicy();
  console.log('aha-source-identity-livsarket-regression.test.cjs passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
