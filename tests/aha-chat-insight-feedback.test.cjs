const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('js/ahaChatInsightFeedback.js', 'utf8');
const chatHtml = fs.readFileSync('chat.html', 'utf8');

function buildChatContext(results) {
  const statusNode = { textContent: '' };
  const timers = [];
  let calls = 0;
  const candidateMiddlewares = new Map();
  function canonicalIngest() {
    const result = results[Math.min(calls, results.length - 1)];
    calls += 1;
    return result;
  }
  const context = {
    console,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    JSON,
    document: {
      readyState: 'complete',
      getElementById(id) { return id === 'chat-status-note' ? statusNode : null; },
      addEventListener() {}
    },
    setTimeout(callback) { timers.push(callback); return timers.length; },
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
  vm.runInContext(code, context, { filename: 'js/ahaChatInsightFeedback.js' });
  return { context, statusNode, timers, getCalls: () => calls };
}

const firstResult = {
  sourceEvent: { id: 'source-1' },
  analysis_trace: {
    analysisRunId: 'run-secret-1',
    conversationId: 'conversation-secret-1',
    sourceHash: 'hash-secret-1'
  },
  duplicates_skipped: 1,
  items: [
    { meta: { action: 'created', insight_id: 'insight-a' }, signal: { text: 'PRIVATE RAW CHAT BODY' } },
    { meta: { action: 'reinforced', insight_id: 'insight-b' } },
    { meta: { action: 'created', insight_id: 'insight-a' } }
  ]
};
const secondResult = {
  sourceEvent: { id: 'source-2' },
  analysis_trace: { analysisRunId: 'run-secret-1' },
  duplicates_skipped: 2,
  items: [
    { meta: { action: 'created', insight_id: 'insight-c' } },
    { meta: { action: 'reinforced', insight_id: 'insight-b' } }
  ]
};
const thirdResult = {
  sourceEvent: { id: 'source-3' },
  analysis_trace: { analysisRunId: 'run-secret-2' },
  empty_candidates_skipped: 1,
  items: [{ meta: { action: 'created', insight_id: 'insight-z' } }]
};

const chat = buildChatContext([firstResult, secondResult, thirdResult]);
const feedback = chat.context.AHAChatInsightFeedback;
assert.ok(feedback, 'Chat feedback API should be exposed');
assert.equal(chat.context.AHAIngest.hasCandidateMiddleware('chat.insightFeedback'), true, 'adapter should install automatically on the Chat surface');

const returnedFirst = chat.context.AHAIngest.ingestWithCandidates({}, []);
assert.strictEqual(returnedFirst, firstResult, 'wrapper must return the exact canonical ingest result object');
assert.equal(chat.getCalls(), 1, 'canonical ingest should be called exactly once');
assert.equal(chat.statusNode.textContent, '', 'feedback should be deferred so Chat can finish its own synchronous status updates first');
assert.equal(chat.timers.length, 1);
chat.timers.shift()();
assert.equal(chat.statusNode.textContent, 'Innsikter oppdatert · 1 ny · 1 forsterket · 1 duplikat filtrert');

const returnedSecond = chat.context.AHAIngest.ingestWithCandidates({}, []);
assert.strictEqual(returnedSecond, secondResult);
assert.equal(chat.getCalls(), 2);
chat.timers.shift()();
assert.equal(chat.statusNode.textContent, 'Innsikter oppdatert · 2 nye · 1 forsterket · 3 duplikater filtrert', 'same analysis run should aggregate unique insight actions without double-counting reinforcement');

chat.context.AHAIngest.ingestWithCandidates({}, []);
chat.timers.shift()();
assert.equal(chat.statusNode.textContent, 'Innsikter oppdatert · 1 ny · 1 tom kandidat hoppet over', 'a new analysis run should start a separate ephemeral summary');
assert.doesNotMatch(chat.statusNode.textContent, /run-secret|conversation-secret|hash-secret|PRIVATE RAW CHAT BODY/, 'Chat feedback must not expose provenance IDs, hashes or raw source text');

feedback.resetFeedbackForTests();
const directSummary = feedback.summarizeInsightIngestResult({
  analysis_trace: { analysisRunId: 'run-direct' },
  items: [
    { meta: { action: 'create', insight_id: 'one' } },
    { meta: { action: 'reinforce', insight_id: 'two' } },
    { meta: { action: 'unknown_action', insight_id: 'three' } }
  ]
});
assert.equal(directSummary.created, 1);
assert.equal(directSummary.reinforced, 1);
assert.equal(directSummary.processed, 1);
assert.equal(feedback.formatInsightFeedback(directSummary), 'Innsikter oppdatert · 1 ny · 1 forsterket · 1 analysert');

let forbiddenReads = 0;
const forbiddenIngest = new Proxy({}, {
  get() {
    forbiddenReads += 1;
    throw new Error('AHAIngest must not be read outside Chat');
  }
});
const isolated = {
  console,
  Map,
  Set,
  Array,
  Object,
  String,
  Number,
  JSON,
  document: {
    readyState: 'complete',
    getElementById() { return null; },
    addEventListener() {}
  },
  setTimeout(callback) { callback(); return 1; },
  AHAIngest: forbiddenIngest
};
isolated.window = isolated;
vm.createContext(isolated);
vm.runInContext(code, isolated, { filename: 'js/ahaChatInsightFeedback.js' });
assert.equal(isolated.AHAChatInsightFeedback.installInsightIngestFeedback(), false, 'adapter should stay inert without the Chat status node');
assert.equal(forbiddenReads, 0, 'non-Chat guard must run before AHAIngest is read');

assert.ok(chatHtml.includes('<script src="js/ahaChatInsightFeedback.js"></script>'), 'chat.html should load the Chat feedback adapter');
assert.ok(
  chatHtml.indexOf('js/ahaContracts.js') < chatHtml.indexOf('js/ahaChatInsightFeedback.js'),
  'feedback must load after the quality middleware registration'
);
assert.ok(
  chatHtml.indexOf('js/ahaAnalysisQualityLayer.js') < chatHtml.indexOf('js/ahaChatInsightFeedback.js'),
  'feedback adapter should load after the existing Chat display quality layer'
);
assert.equal(/localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(code), false, 'feedback adapter must not persist state');
assert.equal(/\bfetch\s*\(/.test(code), false, 'feedback adapter must not fetch');
assert.equal(/AHARepository|EchoNet|supabase|syncFromDatabase|autoSync/i.test(code), false, 'feedback adapter must not activate backend, sync or EchoNet');

console.log('aha-chat-insight-feedback.test.cjs passed');
