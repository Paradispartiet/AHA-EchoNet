const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const snapshotCode = fs.readFileSync('js/ahaConversationInsightSnapshot.js', 'utf8');
const feedbackCode = fs.readFileSync('js/ahaChatInsightFeedback.js', 'utf8');

function loadSnapshot() {
  const context = { console, Set, Array, Object, String, Number, RegExp };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(snapshotCode, context, { filename: 'js/ahaConversationInsightSnapshot.js' });
  return context.AHAConversationInsightSnapshot;
}

const snapshotApi = loadSnapshot();
assert.ok(snapshotApi, 'snapshot API should load');

const chamberInsights = [
  {
    id: 'ins-created',
    title: 'Ny innsikt',
    summary: 'Et trygt sammendrag av den nye innsikten.',
    strength: { evidence_count: 2, total_score: 4 },
    analysis_provenance: [
      { analysisRunId: 'run-current-secret', conversationId: 'conversation-secret', sourceHash: 'hash-secret', ingest_action: 'created', raw_source_text: 'PRIVATE RAW CHAT BODY' },
      { analysisRunId: 'run-current-secret', conversationId: 'conversation-secret', sourceHash: 'hash-secret', ingest_action: 'created' }
    ]
  },
  {
    id: 'ins-reinforced',
    title: 'Forsterket innsikt',
    summary: 'Denne innsikten fikk nytt belegg i analysen.',
    analysis_provenance: [
      { analysisRunId: 'run-current-secret', ingest_action: 'reinforced' }
    ]
  },
  {
    id: 'ins-created-dominates',
    title: 'Opprettet og senere forsterket',
    summary: 'Samme run skal vise denne som ny, ikke dobbelt.',
    analysis_provenance: [
      { analysisRunId: 'run-current-secret', ingest_action: 'created' },
      { analysisRunId: 'run-current-secret', ingest_action: 'reinforced' }
    ]
  },
  {
    id: 'ins-other-run',
    title: 'Skal ikke vises',
    summary: 'Denne hører til en annen analyse.',
    analysis_provenance: [
      { analysisRunId: 'run-other-secret', ingest_action: 'created' }
    ]
  }
];

const changes = snapshotApi.buildInsightChanges({
  analysisRunId: 'run-current-secret',
  chamberInsights
});
assert.equal(changes.createdCount, 2, 'created insights should be counted once each');
assert.equal(changes.reinforcedCount, 1, 'reinforced insight should be counted once');
assert.equal(changes.totalTouched, 3);
assert.deepEqual(Array.from(changes.created, (item) => item.title), ['Ny innsikt', 'Opprettet og senere forsterket']);
assert.deepEqual(Array.from(changes.reinforced, (item) => item.title), ['Forsterket innsikt']);
assert.equal(changes.created[0].evidenceCount, 2);
assert.equal(changes.created[0].totalScore, 4);

const serializedChanges = JSON.stringify(changes);
assert.doesNotMatch(serializedChanges, /run-current-secret|run-other-secret|conversation-secret|hash-secret|PRIVATE RAW CHAT BODY/,
  'display-safe insight changes must not contain technical provenance or raw source text');
assert.doesNotMatch(serializedChanges, /ins-created|ins-reinforced|ins-other-run/,
  'display-safe insight changes should not expose internal insight IDs');

const snapshot = snapshotApi.buildConversationInsightSnapshot({
  analysisRunId: 'run-current-secret',
  chamberInsights,
  headline: 'Trygg samtale',
  concepts: ['mønster']
});
assert.equal(snapshot.localOnly, true);
assert.equal(snapshot.readOnly, true);
assert.equal(snapshot.noSync, true);
assert.equal(snapshot.safety.technicalProvenanceIncluded, false);
assert.equal(snapshot.insightChanges.totalTouched, 3);
assert.equal(snapshotApi.buildInsightChanges({ chamberInsights }).totalTouched, 0,
  'snapshot must fail closed when current analysisRunId is missing');

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

