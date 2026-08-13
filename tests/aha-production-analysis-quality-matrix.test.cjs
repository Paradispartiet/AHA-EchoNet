const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_PATH = path.join(ROOT, 'tests/fixtures/aha-production-analysis-quality-matrix.v1.json');
const REGISTRY_PATH = path.join(ROOT, 'data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json');
const AUTO_OUTPUT_STORAGE_KEY = 'aha_chat_auto_outputs_v1';

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readJson(absolutePath) {
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceContains(sourceText, value) {
  const source = ` ${normalize(sourceText)} `;
  const candidate = normalize(value);
  return Boolean(candidate) && source.includes(` ${candidate} `);
}

function localFetch() {
  return async (url) => {
    const relativePath = String(url || '').replace(/^\/+/, '');
    const absolutePath = path.resolve(ROOT, relativePath);
    if (!absolutePath.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(absolutePath)) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(absolutePath, 'utf8')) };
  };
}

class ElementMock {
  constructor() {
    this.dataset = {};
    this._html = '';
    this.textContent = '';
    this.disabled = false;
    this.hidden = false;
    this.className = '';
    this.value = '';
    this.classList = { toggle() {}, add() {}, remove() {} };
  }
  set innerHTML(value) { this._html = String(value || ''); }
  get innerHTML() { return this._html; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
  appendChild() {}
  setAttribute() {}
  focus() {}
  reset() {}
}

function makeStorage(seed = {}) {
  const store = new Map(Object.entries(seed).map(([key, value]) => [String(key), String(value)]));
  return {
    getItem(key) { return store.has(String(key)) ? store.get(String(key)) : null; },
    setItem(key, value) { store.set(String(key), String(value)); },
    removeItem(key) { store.delete(String(key)); },
    readJson(key, fallback) { return store.has(String(key)) ? JSON.parse(store.get(String(key))) : fallback; }
  };
}

function makeProductContext() {
  const storage = makeStorage({
    aha_lists_v1: '[]',
    aha_concept_lists_v1: '[]',
    aha_paths_v1: '[]'
  });
  const elements = new Map();
  [
    'aha-auto-output', 'aha-answer-composer-status', 'aha-answer-composer-details',
    'aha-answer-evaluation-status', 'aha-processing-indicator', 'aha-processing-text', 'btn-send'
  ].forEach((id) => elements.set(id, new ElementMock()));

  const context = {
    window: null,
    globalThis: null,
    console,
    Date,
    Intl,
    Math,
    JSON,
    Promise,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    TypeError,
    AbortController,
    localStorage: storage,
    navigator: { clipboard: {} },
    location: { hostname: 'localhost', pathname: '/chat.html' },
    document: {
      readyState: 'loading',
      body: new ElementMock(),
      head: new ElementMock(),
      addEventListener() {},
      removeEventListener() {},
      getElementById(id) { return elements.get(id) || null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return new ElementMock(); }
    },
    Event: function Event(type) { this.type = type; },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    Blob: function Blob() {},
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout,
    clearTimeout,
    setInterval() { return 1; },
    clearInterval() {},
    addEventListener() {},
    dispatchEvent() {},
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ reply: 'ok' }) }),
    AHAGroups: { getActiveGroups() { return []; } },
    AHAContracts: { normalizeTags(value) { return Array.isArray(value) ? value : []; } },
    AHAModules: {
      localPageHealth(input) { return { status: input?.count ? 'ready' : 'empty' }; },
      updatePageHealth() {},
      buildModuleEmptyState({ title = '', message = '', hint = '' }) { return `<h2>${title}</h2><p>${message}</p><p>${hint}</p>`; }
    },
    AHARepository: {
      savePath(pathRecord) { return { ok: true, data: pathRecord }; },
      loadPaths() { return { ok: true, data: [] }; }
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);

  [
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
    'js/ahaChatAutoAnalysis.js', 'js/ahaChatAutoOutputView.js', 'js/ahaChatAnalysisStateView.js',
    'js/ahaChatAnalysisPolicy.js', 'js/ahaChatConceptPolicy.js', 'js/ahaChatCanonicalAnalysis.js', 'js/ahaChatKnowledgeView.js', 'js/ahaChatInsightPipeline.js', 'js/ahaChatPersonalUi.js', 'js/ahaChatConversationView.js', 'js/ahaChatAnalysisRunContract.js', 'js/ahaChatAcademicInsightView.js', 'js/ahaChat.js',
    'js/ahaLists.js',
    'js/ahaPaths.js',
    'js/ahaMindmap.js',
    'js/ahaChatPythonSmoke.js'
  ].forEach((relativePath) => vm.runInContext(read(relativePath), context, { filename: relativePath }));

  return { context, storage, elements };
}

