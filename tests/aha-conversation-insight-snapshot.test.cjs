const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const helperPath = 'js/ahaConversationInsightSnapshot.js';
assert.equal(fs.existsSync(helperPath), true);
const code = fs.readFileSync(helperPath, 'utf8');
const context = { window: {} };
context.window.window = context.window;
vm.runInNewContext(code, context);

const api = context.window.AHAConversationInsightSnapshot;
assert.ok(api);
[
  'buildConversationInsightSnapshot',
  'normalizeSnapshotInput',
  'buildSnapshotSummary',
  'buildSnapshotSignals',
  'buildNextUnderstandingSteps',
  'buildSnapshotSafety'
].forEach((name) => assert.equal(typeof api[name], 'function', name));

const empty = api.buildConversationInsightSnapshot();
assert.equal(empty.version, 'aha_conversation_insight_snapshot_v1');
assert.equal(empty.localOnly, true);
assert.equal(empty.readOnly, true);
assert.equal(empty.noSync, true);
assert.equal(empty.sourceScope, 'current_conversation_or_analysis');
assert.ok(empty.summary);
assert.ok(empty.signals);
assert.ok(empty.safety);
assert.ok(empty.quality);
assert.ok(Array.isArray(empty.nextUnderstandingSteps));
assert.equal(empty.safety.rawUserTextIncluded, false);
assert.equal(empty.safety.privateUrlsIncluded, false);
assert.equal(empty.safety.userIdentifiersIncluded, false);
assert.equal(empty.safety.approvalActionAvailable, false);
assert.equal(empty.safety.syncAvailable, false);
assert.equal(empty.summary.headline, 'Samtaleinnsikt');

const rawValues = [
  'RAW_TEXT_SECRET', 'FULL_TEXT_SECRET', 'TRANSCRIPT_SECRET', 'MESSAGE_TEXT_SECRET',
  'SOURCE_EVENT_TEXT_SECRET', 'EVENT_TEXT_SECRET', 'CANDIDATE_TEXT_SECRET',
  'PRIVATE_PAYLOAD_SECRET', 'RAW_PAYLOAD_SECRET', 'PRIVATE_METADATA_SECRET',
  'https://private.example/secret', 'USER_ID_SECRET', 'person@example.test'
];
const leaked = api.buildConversationInsightSnapshot({
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
  concepts: ['Trygt begrep']
});
const leakedJson = JSON.stringify(leaked);
rawValues.forEach((value) => assert.equal(leakedJson.includes(value), false, value));
assert.equal(leaked.signals.concepts[0].label, 'Trygt begrep');

const structured = api.buildConversationInsightSnapshot({
  concepts: ['Begrep', 'Begrep', { label: 'Annet begrep', confidence: 'high' }],
  openQuestions: ['Hva er uklart?'],
  perspectives: ['Første perspektiv'],
  tensions: ['En spenning'],
  conversationLinks: ['Beslektet tema'],
  analysis: { concepts: ['Analysebegrep'] },
  canonicalAnalysis: { openQuestions: ['Hva er uklart?'] },
  ahaSer: { tensions: ['Andre spenning'] }
});
assert.deepEqual(Object.keys(structured.signals), ['concepts', 'openQuestions', 'perspectives', 'tensions', 'conversationLinks']);
assert.equal(structured.signals.concepts.length, 3);
assert.equal(structured.signals.openQuestions.length, 1);
assert.equal(structured.signals.perspectives.length, 1);
assert.equal(structured.signals.tensions.length, 2);
assert.equal(structured.signals.conversationLinks.length, 1);
assert.equal(structured.signals.concepts[1].confidence, 'high');

const many = Array.from({ length: 12 }, (_, index) => `Konsept ${index}`).concat(['Konsept 1']);
const limited = api.buildConversationInsightSnapshot({ concepts: many });
assert.equal(limited.signals.concepts.length, 8);
assert.equal(new Set(limited.signals.concepts.map((item) => item.label)).size, 8);

const quality = api.buildConversationInsightSnapshot({
  quality: { sourceBound: true, staleDataGuarded: false, invalid: 'SECRET' },
  topicConsistency: { status: 'verified', excerpt: 'SECRET_EXCERPT' },
  sourceBinding: { valid: true, sourceRef: 'SECRET_REF' }
});
assert.deepEqual(quality.quality, { sourceBound: true, topicConsistent: true, staleDataGuarded: false });
assert.equal(JSON.stringify(quality).includes('SECRET'), false);

[
  'localStorage.setItem', 'localStorage.removeItem', 'fetch(', 'XMLHttpRequest', 'sendBeacon',
  'supabase.', 'insert(', 'update(', 'upsert(', 'delete(', 'executeSync', 'runSync',
  'performSync', 'startSync', 'manualSync', 'autoSync', 'backgroundSync', 'publish', 'share',
  'approveCandidate', 'rejectCandidate'
].forEach((term) => assert.equal(code.includes(term), false, term));
[
  'phase', 'priority', 'health', 'nextPr', 'repoStatus', 'buildStage', 'projectRoadmap'
].forEach((term) => assert.equal(code.includes(term), false, term));
assert.equal(fs.existsSync('js/ahaSyncConfirmationGate.js'), false);

console.log('aha-conversation-insight-snapshot tests passed');
