const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const helperPath = 'js/ahaConversationInsightSnapshot.js';
const docsPath = 'docs/AHA_CONVERSATION_INSIGHT_SNAPSHOT_V1.md';
const statusPath = 'docs/AHA_IMPLEMENTATION_STATUS.md';

assert.ok(fs.existsSync(helperPath));
assert.equal(fs.existsSync('js/ahaSyncConfirmationGate.js'), false);

const code = fs.readFileSync(helperPath, 'utf8');
const context = { window: {} };
context.window.window = context.window;
vm.runInNewContext(code, context);

const api = context.window.AHAConversationInsightSnapshot;
assert.ok(api, 'AHAConversationInsightSnapshot export exists');
[
  'buildConversationInsightSnapshot',
  'buildSnapshotSignals',
  'normalizeSnapshotInput'
].forEach((name) => assert.equal(typeof api[name], 'function', name));

function labels(snapshot, group) {
  return snapshot.signals[group].map((item) => item.label);
}

function assertNoLeak(snapshot, values) {
  const json = JSON.stringify(snapshot);
  values.forEach((value) => assert.equal(json.includes(value), false, value));
}

const structured = api.buildConversationInsightSnapshot({
  concepts: ['Makt'],
  openQuestions: ['Hva er uklart?'],
  perspectives: ['Borgerperspektiv'],
  tensions: ['Trygghet og frihet'],
  conversationLinks: ['Beslektet samtaletema'],
  nextUnderstandingSteps: ['Avklar begrepene videre'],
  analysis: {
    concepts: ['Analysebegrep'],
    openQuestions: ['Analyse-spørsmål?']
  },
  canonicalAnalysis: {
    concepts: ['Kanonisk begrep'],
    questions: ['Kanonisk spørsmål?'],
    perspectives: ['Kanonisk perspektiv']
  },
  ahaSer: {
    concepts: ['AHA SER begrep'],
    questions: ['AHA SER spørsmål?'],
    tensions: ['AHA SER spenning']
  },
  insightCards: [{ title: 'Trygt insight card' }]
});
assert.ok(labels(structured, 'concepts').includes('Makt'));
assert.ok(labels(structured, 'concepts').includes('Analysebegrep'));
assert.ok(labels(structured, 'concepts').includes('Kanonisk begrep'));
assert.ok(labels(structured, 'concepts').includes('AHA SER begrep'));
assert.ok(labels(structured, 'concepts').includes('Trygt insight card'));
assert.ok(labels(structured, 'openQuestions').includes('Hva er uklart?'));
assert.ok(labels(structured, 'openQuestions').includes('Analyse-spørsmål?'));
assert.ok(labels(structured, 'openQuestions').includes('Kanonisk spørsmål?'));
assert.ok(labels(structured, 'openQuestions').includes('AHA SER spørsmål?'));
assert.ok(labels(structured, 'perspectives').includes('Borgerperspektiv'));
assert.ok(labels(structured, 'perspectives').includes('Kanonisk perspektiv'));
assert.ok(labels(structured, 'tensions').includes('Trygghet og frihet'));
assert.ok(labels(structured, 'tensions').includes('AHA SER spenning'));
assert.ok(labels(structured, 'conversationLinks').includes('Beslektet samtaletema'));
assert.ok(structured.nextUnderstandingSteps.includes('Avklar begrepene videre'));

Object.values(structured.signals).forEach((group) => {
  assert.ok(Array.isArray(group));
  assert.ok(group.length <= 8);
  assert.equal(new Set(group.map((item) => item.label.toLowerCase())).size, group.length);
  group.forEach((item) => {
    assert.equal(/https?:\/\/|www\.|@|userId|rawPayload|privatePayload/i.test(item.label), false, item.label);
    assert.ok(item.label.length <= 80, item.label);
  });
});

const deduped = api.buildConversationInsightSnapshot({ concepts: ['Makt', 'makt', ' MAKT '] });
assert.deepEqual(labels(deduped, 'concepts'), ['Makt']);

const limited = api.buildConversationInsightSnapshot({ concepts: Array.from({ length: 12 }, (_, index) => `Trygt signal ${index}`) });
assert.equal(limited.signals.concepts.length, 8);

const unsafeLabels = ['https://example.com/private', 'www.example.com/path', 'article?id=secret', 'person@example.com'];
const unsafe = api.buildConversationInsightSnapshot({
  concepts: unsafeLabels.concat(['Trygt begrep']),
  openQuestions: unsafeLabels,
  perspectives: unsafeLabels,
  tensions: unsafeLabels,
  conversationLinks: unsafeLabels
});
assertNoLeak(unsafe, unsafeLabels);
assert.deepEqual(labels(unsafe, 'concepts'), ['Trygt begrep']);

