const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

const context = { window: {} };
context.window.window = context.window;
context.window.AHA_SYNC_CHANNELS = [
  { id: 'conversation-insights', name: 'Conversation insights' },
  { id: 'open-questions', name: 'Open questions' }
];
vm.createContext(context);
for (const file of [
  'js/ahaSyncSourceTypeSummary.js',
  'js/ahaSyncChannelRouter.js',
  'js/ahaSyncChannelSourceMatrix.js',
  'js/ahaSyncCoverageGaps.js'
]) {
  vm.runInContext(read(file), context, { filename: file });
}

const api = context.window.AHASyncCoverageGaps;
assert.equal(typeof api.buildCoverageGaps, 'function');
assert.equal(typeof api.summarizeCoverage, 'function');
assert.equal(typeof api.buildCoverageGapLines, 'function');

const summary = api.summarizeCoverage({
  totalSourceEvents: 2,
  totalRoutedEvents: 1,
  channels: ['conversation-insights', 'open-questions'],
  sourceTypes: ['chat', 'url_article'],
  matrix: {
    'conversation-insights': { chat: 1, url_article: 1 },
    'open-questions': { chat: 0, url_article: 0 }
  }
});

assert.equal(summary.totalSourceEvents, 2);
assert.equal(summary.totalRoutedEvents, 1);
assert.equal(summary.activeChannelCount, 1);
assert.equal(summary.emptyChannelCount, 1);
assert.deepEqual(Array.from(summary.activeChannels), ['conversation-insights']);
assert.deepEqual(Array.from(summary.emptyChannels), ['open-questions']);
assert.deepEqual(Array.from(summary.activeSourceTypes), ['chat', 'url_article']);
assert.equal(summary.missingSourceTypes.includes('note'), true);
assert.equal(summary.localOnly, true);
assert.equal(summary.noSync, true);
assert.equal(Array.isArray(summary.lines), true);

console.log('aha-sync-coverage-gaps.test.cjs passed');
