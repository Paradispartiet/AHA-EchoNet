const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const helperPath = 'js/ahaConversationInsightSnapshot.js';
assert.equal(fs.existsSync(helperPath), true, 'builder file exists');
const code = fs.readFileSync(helperPath, 'utf8');
const context = { window: {} };
context.window.window = context.window;
vm.runInNewContext(code, context);

const api = context.window.AHAConversationInsightSnapshot;
assert.ok(api, 'AHAConversationInsightSnapshot export exists');
assert.equal(typeof api.buildConversationInsightSnapshot, 'function');
assert.equal(typeof api.buildSnapshotSignals, 'function');

const topLevel = api.buildConversationInsightSnapshot({
  concepts: ['Begrep A'],
  openQuestions: ['Hva betyr A?'],
  perspectives: ['Lærerperspektiv'],
  tensions: ['Nyttig ↔ uklart'],
  conversationLinks: ['Samtale om læring'],
  nextUnderstandingSteps: ['Sammenlign begrepene rolig']
});
assert.deepEqual(topLevel.signals.concepts.map((item) => item.label), ['Begrep A']);
assert.deepEqual(topLevel.signals.openQuestions.map((item) => item.label), ['Hva betyr A?']);
assert.deepEqual(topLevel.signals.perspectives.map((item) => item.label), ['Lærerperspektiv']);
assert.deepEqual(topLevel.signals.tensions.map((item) => item.label), ['Nyttig ↔ uklart']);
assert.deepEqual(topLevel.signals.conversationLinks.map((item) => item.label), ['Samtale om læring']);
assert.ok(topLevel.nextUnderstandingSteps.includes('Sammenlign begrepene rolig'));

const nested = api.buildConversationInsightSnapshot({
  analysis: {
    concepts: ['Analysebegrep'],
    questions: ['Analyse-spørsmål?'],
    perspectives: [{ label: 'Analyseperspektiv', confidence: 'high' }],
    tensions: ['Analysespenning'],
    conversationLinks: ['Analyse-kobling']
  },
  canonicalAnalysis: {
    concepts: ['Kanonisk begrep'],
    questions: ['Kanonisk spørsmål?'],
    fieldConnections: ['Kanonisk fagkobling'],
    mainTension: 'Kanonisk spenning',
    historyGoLinks: ['Kanonisk samtalekobling'],
    suggestedActions: ['Kanonisk neste forståelsessteg']
  },
  ahaSer: {
    concepts: ['AHA SER begrep'],
    openQuestions: ['AHA SER åpent spørsmål?'],
    fagkoblinger: ['AHA SER fagkobling'],
    hovedspenning: 'AHA SER hovedspenning',
    nesteSteg: 'AHA SER neste steg'
  },
  insightCards: [{ title: 'Strukturert insight card' }]
});
const labels = (field) => nested.signals[field].map((item) => item.label);
assert.ok(labels('concepts').includes('Analysebegrep'));
assert.ok(labels('concepts').includes('Kanonisk begrep'));
assert.ok(labels('concepts').includes('Kanonisk fagkobling'));
assert.ok(labels('concepts').includes('AHA SER begrep'));
assert.ok(labels('concepts').includes('AHA SER fagkobling'));
assert.ok(labels('concepts').includes('Strukturert insight card'));
assert.ok(labels('openQuestions').includes('Analyse-spørsmål?'));
assert.ok(labels('openQuestions').includes('Kanonisk spørsmål?'));
assert.ok(labels('openQuestions').includes('AHA SER åpent spørsmål?'));
assert.ok(labels('perspectives').includes('Analyseperspektiv'));
assert.ok(labels('tensions').includes('Analysespenning'));
assert.ok(labels('tensions').includes('Kanonisk spenning'));
assert.ok(labels('tensions').includes('AHA SER hovedspenning'));
assert.ok(labels('conversationLinks').includes('Analyse-kobling'));
assert.ok(labels('conversationLinks').includes('Kanonisk samtalekobling'));
assert.ok(nested.nextUnderstandingSteps.includes('Kanonisk neste forståelsessteg'));
assert.ok(nested.nextUnderstandingSteps.includes('AHA SER neste steg'));

