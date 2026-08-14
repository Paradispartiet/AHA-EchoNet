const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const ingestCode = fs.readFileSync('js/ahaIngest.js', 'utf8');
const contractsCode = fs.readFileSync('js/ahaContracts.js', 'utf8');
const snapshotCode = fs.readFileSync('js/ahaConversationInsightSnapshot.js', 'utf8');
const feedbackCode = fs.readFileSync('js/ahaChatInsightFeedback.js', 'utf8');
const chatCode = fs.readFileSync('js/ahaChatInsightPipeline.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatAgentRuntime.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatIngestRuntime.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatPersonalUi.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatConversationView.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatAnalysisRunContract.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatAcademicInsightView.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatUiRuntime.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatRuntimeFacade.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatRuntimeComposition.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChat.js', 'utf8');
const chatHtml = fs.readFileSync('chat.html', 'utf8');

// Lock the browser wiring: canonical ingest + contracts must load before Chat,
// while Snapshot/Explorer must exist before the Chat-only feedback adapter.
const scriptOrder = [
  'js/ahaIngest.js',
  'js/ahaContracts.js',
  'js/ahaChatAcademicInsightView.js',
  'js/ahaConversationInsightSnapshot.js',
  'js/ahaExplorer.js',
  'js/ahaChat.js',
  'js/ahaChatInsightFeedback.js'
].map((src) => chatHtml.indexOf(`src="${src}"`));
assert.ok(scriptOrder.every((index) => index >= 0), 'all Chat insight-chain scripts must be loaded by chat.html');
for (let i = 1; i < scriptOrder.length; i += 1) {
  assert.ok(scriptOrder[i] > scriptOrder[i - 1], 'Chat insight-chain scripts must preserve canonical load order');
}
assert.match(chatCode, /global\.AHAActiveRun\s*=\s*\{/, 'Chat runtime facade must expose the active analysis run');
assert.match(chatCode, /ingestWithCandidates/, 'Chat must route insight candidates through canonical ingest');

class MockHost {
  constructor() {
    this.fragments = [];
    this.preview = null;
  }
  querySelector(selector) {
    if (selector === '.aha-snapshot-preview') return this.preview;
    return null;
  }
  querySelectorAll() { return []; }
  insertAdjacentHTML(position, html) {
    if (position === 'afterbegin') this.fragments.unshift(html);
    else this.fragments.push(html);
  }
}

const CHAMBER_KEY = 'aha_insight_chamber_v1';
const storage = new Map();
const storageWrites = [];
storage.set(CHAMBER_KEY, JSON.stringify({
  insights: [
    {
      id: 'ins_existing_e2e',
      title: 'Eksisterende innsikt',
      summary: 'Institusjoner former handlingsrom.',
      strength: { evidence_count: 1, total_score: 2 }
    }
  ]
}));

const activeRun = {
  analysisId: 'analysis_e2e',
  analysisRunId: 'run_e2e',
  runId: 'run_e2e',
  conversationId: 'conversation_e2e',
  sessionId: 'conversation_e2e',
  turnId: 'turn_e2e',
  sourceId: 'chat_message_e2e',
  sourceKind: 'pasted_text',
  sourceHash: 'hash_e2e',
  normalizedSourceHash: 'hash_e2e',
  sourceTextHash: 'hash_e2e',
  sourceFingerprint: 'hash_e2e',
  createdAt: '2026-08-11T09:55:00.000Z',
  sourcePreview: 'PRIVATE RAW CHAT BODY MUST NOT ENTER PROVENANCE'
};

const sourceEvents = [];
const statusNode = { textContent: '' };
const explorerNode = {};
const nowHost = new MockHost();
const previewHost = new MockHost();
nowHost.preview = previewHost;
const insightHost = new MockHost();
let explorerCalls = 0;
const explorerSentinel = { rendered: true };

const context = {
  console,
  Date,
  Math,
  JSON,
  Map,
  Set,
  Array,
  Object,
  String,
  Number,
  RegExp,
  Promise,
  location: { pathname: '/chat.html' },
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) {
      storageWrites.push(key);
      storage.set(key, String(value));
    }
  },
  CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
  dispatchEvent() {},
  addEventListener() {},
  setTimeout(callback) { callback(); return 1; },
  document: {
    readyState: 'complete',
    getElementById(id) {
      if (id === 'chat-status-note') return statusNode;
      if (id === 'aha-explorer') return explorerNode;
      if (id === 'aha-now-content') return nowHost;
      if (id === 'exp-innsikter') return insightHost;
      return null;
    },
    addEventListener() {}
  },
  AHASources: {
    addSourceEvent(input) {
      const event = Object.assign({}, input, {
        id: `src_e2e_${sourceEvents.length + 1}`,
        meta: Object.assign({}, input?.meta || {})
      });
      sourceEvents.push(JSON.parse(JSON.stringify(event)));
      return event;
    }
  },
  InsightsEngine: {
    createSignalFromMessage(text, subjectId, themeId, extra) {
      return {
        text,
        subject_id: subjectId,
        theme_id: themeId,
        timestamp: '2026-08-11T09:55:01.000Z',
        engine_extra: Object.assign({}, extra || {})
      };
    },
    addSignalToChamberWithMeta(chamber, signal) {
      if (signal.text.includes('Eksisterende mønster')) {
        const target = chamber.insights.find((item) => item.id === 'ins_existing_e2e');
        target.last_updated = signal.timestamp;
        target.strength = { evidence_count: 2, total_score: 3 };
        return { insight_id: target.id, action: 'reinforced' };
      }
      const created = {
        id: 'ins_new_e2e',
        title: signal.candidate_title || 'Ny innsikt',
        summary: signal.candidate_summary || signal.text,
        subject_id: signal.subject_id,
        theme_id: signal.theme_id,
        first_seen: signal.timestamp,
        last_updated: signal.timestamp,
        strength: { evidence_count: 1, total_score: 2 }
      };
      chamber.insights.push(created);
      return { insight_id: created.id, action: 'created' };
    }
  },
  AHAActiveRun: {
    get() { return activeRun; }
  },
  AHAExplorer: {
    render() {
      explorerCalls += 1;
      previewHost.fragments = [];
      insightHost.fragments = [];
      return explorerSentinel;
    }
  }
};
context.window = context;
vm.createContext(context);

