const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const file = (relativePath) => path.join(root, relativePath);
const exists = (relativePath) => fs.existsSync(file(relativePath));
const read = (relativePath) => fs.readFileSync(file(relativePath), 'utf8');

function extractBetween(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `${label} start exists`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `${label} end exists`);
  return source.slice(start, end);
}

function assertIncludesAny(source, terms, label) {
  assert.ok(terms.some((term) => source.includes(term)), `${label}: expected one of ${terms.join(', ')}`);
}

function assertMatchesAll(source, patterns, label) {
  for (const pattern of patterns) {
    assert.match(source, pattern, `${label} must match ${pattern}`);
  }
}

function stripLiteralSafetyLists(source) {
  return source
    .replace(/forbidden[A-Za-z]*\s*=\s*\[[\s\S]*?\];/g, '')
    .replace(/deny[A-Za-z]*\s*=\s*\[[\s\S]*?\];/g, '')
    .replace(/blocked[A-Za-z]*\s*=\s*\[[\s\S]*?\];/g, '');
}

assert.ok(exists('js/ahaConversationInsightSnapshot.js'));
assert.equal(exists('js/ahaSyncConfirmationGate.js'), false);

[
  'js/ahaConversationInsightSnapshot.js',
  'js/ahaExplorer.js',
  'index.html',
  'chat.html',
  'tests/aha-conversation-insight-snapshot.test.cjs',
  'tests/aha-conversation-insight-snapshot-safety.test.cjs',
  'tests/aha-conversation-insight-snapshot-preview.test.cjs',
  'docs/AHA_CONVERSATION_INSIGHT_SNAPSHOT_V1.md',
  'docs/AHA_IMPLEMENTATION_STATUS.md'
].forEach((relativePath) => {
  assert.ok(exists(relativePath), `${relativePath} exists`);
  assert.ok(read(relativePath).length > 0, `${relativePath} is readable`);
});

const builderSource = read('js/ahaConversationInsightSnapshot.js');
const explorerSource = read('js/ahaExplorer.js');
const chatHtml = read('chat.html');
const statusDocs = read('docs/AHA_IMPLEMENTATION_STATUS.md');
const snapshotDocs = read('docs/AHA_CONVERSATION_INSIGHT_SNAPSHOT_V1.md');
const combinedDocs = `${statusDocs}\n${snapshotDocs}`;
const previewRenderer = stripLiteralSafetyLists(extractBetween(
  explorerSource,
  'function renderAhaNow(b)',
  'function renderEtterarbeid',
  'AHA Conversation Insight Snapshot preview renderer'
));
const previewSurface = `${chatHtml}\n${previewRenderer}`;

assert.match(previewRenderer, /AHAConversationInsightSnapshot/, 'preview uses snapshot builder namespace');
assert.match(previewRenderer, /buildConversationInsightSnapshot/, 'preview calls buildConversationInsightSnapshot');
assert.ok(chatHtml.includes('js/ahaConversationInsightSnapshot.js'), 'chat loads snapshot builder before preview runtime');

assertIncludesAny(previewSurface, ['AHA ser nå', 'Samtaleinnsikt', 'Conversation Insight Snapshot'], 'preview title');
assertMatchesAll(previewRenderer, [
  /read-only/i,
  /local-only|lokal/i,
  /ingen sync|no sync/i,
  /ingen rå brukerdata|no raw user data/i
], 'preview safety copy');

[
  /Begreper|concepts/i,
  /Åpne spørsmål|open questions/i,
  /Perspektiver|perspectives/i,
  /Spenninger|tensions/i,
  /Samtalekoblinger|conversation links/i,
  /Neste forståelsessteg|next understanding steps/i
].forEach((pattern) => assert.match(previewRenderer, pattern, `safe group ${pattern}`));
assert.match(previewRenderer, /summary/i, 'preview renders snapshot summary');
assert.match(previewRenderer, /nextUnderstandingSteps/, 'preview renders nextUnderstandingSteps');

const forbiddenRawPreviewTerms = [
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
  'prompt',
  'fullTranscript',
  'rawSourceEvents'
];
for (const term of forbiddenRawPreviewTerms) {
  assert.equal(previewRenderer.includes(term), false, `preview must not reference ${term}`);
}

const forbiddenActionTerms = [
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
  'Export',
  'Save to memory',
  'data-sync',
  'data-approve',
  'data-reject',
  'approveCandidate',
  'rejectCandidate',
  'approvalAction'
];
for (const term of forbiddenActionTerms) {
  assert.equal(previewRenderer.includes(term), false, `preview must not expose action ${term}`);
}

const forbiddenSyncOverviewMutations = [
  'executeSync',
  'manualSync',
  'autoSync',
  'backgroundSync',
  'readyForSync: true',
  'noSync: false'
];
for (const term of forbiddenSyncOverviewMutations) {
  assert.equal(previewRenderer.includes(term), false, `preview must not change Sync Overview contract with ${term}`);
}

[
  'localStorage.getItem',
  'localStorage.setItem',
  'localStorage.removeItem',
  'fetch(',
  'XMLHttpRequest',
  'sendBeacon'
].forEach((term) => assert.equal(previewRenderer.includes(term), false, `preview must not read/write/send with ${term}`));

[
  'buildConversationInsightSnapshot',
  'readOnly: true',
  'localOnly: true',
  'noSync: true'
].forEach((term) => assert.ok(builderSource.includes(term), `builder remains locked: ${term}`));

assert.ok(exists('tests/aha-conversation-insight-snapshot-safety.test.cjs'), 'builder safety test remains present');
assert.ok(exists('tests/aha-sync-global-safety.test.cjs'), 'global sync safety test remains present');

assert.match(combinedDocs, /Snapshot V1 preview.*implemented|preview.*implemented|preview.*implementert/i, 'docs say Snapshot V1 preview is implemented');
assert.match(combinedDocs, /read-only/i, 'docs lock read-only');
assert.match(combinedDocs, /local-only|lokal/i, 'docs lock local-only');
assert.match(combinedDocs, /no-sync|ingen sync/i, 'docs lock no-sync');
assert.match(combinedDocs, /raw user text|rå brukerdata|raw text/i, 'docs lock no raw user text');
assert.match(combinedDocs, /private URLs|private URL-er|URL-er/i, 'docs lock no private URLs');
assert.match(combinedDocs, /userId\/email|user IDs.*email|user identifiers|brukeridentifikatorer/i, 'docs lock no user identifiers');
assert.match(combinedDocs, /approval actions|approval action|approval actions|approve\/reject/i, 'docs lock no approval actions');
assert.match(combinedDocs, /EchoNet/i, 'docs lock no EchoNet');
assert.match(combinedDocs, /backend/i, 'docs lock no backend');
assert.match(combinedDocs, /AHA Sync Overview V1.*uendret|AHA Sync Overview V1.*frozen|does not change AHA Sync Overview|Sync Overview.*contract/i, 'docs lock AHA Sync Overview V1 unchanged');

console.log('aha-conversation-insight-snapshot-preview-safety tests passed');
