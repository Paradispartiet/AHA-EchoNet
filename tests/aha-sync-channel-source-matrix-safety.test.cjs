const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const file = (name) => path.join(root, name);
const read = (name) => fs.readFileSync(file(name), 'utf8');

function assertContains(source, pattern, message) {
  if (pattern instanceof RegExp) assert.match(source, pattern, message);
  else assert.equal(source.includes(pattern), true, message);
}

function assertDoesNotContain(source, token, message) {
  assert.equal(source.includes(token), false, message || `must not contain ${token}`);
}

const rawPrivateTokens = [
  'sourceEvent.text',
  'event.text',
  'sourceEvent.url',
  'source.url',
  'rawText',
  'rawPayload',
  'fullText',
  'privatePayload',
  'privateMetadata',
  'userId',
  'email',
  'title',
  'reason'
];

const syncWriteTokens = [
  'localStorage.setItem',
  'localStorage.removeItem',
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
];

assert.equal(fs.existsSync(file('js/ahaSyncChannelSourceMatrix.js')), true, 'channel-source matrix helper must exist');
assert.equal(fs.existsSync(file('js/ahaSyncConfirmationGate.js')), false, 'must not create js/ahaSyncConfirmationGate.js');

const helperSource = read('js/ahaSyncChannelSourceMatrix.js');
for (const token of ['AHASyncChannelSourceMatrix', 'buildChannelSourceMatrix', 'summarizeChannelSourceMatrix', 'buildChannelSourceMatrixLines']) {
  assertContains(helperSource, token, `helper must export/use ${token}`);
}
for (const token of ['AHA_SYNC_CHANNELS', 'AHASyncChannelRouter', 'AHASyncSourceTypeSummary', 'localOnly', 'noSync']) {
  assertContains(helperSource, token, `helper must use read-only model token ${token}`);
}
for (const forbidden of rawPrivateTokens) {
  assertDoesNotContain(helperSource, forbidden, `helper must not use raw/private token as output source: ${forbidden}`);
}
for (const forbidden of syncWriteTokens) {
  assertDoesNotContain(helperSource, forbidden, `helper must not write/sync/share: ${forbidden}`);
}

const context = { window: {} };
context.window.window = context.window;
context.window.AHA_SYNC_CHANNELS = [
  { id: 'open-questions', name: 'Åpne spørsmål' },
  { id: 'concept-links', name: 'Begreper' },
  { id: 'conversation-insights', name: 'Samtaleinnsikter' }
];
context.window.AHASyncSourceTypeSummary = {
  normalizeSourceType(item) {
    return item.safeType || item.source_type || item.type || item.kind || 'unknown';
  }
};
context.window.AHASyncChannelRouter = {
  routeSourceEvent(item) {
    return { matchedChannels: item.safeChannels || [] };
  }
};
vm.createContext(context);
vm.runInContext(helperSource, context, { filename: 'js/ahaSyncChannelSourceMatrix.js' });
const api = context.window.AHASyncChannelSourceMatrix;
assert.equal(typeof api.buildChannelSourceMatrix, 'function');
assert.equal(typeof api.summarizeChannelSourceMatrix, 'function');
assert.equal(typeof api.buildChannelSourceMatrixLines, 'function');

const sample = [
  { safeType: 'chat', safeChannels: ['open-questions'], text: 'SECRET chat text', url: 'https://private.example/chat', title: 'SECRET title', userId: 'user-secret', email: 'secret@example.com', rawPayload: { secret: 'raw-secret-chat' }, privateMetadata: { token: 'private-meta-chat' } },
  { safeType: 'note', safeChannels: ['concept-links'], text: 'SECRET note text', title: 'SECRET note title', rawPayload: { secret: 'raw-secret-note' }, privateMetadata: 'private-meta-note' },
  { safeType: 'url_article', safeChannels: ['conversation-insights'], url: 'https://private.example/article', title: 'SECRET article title', email: 'article@example.com' },
  { safeChannels: [] }
];
const summary = api.buildChannelSourceMatrix(sample);
assert.deepEqual(Object.keys(summary).sort(), [
  'channels',
  'lines',
  'localOnly',
  'matrix',
  'noSync',
  'sourceTypes',
  'totalRoutedEvents',
  'totalSourceEvents'
].sort(), 'summary must only return safe top-level fields');
assert.equal(summary.totalSourceEvents, 4);
assert.equal(summary.totalRoutedEvents, 3);
assert.equal(summary.localOnly, true);
assert.equal(summary.noSync, true);
assert.equal(Array.isArray(summary.lines), true);
assert.equal(summary.matrix['open-questions'].chat, 1);
assert.equal(summary.matrix['concept-links'].note, 1);
assert.equal(summary.matrix['conversation-insights'].url_article, 1);
assert.equal(summary.sourceTypes.includes('unknown'), true);