// Load the real production chain in browser order. Only external engines/sources
// are lightweight stubs; AHAIngest, quality/provenance, Snapshot and feedback are real.
vm.runInContext(ingestCode, context, { filename: 'js/ahaIngest.js' });
const canonicalIngest = context.AHAIngest.ingestWithCandidates;
vm.runInContext(contractsCode, context, { filename: 'js/ahaContracts.js' });
assert.strictEqual(context.AHAIngest.ingestWithCandidates, canonicalIngest,
  'quality/provenance must extend canonical ingest without replacing its public method');
vm.runInContext(snapshotCode, context, { filename: 'js/ahaConversationInsightSnapshot.js' });
vm.runInContext(feedbackCode, context, { filename: 'js/ahaChatInsightFeedback.js' });

assert.equal(context.AHAIngest.hasCandidateMiddleware('contracts.insightQuality'), true);
assert.equal(context.AHAIngest.hasCandidateMiddleware('chat.insightFeedback'), true);
assert.deepEqual(
  Array.from(context.AHAIngest.listCandidateMiddlewares(), (entry) => entry.id),
  ['chat.insightFeedback', 'contracts.insightQuality'],
  'candidate extensions must be explicit and ordered by priority'
);
assert.equal(context.AHAExplorer.__ahaConversationInsightChangesInstalled, true);

const result = context.AHAIngest.ingestWithCandidates({
  source_type: 'chat',
  source_app: 'aha_chat',
  text: 'En chatmelding om makt, sted og institusjoner.',
  theme_id: 'th_makt',
  subject_id: 'sub_samfunn',
  meta: { field_id: 'field_by' }
}, [
  {
    title: 'Ny innsikt',
    text: 'Makt formes av stedet og institusjonene rundt det.',
    summary: 'Makt og sted henger sammen gjennom institusjoner.',
    candidate_type: 'ai',
    functional_type: 'pattern'
  },
  {
    title: 'Duplikat',
    text: '  Makt   formes av stedet og institusjonene rundt det.  ',
    candidate_type: 'ai',
    functional_type: 'pattern'
  },
  {
    title: 'Eksisterende innsikt',
    text: 'Eksisterende mønster får nytt belegg.',
    summary: 'Institusjoner former handlingsrom.',
    candidate_type: 'semantic',
    functional_type: 'principle'
  }
]);

assert.equal(result.ok, true);
assert.equal(sourceEvents.length, 1, 'one Chat submission must create one canonical source event');
assert.equal(result.items.length, 2, 'dedupe must happen before the real canonical ingest loops candidates');
assert.equal(result.duplicates_skipped, 1);
assert.equal(result.items[0].meta.action, 'created');
assert.equal(result.items[1].meta.action, 'reinforced');
assert.equal(result.analysis_trace.analysisRunId, activeRun.analysisRunId);
assert.equal(result.analysis_trace.conversationId, activeRun.conversationId);
assert.equal(result.analysis_trace.turnId, activeRun.turnId);
assert.equal(result.analysis_trace.sourceHash, activeRun.sourceHash);

