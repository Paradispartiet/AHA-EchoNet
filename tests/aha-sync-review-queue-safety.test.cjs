const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const reviewPath = 'js/ahaSyncReviewQueue.js';
const dashboardPath = 'js/ahaDashboard.js';
const builderPath = 'js/ahaSyncCandidateBuilder.js';
const docsPaths = [
  'README.md',
  'docs/AHA_CONVERSATION_INSIGHT_SYNC_PLAN.md',
  'docs/AHA_SYNC_HUB_PLAN.md',
  'docs/AHA_IMPLEMENTATION_STATUS.md',
  'docs/AHA_PERSONAL_AI_LOOP_SOURCE_APPROVAL_SURFACE.md'
];

assert.ok(fs.existsSync(path.join(root, reviewPath)), 'review queue helper must exist');
assert.equal(fs.existsSync(path.join(root, 'js/ahaSyncConfirmationGate.js')), false, 'must not create a sync confirmation gate');
assert.ok(fs.existsSync(path.join(root, 'tests/aha-sync-review-queue.test.cjs')), 'base review queue test must remain in place');

const reviewSource = read(reviewPath);
const dashboardSource = read(dashboardPath);
const builderSource = read(builderPath);
const docsSource = docsPaths.map(read).join('\n');

for (const exported of ['AHASyncReviewQueue', 'buildReviewQueue', 'summarizeReviewQueue', 'buildReviewQueueLines']) {
  assert.match(reviewSource, new RegExp(exported), `review queue must export/use ${exported}`);
}

for (const required of ['AHASyncCandidateBuilder', 'AHA_SYNC_CHANNELS', 'personal_ai_loop_source_approval', 'requiresUserConfirmation']) {
  assert.match(reviewSource, new RegExp(required), `review queue must use ${required}`);
}
assert.match(reviewSource, /localOnly|local-only|local_only/i, 'review queue must enforce/report local-only candidates');

for (const forbidden of [
  'sourceEvent.text',
  'event.text',
  'candidate.text',
  'previewLabel',
  'rawText',
  'rawPayload',
  'fullText',
  'privatePayload',
  'privateMetadata'
]) {
  assert.equal(reviewSource.includes(forbidden), false, `review queue must not use raw data field: ${forbidden}`);
}

for (const forbidden of [
  /localStorage\.setItem/,
  /localStorage\.removeItem/,
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /sendBeacon/,
  /supabase\./,
  /\binsert\s*\(/,
  /\bupdate\s*\(/,
  /\bupsert\s*\(/,
  /\bdelete\s*\(/,
  /executeSync/,
  /runSync/,
  /performSync/,
  /startSync/,
  /manualSync/,
  /autoSync/,
  /backgroundSync/,
  /\bpublish\b/,
  /\bshare\b/,
  /approveCandidate/,
  /rejectCandidate/,
  /approvalAction/
]) {
  assert.equal(forbidden.test(reviewSource), false, `review queue must not write, approve or sync: ${forbidden}`);
}

assert.match(dashboardSource, /AHA Sync Review Queue Summary|AHA sync review queue|AHA sync review-kø/i, 'dashboard must show AHA sync review queue');
assert.match(dashboardSource, /AHASyncReviewQueue/, 'dashboard must use AHASyncReviewQueue');
assert.match(dashboardSource, /buildReviewQueue/, 'dashboard must use buildReviewQueue');

const reviewDashboardSource = dashboardSource.slice(
  dashboardSource.indexOf('function renderAhaSyncReviewQueueSummary(sourceEvents)'),
  dashboardSource.indexOf('function renderAhaSyncInsightDigest(sourceEvents)')
);
assert.ok(reviewDashboardSource.length > 0, 'must find dashboard review queue renderer');
for (const forbidden of [
  /<button[^>]*>\s*(Approve|Reject|Godkjenn|Avvis)\b/i,
  /data-approve/,
  /data-reject/,
  /approveCandidate/,
  /rejectCandidate/
]) {
  assert.equal(forbidden.test(reviewDashboardSource), false, `review queue UI must not include approval buttons/actions: ${forbidden}`);
}

for (const required of [
  /approvalBoundary/,
  /personal_ai_loop_source_approval/,
  /approvalState/,
  /suggested/,
  /requiresUserConfirmation/,
  /local_only/
]) {
  assert.match(builderSource, required, `candidate builder must keep approval boundary invariant: ${required}`);
}

for (const forbidden of [
  /approved:\s*true/,
  /approvalState:\s*"approved"/,
  /approvalState:\s*'approved'/,
  /autoApprove/,
  /autoApproval/,
  /allowed:\s*true/
]) {
  assert.equal(forbidden.test(builderSource), false, `candidate builder must not auto-approve: ${forbidden}`);
}

assert.match(`${docsSource}\n${reviewSource}`, /AHA Sync Review Queue|review queue|review-kø/i, 'docs/helper must describe AHA sync review queue');
assert.match(docsSource, /read-only/i, 'docs must state read-only');
assert.match(docsSource, /local-only|local_only/i, 'docs must state local-only');
assert.match(`${docsSource}\n${reviewSource}\n${dashboardSource}`, /no approval action|no approval-action|ingen approval-action/i, 'docs/helper/UI must state no approval action');
assert.match(docsSource, /no raw user data|ingen rå brukerdata|viser ikke rå brukerdata/i, 'docs must state no raw user data');
assert.match(docsSource, /no sync|ingen sync|Ingen sync kjøres/i, 'docs must state no sync');
assert.match(docsSource, /AHA_SYNC_CHANNELS/, 'docs must reference AHA_SYNC_CHANNELS');
assert.match(docsSource, /Personal AI Loop source approval boundary|Personal AI Loop source approval/i, 'docs must reference Personal AI Loop source approval boundary');

console.log('aha-sync-review-queue-safety.test.cjs passed');
