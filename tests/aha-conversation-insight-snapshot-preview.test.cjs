const assert = require('node:assert/strict');
const fs = require('node:fs');

const explorer = fs.readFileSync('js/ahaExplorer.js', 'utf8');
const start = explorer.indexOf('function renderSamtalespor(model)');
const end = explorer.indexOf('function renderFag(model)', start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const preview = explorer.slice(start, end);

assert.match(preview, /model\.sections\.conversation_tracks/);
assert.match(preview, /Generiske samtalespor er undertrykt/);
assert.match(preview, /konkret belegg/i);
assert.match(preview, /read-only/i);
assert.match(preview, /local-only/i);
assert.match(preview, /ingen sync/i);
assert.match(preview, /rå brukerdata/i);
assert.doesNotMatch(preview, /AHAConversationInsightSnapshot|buildConversationInsightSnapshot/);
for (const term of ['rawText', 'fullText', 'transcript', 'messageText', 'rawPayload', 'privateMetadata', 'source.url', 'userId', 'email', 'data-sync', 'approveCandidate', 'rejectCandidate']) {
  assert.equal(preview.includes(term), false, term);
}

console.log('aha-conversation-insight-snapshot-preview tests passed');
