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
[
  'buildConversationInsightSnapshot',
  'buildNextUnderstandingSteps'
].forEach((name) => assert.equal(typeof api[name], 'function', name));

function stepsFor(input) {
  return api.buildConversationInsightSnapshot(input).nextUnderstandingSteps;
}

function assertStep(input, pattern, message) {
  assert.match(stepsFor(input).join('\n'), pattern, message);
}

function assertSafeSteps(snapshot, rawValues = []) {
  assert.ok(Array.isArray(snapshot.nextUnderstandingSteps));
  assert.ok(snapshot.nextUnderstandingSteps.length > 0);
  assert.ok(snapshot.nextUnderstandingSteps.length <= 5);
  assert.equal(new Set(snapshot.nextUnderstandingSteps.map((step) => step.toLowerCase())).size, snapshot.nextUnderstandingSteps.length);
  const json = JSON.stringify(snapshot.nextUnderstandingSteps);
  [
    'Sync now', 'Start sync', 'Kjør sync', 'Approve', 'Reject', 'Godkjenn', 'Avvis',
    'Publish', 'Share', 'Send', 'Connect EchoNet', 'Export', 'Save to memory',
    'PR', 'repo', 'sprint', 'phase', 'priority'
  ].forEach((term) => assert.equal(json.includes(term), false, term));
  assert.equal(/https?:\/\/|www\.|@|user[_-]?id/i.test(json), false, json);
  rawValues.forEach((value) => assert.equal(json.includes(value), false, value));
}

const empty = api.buildConversationInsightSnapshot();
assertSafeSteps(empty);
assert.ok(empty.nextUnderstandingSteps.includes('Samle flere strukturerte signaler før AHA trekker tydeligere mønstre.'));

assertStep({ openQuestions: ['Hva er uklart?'] }, /Avklar hovedspørsmålet før du konkluderer\./, 'open questions step');
assertStep({ concepts: ['Makt', 'Tillit'] }, /Skill de viktigste begrepene fra hverandre\./, 'multiple concepts step');
assertStep({ concepts: ['Makt'] }, /Undersøk hvorfor dette begrepet går igjen\./, 'single concept step');
assertStep({ tensions: ['Trygghet og frihet'] }, /Formuler spenningen som et åpent spørsmål\./, 'tension step');
assertStep({ perspectives: ['Borgerperspektiv'] }, /Sammenlign perspektivene før neste tolkning\./, 'perspective step');
assertStep({ conversationLinks: ['Tidligere tema'] }, /Se hvilke samtalekoblinger som faktisk forklarer temaet\./, 'conversation links step');
assertStep({ quality: { sourceBound: false } }, /Sjekk kildegrunnlaget før du bruker innsikten videre\./, 'source quality step');
assertStep({ quality: { topicConsistent: false } }, /Sjekk kildegrunnlaget før du bruker innsikten videre\./, 'topic quality step');

const rich = api.buildConversationInsightSnapshot({
  concepts: ['A', 'B'],
  openQuestions: ['Hva nå?'],
  tensions: ['A mot B'],
  perspectives: ['P1'],
  conversationLinks: ['L1'],
  quality: { sourceBound: false }
});
assertSafeSteps(rich);

const deduped = api.buildConversationInsightSnapshot({
  nextUnderstandingSteps: ['Avklar hovedspørsmålet før du konkluderer.'],
  openQuestions: ['Hva nå?']
});
assert.equal(deduped.nextUnderstandingSteps.filter((step) => step === 'Avklar hovedspørsmålet før du konkluderer.').length, 1);
assertSafeSteps(deduped);

const rawValues = [
  'RAW_NEXT_STEP_TEXT_SECRET',
  'FULL_NEXT_STEP_TEXT_SECRET',
  'TRANSCRIPT_NEXT_STEP_SECRET',
  'MESSAGE_NEXT_STEP_SECRET',
  'PROMPT_NEXT_STEP_SECRET',
  'SOURCE_EVENT_NEXT_STEP_SECRET',
  'EVENT_NEXT_STEP_SECRET',
  'CANDIDATE_NEXT_STEP_SECRET',
  'CANDIDATE_PREVIEW_NEXT_STEP_SECRET',
  'RAW_PAYLOAD_NEXT_STEP_SECRET',
  'PRIVATE_PAYLOAD_NEXT_STEP_SECRET',
  'PRIVATE_METADATA_NEXT_STEP_SECRET',
  'https://private.example/next-step-secret',
  'USER_ID_NEXT_STEP_SECRET',
  'next-step-secret@example.com'
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
  concepts: ['Trygt begrep', 'Annet trygt begrep']
});
assertSafeSteps(rawSnapshot, rawValues);

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

console.log('aha-conversation-insight-snapshot-next-steps tests passed');
