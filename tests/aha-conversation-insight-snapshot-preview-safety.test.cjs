const assert = require('node:assert/strict');
const fs = require('node:fs');

const explorer = fs.readFileSync('js/ahaExplorer.js', 'utf8');
const start = explorer.indexOf('function renderSamtalespor(model)');
const end = explorer.indexOf('function renderFag(model)', start);
assert.notEqual(start, -1, 'AnalysisReadModelV2 conversation renderer exists');
assert.notEqual(end, -1);
const preview = explorer.slice(start, end);

assert.match(preview, /sections\.conversation_tracks/);
assert.match(preview, /read-only/i);
assert.match(preview, /local-only/i);
assert.match(preview, /ingen sync/i);
assert.match(preview, /rå brukerdata/i);
assert.match(preview, /Generiske samtalespor er undertrykt/);

for (const term of [
  'rawText', 'fullText', 'transcript', 'messageText', 'sourceEvent.text', 'candidate.text', 'privatePayload',
  'rawPayload', 'privateMetadata', 'source.url', 'userId', 'email', 'prompt', 'localStorage', 'fetch(',
  'XMLHttpRequest', 'sendBeacon', 'Sync now', 'Kjør sync', 'Godkjenn', 'Avvis', 'Publish', 'Share',
  'data-sync', 'data-approve', 'data-reject', 'approveCandidate', 'rejectCandidate', 'approvalAction'
]) assert.equal(preview.includes(term), false, `conversation read model preview must not include ${term}`);

assert.ok(fs.existsSync('js/ahaConversationInsightSnapshot.js'), 'legacy standalone snapshot contract remains available outside the authoritative analysis renderer');
assert.ok(fs.existsSync('tests/aha-conversation-insight-snapshot-safety.test.cjs'));
assert.ok(fs.existsSync('tests/aha-sync-global-safety.test.cjs'));

console.log('aha-conversation-insight-snapshot-preview-safety tests passed');
