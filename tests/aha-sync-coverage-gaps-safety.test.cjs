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

assert.ok(fs.existsSync(file('js/ahaSyncCoverageGaps.js')));
assert.equal(fs.existsSync(file('js/ahaSyncConfirmationGate.js')), false);

const helperSource = read('js/ahaSyncCoverageGaps.js');
for (const token of ['AHASyncCoverageGaps', 'buildCoverageGaps', 'summarizeCoverage', 'buildCoverageGapLines']) {
  assertContains(helperSource, token, `helper must export/use ${token}`);
}
for (const token of ['AHA_SYNC_CHANNELS', 'AHASyncChannelSourceMatrix', 'AHASyncSourceTypeSummary', 'localOnly', 'noSync']) {
  assertContains(helperSource, token, `helper must use read-only model token ${token}`);
}

for (const forbidden of [
  'sourceEvent.text', 'event.text', 'sourceEvent.url', 'source.url', 'rawText', 'rawPayload', 'fullText',
  'privatePayload', 'privateMetadata', 'userId', 'email', 'title', 'reason', 'previewLabel',
  'candidate.text', 'candidate.previewLabel'
]) assertDoesNotContain(helperSource, forbidden, `helper must not use raw/private token: ${forbidden}`);

for (const forbidden of [
  'localStorage.setItem', 'localStorage.removeItem', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'supabase.',
  'insert(', 'update(', 'upsert(', 'delete(', 'executeSync', 'runSync', 'performSync', 'startSync',
  'manualSync', 'autoSync', 'backgroundSync', 'publish', 'share', 'approveCandidate', 'rejectCandidate',
  'approvalAction'
]) assertDoesNotContain(helperSource, forbidden, `helper must not write/sync/share: ${forbidden}`);

const context = { window: {} };
context.window.window = context.window;
context.window.AHA_SYNC_CHANNELS = [
  { id: 'conversation-insights', name: 'Conversation insights' },
  { id: 'open-questions', name: 'Open questions' },
  { id: 'concept-links', name: 'Concept links' }
];
vm.createContext(context);
for (const script of ['js/ahaSyncSourceTypeSummary.js', 'js/ahaSyncChannelRouter.js', 'js/ahaSyncChannelSourceMatrix.js', 'js/ahaSyncCoverageGaps.js']) {
  vm.runInContext(read(script), context, { filename: script });
}
const api = context.window.AHASyncCoverageGaps;
assert.equal(typeof api.buildCoverageGaps, 'function');
assert.equal(typeof api.summarizeCoverage, 'function');
assert.equal(typeof api.buildCoverageGapLines, 'function');

const samples = [
  { source_type: 'message', text: 'SECRET_CHAT_TEXT', url: 'https://private.example/a', title: 'PRIVATE_TITLE', userId: 'USER_123', email: 'person@example.com', rawPayload: { secret: 'RAW_SECRET' }, privateMetadata: 'PRIVATE_META', previewLabel: 'PRIVATE_PREVIEW', reason: 'RAW_ROUTER_REASON' },
  { kind: 'article_analysis', text: 'SECRET_URL_ARTICLE_TEXT', url: 'https://private.example/article' },
  { source_type: 'mystery', text: 'UNKNOWN_SECRET_TEXT' }
];
const output = api.buildCoverageGaps(samples);
assert.deepEqual(Object.keys(output).sort(), [
  'totalSourceEvents', 'totalRoutedEvents', 'activeChannelCount', 'emptyChannelCount', 'activeChannels',
  'emptyChannels', 'activeSourceTypes', 'missingSourceTypes', 'localOnly', 'noSync', 'lines'
].sort());
assert.equal(typeof output.activeChannelCount, 'number');
assert.equal(typeof output.emptyChannelCount, 'number');
assert.equal(Array.isArray(output.activeChannels), true);
assert.equal(Array.isArray(output.emptyChannels), true);
assert.equal(Array.isArray(output.activeSourceTypes), true);
assert.equal(Array.isArray(output.missingSourceTypes), true);
assert.equal(output.localOnly, true);
assert.equal(output.noSync, true);
assert.equal(Array.isArray(output.lines), true);
assert.ok(output.activeChannelCount >= 1);
assert.ok(output.emptyChannelCount >= 1);
assert.ok(output.activeSourceTypes.includes('chat'));
assert.ok(output.activeSourceTypes.includes('url_article'));
assert.ok(output.activeSourceTypes.includes('unknown'));
assert.ok(output.missingSourceTypes.length >= 1);

