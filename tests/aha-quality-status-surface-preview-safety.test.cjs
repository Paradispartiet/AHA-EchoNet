const assert = require('node:assert/strict');
const fs = require('node:fs');

const explorer = fs.readFileSync('js/ahaExplorer.js', 'utf8');
const start = explorer.indexOf('function renderQualityStatus(model)');
const end = explorer.indexOf('function renderOversikt(model)', start);
assert.notEqual(start, -1, 'AnalysisReadModelV2 quality renderer exists');
assert.notEqual(end, -1);
const preview = explorer.slice(start, end);

assert.match(preview, /model\?\.quality/);
assert.doesNotMatch(preview, /AHAQualityStatusSurface|buildQualityStatusSurface/, 'authoritative read model status must not be recomputed from a flattened legacy package');
for (const pattern of [/Kildebinding/, /Temakonsistens/, /Stale-data/, /Analyse-isolering/, /unknown/, /passed/, /read-only/i, /ingen sync/i, /rå brukerdata/i]) assert.match(preview, pattern);
for (const term of [
  'rawText', 'fullText', 'transcript', 'messageText', 'prompt', 'sourceEvent.text', 'candidate.text',
  'privatePayload', 'rawPayload', 'privateMetadata', 'source.url', 'userId', 'email', 'localStorage',
  'fetch(', 'XMLHttpRequest', 'sendBeacon', 'Sync now', 'Kjør sync', 'Godkjenn', 'Avvis',
  'Publish', 'Share', 'data-sync', 'approveCandidate', 'rejectCandidate', 'approvalAction'
]) assert.equal(preview.includes(term), false, term);

assert.ok(fs.existsSync('js/ahaQualityStatusSurface.js'), 'legacy standalone helper remains available for other surfaces');
assert.ok(fs.existsSync('tests/aha-quality-status-surface-safety.test.cjs'));
assert.ok(fs.existsSync('tests/aha-sync-global-safety.test.cjs'));

console.log('aha-quality-status-surface-preview-safety.test.cjs passed');
