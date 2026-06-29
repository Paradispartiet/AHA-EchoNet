const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
assert.equal(fs.existsSync(path.join(root, 'js/ahaSyncConfirmationGate.js')), false, 'must not create a sync confirmation gate');

const helperSource = fs.readFileSync(path.join(root, 'js/ahaSyncReviewQueue.js'), 'utf8');
for (const forbidden of [
  /localStorage\.setItem/,
  /fetch\(/,
  /sendBeacon/,
  /XMLHttpRequest/,
  /sourceEvent\.text/,
  /candidate\.text/,
  /approve[A-Z_]*(?:Candidate|Sync|Source|Item)\s*\(/i,
  /reject[A-Z_]*(?:Candidate|Sync|Source|Item)\s*\(/i,
  /phase|priority|health|nextPr|repoStatus/
]) {
  assert.equal(forbidden.test(helperSource), false, `review queue helper must not use forbidden pattern: ${forbidden}`);
}

const context = { window: {}, console };
context.window.window = context.window;
vm.createContext(context);

for (const file of [
  'js/ahaSyncChannelsRegistry.js',
  'js/ahaSyncChannelRouter.js',
  'js/ahaSyncCandidateBuilder.js',
  'js/ahaSyncReviewQueue.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

const helper = context.window.AHASyncReviewQueue;
assert.equal(typeof helper.buildReviewQueue, 'function');
assert.equal(typeof helper.summarizeReviewQueue, 'function');
assert.equal(typeof helper.buildReviewQueueLines, 'function');

const summary = helper.buildReviewQueue([
  {
    id: 'local-1',
    source_type: 'chat',
    title: 'Safe local title',
    text: 'Hvordan kan begrep kobles? Fra mitt perspektiv finnes en spenning.',
    tags: ['concept'],
    thread_id: 'thread-1'
  }
]);

assert.ok(summary.totalCandidates >= 1);
assert.equal(summary.approvalBoundary, 'personal_ai_loop_source_approval');
assert.equal(summary.requiresUserConfirmation, summary.totalCandidates);
assert.equal(summary.localOnly, summary.totalCandidates);
assert.equal(summary.byApprovalState.suggested, summary.totalCandidates);
assert.equal(summary.totalReviewItems, summary.totalCandidates);
assert.ok(summary.byChannel['conversation-insights'] >= 1);
assert.ok(Array.isArray(summary.lines));
assert.equal(summary.lines.some((line) => /Hvordan|perspektiv finnes/i.test(line)), false, 'review queue lines must not render raw source text');

const empty = helper.buildReviewQueue(null);
assert.equal(empty.totalCandidates, 0);
assert.equal(empty.totalReviewItems, 0);
assert.equal(empty.requiresUserConfirmation, 0);
assert.equal(empty.localOnly, 0);

const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(indexSource, /js\/ahaSyncCandidateBuilder\.js[\s\S]*js\/ahaSyncInsightDigest\.js[\s\S]*js\/ahaSyncReviewQueue\.js[\s\S]*js\/ahaPersonalAiLoopAudit\.js[\s\S]*js\/ahaDashboard\.js/, 'Home must load review queue after builder/digest and before dashboard');

const dashboard = fs.readFileSync(path.join(root, 'js/ahaDashboard.js'), 'utf8');
assert.match(dashboard, /function renderAhaSyncReviewQueueSummary\(sourceEvents\)/, 'dashboard must render review queue summary');
assert.match(dashboard, /window\.AHASyncReviewQueue/, 'dashboard must use review queue helper');
assert.match(dashboard, /renderAhaSyncInsightDigest\(sourceEvents\)[\s\S]*renderAhaSyncReviewQueueSummary\(sourceEvents\)/, 'review queue summary must render in Home route preview');
assert.match(dashboard, /Bare trygge counts vises/, 'dashboard must state safe-count-only review queue behavior');

console.log('aha-sync-review-queue.test.cjs passed');
