const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ahaContracts.js'), 'utf8');

const chamber = {
  insights: [
    { id: 'ins_1', title: 'Første' },
    { id: 'ins_2', title: 'Andre' }
  ]
};
let savedChamber = null;
let originalCalls = 0;
let receivedInput = null;
let receivedCandidates = null;
const candidateMiddlewares = new Map();

function canonicalIngest(input, candidates) {
  originalCalls += 1;
  receivedInput = input;
  receivedCandidates = candidates;
  return {
    ok: true,
    sourceEvent: { id: 'src_chat_1', meta: input.meta || {} },
    items: candidates.map((candidate, index) => ({
      signal: { text: candidate.text || candidate.summary || candidate, meta: input.meta || {} },
      meta: { insight_id: index === 0 ? 'ins_1' : 'ins_2', action: index === 0 ? 'created' : 'reinforced' }
    }))
  };
}

const activeRun = {
  analysisId: 'analysis_abc123',
  analysisRunId: 'run_abc123',
  runId: 'run_abc123',
  conversationId: 'default_thread',
  sessionId: 'default_thread',
  turnId: 'turn_abc123',
  sourceId: 'chat_message_msg_42',
  sourceKind: 'pasted_text',
  createdAt: '2026-08-11T07:40:00.000Z',
  sourceHash: 'src-hash-original',
  normalizedSourceHash: 'src-hash-original',
  sourceTextHash: 'src-hash-original',
  sourceFingerprint: 'src-hash-original'
};

const context = {
  console,
  Date,
  Math,
  JSON,
  location: { pathname: '/chat.html' },
  localStorage: {
    getItem(key) {
      if (key === 'aha_insight_chamber_v1') return JSON.stringify(chamber);
      return null;
    },
    setItem(key, value) {
      if (key === 'aha_insight_chamber_v1') savedChamber = JSON.parse(value);
    }
  },
  saveChamberToStorage(next) {
    savedChamber = JSON.parse(JSON.stringify(next));
  },
  AHAActiveRun: {
    get() {
      return activeRun;
    }
  },
  AHAIngest: {
    useCandidateMiddleware(id, handler, options = {}) {
      candidateMiddlewares.set(id, { id, handler, priority: Number(options.priority) || 0 });
    },
    hasCandidateMiddleware(id) { return candidateMiddlewares.has(id); },
    ingestWithCandidates(input, candidates) {
      const entries = Array.from(candidateMiddlewares.values()).sort((a, b) => b.priority - a.priority);
      function dispatch(index, nextInput, nextCandidates) {
        const entry = entries[index];
        if (!entry) return canonicalIngest(nextInput, nextCandidates);
        return entry.handler(
          { input: nextInput, candidates: nextCandidates },
          (forwardInput = nextInput, forwardCandidates = nextCandidates) => dispatch(index + 1, forwardInput, forwardCandidates)
        );
      }
      return dispatch(0, input, candidates);
    }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'js/ahaContracts.js' });

assert.ok(context.AHAContracts, 'AHAContracts skal finnes');
assert.equal(typeof context.AHAContracts.prepareInsightCandidates, 'function');
assert.equal(typeof context.AHAContracts.installInsightQualityContract, 'function');
assert.equal(typeof context.AHAContracts.normalizeAnalysisTrace, 'function');
assert.equal(context.AHAIngest.hasCandidateMiddleware('contracts.insightQuality'), true, 'kvalitetskontrakten skal installeres på chat.html');

const candidates = [
  {
    title: 'Makt og sted',
    text: 'Makt formes av stedet og institusjonene rundt det.',
    candidate_type: 'ai',
    functional_type: 'pattern'
  },
  {
    title: 'Duplikat med ulik whitespace',
    text: '  Makt   formes av stedet og institusjonene rundt det.  ',
    candidate_type: 'ai',
    functional_type: 'pattern'
  },
  {
    title: 'Et annet spor',
    summary: 'Institusjoner gjør bestemte handlingsrom mer sannsynlige.',
    candidate_type: 'semantic',
    functional_type: 'principle'
  }
];

const result = context.AHAIngest.ingestWithCandidates({
  source_type: 'chat',
  text: 'En lengre chattekst om makt, sted og institusjoner.',
  meta: { theme_id: 'th_makt', field_id: 'field_by' }
}, candidates);

assert.equal(originalCalls, 1, 'canonical AHAIngest skal fortsatt kalles nøyaktig én gang');
assert.equal(receivedCandidates.length, 2, 'identiske kandidater skal dedupliseres før canonical ingest');
assert.equal(result.duplicates_skipped, 1, 'resultatet skal gjøre deduplisering inspiserbar');
assert.equal(result.quality_contract, 'aha_insight_quality_contract_v1');

const first = receivedCandidates[0];
const second = receivedCandidates[1];
assert.match(first.candidate_fingerprint, /^cand_[0-9a-f]{8}$/);
assert.equal(first.candidate_origin, 'ai');
assert.equal(first.candidate_quality.status, 'accepted_for_ingest');
assert.equal(first.candidate_quality.acceptance_basis, 'chat_candidate_filter');
assert.equal(second.candidate_origin, 'semantic');
assert.equal(second.candidate_quality.acceptance_basis, 'chat_semantic_candidate_builder');
assert.notEqual(first.candidate_fingerprint, second.candidate_fingerprint);

