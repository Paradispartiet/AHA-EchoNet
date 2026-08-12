const assert = require('assert');
const fs = require('fs');

const explorerPath = 'js/ahaExplorer.js';
const chatPath = 'chat.html';
const code = fs.readFileSync(explorerPath, 'utf8');
const html = fs.readFileSync(chatPath, 'utf8');

const start = code.indexOf('function buildConversationSnapshot(b)');
const end = code.indexOf('function renderEtterarbeid', start);
assert.notEqual(start, -1, 'snapshot preview renderer exists in the unified analysis surface');
assert.notEqual(end, -1, 'snapshot preview renderer has a stable boundary');
const preview = code.slice(start, end);

assert.ok(html.includes('js/ahaConversationInsightSnapshot.js'), 'chat UI loads AHAConversationInsightSnapshot');
assert.ok(preview.includes('AHAConversationInsightSnapshot'), 'UI uses AHAConversationInsightSnapshot');
assert.ok(preview.includes('buildConversationInsightSnapshot'), 'UI uses buildConversationInsightSnapshot');

assert.ok(html.includes('AHA ser nå') || preview.includes('Samtaleinnsikt') || preview.includes('Conversation Insight Snapshot'), 'UI contains a snapshot title');

[
  /read-only/i,
  /local-only|lokal/i,
  /ingen sync|no sync/i,
  /ingen rå brukerdata|no raw user data/i
].forEach((pattern) => assert.match(preview, pattern, String(pattern)));

[
  /Begreper|concepts/i,
  /Åpne spørsmål|openQuestions/i,
  /Perspektiver|perspectives/i,
  /Spenninger|tensions/i,
  /Samtalekoblinger|conversationLinks/i,
  /Neste forståelsessteg|nextUnderstandingSteps/i
].forEach((pattern) => assert.match(preview, pattern, String(pattern)));

[
  'rawText',
  'fullText',
  'transcript',
  'messageText',
  'sourceEvent.text',
  'event.text',
  'candidate.text',
  'candidate.previewLabel',
  'privatePayload',
  'rawPayload',
  'privateMetadata',
  'source.url',
  'sourceEvent.url',
  'userId',
  'email',
  'prompt'
].forEach((term) => assert.equal(preview.includes(term), false, term));

[
  'Sync now',
  'Start sync',
  'Kjør sync',
  'Approve',
  'Reject',
  'Godkjenn',
  'Avvis',
  'Publish',
  'Share',
  'Send',
  'Connect EchoNet',
  'data-sync',
  'data-approve',
  'data-reject',
  'approveCandidate',
  'rejectCandidate',
  'approvalAction'
].forEach((term) => assert.equal(preview.includes(term), false, term));

assert.equal(fs.existsSync('js/ahaSyncConfirmationGate.js'), false);

console.log('aha-conversation-insight-snapshot-preview tests passed');
