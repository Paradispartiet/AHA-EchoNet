const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const file = (name) => path.join(root, name);
const dashboard = fs.readFileSync(file('js/ahaDashboard.js'), 'utf8');

function extractBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `must find ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `must find ${endMarker}`);
  return source.slice(start, end);
}

function assertDoesNotContain(source, tokens, label) {
  for (const token of tokens) {
    assert.equal(source.includes(token), false, `${label} must not include ${token}`);
  }
}

assert.equal(fs.existsSync(file('js/ahaSyncConfirmationGate.js')), false);

assert.match(dashboard, /Hva betyr dette\?|AHA Sync-forklaring/);
assert.match(dashboard, /read-only/i);
assert.match(dashboard, /local-only/i);
assert.match(dashboard, /ingen sync|no sync/i);
assert.match(dashboard, /ingen rå brukerdata|no raw user data/i);

for (const pattern of [
  /channels|kanaler/i,
  /source types|kildetyper/i,
  /channel-source matrix|kilde-kanal-matrise/i,
  /coverage gaps|dekningshull/i,
  /url_article/
]) {
  assert.match(dashboard, pattern, `legend must cover ${pattern}`);
}

const legendCode = extractBetween(
  dashboard,
  'function renderAhaSyncOverviewLegend()',
  'function renderAhaSyncOverview(sourceEvents)'
);
const overviewCode = extractBetween(
  dashboard,
  'function renderAhaSyncOverview(sourceEvents)',
  'function renderAhaSyncChannelPreview()'
);
const relevantCode = `${legendCode}\n${overviewCode}`;

assertDoesNotContain(relevantCode, [
  'Sync now',
  'Start sync',
  'Kjør sync',
  'Approve',
  'Reject',
  'Godkjenn',
  'Avvis',
  'Publish',
  'Share',
  'data-sync',
  'data-approve',
  'data-reject',
  'approveCandidate',
  'rejectCandidate',
  'approvalAction'
], 'AHA Sync Overview legend/dashboard');

assertDoesNotContain(relevantCode, [
  'sourceEvent.text',
  'event.text',
  'candidate.text',
  'candidate.previewLabel',
  'sourceEvent.url',
  'source.url',
  'rawText',
  'rawPayload',
  'fullText',
  'privatePayload',
  'privateMetadata',
  'userId',
  'email',
  'reason',
  'previewLabel'
], 'AHA Sync Overview legend/dashboard');

console.log('aha-sync-overview-legend.test.cjs passed');
