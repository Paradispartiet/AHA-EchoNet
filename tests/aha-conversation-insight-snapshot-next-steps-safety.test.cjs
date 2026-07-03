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
  'buildNextUnderstandingSteps'
].forEach((name) => assert.equal(typeof api[name], 'function', name));

function build(input) {
  return api.buildConversationInsightSnapshot(input);
}

function stepsJson(snapshot) {
  return JSON.stringify(snapshot.nextUnderstandingSteps);
}

function assertSnapshotContract(snapshot) {
  assert.equal(snapshot.version, 'aha_conversation_insight_snapshot_v1');
  assert.equal(snapshot.localOnly, true);
  assert.equal(snapshot.readOnly, true);
  assert.equal(snapshot.noSync, true);
  assert.equal(snapshot.safety.syncAvailable, false);
  assert.equal(snapshot.safety.approvalActionAvailable, false);
}

function assertSafeStepShape(snapshot) {
  assert.ok(Array.isArray(snapshot.nextUnderstandingSteps));
  assert.ok(snapshot.nextUnderstandingSteps.length > 0);
  assert.ok(snapshot.nextUnderstandingSteps.length <= 5, snapshot.nextUnderstandingSteps.join('\n'));
  assert.equal(
    new Set(snapshot.nextUnderstandingSteps.map((step) => step.toLowerCase())).size,
    snapshot.nextUnderstandingSteps.length
  );
  snapshot.nextUnderstandingSteps.forEach((step) => {
    assert.equal(typeof step, 'string');
    assert.ok(step.trim().length > 0, 'step is not empty');
    assert.ok(step.length <= 140, step);
  });
}

function assertNoForbiddenStepLanguage(snapshot) {
  const json = stepsJson(snapshot);
  [
    'Sync now',
    'Start sync',
    'Kjør sync',
    'Synk',
    'Approve',
    'Reject',
    'Godkjenn',
    'Avvis',
    'Publish',
    'Share',
    'Send',
    'Connect EchoNet',
    'Export',
    'Save to memory',
    'Lagre',
    'Opprett',
    'Klikk',
    'PR',
    'repo',
    'sprint',
    'phase',
    'priority',
    'roadmap'
  ].forEach((term) => assert.equal(json.toLowerCase().includes(term.toLowerCase()), false, term));
}

function assertNoLeak(snapshot, values) {
  const json = stepsJson(snapshot);
  values.forEach((value) => assert.equal(json.includes(value), false, value));
  assert.equal(/https?:\/\/|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|user[_-]?12345/i.test(json), false, json);
}

function assertSafe(snapshot, rawValues = []) {
  assertSnapshotContract(snapshot);
  assertSafeStepShape(snapshot);
  assertNoForbiddenStepLanguage(snapshot);
  assertNoLeak(snapshot, rawValues);
}

const empty = build();
assertSafe(empty);
assert.match(stepsJson(empty), /strukturerte signaler/i);

const structured = build({
  concepts: ['Makt', 'Tillit'],
  openQuestions: ['Hva bør avklares?'],
  perspectives: ['Borgerperspektiv'],
  tensions: ['Trygghet og frihet'],
  conversationLinks: ['Beslektet samtaletema'],
  quality: { sourceBound: false, topicConsistent: false }
});
assertSafe(structured);
const structuredText = stepsJson(structured);
[
  /spørsmål/i,
  /begrep/i,
  /spenning/i,
  /perspektiv/i,
  /samtalekobling/i
].forEach((pattern) => assert.match(structuredText, pattern));

const weakQuality = build({
  sourceBinding: { status: 'failed' },
  topicConsistency: { status: 'mismatch' }
});
assertSafe(weakQuality);
assert.match(stepsJson(weakQuality), /kilde/i);

