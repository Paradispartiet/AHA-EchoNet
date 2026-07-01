const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const file = (relativePath) => path.join(root, relativePath);
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

const overviewCode = extractBetween(
  dashboard,
  'function renderAhaSyncOverview(sourceEvents)',
  'function renderAhaSyncChannelPreview()'
);
const legendCode = extractBetween(
  dashboard,
  'function renderAhaSyncOverviewLegend()',
  'function renderAhaSyncOverview(sourceEvents)'
);
const relevantCode = `${legendCode}\n${overviewCode}`;

assert.match(dashboard, /AHA Sync Overview|AHA Sync-oversikt/i, 'dashboard must contain AHA Sync Overview copy');
assert.match(overviewCode, /read-only|lokal forhåndsvisning/i, 'top status must state read-only/local preview');
assert.match(overviewCode, /local-only|lokal/i, 'top status must state local-only/local');
assert.match(overviewCode, /ingen sync|no sync/i, 'top status must state no sync');
assert.match(overviewCode, /ingen rå brukerdata|no raw user data/i, 'top status must state no raw user data');

for (const helper of [
  'AHASyncInsightDigest',
  'AHASyncReviewQueue',
  'AHASyncSourceTypeSummary',
  'AHASyncChannelSourceMatrix',
  'AHASyncCoverageGaps',
  'AHA_SYNC_CHANNELS'
]) {
  assert.match(overviewCode, new RegExp(helper), `overview must use existing helper/model: ${helper}`);
}

assert.match(overviewCode, /<details\b/, 'overview must use compact foldable sections');
assert.match(overviewCode, /<summary>/, 'overview details must include summaries');
assert.match(overviewCode, /aha-sync-overview-metrics/, 'overview must include a compact main metrics row');

for (const pattern of [
  /source types|kildetyper/i,
  /channel-source matrix|kilde-kanal-matrise/i,
  /coverage gaps|dekningshull/i,
  /legend|forklaring|Hva betyr dette/i
]) {
  assert.match(relevantCode, pattern, `overview must retain heavy section: ${pattern}`);
}

assert.equal(fs.existsSync(file('js/ahaSyncConfirmationGate.js')), false);

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
], 'AHA Sync Overview compact layout');

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
], 'AHA Sync Overview compact layout');

console.log('aha-sync-overview-compact-layout.test.cjs passed');
