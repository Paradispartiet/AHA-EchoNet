const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const digestPath = 'js/ahaSyncInsightDigest.js';
const dashboardPath = 'js/ahaDashboard.js';
const registryPath = 'js/ahaSyncChannelsRegistry.js';
const routerPath = 'js/ahaSyncChannelRouter.js';
const builderPath = 'js/ahaSyncCandidateBuilder.js';
const indexPath = 'index.html';

assert.ok(fs.existsSync(path.join(root, digestPath)), 'AHA Sync Insight Digest file must exist');
assert.equal(fs.existsSync(path.join(root, 'js/ahaSyncConfirmationGate.js')), false, 'must not create a new sync confirmation gate');

const digestSource = read(digestPath);
const dashboardSource = read(dashboardPath);
const registrySource = read(registryPath);
const routerSource = read(routerPath);
const builderSource = read(builderPath);
const indexSource = read(indexPath);
const digestAndDashboard = `${digestSource}\n${dashboardSource}`;

assert.match(indexSource, /js\/ahaSyncChannelsRegistry\.js[\s\S]*js\/ahaSyncChannelRouter\.js[\s\S]*js\/ahaSyncCandidateBuilder\.js[\s\S]*js\/ahaSyncInsightDigest\.js[\s\S]*js\/ahaDashboard\.js/, 'Home must load channels, router, candidate builder and digest before dashboard');
assert.match(registrySource, /window\.AHA_SYNC_CHANNELS\s*=/, 'AHA_SYNC_CHANNELS must remain the channel registry model');
assert.match(digestSource, /AHA_SYNC_CHANNELS/, 'digest must be based on AHA_SYNC_CHANNELS');
assert.match(digestSource, /AHASyncChannelRouter/, 'digest must use the read-only sync channel router');
assert.match(digestSource, /routeSourceEvent/, 'digest must route source events through the router');
assert.match(digestSource, /AHASyncCandidateBuilder/, 'digest must use the candidate builder');
assert.match(digestSource, /buildCandidates/, 'digest must build candidates through the candidate builder');
assert.match(builderSource, /approvalBoundary:\s*"personal_ai_loop_source_approval"/, 'candidates must use the existing Personal AI Loop source approval boundary');
assert.match(builderSource, /approvalState:\s*"suggested"/, 'candidates must start as suggested, not approved');
assert.match(digestSource, /personal_ai_loop_source_approval/, 'digest must expose the existing approval boundary');

for (const [label, source] of [[digestPath, digestSource], [dashboardPath, dashboardSource]]) {
  assert.doesNotMatch(source, /sourceEvent\.text|candidate\.text|\.rawPayload|rawPayload|payloadText|privateMessage|fullChatHistory/, `${label} must not render raw user/source payload fields`);
}

for (const forbidden of [
  /localStorage\s*\./,
  /\.setItem\s*\(/,
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /sendBeacon/,
  /navigator\.share/,
  /postMessage\s*\(/,
  /dispatchEvent\s*\(/,
  /save[A-Z][A-Za-z]*\s*\(/,
  /persist[A-Z][A-Za-z]*\s*\(/,
  /write[A-Z][A-Za-z]*\s*\(/,
  /syncNow\s*\(/,
  /runSync\s*\(/,
  /executeSync\s*\(/,
  /approve[A-Z][A-Za-z]*\s*\(/
]) {
  assert.equal(forbidden.test(digestSource), false, `digest must stay read-only/local-only and avoid ${forbidden}`);
}

for (const forbidden of [
  /AHA_SYNC_HUB_PROJECTS/,
  /\bphase\b/,
  /\bpriority\b/,
  /\bhealth\b/,
  /\bnextPr\b/,
  /\brepoStatus\b/
]) {
  assert.equal(forbidden.test(digestSource), false, `digest must not use project-management field/model ${forbidden}`);
}

for (const forbidden of [/approvalState:\s*"approved"/, /approved:\s*true/, /autoApprove/, /autoApproval/, /ConfirmationGate/]) {
  assert.equal(forbidden.test(digestAndDashboard), false, `digest surface must not add approval/confirmation behavior: ${forbidden}`);
}

const context = { window: {}, console };
context.window.window = context.window;
vm.createContext(context);
for (const file of [registryPath, routerPath, builderPath, digestPath]) {
  vm.runInContext(read(file), context, { filename: file });
}

const digestHelper = context.window.AHASyncInsightDigest;
assert.equal(typeof digestHelper.buildDigest, 'function');
assert.equal(typeof digestHelper.summarizeChannels, 'function');
assert.equal(typeof digestHelper.buildDigestLines, 'function');

const rawSecretText = 'RAW_SECRET_USER_TEXT_must_never_render';
const rawCandidateText = 'RAW_CANDIDATE_TEXT_must_never_render';
const rawPayloadSecret = 'RAW_PAYLOAD_SECRET_must_never_render';
const digest = digestHelper.buildDigest([
  {
    id: 'source-1',
    source_type: 'chat',
    content_type: 'text',
    title: 'Trygg tittel',
    text: `Hvordan kan begrep kobles? Fra mitt perspektiv finnes en spenning. ${rawSecretText}`,
    candidate: { text: rawCandidateText },
    rawPayload: rawPayloadSecret,
    tags: ['concept'],
    thread_id: 'thread-1',
    meta: { concepts: ['AHA'] }
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

const serializedDigest = JSON.stringify(digest);
for (const forbidden of [rawSecretText, rawCandidateText, rawPayloadSecret, 'Hvordan kan begrep kobles', 'Trygg tittel']) {
  assert.equal(serializedDigest.includes(forbidden), false, `digest output must not include raw/title/user text: ${forbidden}`);
}

const allowedDigestKeys = new Set([
  'totalSourceEvents',
  'totalRoutedEvents',
  'totalCandidates',
  'activeChannels',
  'topChannelId',
  'hasOpenQuestions',
  'hasConceptLinks',
  'hasPerspectives',
  'hasTensions',
  'hasConversationLinks',
  'approvalBoundary',
  'localOnly',
  'requiresUserConfirmation',
  'lines'
]);
assert.deepEqual(Object.keys(digest).sort(), Array.from(allowedDigestKeys).sort(), 'digest must expose only compact counts, booleans, generic lines and boundary flags');

const emptyDigest = digestHelper.buildDigest(null);
assert.equal(emptyDigest.totalSourceEvents, 0);
assert.equal(emptyDigest.totalCandidates, 0);
assert.equal(emptyDigest.localOnly, true);
assert.equal(emptyDigest.requiresUserConfirmation, true);
assert.equal(JSON.stringify(emptyDigest).includes(rawSecretText), false);

console.log('aha-sync-insight-digest-safety.test.cjs passed');
