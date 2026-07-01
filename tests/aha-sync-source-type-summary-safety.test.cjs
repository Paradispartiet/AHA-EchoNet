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

assert.equal(fs.existsSync(file('js/ahaSyncSourceTypeSummary.js')), true, 'source type summary helper must exist');
assert.equal(fs.existsSync(file('js/ahaSyncConfirmationGate.js')), false, 'must not create js/ahaSyncConfirmationGate.js');

const helperSource = read('js/ahaSyncSourceTypeSummary.js');
for (const token of ['AHASyncSourceTypeSummary', 'buildSourceTypeSummary', 'normalizeSourceType', 'buildSourceTypeLines']) {
  assertContains(helperSource, token, `helper must export/use ${token}`);
}
for (const token of ['localOnly', 'noSync', 'unknown']) {
  assertContains(helperSource, token, `helper must contain ${token}`);
}

for (const forbidden of [
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
  'title'
]) {
  assertDoesNotContain(helperSource, forbidden, `helper must not use raw/private token: ${forbidden}`);
}

for (const forbidden of [
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
]) {
  assertDoesNotContain(helperSource, forbidden, `helper must not write/sync/share: ${forbidden}`);
}

const context = { window: {} };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(helperSource, context, { filename: 'js/ahaSyncSourceTypeSummary.js' });
const api = context.window.AHASyncSourceTypeSummary;
assert.equal(typeof api.buildSourceTypeSummary, 'function');
assert.equal(typeof api.normalizeSourceType, 'function');
assert.equal(typeof api.buildSourceTypeLines, 'function');

for (const value of ['chat', 'message', 'conversation']) assert.equal(api.normalizeSourceType({ source_type: value }), 'chat');
for (const value of ['note', 'notes']) assert.equal(api.normalizeSourceType({ type: value }), 'note');
for (const value of ['reflection', 'refleksjon']) assert.equal(api.normalizeSourceType({ content_type: value }), 'reflection');
for (const value of ['url', 'article', 'url_article', 'link_reader', 'article_analysis']) assert.equal(api.normalizeSourceType({ kind: value }), 'url_article');
for (const value of ['import', 'imported']) assert.equal(api.normalizeSourceType({ meta: { sourceType: value } }), 'import');
for (const value of ['source_event', 'event']) assert.equal(api.normalizeSourceType({ source_type: value }), 'source_event');
assert.equal(api.normalizeSourceType({}), 'unknown');
assert.equal(api.normalizeSourceType({ source_type: 'ukjent' }), 'unknown');

const sample = [
  { source_type: 'message', text: 'secret chat text', title: 'Private title', url: 'https://private.example/a' },
  { type: 'notes', rawText: 'secret note' },
  { content_type: 'refleksjon' },
  { kind: 'article_analysis', meta: { sourceType: 'ignored' } },
  { meta: { sourceType: 'imported', privateMetadata: 'hidden' } },
  { source_type: 'mystery', email: 'me@example.com', userId: 'u1', rawPayload: { secret: 'raw secret' } }
];
const summary = api.buildSourceTypeSummary(sample);
assert.deepEqual(Object.keys(summary).sort(), [
  'byType',
  'knownTypes',
  'lines',
  'localOnly',
  'noSync',
  'totalSourceEvents',
  'unknownCount'
].sort(), 'summary must only return safe top-level fields');
assert.equal(summary.totalSourceEvents, 6);
assert.equal(summary.byType.chat, 1);
assert.equal(summary.byType.note, 1);
assert.equal(summary.byType.reflection, 1);
assert.equal(summary.byType.url_article, 1);
assert.equal(summary.byType.import, 1);
assert.equal(summary.byType.unknown, 1);
assert.equal(summary.unknownCount, 1);
assert.equal(summary.localOnly, true);
assert.equal(summary.noSync, true);

const output = JSON.stringify(summary);
for (const leaked of ['secret chat text', 'Private title', 'https://private.example/a', 'secret note', 'me@example.com', 'u1', 'hidden', 'raw secret']) {
  assertDoesNotContain(output, leaked, `summary output must not leak raw sample value: ${leaked}`);
}

const dashboard = read('js/ahaDashboard.js');
assertContains(dashboard, 'AHASyncSourceTypeSummary', 'dashboard must use source type helper');
assertContains(dashboard, 'buildSourceTypeSummary', 'dashboard must build source type summary');
assertContains(dashboard, /Source types|Kildetyper/, 'dashboard must show source type section');
assertContains(dashboard, /AHA Sync Overview|AHA Sync-oversikt/, 'overview safety copy must remain visible');
assertContains(dashboard, /read-only/i, 'overview must remain read-only');
assertContains(dashboard, /local-only/i, 'overview must remain local-only');
assertContains(dashboard, /no sync|ingen sync/i, 'overview must state no sync');

const candidateBuilder = read('js/ahaSyncCandidateBuilder.js');
for (const token of ['approvalBoundary', 'personal_ai_loop_source_approval', 'approvalState', 'suggested', 'requiresUserConfirmation', 'local_only']) {
  assertContains(candidateBuilder, token, `candidate builder must keep ${token}`);
}
for (const forbidden of ['approved: true', 'approvalState: "approved"', "approvalState: 'approved'", 'autoApprove', 'autoApproval', 'allowed: true']) {
  assertDoesNotContain(candidateBuilder, forbidden, `candidate builder must not auto-approve via ${forbidden}`);
}

const docs = [
  read('docs/AHA_IMPLEMENTATION_STATUS.md'),
  read('docs/AHA_SYNC_HUB_PLAN.md'),
  read('docs/AHA_CONVERSATION_INSIGHT_SYNC_PLAN.md')
].join('\n');
for (const pattern of [
  /source type summary|kildetyper/i,
  /read-only/i,
  /local-only/i,
  /no raw user data|ingen rå brukerdata/i,
  /no sync|ingen sync/i,
  /URL-artikler|url_article/i,
  /AHA_SYNC_CHANNELS/,
  /Personal AI Loop source approval boundary/
]) {
  assertContains(docs, pattern, `docs must mention ${pattern}`);
}

console.log('aha-sync-source-type-summary-safety.test.cjs passed');