const fixture = readJson(FIXTURE_PATH);
const registry = readJson(REGISTRY_PATH);
assert.equal(fixture.version, 'aha_production_analysis_quality_matrix_v1');
assert.ok(Array.isArray(fixture.cases) && fixture.cases.length > 0, 'quality matrix must contain reviewed cases');

const activeSubjectIds = Object.keys(registry.active_subjects || {}).sort();
const fixtureSubjectIds = fixture.cases.map((item) => item.canonicalSubjectId).sort();
assert.deepEqual(fixtureSubjectIds, activeSubjectIds, 'quality matrix must track every runtime-active subject exactly once');

const subjectContext = { window: null, globalThis: null, console, fetch: localFetch() };
subjectContext.window = subjectContext;
subjectContext.globalThis = subjectContext;
vm.runInNewContext(read('js/ahaSubjectEngine.js'), subjectContext, { filename: 'js/ahaSubjectEngine.js' });

(async () => {
  const scorecard = {
    version: fixture.version,
    reviewedCases: fixture.cases.length,
    subjectMatches: 0,
    canonicalProvenance: 0,
    sourceGroundedAnalyses: 0,
    conceptLists: 0,
    knowledgePaths: 0,
    graphicalMindmaps: 0,
    personalAiBoundaries: 0,
    personalAiIsolations: 0,
    adversarialSharedTokenMemories: 0,
    semanticBindings: 0,
    leakageChecks: 0,
    leakageFailures: 0,
    requiredOutputChecks: fixture.cases.length * 6,
    emptyOutputFailures: 0
  };

  for (const [caseIndex, item] of fixture.cases.entries()) {
    assert.ok(item.sourceText.length >= 300, `${item.id}: source must be substantial enough for the production academic path`);
    assert.ok(item.expectedConceptTerms.length >= 2, `${item.id}: reviewed concepts missing`);
    assert.ok(item.forbiddenLeakageTerms.length >= 3, `${item.id}: leakage vocabulary missing`);
    item.expectedConceptTerms.forEach((term) => assert.equal(sourceContains(item.sourceText, term), true, `${item.id}: expected concept must occur in source: ${term}`));

    const matches = await subjectContext.AHASubjectEngine.matchText(item.sourceText, {
      source: 'production_analysis_quality_matrix',
      maxResults: 8
    });
    assert.ok(matches.length > 0, `${item.id}: subject engine returned no match`);
    assert.equal(matches[0].subject_id, item.ahaSubjectId, `${item.id}: wrong AHA subject`);
    assert.equal(matches[0].emne_id, item.emneId, `${item.id}: wrong AHA topic`);
    scorecard.subjectMatches += 1;

    assert.equal(matches[0].provenance?.kind, 'canonical_fagverk', `${item.id}: missing canonical provenance`);
    assert.equal(matches[0].provenance?.canonical_subject_id, item.canonicalSubjectId, `${item.id}: wrong canonical subject provenance`);
    assert.equal(matches[0].provenance?.chapter_id, item.chapterId, `${item.id}: wrong chapter provenance`);
    assert.equal(matches[0].provenance?.evidence_role, 'reference_support_not_source_evidence', `${item.id}: Fagverk must remain reference support`);
    scorecard.canonicalProvenance += 1;

    const { context, storage } = makeProductContext();
    const hooks = context.AHATestHooks;
    assert.equal(hooks.detectTextType(item.sourceText), 'academic_article', `${item.id}: source must use the academic production path`);
    const run = hooks.createAnalysisRun(item.sourceText, { sourceKind: 'pasted_text' });
    hooks.clearActiveAnalysisState(run);
    await hooks.renderAutoOutputs(item.sourceText, '', { subjectMatches: [matches[0]], analysisRun: run });

    const stored = storage.readJson(AUTO_OUTPUT_STORAGE_KEY, null);
    assert.ok(stored?.payload, `${item.id}: production render did not persist an analysis payload`);
    const payload = stored.payload;
    const analysisSurface = JSON.stringify({
      canonicalAnalysis: payload.canonicalAnalysis,
      ahaSer: payload.ahaSer,
      reflection: payload.reflection,
      sortItems: payload.sortItems,
      list: payload.list,
      path: payload.path
    });

    const leaked = item.forbiddenLeakageTerms.filter((term) => normalize(analysisSurface).includes(normalize(term)));
    scorecard.leakageChecks += item.forbiddenLeakageTerms.length;
    scorecard.leakageFailures += leaked.length;
    assert.deepEqual(leaked, [], `${item.id}: cross-domain leakage: ${leaked.join(', ')}`);

    assert.ok(payload.ahaSer?.viktigsteInnsikt, `${item.id}: AHA Ser insight missing`);
    assert.ok(payload.canonicalAnalysis?.keyInsight, `${item.id}: canonical key insight missing`);
    assert.ok(Array.isArray(payload.sortItems) && payload.sortItems.length >= 3, `${item.id}: structured source analysis missing`);
    payload.sortItems.forEach((field) => {
      assert.equal(sourceContains(item.sourceText, field.text), true, `${item.id}: structured field is not a verbatim source sentence: ${field.label}`);
    });
    assert.equal(payload.analysisKnowledgePolicy?.durableKnowledgeSource, 'fagverk', `${item.id}: durable knowledge source changed`);
    assert.equal(payload.analysisKnowledgePolicy?.currentDocumentRole, 'analysis_source', `${item.id}: current document role changed`);
    scorecard.sourceGroundedAnalyses += 1;

    assert.equal(payload.analysisKnowledgePolicy?.persistAsMemory, false, `${item.id}: source article must not become Personal AI memory automatically`);
    scorecard.personalAiBoundaries += 1;

    const relevantMemory = {
      id: `relevant_${item.id}`,
      title: `Relevant minne om ${item.canonicalSubjectId}`,
      summary: item.expectedConceptTerms.join(' · '),
      concepts: item.expectedConceptTerms
    };
    const adversarialMemory = {
      id: `adversarial_${item.id}`,
      title: `Stale minne fra et annet fag ${caseIndex}`,
      summary: item.forbiddenLeakageTerms.join(' · '),
      concepts: item.forbiddenLeakageTerms
    };
    const sharedAcademicLanguage = [
      'artikkelen', 'undersøker', 'undersøkelsen', 'studien', 'analysen',
      'metoden', 'resultatet', 'resultatene', 'forskerne', 'sammenligner'
    ].filter((term) => sourceContains(item.sourceText, term));
    assert.ok(sharedAcademicLanguage.length >= 2, `${item.id}: adversarial shared-token vocabulary is too weak`);
    const sharedTokenAdversarialMemory = {
      id: `adversarial_shared_${item.id}`,
      title: `Tidligere artikkel fra et annet fag ${caseIndex}`,
      summary: `${sharedAcademicLanguage.join(' · ')} · ${item.forbiddenLeakageTerms.join(' · ')}`,
      concepts: [...sharedAcademicLanguage, ...item.forbiddenLeakageTerms]
    };
    sharedAcademicLanguage.forEach((term) => {
      assert.equal(sourceContains(item.sourceText, term), true, `${item.id}: shared-token adversary must overlap active source text: ${term}`);
    });
    const filteredRetrieval = hooks.filterRetrievalForActiveSource({
      results: [adversarialMemory, sharedTokenAdversarialMemory, relevantMemory],
      context: { selectedSources: [adversarialMemory, sharedTokenAdversarialMemory, relevantMemory] }
    }, item.sourceText, run);
    assert.deepEqual(Array.from(filteredRetrieval.results, (entry) => entry.id), [relevantMemory.id], `${item.id}: Personal AI retrieval kept an unrelated cross-domain memory`);
    assert.deepEqual(Array.from(filteredRetrieval.context.selectedSources, (entry) => entry.id), [relevantMemory.id], `${item.id}: answer sources kept an unrelated cross-domain memory`);
    const filteredMemory = hooks.filterMemoryContextForActiveSource({
      used: true,
      reason: 'Adversarial production matrix',
      confidence: 0.9,
      mode: 'semantic_match',
      selectedInsights: [adversarialMemory, sharedTokenAdversarialMemory, relevantMemory],
      localMatches: [{ insight: adversarialMemory }, { insight: sharedTokenAdversarialMemory }, { insight: relevantMemory }],
      semanticMatches: [adversarialMemory, sharedTokenAdversarialMemory, relevantMemory],
      summaryForAgent: 'stale pre-filter summary'
    }, item.sourceText, run);
    assert.equal(filteredMemory.used, true, `${item.id}: relevant Personal AI memory was lost`);
    assert.deepEqual(Array.from(filteredMemory.selectedInsights, (entry) => entry.id), [relevantMemory.id], `${item.id}: active memory kept cross-domain material`);
    assert.equal(filteredMemory.localMatches.some((entry) => (entry.insight || entry).id === sharedTokenAdversarialMemory.id), false, `${item.id}: shared-token memory survived local filtering`);
    assert.equal(filteredMemory.semanticMatches.some((entry) => (entry.insight || entry).id === sharedTokenAdversarialMemory.id), false, `${item.id}: shared-token memory survived semantic filtering`);
    item.forbiddenLeakageTerms.forEach((term) => assert.equal(normalize(filteredMemory.summaryForAgent).includes(normalize(term)), false, `${item.id}: cross-domain memory reached the agent summary: ${term}`));
    scorecard.adversarialSharedTokenMemories += 1;
    scorecard.personalAiIsolations += 1;

    const binding = context.AHAAutoOutputSourceBinding.bindAutoOutputToSource(stored);
    assert.equal(binding.sourceBinding.invalidFields.length, 0, `${item.id}: invalid source-bound artifacts`);
    assert.notEqual(binding.payload.source_binding?.status, 'invalid_semantic_topic_mismatch', `${item.id}: correct analysis rejected as topic mismatch`);
    scorecard.semanticBindings += 1;

    const conceptCandidates = hooks.buildAcademicConceptCandidates(item.sourceText, payload)
      .filter((term) => sourceContains(item.sourceText, term));
    assert.ok(conceptCandidates.length >= 2, `${item.id}: fewer than two source-grounded concept candidates`);
    assert.ok(item.expectedConceptTerms.some((expected) => conceptCandidates.some((candidate) => normalize(candidate).includes(normalize(expected)) || normalize(expected).includes(normalize(candidate)))), `${item.id}: reviewed concept vocabulary missing from candidates (${conceptCandidates.join(', ')})`);

    const conceptList = context.AHALists.createConceptList({
      title: payload.ahaSer.tema || item.id,
      description: 'Kildebundne relaterte ord og begreper',
      terms: conceptCandidates.slice(0, 6)
    });
    assert.ok(conceptList && conceptList.terms.length >= 2, `${item.id}: concept list was not created`);
    assert.equal(new Set(conceptList.terms.map((term) => normalize(term.term))).size, conceptList.terms.length, `${item.id}: concept list contains duplicates`);
    conceptList.terms.forEach((term) => assert.equal(sourceContains(item.sourceText, term.term), true, `${item.id}: concept list term is not source-bound`));
    scorecard.conceptLists += 1;

    const knowledgePath = context.AHAPaths.createPath({
      title: `Forstå ${conceptList.title}`,
      type: 'learning',
      mode: 'learning',
      description: 'Kildebundet læringsforløp',
      goal: payload.ahaSer.viktigsteInnsikt,
      learningOutcome: `Forklar ${conceptList.terms[0].term} med støtte i kilden.`
    });
    const stepResult = context.AHAPaths.addStepToPath(knowledgePath.id, {
      source: 'aha_concept_lists',
      refId: conceptList.id,
      narrative: `Start med begrepene som bærer kildens hovedpoeng: ${conceptList.terms.slice(0, 3).map((term) => term.term).join(', ')}.`,
      learningOutcome: `Knytt ${conceptList.terms[0].term} til kildens dokumenterte hovedfunn.`
    });
    assert.equal(stepResult.ok, true, `${item.id}: learning step was not created`);
    assert.equal(stepResult.path.mode, 'learning', `${item.id}: path is not a learning path`);
    assert.ok(stepResult.step.narrative.length > 40, `${item.id}: path step lacks narrative`);
    assert.ok(stepResult.step.learningOutcome.length > 30, `${item.id}: path step lacks learning outcome`);
    scorecard.knowledgePaths += 1;

    const graph = context.AHAMindmap.collectGraphData();
    const rootId = `concept_list::aha_concept_lists::${conceptList.id}`;
    const layout = context.AHAMindmap.buildMindmapLayout(graph.nodes, graph.edges, rootId);
    assert.equal(layout.rootId, rootId, `${item.id}: concept list is not the graphical mindmap center`);
    assert.ok(layout.nodes.some((node) => node.depth === 0), `${item.id}: mindmap center missing`);
    assert.ok(layout.nodes.filter((node) => node.depth === 1 && node.type === 'concept').length >= conceptList.terms.length, `${item.id}: concepts are not graphical first-level branches`);
    assert.ok(layout.links.length >= conceptList.terms.length, `${item.id}: graphical mindmap links missing`);
    assert.ok(graph.edges.some((edge) => edge.type === 'path_contains' && edge.to === rootId), `${item.id}: learning path is not connected to its concept list`);
    scorecard.graphicalMindmaps += 1;
    scorecard.emptyOutputFailures += [
      Boolean(payload.ahaSer?.viktigsteInnsikt),
      Boolean(payload.canonicalAnalysis?.keyInsight),
      Array.isArray(payload.sortItems) && payload.sortItems.length >= 3,
      Boolean(conceptList?.terms?.length >= 2),
      stepResult.ok === true,
      layout.links.length >= conceptList.terms.length
    ].filter((complete) => !complete).length;
  }

  assert.equal(scorecard.leakageFailures, 0, 'production matrix must have zero forbidden cross-domain terms');
  for (const field of [
    'subjectMatches', 'canonicalProvenance', 'sourceGroundedAnalyses', 'conceptLists',
    'knowledgePaths', 'graphicalMindmaps', 'personalAiBoundaries', 'personalAiIsolations', 'semanticBindings'
  ]) assert.equal(scorecard[field], scorecard.reviewedCases, `${field} must pass for every reviewed case`);

  scorecard.metrics = {
    leakageRate: Number((scorecard.leakageFailures / Math.max(1, scorecard.leakageChecks)).toFixed(4)),
    emptyOutputRate: Number((scorecard.emptyOutputFailures / Math.max(1, scorecard.requiredOutputChecks)).toFixed(4)),
    provenanceCompleteness: Number((scorecard.canonicalProvenance / scorecard.reviewedCases).toFixed(4)),
    structureCompleteness: Number(((scorecard.conceptLists + scorecard.knowledgePaths + scorecard.graphicalMindmaps) / (scorecard.reviewedCases * 3)).toFixed(4)),
    personalAiIsolationRate: Number((scorecard.personalAiIsolations / scorecard.reviewedCases).toFixed(4))
  };
  assert.deepEqual(scorecard.metrics, {
    leakageRate: 0,
    emptyOutputRate: 0,
    provenanceCompleteness: 1,
    structureCompleteness: 1,
    personalAiIsolationRate: 1
  });

  console.log(`AHA production analysis quality matrix: PASS\n${JSON.stringify(scorecard, null, 2)}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
