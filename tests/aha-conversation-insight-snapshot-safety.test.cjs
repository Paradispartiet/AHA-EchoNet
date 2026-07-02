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
  'normalizeSnapshotInput',
  'buildSnapshotSummary',
  'buildSnapshotSignals',
  'buildNextUnderstandingSteps',
  'buildSnapshotSafety'
].forEach((name) => assert.equal(typeof api[name], 'function', name));

function assertSnapshotContract(snapshot) {
  assert.equal(snapshot.version, 'aha_conversation_insight_snapshot_v1');
  assert.equal(snapshot.localOnly, true);
  assert.equal(snapshot.readOnly, true);
  assert.equal(snapshot.noSync, true);
  assert.equal(snapshot.sourceScope, 'current_conversation_or_analysis');
  assert.ok(snapshot.summary);
  assert.ok(snapshot.signals);
  assert.ok(snapshot.safety);
  assert.ok(snapshot.quality);
  assert.ok(snapshot.nextUnderstandingSteps);
  assert.equal(snapshot.safety.rawUserTextIncluded, false);
  assert.equal(snapshot.safety.privateUrlsIncluded, false);
  assert.equal(snapshot.safety.userIdentifiersIncluded, false);
  assert.equal(snapshot.safety.approvalActionAvailable, false);
  assert.equal(snapshot.safety.syncAvailable, false);
}

const empty = api.buildConversationInsightSnapshot();
assertSnapshotContract(empty);
assert.ok(Array.isArray(empty.nextUnderstandingSteps));
assert.ok(empty.summary.headline);
assert.ok(empty.summary.shortDescription);

const rawValues = [
  'RAW_TEXT_SECRET_SNAPSHOT',
  'FULL_TEXT_SECRET_SNAPSHOT',
  'TRANSCRIPT_SECRET_SNAPSHOT',
  'MESSAGE_TEXT_SECRET_SNAPSHOT',
  'SOURCE_EVENT_TEXT_SECRET_SNAPSHOT',
  'EVENT_TEXT_SECRET_SNAPSHOT',
  'CANDIDATE_TEXT_SECRET_SNAPSHOT',
  'PRIVATE_PAYLOAD_SECRET_SNAPSHOT',
  'RAW_PAYLOAD_SECRET_SNAPSHOT',
  'PRIVATE_METADATA_SECRET_SNAPSHOT',
  'https://private.example/snapshot-secret',
  'USER_ID_SECRET_SNAPSHOT',
  'snapshot.person@example.test',
  'PROMPT_SECRET_SNAPSHOT'
];
const rawSnapshot = api.buildConversationInsightSnapshot({
  rawText: rawValues[0],
  fullText: rawValues[1],
  transcript: rawValues[2],
  messageText: rawValues[3],
  sourceEvent: { text: rawValues[4], url: rawValues[10] },
  event: { text: rawValues[5] },
  candidate: { text: rawValues[6] },
  privatePayload: rawValues[7],
  rawPayload: rawValues[8],
  privateMetadata: rawValues[9],
  source: { url: rawValues[10] },
  userId: rawValues[11],
  email: rawValues[12],
  prompt: rawValues[13],
  concepts: ['Trygt strukturert begrep']
});
assertSnapshotContract(rawSnapshot);
const rawJson = JSON.stringify(rawSnapshot);
rawValues.forEach((value) => assert.equal(rawJson.includes(value), false, value));

const structured = api.buildConversationInsightSnapshot({
  concepts: ['Begrep', 'Begrep', { label: 'Nytt begrep', confidence: 'high' }],
  openQuestions: ['Hva bør avklares?'],
  perspectives: ['Et rolig perspektiv'],
  tensions: ['En trygg spenning'],
  conversationLinks: ['Beslektet samtaletema'],
  nextUnderstandingSteps: ['Undersøk begrepet nærmere']
});
assert.deepEqual(structured.signals.concepts.map((item) => item.label), ['Begrep', 'Nytt begrep']);
assert.equal(structured.signals.openQuestions[0].label, 'Hva bør avklares?');
assert.equal(structured.signals.perspectives[0].label, 'Et rolig perspektiv');
assert.equal(structured.signals.tensions[0].label, 'En trygg spenning');
assert.equal(structured.signals.conversationLinks[0].label, 'Beslektet samtaletema');
assert.ok(structured.nextUnderstandingSteps.includes('Undersøk begrepet nærmere'));

