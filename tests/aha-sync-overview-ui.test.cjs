const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const dashboard = read('js/ahaDashboard.js');

assert.equal(fs.existsSync(path.join(root, 'js/ahaSyncConfirmationGate.js')), false, 'js/ahaSyncConfirmationGate.js must not exist');

assert.match(dashboard, /AHA Sync Overview|AHA Sync-oversikt/, 'dashboard must render the consolidated overview title');
assert.match(dashboard, /read-only/i, 'dashboard must show read-only status');
assert.match(dashboard, /local-only/i, 'dashboard must show local-only status');
assert.match(dashboard, /no sync|ingen sync/i, 'dashboard must show no-sync status');

for (const helper of ['AHASyncInsightDigest', 'AHASyncReviewQueue', 'AHASyncCandidateBuilder', 'AHA_SYNC_CHANNELS']) {
  assert.match(dashboard, new RegExp(helper), `dashboard must use ${helper}`);
}
if (fs.existsSync(path.join(root, 'js/ahaSyncReadinessSummary.js'))) {
  assert.match(dashboard, /AHASyncReadinessSummary/, 'dashboard must use readiness summary helper when it exists');
}

const overviewStart = dashboard.indexOf('function renderAhaSyncOverview(sourceEvents)');
const overviewEnd = dashboard.indexOf('function renderAhaSyncChannelPreview', overviewStart);
assert.ok(overviewStart >= 0 && overviewEnd > overviewStart, 'renderAhaSyncOverview function must exist');
const overview = dashboard.slice(overviewStart, overviewEnd);

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
  assert.equal(overview.includes(forbidden), false, `Sync Overview must not render raw data token: ${forbidden}`);
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
  assert.equal(overview.includes(forbidden), false, `Sync Overview must not write, sync, approve, or share: ${forbidden}`);
}

for (const forbidden of [
  'Sync now',
  'Start sync',
  'Kjør sync',
  'Approve',
  'Reject',
  'Godkjenn',
  'Avvis',
  'data-sync',
  'data-approve',
  'data-reject'
]) {
  assert.equal(overview.includes(forbidden), false, `Sync Overview must not render sync/approval controls: ${forbidden}`);
}

const builder = read('js/ahaSyncCandidateBuilder.js');
for (const required of ['approvalBoundary', 'personal_ai_loop_source_approval', 'approvalState', 'suggested', 'requiresUserConfirmation', 'local_only']) {
  assert.match(builder, new RegExp(required), `candidate builder must keep ${required}`);
}

const registryPath = path.join(root, 'js/ahaSyncHubRegistry.js');
if (fs.existsSync(registryPath)) {
  const registry = read('js/ahaSyncHubRegistry.js');
  for (const forbidden of ['phase', 'priority', 'health', 'nextPr', 'repoStatus', 'buildStage', 'projectRoadmap']) {
    assert.equal(registry.includes(forbidden), false, `Sync Hub registry must not contain project-management field: ${forbidden}`);
  }
}

console.log('aha-sync-overview-ui.test.cjs passed');
