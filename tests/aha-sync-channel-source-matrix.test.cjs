const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const file = (name) => path.join(root, name);
const read = (name) => fs.readFileSync(file(name), 'utf8');

assert.equal(fs.existsSync(file('js/ahaSyncChannelSourceMatrix.js')), true, 'channel-source matrix helper must exist');
assert.equal(fs.existsSync(file('js/ahaSyncConfirmationGate.js')), false, 'must not create js/ahaSyncConfirmationGate.js');

const helperSource = read('js/ahaSyncChannelSourceMatrix.js');
for (const token of ['AHASyncChannelSourceMatrix', 'buildChannelSourceMatrix', 'summarizeChannelSourceMatrix', 'buildChannelSourceMatrixLines']) {
  assert.match(helperSource, new RegExp(token), `helper must export/use ${token}`);
}
for (const token of ['AHA_SYNC_CHANNELS', 'AHASyncChannelRouter', 'AHASyncSourceTypeSummary', 'localOnly', 'noSync']) {
  assert.match(helperSource, new RegExp(token), `helper must use ${token}`);
}

for (const forbidden of [
  'sourceEvent.text', 'event.text', 'sourceEvent.url', 'source.url', 'rawText', 'rawPayload',
  'fullText', 'privatePayload', 'privateMetadata', 'userId', 'email', 'title'
]) {
  assert.equal(helperSource.includes(forbidden), false, `helper must not use raw/private token: ${forbidden}`);
}

for (const forbidden of [
  'localStorage.setItem', 'localStorage.removeItem', 'fetch(', 'XMLHttpRequest', 'sendBeacon',
  'supabase.', 'insert(', 'update(', 'upsert(', 'delete(', 'executeSync', 'runSync',
  'performSync', 'startSync', 'manualSync', 'autoSync', 'backgroundSync', 'publish', 'share',
  'approveCandidate', 'rejectCandidate'
]) {
  assert.equal(helperSource.includes(forbidden), false, `helper must not write/sync/share: ${forbidden}`);
}

const context = { window: {} };
context.window.window = context.window;
context.window.AHA_SYNC_CHANNELS = [
  { id: 'open-questions', name: 'Åpne spørsmål' },
  { id: 'concept-links', name: 'Begrepskoblinger' },
  { id: 'conversation-insights', name: 'Samtaleinnsikter' }
];
context.window.AHASyncSourceTypeSummary = {
  normalizeSourceType(item) {
    return item.safeType || item.source_type || item.kind || 'unknown';
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
  { safeType: 'chat', safeChannels: ['open-questions'], text: 'secret chat', url: 'https://private.example/a', title: 'private title', userId: 'u1', email: 'me@example.com' },
  { safeType: 'note', safeChannels: ['concept-links'], rawPayload: { hidden: 'payload-secret' } },
  { safeType: 'url_article', safeChannels: ['conversation-insights'], url: 'https://private.example/b' },
  { safeChannels: [] }
];
const summary = api.buildChannelSourceMatrix(sample);
assert.deepEqual(Object.keys(summary).sort(), [
  'channels', 'lines', 'localOnly', 'matrix', 'noSync', 'sourceTypes', 'totalRoutedEvents', 'totalSourceEvents'
].sort(), 'summary must only return safe top-level fields');
assert.equal(summary.totalSourceEvents, 4);
assert.equal(summary.totalRoutedEvents, 3);
assert.equal(summary.localOnly, true);
assert.equal(summary.noSync, true);
assert.equal(summary.matrix['open-questions'].chat, 1);
assert.equal(summary.matrix['concept-links'].note, 1);
assert.equal(summary.matrix['conversation-insights'].url_article, 1);
assert.equal(summary.sourceTypes.includes('unknown'), true);

const output = JSON.stringify(summary);
for (const leaked of ['secret chat', 'https://private.example/a', 'https://private.example/b', 'private title', 'u1', 'me@example.com', 'payload-secret']) {
  assert.equal(output.includes(leaked), false, `matrix output must not leak raw sample value: ${leaked}`);
}

const empty = api.buildChannelSourceMatrix(null);
assert.equal(empty.totalSourceEvents, 0);
assert.equal(empty.localOnly, true);
assert.equal(empty.noSync, true);
assert.match(empty.lines.join('\n'), /Ingen lokale source events/);

const dashboard = read('js/ahaDashboard.js');
assert.match(dashboard, /Channel-source matrix|Kilde-kanal-matrise/, 'dashboard must show channel-source matrix section');
assert.match(dashboard, /AHASyncChannelSourceMatrix/, 'dashboard must use channel-source matrix helper');
assert.match(dashboard, /buildChannelSourceMatrix/, 'dashboard must build channel-source matrix');

console.log('aha-sync-channel-source-matrix.test.cjs passed');