const sourceMeta = sourceEvents[0].meta;
assert.equal(sourceMeta.insight_quality_contract.version, 'aha_insight_quality_contract_v1');
assert.equal(sourceMeta.insight_quality_contract.candidate_count, 3);
assert.equal(sourceMeta.insight_quality_contract.unique_candidate_count, 2);
assert.equal(sourceMeta.insight_quality_contract.duplicates_skipped, 1);
assert.equal(sourceMeta.insight_quality_contract.analysis_run_id, activeRun.analysisRunId);
assert.equal(sourceMeta.analysis_trace.analysisRunId, activeRun.analysisRunId);
assert.equal(sourceMeta.analysis_trace.turnId, activeRun.turnId);
assert.equal(sourceMeta.analysis_trace.sourceHash, activeRun.sourceHash);
assert.equal(Object.prototype.hasOwnProperty.call(sourceMeta.analysis_trace, 'sourcePreview'), false,
  'raw source preview must not enter the persisted analysis trace');

const persistedChamber = JSON.parse(storage.get(CHAMBER_KEY));
const createdInsight = persistedChamber.insights.find((item) => item.id === 'ins_new_e2e');
const reinforcedInsight = persistedChamber.insights.find((item) => item.id === 'ins_existing_e2e');
assert.ok(createdInsight && reinforcedInsight, 'real canonical ingest must persist created and reinforced insights');

for (const [insight, action] of [[createdInsight, 'created'], [reinforcedInsight, 'reinforced']]) {
  assert.equal(insight.analysisRunId, activeRun.analysisRunId);
  assert.equal(insight.conversationId, activeRun.conversationId);
  assert.equal(insight.turnId, activeRun.turnId);
  assert.equal(insight.sourceHash, activeRun.sourceHash);
  assert.equal(insight.analysis_provenance.length, 1);
  assert.equal(insight.analysis_provenance[0].analysisRunId, activeRun.analysisRunId);
  assert.equal(insight.analysis_provenance[0].conversationId, activeRun.conversationId);
  assert.equal(insight.analysis_provenance[0].turnId, activeRun.turnId);
  assert.equal(insight.analysis_provenance[0].source_event_id, sourceEvents[0].id);
  assert.equal(insight.analysis_provenance[0].ingest_action, action);
  assert.equal(insight.candidate_provenance.length, 1);
}
assert.equal(createdInsight.candidate_origin, 'ai');
assert.equal(reinforcedInsight.candidate_origin, 'semantic');
assert.doesNotMatch(JSON.stringify(persistedChamber), /PRIVATE RAW CHAT BODY MUST NOT ENTER PROVENANCE/,
  'raw source preview must not leak into chamber provenance');

const changes = context.AHAConversationInsightSnapshot.buildInsightChanges({
  analysisRunId: activeRun.analysisRunId,
  chamberInsights: persistedChamber.insights
});
assert.equal(changes.createdCount, 1);
assert.equal(changes.reinforcedCount, 1);
assert.equal(changes.totalTouched, 2);
assert.deepEqual(Array.from(changes.created, (item) => item.title), ['Ny innsikt']);
assert.deepEqual(Array.from(changes.reinforced, (item) => item.title), ['Eksisterende innsikt']);
assert.doesNotMatch(JSON.stringify(changes), /run_e2e|conversation_e2e|turn_e2e|hash_e2e|ins_new_e2e|ins_existing_e2e/,
  'Snapshot display model must remove technical provenance identifiers');

assert.match(statusNode.textContent, /Innsikter oppdatert · 1 ny · 1 forsterket · 1 duplikat filtrert/,
  'ephemeral Chat feedback must reflect the real ingest result');

const returned = context.AHAExplorer.render({
  analysisRunId: activeRun.analysisRunId,
  chamberInsights: persistedChamber.insights
});
assert.strictEqual(returned, explorerSentinel);
assert.equal(explorerCalls, 1);
const rendered = previewHost.fragments.join('\n') + insightHost.fragments.join('\n');
assert.match(rendered, /Denne analysen · 1 ny · 1 forsterket/);
assert.match(rendered, /Ny innsikt/);
assert.match(rendered, /Eksisterende innsikt/);
assert.doesNotMatch(rendered, /run_e2e|conversation_e2e|turn_e2e|hash_e2e|PRIVATE RAW CHAT BODY MUST NOT ENTER PROVENANCE/,
  'persistent Chat/Explorer surfaces must not reveal technical provenance or raw Chat text');

assert.deepEqual(Array.from(new Set(storageWrites)), [CHAMBER_KEY],
  'end-to-end insight chain must not introduce a second persistence store');

console.log('aha-chat-insight-end-to-end-audit.test.cjs passed');