const unsafeTerms = [
  'RAW_SIGNAL_TEXT_SECRET',
  'https://private.example/signal',
  'signal.person@example.test',
  'USER_ID_SIGNAL_SECRET',
  'rawPayload',
  'privatePayload'
];
const signalSafety = api.buildConversationInsightSnapshot({
  concepts: Array.from({ length: 12 }, (_, index) => `Konsept ${index}`).concat([
    'Konsept 1',
    unsafeTerms[0],
    unsafeTerms[1],
    unsafeTerms[2],
    unsafeTerms[3],
    unsafeTerms[4],
    unsafeTerms[5]
  ]),
  openQuestions: ['Åpent spørsmål?', 'Åpent spørsmål?'],
  perspectives: ['Perspektiv', 'https://private.example/perspective'],
  tensions: ['Spenning', 'signal.person@example.test'],
  conversationLinks: ['Samtaletema', 'rawPayload']
});
Object.entries(signalSafety.signals).forEach(([field, items]) => {
  assert.ok(Array.isArray(items), `${field} is array`);
  assert.ok(items.length <= 8, `${field} is limited`);
  assert.equal(new Set(items.map((item) => item.label.toLowerCase())).size, items.length, `${field} is deduped`);
  const json = JSON.stringify(items);
  unsafeTerms.forEach((term) => assert.equal(json.includes(term), false, `${field} leaked ${term}`));
  assert.equal(/https?:\/\//i.test(json), false, `${field} leaked URL`);
  assert.equal(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(json), false, `${field} leaked email`);
});

const summary = api.buildConversationInsightSnapshot({
  headline: 'Kort trygg headline',
  shortDescription: 'Kort trygg beskrivelse uten sensitive detaljer.',
  concepts: ['Begrep']
}).summary;
assert.ok(summary.headline);
assert.ok(summary.shortDescription);
assert.ok(summary.headline.length <= 90);
assert.ok(summary.shortDescription.length <= 240);
assert.equal(JSON.stringify(summary).includes('https://'), false);
assert.equal(JSON.stringify(summary).includes('@example.test'), false);
assert.equal(JSON.stringify(summary).includes('USER_ID'), false);

const unsafeSummary = api.buildConversationInsightSnapshot({
  headline: 'https://private.example/headline',
  shortDescription: 'Kontakt snapshot.person@example.test eller USER_ID_SECRET_SNAPSHOT'
}).summary;
assert.equal(JSON.stringify(unsafeSummary).includes('https://private.example/headline'), false);
assert.equal(JSON.stringify(unsafeSummary).includes('snapshot.person@example.test'), false);
assert.equal(JSON.stringify(unsafeSummary).includes('USER_ID_SECRET_SNAPSHOT'), false);

const blockedSteps = api.buildConversationInsightSnapshot({
  nextUnderstandingSteps: [
    'Sync now', 'Start sync', 'Kjør sync', 'Approve', 'Reject', 'Godkjenn', 'Avvis',
    'Publish', 'Share', 'Send', 'Connect EchoNet', 'PR', 'repo', 'Sammenlign begrepene rolig'
  ]
}).nextUnderstandingSteps;
['Sync now', 'Start sync', 'Kjør sync', 'Approve', 'Reject', 'Godkjenn', 'Avvis', 'Publish', 'Share', 'Send', 'Connect EchoNet', 'PR', 'repo'].forEach((term) => {
  assert.equal(blockedSteps.includes(term), false, term);
});
assert.ok(blockedSteps.includes('Sammenlign begrepene rolig'));

const quality = api.buildConversationInsightSnapshot({
  quality: {
    sourceBound: true,
    staleDataGuarded: 'failed',
    invalid: 'QUALITY_INVALID_SECRET',
    sourceExcerpt: 'QUALITY_EXCERPT_SECRET',
    sourceUrl: 'https://private.example/quality'
  },
  sourceBinding: { status: 'verified', excerpt: 'SOURCE_EXCERPT_SECRET', url: 'https://private.example/source' },
  topicConsistency: { valid: false, sourceExcerpt: 'TOPIC_EXCERPT_SECRET', sourceUrl: 'https://private.example/topic' }
});
assert.deepEqual(quality.quality, { sourceBound: true, topicConsistent: false, staleDataGuarded: false });
const qualityJson = JSON.stringify(quality);
['QUALITY_INVALID_SECRET', 'QUALITY_EXCERPT_SECRET', 'SOURCE_EXCERPT_SECRET', 'TOPIC_EXCERPT_SECRET', 'https://private.example/quality', 'https://private.example/source', 'https://private.example/topic'].forEach((value) => {
  assert.equal(qualityJson.includes(value), false, value);
});

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

[docsPath, statusPath].forEach((path) => assert.ok(fs.existsSync(path), `${path} exists`));
const docsText = fs.readFileSync(docsPath, 'utf8').toLowerCase();
const statusText = fs.readFileSync(statusPath, 'utf8').toLowerCase();
const combinedDocs = `${docsText}\n${statusText}`;
[
  'aha conversation insight snapshot v1',
  'read-only',
  'local-only',
  'ui not started'
].forEach((term) => assert.ok(combinedDocs.includes(term), term));
assert.ok(combinedDocs.includes('no-sync') || combinedDocs.includes('ingen sync'), 'no-sync documented');
assert.ok(/runtime.*builder|builder.*implemented|builder implementert|runtime\/builder implementert/i.test(combinedDocs), 'runtime/builder implemented documented');
assert.ok(combinedDocs.includes('ingen raw user text') || combinedDocs.includes('ingen rå brukerdata') || combinedDocs.includes('raw user text'), 'raw user text forbidden documented');
assert.ok(combinedDocs.includes('ingen echonet') || combinedDocs.includes('does not activate echonet') || combinedDocs.includes('no echonet'), 'no EchoNet documented');
assert.ok(combinedDocs.includes('ingen approval action') || combinedDocs.includes('no approval action') || combinedDocs.includes('does not add approval actions'), 'no approval action documented');

console.log('aha-conversation-insight-snapshot safety tests passed');