const output = JSON.stringify(summary);
for (const leaked of [
  'SECRET chat text',
  'https://private.example/chat',
  'SECRET title',
  'user-secret',
  'secret@example.com',
  'raw-secret-chat',
  'private-meta-chat',
  'SECRET note text',
  'SECRET note title',
  'raw-secret-note',
  'private-meta-note',
  'https://private.example/article',
  'SECRET article title',
  'article@example.com'
]) {
  assertDoesNotContain(output, leaked, `matrix output must be counts-only and not leak raw sample value: ${leaked}`);
}

const linesOutput = summary.lines.join('\n');
for (const leaked of ['SECRET chat text', 'https://private.example/article', 'SECRET title', 'secret@example.com']) {
  assertDoesNotContain(linesOutput, leaked, `matrix lines must not leak raw text/url/title/email: ${leaked}`);
}

const dashboard = read('js/ahaDashboard.js');
assertContains(dashboard, 'AHASyncChannelSourceMatrix', 'dashboard must use channel-source matrix helper');
assertContains(dashboard, 'buildChannelSourceMatrix', 'dashboard must build channel-source matrix');
assertContains(dashboard, /Channel-source matrix|Kilde-kanal-matrise/, 'dashboard must show channel-source matrix section');
assertContains(dashboard, /AHA Sync Overview|AHA Sync-oversikt/, 'overview safety copy must remain visible');
assertContains(dashboard, /read-only/i, 'overview must remain read-only');
assertContains(dashboard, /local-only/i, 'overview must remain local-only');
assertContains(dashboard, /no sync|ingen sync/i, 'overview must state no sync');

const overviewStart = dashboard.indexOf('function renderAhaSyncOverview');
const overviewEnd = dashboard.indexOf('function renderAhaSyncChannelPreview', overviewStart);
assert.notEqual(overviewStart, -1, 'dashboard must keep renderAhaSyncOverview');
assert.notEqual(overviewEnd, -1, 'dashboard overview boundary must remain isolatable');
const overviewSource = dashboard.slice(overviewStart, overviewEnd);
for (const forbidden of rawPrivateTokens) {
  assertDoesNotContain(overviewSource, forbidden, `sync overview/matrix code must not render raw/private token: ${forbidden}`);
}

assert.equal(fs.existsSync(file('js/ahaSyncSourceTypeSummary.js')), true, 'source type summary helper must exist');
const candidateBuilder = read('js/ahaSyncCandidateBuilder.js');
for (const token of ['approvalBoundary', 'personal_ai_loop_source_approval', 'approvalState', 'suggested', 'requiresUserConfirmation', 'local_only']) {
  assertContains(candidateBuilder, token, `candidate builder must keep source approval boundary token ${token}`);
}
for (const forbidden of ['approved: true', 'approvalState: "approved"', "approvalState: 'approved'", 'autoApprove', 'autoApproval', 'allowed: true']) {
  assertDoesNotContain(candidateBuilder, forbidden, `candidate builder must not auto-approve via ${forbidden}`);
}

for (const docName of ['docs/AHA_IMPLEMENTATION_STATUS.md', 'docs/AHA_SYNC_HUB_PLAN.md', 'docs/AHA_CONVERSATION_INSIGHT_SYNC_PLAN.md']) {
  const doc = read(docName);
  for (const pattern of [
    /channel-source matrix|kilde-kanal-matrise/i,
    /read-only/i,
    /local-only/i,
    /no raw user data|ingen rå brukerdata/i,
    /no sync|ingen sync/i,
    /URL-artikler|url_article/i,
    /AHA_SYNC_CHANNELS/,
    /Personal AI Loop source approval boundary/
  ]) {
    assertContains(doc, pattern, `${docName} must document matrix safety: ${pattern}`);
  }
}

console.log('aha-sync-channel-source-matrix-safety.test.cjs passed');
