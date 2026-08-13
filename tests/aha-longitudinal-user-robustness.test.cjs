const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const MATRIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/aha-production-analysis-quality-matrix.v1.json'), 'utf8'));
const AUTO_OUTPUT_KEY = 'aha_chat_auto_outputs_v1';
const CURRENT_SESSION_KEY = 'aha_chat_current_session_v1';

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
  const map = new Map(Object.entries(seed).map(([key, value]) => [String(key), String(value)]));
  return {
    getItem(key) { return map.has(String(key)) ? map.get(String(key)) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(String(key)); },
    clear() { map.clear(); },
    readJson(key, fallback) { return map.has(String(key)) ? JSON.parse(map.get(String(key))) : fallback; }
  };
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

function buildContext() {
  const notes = Array.from({ length: 600 }, (_, index) => ({
    id: `long_note_${index}`,
    title: `Langtidsnotat ${index}`,
    text: `Lokalt notat ${index} om kildekritikk, begreper og læring over tid.`,
    tags: [`fase_${index % 3}`, `tema_${index % 8}`],
    local_only: true
  }));
  const storage = makeStorage({
    aha_notes_v1: JSON.stringify(notes),
    aha_lists_v1: '[]',
    aha_concept_lists_v1: '[]',
    aha_paths_v1: '[]',
    aha_insight_chamber_v1: JSON.stringify({ insights: [] }),
    aha_personal_retrieval_index_v1: JSON.stringify({ stale: true }),
    aha_personal_semantic_index_v1: JSON.stringify({ stale: true })
  });
  const elements = new Map();
  [
    'aha-auto-output', 'aha-answer-composer-status', 'aha-answer-composer-details',
    'aha-answer-evaluation-status', 'aha-processing-indicator', 'aha-processing-text', 'btn-send'
  ].forEach((id) => elements.set(id, new ElementMock()));

  const context = {
    window: null, globalThis: null, console, Date, Intl, Math, JSON, Promise,
    String, Number, Boolean, Array, Object, Set, Map, TypeError, AbortController,
    localStorage: storage,
    navigator: { clipboard: {} },
    location: { hostname: 'localhost', pathname: '/chat.html' },
    document: {
      readyState: 'loading', body: new ElementMock(), head: new ElementMock(),
      addEventListener() {}, removeEventListener() {},
      getElementById(id) { return elements.get(id) || null; },
      querySelector() { return null; }, querySelectorAll() { return []; },
      createElement() { return new ElementMock(); }
    },
    Event: function Event(type) { this.type = type; },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
    Blob: function Blob() {},
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    setTimeout, clearTimeout,
    setInterval() { return 1; }, clearInterval() {},
    addEventListener() {}, dispatchEvent() {},
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
    'js/ahaChatPersistence.js', 'js/metaInsightsMemory.js', 'js/ahaChatTextUtils.js',
    'js/ahaChatSignals.js', 'js/ahaChatSubjects.js', 'js/ahaChatAnalysis.js',
    'js/ahaChatReplyFormat.js', 'js/ahaChatExport.js', 'js/ahaChatMemoryControls.js', 'js/ahaChatAfterwork.js', 'js/ahaChatMemoryRuntime.js', 'js/ahaChatRunContext.js', 'js/ahaChatInsightView.js', 'js/ahaChatAutoAnalysis.js', 'js/ahaChatAutoOutputView.js', 'js/ahaChatAnalysisStateView.js', 'js/ahaChatAnalysisPolicy.js', 'js/ahaChatConceptPolicy.js', 'js/ahaChatCanonicalAnalysis.js', 'js/ahaChatKnowledgeView.js', 'js/ahaChatInsightPipeline.js', 'js/ahaChatPersonalUi.js', 'js/ahaChatConversationView.js', 'js/ahaChatAnalysisRunContract.js', 'js/ahaChatAcademicInsightView.js', 'js/ahaChat.js',
    'js/ahaLists.js', 'js/ahaPaths.js', 'js/ahaMindmap.js', 'js/ahaSearch.js'
  ].forEach((relativePath) => vm.runInContext(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'), context, { filename: relativePath }));
  return { context, storage, elements };
}

function makeHistoricalSessions() {
  return Array.from({ length: 30 }, (_, index) => {
    const month = String((index % 9) + 1).padStart(2, '0');
    const day = String((index % 27) + 1).padStart(2, '0');
    const createdAt = `2025-${month}-${day}T10:00:00.000Z`;
    return {
      id: `historical_session_${index}`,
      title: `Eldre AHA-session ${index}`,
      createdAt,
      updatedAt: createdAt,
      messages: [
        { id: `historical_user_${index}`, role: 'user', text: `Dette er en eldre prosjektsamtale ${index} med relevant kontekst og begreper.`, createdAt },
        { id: `historical_aha_${index}`, role: 'assistant', text: `AHA oppsummerte den eldre samtalen ${index} uten å gjøre den til automatisk treningsgrunnlag.`, createdAt }
      ],
      meta: { active: true }
    };
  });
}

(async () => {
  assert.equal(MATRIX.version, 'aha_production_analysis_quality_matrix_v1');
  const { context, storage, elements } = buildContext();
  const hooks = context.AHATestHooks;
  const chat = context.AHAChatPersistence;
  const memory = context.AHAMetaInsightsMemory;

  chat.saveSessions(makeHistoricalSessions());
  let sessions = chat.loadSessions();
  assert.equal(sessions.length, 25, 'chat history must keep its bounded newest-session window');
  storage.setItem(CURRENT_SESSION_KEY, sessions[0].id);

  const lifePhases = ['første_gjennomgang', 'tilbakevendende_bruk', 'modent_bibliotek'];
  const createdConceptListIds = [];
  const createdPathIds = [];
  let previousArtifact = null;
  let analysisCount = 0;

  for (const phase of lifePhases) {
    for (const item of MATRIX.cases) {
      const run = hooks.createAnalysisRun(item.sourceText, { sourceKind: 'pasted_text' });
      hooks.clearActiveAnalysisState(run);
      if (previousArtifact) {
        hooks.renderAutoOutputPayload(previousArtifact);
        const staleHtml = elements.get('aha-auto-output').innerHTML;
        assert.match(staleHtml, /Venter på etterarbeid for aktiv analyse|Analyseobjektet matcher ikke aktiv tekst/);
        item.forbiddenLeakageTerms.forEach((term) => assert.equal(normalize(staleHtml).includes(normalize(term)), false, `${phase}/${item.id}: stale term survived run switch: ${term}`));
      }

      const subjectMatch = {
        subject_id: item.ahaSubjectId, subject_label: item.ahaSubjectId,
        emne_id: item.emneId, title: item.chapterId, score: 12,
        matched_terms: item.expectedConceptTerms,
        provenance: {
          kind: 'canonical_fagverk', canonical_subject_id: item.canonicalSubjectId,
          chapter_id: item.chapterId, evidence_role: 'reference_support_not_source_evidence'
        }
      };
      await hooks.renderAutoOutputs(item.sourceText, '', { subjectMatches: [subjectMatch], analysisRun: run });
      const stored = storage.readJson(AUTO_OUTPUT_KEY, null);
      assert.ok(stored?.payload?.canonicalAnalysis?.keyInsight, `${phase}/${item.id}: current analysis missing`);
      assert.equal(stored.payload.analysisKnowledgePolicy?.persistAsMemory, false, `${phase}/${item.id}: article became memory automatically`);
      const currentSurface = JSON.stringify(stored.payload);
      item.forbiddenLeakageTerms.forEach((term) => assert.equal(normalize(currentSurface).includes(normalize(term)), false, `${phase}/${item.id}: cross-run leakage: ${term}`));
      previousArtifact = JSON.parse(JSON.stringify(stored.payload));

      const candidates = hooks.buildAcademicConceptCandidates(item.sourceText, stored.payload)
        .filter((term) => normalize(item.sourceText).includes(normalize(term))).slice(0, 6);
      const conceptList = context.AHALists.createConceptList({
        title: `${phase}: ${stored.payload.ahaSer.tema}`,
        description: 'Langtidsaudit av kildebundne begreper', terms: candidates
      });
      assert.ok(conceptList?.terms?.length >= 2, `${phase}/${item.id}: concept list missing`);
      createdConceptListIds.push(conceptList.id);

      const knowledgePath = context.AHAPaths.createPath({
        title: `${phase}: lær ${item.canonicalSubjectId}`, type: 'learning', mode: 'learning',
        goal: stored.payload.ahaSer.viktigsteInnsikt,
        learningOutcome: `Forklar hovedideen i ${item.canonicalSubjectId}.`
      });
      const step = context.AHAPaths.addStepToPath(knowledgePath.id, {
        source: 'aha_concept_lists', refId: conceptList.id,
        narrative: `Begynn med ${conceptList.terms.slice(0, 3).map((term) => term.term).join(', ')} og følg kildens resonnement.`,
        learningOutcome: `Knytt ${conceptList.terms[0].term} til et eksplisitt kildebelegg.`
      });
      assert.equal(step.ok, true, `${phase}/${item.id}: path step missing`);
      createdPathIds.push(knowledgePath.id);

      chat.appendUserMessage(`I ${phase} analyserer jeg ${item.canonicalSubjectId}: ${item.sourceText.slice(0, 150)}`, {
        project: 'AHA langtidsaudit', concepts: item.expectedConceptTerms
      });
      const assistantMessage = chat.appendAssistantMessage(`I ${phase} er analysen av ${item.canonicalSubjectId} kildebundet og klar for videre læring.`, {
        project: 'AHA langtidsaudit', concepts: candidates
      });
      chat.attachAnswerPackage(assistantMessage.id, { id: `package_${phase}_${item.id}`, status: { ready: true, intent: 'analysis' } });
      chat.attachAnswerEvaluation(assistantMessage.id, { id: `evaluation_${phase}_${item.id}`, score: 85, status: 'good' });
      analysisCount += 1;
    }
  }

  assert.equal(analysisCount, lifePhases.length * MATRIX.cases.length);
  const stats = chat.collectChatStats();
  assert.equal(stats.sessions, 25, 'historical sessions must survive ongoing use within the supported window');
  assert.ok(stats.withAnswerPackage >= analysisCount && stats.withEvaluation >= analysisCount, 'new analyses must retain answer provenance');
  const intake = chat.buildChatIntakeCandidates({ minLength: 20 });
  assert.ok(intake.items.length >= analysisCount, 'review queue must remain usable after many sessions');
  assert.ok(intake.items.every((item) => item.status === 'review' && item.consent.useForTrainingCorpus === false), 'old chats must not become training data automatically');

  MATRIX.cases.forEach((item, index) => {
    const oldClaim = `Jeg arbeider med ${item.canonicalSubjectId}`;
    assert.equal(memory.addFeedback({
      sessionId: `memory_session_${index}`, claimId: `memory_claim_${index}`,
      claimText: oldClaim, response: 'stemmer', confidence: 0.8
    }).ok, true);
    const before = memory.loadMemory().feedback.length;
    assert.equal(memory.replaceClaim(oldClaim, `Jeg arbeider kildekritisk med ${item.canonicalSubjectId}`, {
      createdAt: `2026-08-12T20:${String(index).padStart(2, '0')}:00.000Z`,
      note: 'Presisert gjennom langtidsaudit.'
    }).ok, true);
    assert.equal(memory.loadMemory().feedback.length, before + 2, `${item.id}: correction history grew by more than two events`);
    assert.equal(memory.addFeedback({
      sessionId: `memory_session_${index}`, claimId: `rejected_claim_${index}`,
      claimText: `Jeg arbeider ukritisk med ${item.canonicalSubjectId}`,
      response: 'feil', confidence: 0.9
    }).ok, true);
  });
  const memorySummary = memory.summarizeMemory();
  assert.equal(memorySummary.confirmed, MATRIX.cases.length);
  assert.equal(memorySummary.outdated, MATRIX.cases.length);
  assert.equal(memorySummary.rejected, MATRIX.cases.length);
  assert.equal(memorySummary.totalFeedback, MATRIX.cases.length * 4, 'memory history must grow linearly without duplicate correction events');
  assert.equal(storage.getItem('aha_personal_retrieval_index_v1'), null, 'corrections must invalidate stale lexical retrieval');
  assert.equal(storage.getItem('aha_personal_semantic_index_v1'), null, 'corrections must invalidate stale semantic retrieval');
  const memoryPack = memory.buildMemoryPack();
  assert.ok(memoryPack.confirmed_claims.every((claim) => /kildekritisk/.test(claim)), 'only corrected active wording belongs in confirmed memory');
  assert.ok(memoryPack.rejected_claims.every((claim) => /ukritisk/.test(claim)), 'rejected claims must stay separated');

  const firstPhaseCount = MATRIX.cases.length;
  createdConceptListIds.slice(0, firstPhaseCount).forEach((id) => context.AHALists.deleteConceptList(id));
  createdPathIds.slice(0, firstPhaseCount).forEach((id) => context.AHAPaths.deletePath(id));
  const searchItems = context.AHASearch.collectSearchItems();
  const searchRefs = new Set(searchItems.map((item) => `${item.source}::${item.refId}`));
  createdConceptListIds.slice(0, firstPhaseCount).forEach((id) => assert.equal(searchRefs.has(`aha_concept_lists::${id}`), false, 'deleted concept list remained searchable'));
  createdPathIds.slice(0, firstPhaseCount).forEach((id) => assert.equal(searchRefs.has(`aha_paths::${id}`), false, 'deleted path remained searchable'));
  createdConceptListIds.slice(firstPhaseCount).forEach((id) => assert.equal(searchRefs.has(`aha_concept_lists::${id}`), true, 'active concept list disappeared'));
  createdPathIds.slice(firstPhaseCount).forEach((id) => assert.equal(searchRefs.has(`aha_paths::${id}`), true, 'active path disappeared'));
  assert.ok(searchItems.filter((item) => item.source === 'aha_notes').length >= 600, 'growing note library was not preserved');

  const graph = context.AHAMindmap.collectGraphData();
  const graphIds = new Set(graph.nodes.map((node) => node.id));
  createdConceptListIds.slice(0, firstPhaseCount).forEach((id) => assert.equal(graphIds.has(`concept_list::aha_concept_lists::${id}`), false, 'deleted concept list remained in mindmap'));
  createdPathIds.slice(0, firstPhaseCount).forEach((id) => assert.equal(graphIds.has(`path::aha_paths::${id}`), false, 'deleted path remained in mindmap'));
  graph.edges.forEach((edge) => {
    assert.ok(graphIds.has(edge.from), `dangling graph source: ${edge.id}`);
    assert.ok(graphIds.has(edge.to), `dangling graph target: ${edge.id}`);
  });

  const scorecard = {
    status: 'pass', lifePhases: lifePhases.length, sequentialAnalyses: analysisCount,
    retainedHistoricalSessions: stats.sessions,
    localNotes: searchItems.filter((item) => item.source === 'aha_notes').length,
    activeConceptLists: createdConceptListIds.length - firstPhaseCount,
    activeKnowledgePaths: createdPathIds.length - firstPhaseCount,
    correctedMemories: memorySummary.confirmed, rejectedMemories: memorySummary.rejected,
    duplicateCorrectionEvents: 0, danglingMindmapEdges: 0,
    automaticTrainingCandidates: 0, manualSafariDeviceVerificationRequired: true
  };
  console.log(`AHA longitudinal user robustness audit: PASS\n${JSON.stringify(scorecard, null, 2)}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
