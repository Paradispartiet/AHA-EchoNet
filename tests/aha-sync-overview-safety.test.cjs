const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const dashboardPath = 'js/ahaDashboard.js';
const builderPath = 'js/ahaSyncCandidateBuilder.js';
const registryPath = 'js/ahaSyncHubRegistry.js';
const readinessPath = 'js/ahaSyncReadinessSummary.js';
const docsPaths = [
  'docs/AHA_IMPLEMENTATION_STATUS.md',
  'docs/AHA_SYNC_HUB_PLAN.md',
  'docs/AHA_CONVERSATION_INSIGHT_SYNC_PLAN.md'
];

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `must find start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `must find end marker after ${startMarker}: ${endMarker}`);
  return source.slice(start, end);
}

function assertDoesNotContain(source, forbidden, label) {
  for (const item of forbidden) {
    if (item instanceof RegExp) {
      assert.equal(item.test(source), false, `${label} must not match ${item}`);
    } else {
      assert.equal(source.includes(item), false, `${label} must not include ${item}`);
    }
  }
}

assert.equal(exists('js/ahaSyncConfirmationGate.js'), false, 'must not create a new AHA sync confirmation gate');

const dashboardSource = read(dashboardPath);
const builderSource = read(builderPath);
const overviewSource = extractBetween(
  dashboardSource,
  'function renderAhaSyncOverview(sourceEvents)',
  'function renderAhaSyncChannelPreview()'
);
const hubStatusSource = extractBetween(
  dashboardSource,
  'function renderAhaSyncChannelsStatus()',
  'function renderAhaSyncHubStatus()'
);

assert.match(dashboardSource, /AHA Sync Overview|AHA Sync-oversikt/i, 'dashboard must contain consolidated overview copy');
assert.match(dashboardSource, /read-only/i, 'dashboard must state read-only');
assert.match(dashboardSource, /local-only|localOnly/i, 'dashboard must state local-only');
assert.match(dashboardSource, /no sync|ingen sync/i, 'dashboard must state no sync');

for (const helper of ['AHA_SYNC_CHANNELS', 'AHASyncInsightDigest', 'AHASyncReviewQueue', 'AHASyncCandidateBuilder']) {
  assert.match(dashboardSource, new RegExp(helper), `dashboard must use existing helper/model: ${helper}`);
}
if (exists(readinessPath)) {
  assert.match(dashboardSource, /AHASyncReadinessSummary/, 'dashboard must use AHASyncReadinessSummary when helper exists');
}

assert.match(dashboardSource, /function renderAhaSyncOverview\s*\(/, 'dashboard must keep one consolidated overview renderer');
assert.match(hubStatusSource, /renderAhaSyncOverview\s*\(/, 'Sync Hub status must render the consolidated overview');
assertDoesNotContain(hubStatusSource, [
  /renderAhaSyncCandidateApprovalSummary\s*\(/,
  /renderAhaSyncCandidatesByChannel\s*\(/,
  /renderAhaSyncInsightDigest\s*\(/,
  /renderAhaSyncReviewQueueSummary\s*\(/,
  /renderAhaSyncChannelPreview\s*\(/
], 'consolidated Sync Hub status renderer');

assertDoesNotContain(overviewSource, [
  'sourceEvent.text',
  'event.text',
  'candidate.text',
  'candidate.previewLabel',
  'previewLabel',
  'rawText',
  'rawPayload',
  'fullText',
  'privatePayload',
  'privateMetadata',
  'privateSourceUrl',
  'source.url',
  'userId',
  'email'
], 'AHA Sync Overview renderer');

assertDoesNotContain(overviewSource, [
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
], 'AHA Sync Overview renderer');

assertDoesNotContain(overviewSource, [
  /Sync now/i,
  /Start sync/i,
  /Kjør sync/i,
  /<button[^>]*>\s*Approve\b/i,
  /<button[^>]*>\s*Reject\b/i,
  /<button[^>]*>\s*Godkjenn\b/i,
  /<button[^>]*>\s*Avvis\b/i,
  /data-sync/,
  /data-approve/,
  /data-reject/,
  /approveCandidate/,
  /rejectCandidate/
], 'AHA Sync Overview UI');

for (const required of [
  /approvalBoundary/,
  /personal_ai_loop_source_approval/,
  /approvalState/,
  /suggested/,
  /requiresUserConfirmation/,
  /local_only/
]) {
  assert.match(builderSource, required, `candidate builder must keep source approval boundary invariant: ${required}`);
}

assertDoesNotContain(builderSource, [
  /approved:\s*true/,
  /approvalState:\s*"approved"/,
  /approvalState:\s*'approved'/,
  /autoApprove/,
  /autoApproval/,
  /allowed:\s*true/
], 'candidate builder');

if (exists(registryPath)) {
  assertDoesNotContain(read(registryPath), [
    /\bphase\b/,
    /\bpriority\b/,
    /\bhealth\b/,
    /\bnextPr\b/,
    /\brepoStatus\b/,
    /\bbuildStage\b/,
    /\bprojectRoadmap\b/
  ], 'AHA Sync Hub registry');
}

assertDoesNotContain(overviewSource, [
  /<h[1-4][^>]*>\s*Approval summary\s*<\/h[1-4]>/i,
  /<h[1-4][^>]*>\s*Sync candidates by channel\s*<\/h[1-4]>/i,
  /<h[1-4][^>]*>\s*Channel signal summary\s*<\/h[1-4]>/i,
  /<h[1-4][^>]*>\s*AHA sync insight digest\s*<\/h[1-4]>/i,
  /<h[1-4][^>]*>\s*AHA sync review queue\s*<\/h[1-4]>/i,
  /<h[1-4][^>]*>\s*AHA sync readiness\s*<\/h[1-4]>/i
], 'AHA Sync Overview must not regress to separate debug top sections');

for (const file of docsPaths) {
  const text = read(file);
  assert.match(text, /AHA Sync Overview|AHA Sync-oversikt/i, `${file} must document AHA Sync Overview`);
  assert.match(text, /read-only/i, `${file} must document read-only`);
  assert.match(text, /local-only|local_only/i, `${file} must document local-only`);
  assert.match(text, /no sync|ingen sync/i, `${file} must document no sync`);
  assert.match(text, /no raw user data|ingen rå brukerdata|viser ikke rå brukerdata|rå brukerdata/i, `${file} must document no raw user data`);
  assert.match(text, /AHA_SYNC_CHANNELS/, `${file} must document AHA_SYNC_CHANNELS`);
  assert.match(text, /Personal AI Loop source approval boundary/i, `${file} must document Personal AI Loop source approval boundary`);
  assert.match(text, /Sync er fortsatt\s*(?:\*\*)?NO-GO|Sync er fortsatt NO-GO|fortsatt\s*(?:\*\*)?NO-GO/i, `${file} must document Sync is still NO-GO`);
}

console.log('aha-sync-overview-safety.test.cjs passed');