const deduped = api.buildConversationInsightSnapshot({ concepts: ['Begrep', ' begrep ', 'BEGREP', 'Annet'] });
assert.deepEqual(deduped.signals.concepts.map((item) => item.label), ['Begrep', 'Annet']);

const limited = api.buildConversationInsightSnapshot({ concepts: Array.from({ length: 12 }, (_, index) => `Konsept ${index}`) });
assert.equal(limited.signals.concepts.length, 8);

const longLabel = 'Dette er en lang strukturert norsk label som skal kuttes trygt uten å lekke noe sensitivt eller bli for lang i snapshotet';
const sanitized = api.buildConversationInsightSnapshot({ concepts: [longLabel] });
assert.ok(sanitized.signals.concepts[0].label.length <= 80);

const unsafeSignalSnapshot = api.buildConversationInsightSnapshot({
  concepts: ['Trygt', 'https://private.example/signal', 'www.example.test/path', 'person@example.test'],
  openQuestions: ['file:///secret.txt', 'Hva er trygt?'],
  perspectives: ['http://localhost:3000/private', 'Rolig perspektiv'],
  tensions: ['rawPayload', 'Trygg spenning'],
  conversationLinks: ['source.url', 'Sikker kobling']
});
const unsafeJson = JSON.stringify(unsafeSignalSnapshot);
['https://private.example/signal', 'www.example.test/path', 'person@example.test', 'file:///secret.txt', 'http://localhost:3000/private', 'rawPayload', 'source.url'].forEach((value) => {
  assert.equal(unsafeJson.includes(value), false, value);
});
assert.ok(unsafeSignalSnapshot.signals.concepts.some((item) => item.label === 'Trygt'));

const rawValues = [
  'RAW_STRUCTURED_TEXT_SECRET',
  'FULL_STRUCTURED_TEXT_SECRET',
  'TRANSCRIPT_STRUCTURED_SECRET',
  'MESSAGE_STRUCTURED_SECRET',
  'PROMPT_STRUCTURED_SECRET',
  'SOURCE_EVENT_STRUCTURED_SECRET',
  'EVENT_STRUCTURED_SECRET',
  'CANDIDATE_STRUCTURED_SECRET',
  'RAW_PAYLOAD_STRUCTURED_SECRET',
  'PRIVATE_PAYLOAD_STRUCTURED_SECRET',
  'PRIVATE_METADATA_STRUCTURED_SECRET',
  'https://private.example/raw-structured',
  'USER_ID_STRUCTURED_SECRET',
  'structured.person@example.test'
];
const rawSnapshot = api.buildConversationInsightSnapshot({
  rawText: rawValues[0],
  fullText: rawValues[1],
  transcript: rawValues[2],
  messageText: rawValues[3],
  prompt: rawValues[4],
  sourceEvent: { text: rawValues[5], url: rawValues[11] },
  event: { text: rawValues[6] },
  candidate: { text: rawValues[7], previewLabel: 'CANDIDATE_PREVIEW_STRUCTURED_SECRET' },
  rawPayload: rawValues[8],
  privatePayload: rawValues[9],
  privateMetadata: rawValues[10],
  source: { url: rawValues[11] },
  userId: rawValues[12],
  email: rawValues[13],
  concepts: ['Trygt strukturert begrep']
});
const rawJson = JSON.stringify(rawSnapshot);
rawValues.concat(['CANDIDATE_PREVIEW_STRUCTURED_SECRET']).forEach((value) => assert.equal(rawJson.includes(value), false, value));

const quality = api.buildConversationInsightSnapshot({
  quality: { sourceBound: true, topicConsistent: 'failed', staleDataGuarded: 'ok', invalidFields: ['SECRET_FIELD'] },
  sourceBinding: { valid: false, excerpt: 'SECRET_EXCERPT', url: 'https://private.example/source' },
  topicConsistency: { status: 'valid', matchedForbiddenTerms: ['SECRET_TERM'] }
});
assert.deepEqual(quality.quality, { sourceBound: true, topicConsistent: false, staleDataGuarded: true });
assert.equal(JSON.stringify(quality).includes('SECRET'), false);
assert.equal(JSON.stringify(quality).includes('https://private.example/source'), false);

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

console.log('aha-conversation-insight-snapshot-structured-signals tests passed');