const statusNode = { textContent: '' };
const explorerNode = {};
const nowHost = new MockHost();
const previewHost = new MockHost();
nowHost.preview = previewHost;
const insightHost = new MockHost();
let originalExplorerCalls = 0;
const sentinel = { rendered: true };
const timers = [];
const context = {
  console,
  Map,
  Set,
  Array,
  Object,
  String,
  Number,
  RegExp,
  AHAConversationInsightSnapshot: snapshotApi,
  AHAIngest: {
    ingestWithCandidates() { return { items: [] }; }
  },
  AHAExplorer: {
    render() {
      originalExplorerCalls += 1;
      previewHost.fragments = [];
      insightHost.fragments = [];
      return sentinel;
    }
  },
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
  setTimeout(callback) { timers.push(callback); return timers.length; }
};
context.window = context;
vm.createContext(context);
vm.runInContext(feedbackCode, context, { filename: 'js/ahaChatInsightFeedback.js' });

assert.equal(context.AHAExplorer.__ahaConversationInsightChangesInstalled, true,
  'Chat adapter should wrap the existing Explorer surface');
const returned = context.AHAExplorer.render({ analysisRunId: 'run-current-secret', chamberInsights });
assert.strictEqual(returned, sentinel, 'Explorer wrapper must preserve original render return');
assert.equal(originalExplorerCalls, 1);
const rendered = previewHost.fragments.join('\n') + insightHost.fragments.join('\n');
assert.match(rendered, /Denne analysen · 2 nye · 1 forsterket/);
assert.match(rendered, /Nye innsikter fra denne analysen/);
assert.match(rendered, /Forsterket i denne analysen/);
assert.match(rendered, /Ny innsikt/);
assert.match(rendered, /Forsterket innsikt/);
assert.doesNotMatch(rendered, /Skal ikke vises|run-current-secret|run-other-secret|conversation-secret|hash-secret|PRIVATE RAW CHAT BODY/);

context.AHAExplorer.render({ analysisRunId: 'run-current-secret', chamberInsights });
assert.equal(originalExplorerCalls, 2);
assert.equal((insightHost.fragments.join('\n').match(/Denne analysen · 2 nye · 1 forsterket/g) || []).length, 1,
  'rerender should not duplicate the persisted conversation-change surface');

let forbiddenIngestReads = 0;
let forbiddenExplorerReads = 0;
const isolated = {
  console,
  Map,
  Set,
  Array,
  Object,
  String,
  Number,
  RegExp,
  document: {
    readyState: 'complete',
    getElementById() { return null; },
    addEventListener() {}
  },
  setTimeout(callback) { callback(); return 1; },
  AHAIngest: new Proxy({}, { get() { forbiddenIngestReads += 1; throw new Error('AHAIngest must stay isolated'); } }),
  AHAExplorer: new Proxy({}, { get() { forbiddenExplorerReads += 1; throw new Error('AHAExplorer must stay isolated'); } })
};
isolated.window = isolated;
vm.createContext(isolated);
vm.runInContext(feedbackCode, isolated, { filename: 'js/ahaChatInsightFeedback.js' });
assert.equal(forbiddenIngestReads, 0, 'non-Chat surface must be checked before AHAIngest is read');
assert.equal(forbiddenExplorerReads, 0, 'non-Chat surface must be checked before AHAExplorer is read');

assert.equal(/localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(snapshotCode + feedbackCode), false,
  'snapshot and presentation must remain read-only');
assert.equal(/\bfetch\s*\(/.test(snapshotCode + feedbackCode), false,
  'snapshot and presentation must not fetch');
assert.equal(/AHARepository|EchoNet|supabase|syncFromDatabase|autoSync/i.test(snapshotCode + feedbackCode), false,
  'snapshot and presentation must not activate backend, sync or EchoNet');

console.log('aha-conversation-insight-changes.test.cjs passed');