const rawValues = [
  'RAW_TEXT_STRUCTURED_SAFETY_SECRET',
  'FULL_TEXT_STRUCTURED_SAFETY_SECRET',
  'TRANSCRIPT_STRUCTURED_SAFETY_SECRET',
  'MESSAGE_TEXT_STRUCTURED_SAFETY_SECRET',
  'PROMPT_STRUCTURED_SAFETY_SECRET',
  'SOURCE_EVENT_TEXT_STRUCTURED_SAFETY_SECRET',
  'EVENT_TEXT_STRUCTURED_SAFETY_SECRET',
  'CANDIDATE_TEXT_STRUCTURED_SAFETY_SECRET',
  'CANDIDATE_PREVIEW_STRUCTURED_SAFETY_SECRET',
  'RAW_PAYLOAD_STRUCTURED_SAFETY_SECRET',
  'PRIVATE_PAYLOAD_STRUCTURED_SAFETY_SECRET',
  'PRIVATE_METADATA_STRUCTURED_SAFETY_SECRET',
  'https://example.com/private/raw-structured-safety',
  'USER_ID_STRUCTURED_SAFETY_SECRET',
  'structured-safety@example.com'
];
const rawSnapshot = api.buildConversationInsightSnapshot({
  rawText: rawValues[0],
  fullText: rawValues[1],
  transcript: rawValues[2],
  messageText: rawValues[3],
  prompt: rawValues[4],
  sourceEvent: { text: rawValues[5], url: rawValues[12] },
  event: { text: rawValues[6] },
  candidate: { text: rawValues[7], previewLabel: rawValues[8] },
  rawPayload: rawValues[9],
  privatePayload: rawValues[10],
  privateMetadata: rawValues[11],
  source: { url: rawValues[12] },
  url: rawValues[12],
  href: rawValues[12],
  userId: rawValues[13],
  email: rawValues[14],
  concepts: ['Trygt strukturert begrep']
});
assertNoLeak(rawSnapshot, rawValues);

const fallbackSummary = api.buildConversationInsightSnapshot({ transcript: 'RAW_TRANSCRIPT_SUMMARY_SECRET' });
assertNoLeak(fallbackSummary, ['RAW_TRANSCRIPT_SUMMARY_SECRET']);
assert.ok(fallbackSummary.summary.headline);
assert.ok(fallbackSummary.summary.shortDescription);

const quality = api.buildConversationInsightSnapshot({
  quality: { sourceBound: true, topicConsistent: 'failed', staleDataGuarded: 'ok', invalidDetails: 'QUALITY_INVALID_SECRET' },
  sourceBinding: { status: 'valid', excerpt: 'QUALITY_EXCERPT_SECRET', url: 'https://example.com/private/quality' },
  topicConsistency: { valid: false, sourceExcerpt: 'TOPIC_EXCERPT_SECRET', sourceUrl: 'https://example.com/private/topic' }
});
assert.deepEqual(quality.quality, { sourceBound: true, topicConsistent: false, staleDataGuarded: true });
assertNoLeak(quality, ['QUALITY_INVALID_SECRET', 'QUALITY_EXCERPT_SECRET', 'TOPIC_EXCERPT_SECRET', 'https://example.com/private/quality', 'https://example.com/private/topic']);

const actionSteps = [
  'Sync now', 'Start sync', 'Kjør sync', 'Approve', 'Reject', 'Godkjenn', 'Avvis',
  'Publish', 'Share', 'Send', 'Connect EchoNet', 'Export', 'Save to memory', 'PR', 'repo'
];
const actionSnapshot = api.buildConversationInsightSnapshot({ nextUnderstandingSteps: actionSteps.concat(['Undersøk begrepet videre']) });
assertNoLeak(actionSnapshot, actionSteps);
assert.ok(actionSnapshot.nextUnderstandingSteps.includes('Undersøk begrepet videre'));
assert.ok(actionSnapshot.nextUnderstandingSteps.includes('Samle flere strukturerte signaler før AHA trekker tydeligere mønstre.'));

[
  'localStorage.setItem', 'localStorage.removeItem', 'localStorage.getItem', 'fetch(',
  'XMLHttpRequest', 'sendBeacon', 'supabase.', 'insert(', 'update(', 'upsert(',
  'delete(', 'executeSync', 'runSync', 'performSync', 'startSync', 'manualSync',
  'autoSync', 'backgroundSync', 'publish', 'share', 'approveCandidate',
  'rejectCandidate', 'approvalAction'
].forEach((term) => assert.equal(code.includes(term), false, term));
[
  'phase', 'priority', 'health', 'nextPr', 'repoStatus', 'buildStage', 'projectRoadmap'
].forEach((term) => assert.equal(code.includes(term), false, term));

const combinedDocs = `${fs.readFileSync(docsPath, 'utf8')}\n${fs.readFileSync(statusPath, 'utf8')}`;
[
  /structured signals|strukturerte signaler/i,
  /read-only/i,
  /local-only/i,
  /no-sync|ingen sync/i,
  /ingen raw user text|ingen rå brukerdata|raw user text|raw text/i,
  /ingen URL-er|private URL-er|private URLs|URL-er/i,
  /ingen userId\/email|userId\/email|user identifiers|brukeridentifikatorer/i,
  /ingen approval actions|approval actions|approval action/i,
  /ingen EchoNet|EchoNet/i,
  /UI-kontrakten er uendret|UI contract is unchanged|UI.*unchanged/i
].forEach((pattern) => assert.match(combinedDocs, pattern));

console.log('aha-conversation-insight-snapshot-structured-signals-safety tests passed');
