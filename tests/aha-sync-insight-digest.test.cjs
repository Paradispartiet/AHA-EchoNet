const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = { window: {}, console };
context.window.window = context.window;
vm.createContext(context);

for (const file of [
  'js/ahaSyncChannelsRegistry.js',
  'js/ahaSyncChannelRouter.js',
  'js/ahaSyncCandidateBuilder.js',
  'js/ahaSyncInsightDigest.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}

const helper = context.window.AHASyncInsightDigest;
assert.equal(typeof helper.buildDigest, 'function');
assert.equal(typeof helper.summarizeChannels, 'function');
assert.equal(typeof helper.buildDigestLines, 'function');

const digest = helper.buildDigest([
  {
    id: 'local-1',
    source_type: 'chat',
    title: 'Safe local title',
    text: 'Hvordan kan begrep kobles? Fra mitt perspektiv finnes en spenning.',
    tags: ['concept'],
    thread_id: 'thread-1'
  }
]);

assert.equal(digest.totalSourceEvents, 1);
assert.equal(digest.totalRoutedEvents, 1);
assert.ok(digest.totalCandidates >= 1);
assert.ok(digest.activeChannels >= 1);
assert.equal(digest.hasOpenQuestions, true);
assert.equal(digest.hasConceptLinks, true);
assert.equal(digest.hasPerspectives, true);
assert.equal(digest.hasTensions, true);
assert.equal(digest.hasConversationLinks, true);
assert.equal(digest.approvalBoundary, 'personal_ai_loop_source_approval');
assert.equal(digest.localOnly, true);
assert.equal(digest.requiresUserConfirmation, true);
assert.ok(Array.isArray(digest.lines));
assert.equal(digest.lines.some((line) => /Hvordan|perspektiv finnes/i.test(line)), false, 'digest lines must not render raw source text');

const emptyDigest = helper.buildDigest(null);
assert.equal(emptyDigest.totalSourceEvents, 0);
assert.equal(emptyDigest.totalCandidates, 0);
assert.equal(emptyDigest.localOnly, true);
assert.equal(emptyDigest.requiresUserConfirmation, true);