const rawValues = [
  'RAW_NEXT_STEPS_SAFETY_TEXT_SECRET',
  'FULL_NEXT_STEPS_SAFETY_TEXT_SECRET',
  'TRANSCRIPT_NEXT_STEPS_SAFETY_SECRET',
  'MESSAGE_NEXT_STEPS_SAFETY_SECRET',
  'PROMPT_NEXT_STEPS_SAFETY_SECRET',
  'SOURCE_EVENT_NEXT_STEPS_SAFETY_SECRET',
  'EVENT_NEXT_STEPS_SAFETY_SECRET',
  'CANDIDATE_NEXT_STEPS_SAFETY_SECRET',
  'CANDIDATE_PREVIEW_NEXT_STEPS_SAFETY_SECRET',
  'RAW_PAYLOAD_NEXT_STEPS_SAFETY_SECRET',
  'PRIVATE_PAYLOAD_NEXT_STEPS_SAFETY_SECRET',
  'PRIVATE_METADATA_NEXT_STEPS_SAFETY_SECRET',
  'https://example.com/private',
  'www.example.com/secret',
  'user_12345',
  'person@example.com'
];
const rawSnapshot = build({
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
  href: rawValues[13],
  userId: rawValues[14],
  email: rawValues[15],
  concepts: ['Trygt begrep', rawValues[12], rawValues[15]],
  openQuestions: [rawValues[13], 'Hva er trygt å avklare?'],
  perspectives: [rawValues[14], 'Trygt perspektiv'],
  tensions: ['Trygg spenning'],
  conversationLinks: ['Trygg samtalekobling']
});
assertSafe(rawSnapshot, rawValues);

const explicitUnsafe = build({
  nextUnderstandingSteps: [
    'Sync now',
    'Start sync',
    'Kjør sync',
    'Synk nå',
    'Approve',
    'Reject',
    'Godkjenn',
    'Avvis',
    'Publish',
    'Share',
    'Send',
    'Connect EchoNet',
    'Export',
    'Save to memory',
    'Lagre funn',
    'Opprett sak',
    'Klikk her',
    'PR',
    'repo',
    'sprint',
    'phase',
    'priority',
    'roadmap',
    'https://example.com/private',
    'person@example.com',
    'user_12345'
  ],
  concepts: ['Trygt begrep']
});
assertSafe(explicitUnsafe, ['https://example.com/private', 'person@example.com', 'user_12345']);
assert.match(stepsJson(explicitUnsafe), /begrep/i);

[
  'localStorage.setItem',
  'localStorage.removeItem',
  'localStorage.getItem',
  'fetch(',
  'XMLHttpRequest',
  'sendBeacon',
  'supabase.',
  'insert(',
  'update(',
  'upsert(',
  'delete(',
  'executeSync',
  'runSync',
  'performSync',
  'startSync',
  'manualSync',
  'autoSync',
  'backgroundSync',
  'publish',
  'share',
  'approveCandidate',
  'rejectCandidate',
  'approvalAction'
].forEach((term) => assert.equal(code.includes(term), false, term));
[
  'phase',
  'priority',
  'health',
  'nextPr',
  'repoStatus',
  'buildStage',
  'projectRoadmap'
].forEach((term) => assert.equal(code.includes(term), false, term));

const snapshotDoc = fs.readFileSync(docsPath, 'utf8');
const statusDoc = fs.readFileSync(statusPath, 'utf8');
[snapshotDoc, statusDoc].forEach((doc) => {
  [
    /nextUnderstandingSteps|forståelsessteg/i,
    /structured signals|strukturerte signaler/i,
    /read-only/i,
    /local-only/i,
    /no-sync|ingen sync/i,
    /forståelsessteg, ikke actions|understanding prompts only|forståelsessteg.*ikke actions/i,
    /ingen raw user text|ingen rå brukerdata|raw user text|raw text/i,
    /ingen URL-er|private URL-er|private URLs|URL-er/i,
    /ingen userId\/email|userId\/email|user identifiers|brukeridentifikatorer/i,
    /ingen approval actions|approval actions|approval action/i,
    /ingen EchoNet|EchoNet/i,
    /AHA Sync Overview V1 (er )?(fortsatt )?(uendret|unchanged|remains frozen)|AHA Sync Overview V1 remains frozen/i
  ].forEach((pattern) => assert.match(doc, pattern));
});

console.log('aha-conversation-insight-snapshot-next-steps-safety tests passed');