assert.equal(receivedInput.meta.insight_quality_contract.version, 'aha_insight_quality_contract_v1');
assert.equal(receivedInput.meta.insight_quality_contract.candidate_count, 3);
assert.equal(receivedInput.meta.insight_quality_contract.unique_candidate_count, 2);
assert.equal(receivedInput.meta.insight_quality_contract.duplicates_skipped, 1);
assert.match(receivedInput.meta.insight_quality_contract.source_fingerprint, /^src_[0-9a-f]{8}$/);
assert.equal(receivedInput.meta.insight_quality_contract.analysis_run_id, activeRun.analysisRunId);
assert.equal(receivedInput.meta.insight_quality_contract.turn_id, activeRun.turnId);
assert.equal(receivedInput.meta.insight_quality_contract.analysis_source_hash, activeRun.sourceHash);

assert.deepEqual(JSON.parse(JSON.stringify(receivedInput.meta.analysis_trace)), activeRun, 'source-event-meta skal få den aktive Chat-kjøringen');
assert.equal(result.analysis_trace.analysisRunId, activeRun.analysisRunId);
assert.equal(result.analysis_trace.conversationId, activeRun.conversationId);
assert.equal(result.analysis_trace.turnId, activeRun.turnId);
assert.equal(result.analysis_trace.sourceHash, activeRun.sourceHash);

assert.equal(result.items[0].signal.candidate_fingerprint, first.candidate_fingerprint, 'returnert signal skal ha kandidatfingeravtrykk');
assert.equal(result.items[0].signal.candidate_origin, 'ai');
assert.equal(result.items[0].signal.candidate_quality.source_event_id, 'src_chat_1');
assert.equal(result.items[0].signal.analysisRunId, activeRun.analysisRunId, 'signalet skal beholde analysisRunId');
assert.equal(result.items[0].signal.conversationId, activeRun.conversationId, 'signalet skal beholde conversationId');
assert.equal(result.items[0].signal.turnId, activeRun.turnId, 'signalet skal beholde turnId');
assert.equal(result.items[0].signal.sourceHash, activeRun.sourceHash, 'signalet skal beholde original source hash');

assert.ok(savedChamber, 'chamber skal lagres etter metadata-berikelse');
const storedFirst = savedChamber.insights.find((item) => item.id === 'ins_1');
const storedSecond = savedChamber.insights.find((item) => item.id === 'ins_2');
assert.equal(storedFirst.source_event_id, 'src_chat_1');
assert.equal(storedFirst.candidate_fingerprint, first.candidate_fingerprint);
assert.equal(storedFirst.candidate_origin, 'ai');
assert.equal(storedFirst.candidate_provenance.length, 1);
assert.equal(storedFirst.candidate_provenance[0].source_event_id, 'src_chat_1');
assert.equal(storedFirst.candidate_provenance[0].analysisRunId, activeRun.analysisRunId);
assert.equal(storedFirst.candidate_provenance[0].conversationId, activeRun.conversationId);
assert.equal(storedFirst.candidate_provenance[0].turnId, activeRun.turnId);
assert.equal(storedFirst.candidate_provenance[0].sourceHash, activeRun.sourceHash);
assert.equal(storedSecond.candidate_origin, 'semantic');

assert.equal(storedFirst.analysisRunId, activeRun.analysisRunId, 'lagret insight skal peke på siste analyse-kjøring');
assert.equal(storedFirst.conversationId, activeRun.conversationId);
assert.equal(storedFirst.turnId, activeRun.turnId);
assert.equal(storedFirst.sourceHash, activeRun.sourceHash);
assert.equal(storedFirst.analysis_trace.sourceId, activeRun.sourceId);
assert.equal(storedFirst.analysis_provenance.length, 1, 'lagret insight skal bevare analyseproveniens');
assert.equal(storedFirst.analysis_provenance[0].analysisRunId, activeRun.analysisRunId);
assert.equal(storedFirst.analysis_provenance[0].turnId, activeRun.turnId);
assert.equal(storedFirst.analysis_provenance[0].source_event_id, 'src_chat_1');
assert.equal(storedFirst.analysis_provenance[0].candidate_fingerprint, first.candidate_fingerprint);
assert.equal(storedFirst.analysis_provenance[0].ingest_action, 'created');
assert.equal(storedSecond.analysis_provenance[0].ingest_action, 'reinforced');

const again = context.AHAContracts.prepareInsightCandidates([
  { text: 'Makt formes av stedet og institusjonene rundt det.', candidate_type: 'ai' },
  { text: 'makt formes av stedet og institusjonene rundt det', candidate_type: 'ai' }
]);
assert.equal(again.candidates.length, 1, 'normalisering skal gi stabil duplikatdeteksjon');
assert.equal(again.duplicatesSkipped, 1);

const normalizedTrace = context.AHAContracts.normalizeAnalysisTrace({
  runId: 'run_fallback',
  sessionId: 'session_fallback',
  turnId: 'turn_fallback',
  sourceTextHash: 'hash_fallback'
});
assert.equal(normalizedTrace.analysisRunId, 'run_fallback');
assert.equal(normalizedTrace.conversationId, 'session_fallback');
assert.equal(normalizedTrace.sourceHash, 'hash_fallback');

const base = context.AHAContracts.normalizeBaseItem({ title: 'Test' }, { type: 'note', source: 'aha' });
assert.equal(base.type, 'note', 'eksisterende AHAContracts-funksjoner skal bevares');
assert.equal(base.source, 'aha');

console.log('aha-chat-insight-quality-contract.test.cjs passed');
