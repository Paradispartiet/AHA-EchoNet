const assert = require('node:assert/strict');
const fs = require('node:fs');

assert.equal(fs.existsSync('js/ahaSyncConfirmationGate.js'), false, 'js/ahaSyncConfirmationGate.js must not exist');

const dashboard = fs.readFileSync('js/ahaDashboard.js', 'utf8');
const helperStart = dashboard.indexOf('function renderAhaSyncCandidateApprovalSummary');
const helperEnd = dashboard.indexOf('function renderAhaSyncChannelPreview');
assert.ok(helperStart >= 0, 'dashboard must define renderAhaSyncCandidateApprovalSummary');
assert.ok(helperEnd > helperStart, 'helper must appear before route preview');
const helper = dashboard.slice(helperStart, helperEnd);

assert.match(dashboard, /buildPersonalAiLoopSourceApprovalSummary/, 'dashboard must reuse Personal AI Loop source approval summary helper');
assert.match(dashboard, /Personal AI Loop source approval/, 'dashboard must show Personal AI Loop source approval copy');
assert.match(dashboard, /Sync-kandidater bruker eksisterende Personal AI Loop source approval\. Ingen sync kjøres her\./, 'dashboard must render the required approval summary copy');

for (const forbidden of [
  /sourceEvent\.text/,
  /candidate\.text/,
  /rawPayload/,
  /topSources/,
  /metadata/,
  /localStorage\.setItem/
]) {
  assert.equal(forbidden.test(helper), false, `approval summary helper must not use/render forbidden pattern: ${forbidden}`);
}

for (const required of [
  'suggestedCount',
  'reviewNeededCount',
  'approvedCount',
  'rejectedCount',
  'blockedCount',
  'unknownCount',
  'manualReviewRequired',
  'localOnly',
  'explicitActionOnly',
  'compactOnly',
  'redacted'
]) {
  assert.ok(helper.includes(required), `approval summary helper must render ${required}`);
}

const builder = fs.readFileSync('js/ahaSyncCandidateBuilder.js', 'utf8');
assert.match(builder, /approvalBoundary:\s*"personal_ai_loop_source_approval"/, 'builder must set Personal AI Loop source approval boundary');
assert.match(builder, /approvalState:\s*"suggested"/, 'builder must set suggested approval state');

for (const forbidden of [
  /approved:\s*true/,
  /approvalState:\s*"approved"/,
  /autoApprove/,
  /autoApproval/
]) {
  assert.equal(forbidden.test(builder), false, `builder must not auto approve candidates: ${forbidden}`);
}

const docs = [
  'README.md',
  'docs/AHA_CONVERSATION_INSIGHT_SYNC_PLAN.md',
  'docs/AHA_SYNC_HUB_PLAN.md',
  'docs/AHA_IMPLEMENTATION_STATUS.md'
];
for (const file of docs) {
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /approval summary/i, `${file} must document approval summary`);
  assert.match(text, /gjenbruker den eksisterende Personal AI Loop source approval-boundaryen|gjenbruker Personal AI Loop source approval boundary/i, `${file} must document reused existing source approval boundary`);
  assert.match(text, /Ingen kandidat blir automatisk `approved`|Ingen kandidat.*automatisk approved/i, `${file} must document no automatic approval`);
  assert.match(text, /ingen sync kjøres/i, `${file} must document no sync runs`);
  assert.match(text, /rå brukerdata|rå brukerinnhold|raw payload/i, `${file} must document no raw user data is shown`);
  assert.match(text, /ingen separat sync confirmation gate|ikke lages en separat sync confirmation gate/i, `${file} must document no separate sync confirmation gate`);
}

console.log('aha-sync-candidate-approval-summary.test.cjs passed');