const serialized = JSON.stringify(output);
for (const leaked of ['SECRET_CHAT_TEXT', 'https://private.example/a', 'PRIVATE_TITLE', 'USER_123', 'person@example.com', 'RAW_SECRET', 'PRIVATE_META', 'PRIVATE_PREVIEW', 'RAW_ROUTER_REASON', 'SECRET_URL_ARTICLE_TEXT', 'https://private.example/article', 'UNKNOWN_SECRET_TEXT']) {
  assertDoesNotContain(serialized, leaked, `coverage output must not leak raw value: ${leaked}`);
}
for (const line of output.lines) {
  for (const leaked of ['SECRET_CHAT_TEXT', 'https://private.example/a', 'PRIVATE_TITLE', 'person@example.com', 'RAW_ROUTER_REASON']) {
    assertDoesNotContain(String(line), leaked, `coverage lines must not leak raw value: ${leaked}`);
  }
}

const dashboard = read('js/ahaDashboard.js');
assertContains(dashboard, 'AHASyncCoverageGaps', 'dashboard must use coverage helper');
assertContains(dashboard, 'buildCoverageGaps', 'dashboard must build coverage gaps');
assertContains(dashboard, /Coverage gaps|Dekningshull/, 'dashboard must show coverage gaps section');
const overviewStart = dashboard.indexOf('function renderAhaSyncOverview');
const overviewEnd = dashboard.indexOf('function renderAhaSyncChannelPreview');
assert.ok(overviewStart >= 0 && overviewEnd > overviewStart, 'must isolate overview renderer');
const overviewCode = dashboard.slice(overviewStart, overviewEnd);
for (const forbidden of ['sourceEvent.text', 'event.text', 'sourceEvent.url', 'source.url', 'rawText', 'rawPayload', 'fullText', 'privatePayload', 'privateMetadata', 'userId', 'email', 'title', 'reason', 'previewLabel', 'candidate.text', 'candidate.previewLabel']) {
  assertDoesNotContain(overviewCode, forbidden, `overview coverage code must not expose raw/private token: ${forbidden}`);
}
for (const pattern of [/AHA Sync Overview|AHA Sync-oversikt/, /read-only/i, /local-only/i, /no sync|ingen sync/i]) {
  assertContains(dashboard, pattern, `overview safety copy must contain ${pattern}`);
}

assert.equal(fs.existsSync(file('js/ahaSyncChannelSourceMatrix.js')), true);
assert.equal(fs.existsSync(file('js/ahaSyncSourceTypeSummary.js')), true);
const candidateBuilder = read('js/ahaSyncCandidateBuilder.js');
for (const token of ['approvalBoundary', 'personal_ai_loop_source_approval', 'approvalState', 'suggested', 'requiresUserConfirmation', 'local_only']) assertContains(candidateBuilder, token, `candidate builder must keep ${token}`);
for (const forbidden of ['approved: true', 'approvalState: "approved"', "approvalState: 'approved'", 'autoApprove', 'autoApproval', 'allowed: true']) assertDoesNotContain(candidateBuilder, forbidden, `candidate builder must not auto-approve via ${forbidden}`);

const docs = ['docs/AHA_IMPLEMENTATION_STATUS.md', 'docs/AHA_SYNC_HUB_PLAN.md', 'docs/AHA_CONVERSATION_INSIGHT_SYNC_PLAN.md'].map(read).join('\n');
for (const pattern of [/coverage gaps|dekningshull/i, /read-only/i, /local-only/i, /no raw user data|ingen rå brukerdata/i, /no sync|ingen sync/i, /AHA_SYNC_CHANNELS/, /Personal AI Loop source approval boundary/, /URL-artikler|url_article/i]) {
  assertContains(docs, pattern, `docs must mention ${pattern}`);
}

console.log('aha-sync-coverage-gaps-safety.test.cjs passed');
