const assert = require('node:assert/strict');
const fs = require('node:fs');

const dashboard = fs.readFileSync('js/ahaDashboard.js', 'utf8');
const helperStart = dashboard.indexOf('function renderAhaSyncCandidatesByChannel');
const helperEnd = dashboard.indexOf('function renderAhaSyncChannelPreview');
assert.ok(helperStart >= 0, 'dashboard must define renderAhaSyncCandidatesByChannel');
assert.ok(helperEnd > helperStart, 'channel candidate helper must appear before route preview');
const helper = dashboard.slice(helperStart, helperEnd);

assert.match(helper, /window\.AHASyncCandidateBuilder/, 'helper must use existing candidate builder');
assert.match(helper, /window\.AHASources/, 'helper must use existing source loader');
assert.match(helper, /loadSourceEvents\(\)/, 'helper must read source events through AHASources.loadSourceEvents');
assert.match(helper, /buildCandidates\(sourceEvents\)/, 'helper must build candidates from loaded source events');
assert.match(helper, /window\.AHA_SYNC_CHANNELS/, 'helper must use AHA_SYNC_CHANNELS as channel source');
assert.match(helper, /Sync-kandidater per kanal/, 'helper must render the Norwegian section title');
assert.match(helper, /Read-only oversikt over lokale sync-kandidater gruppert etter innsiktskanal\. Ingen rå brukerdata vises\./, 'helper must render read-only/no-raw-data copy');

for (const state of ['suggested', 'review_needed', 'approved', 'rejected', 'blocked', 'unknown']) {
  assert.ok(helper.includes(state), `helper must count ${state}`);
}

for (const forbidden of [
  /sourceEvent\.text/,
  /candidate\.text/,
  /rawPayload/,
  /metadata/,
  /localStorage\.setItem/,
  /fetch\(/,
  /sendBeacon/,
  /XMLHttpRequest/
]) {
  assert.equal(forbidden.test(helper), false, `by-channel helper must not use/render forbidden pattern: ${forbidden}`);
}

assert.match(dashboard, /renderAhaSyncCandidateApprovalSummary\(sourceEvents\)[\s\S]*renderAhaSyncCandidatesByChannel\(\)/, 'by-channel section must render after approval summary');

console.log('aha-sync-candidates-by-channel.test.cjs passed');
