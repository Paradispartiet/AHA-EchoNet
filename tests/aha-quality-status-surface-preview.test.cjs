const assert = require('node:assert/strict');
const fs = require('node:fs');

const explorer = fs.readFileSync('js/ahaExplorer.js', 'utf8');
const chatHtml = fs.readFileSync('chat.html', 'utf8');
const start = explorer.indexOf('function renderQualityStatus(model)');
const end = explorer.indexOf('function renderOversikt(model)', start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const preview = explorer.slice(start, end);

assert.match(preview, /model\?\.quality/);
assert.match(preview, /Kvalitetsstatus/);
for (const pattern of [/Kildebinding/, /Temakonsistens/, /Stale-data/, /Analyse-isolering/, /read-only/i, /ingen sync/i, /rå brukerdata/i]) assert.match(preview, pattern);
for (const term of ['rawText', 'fullText', 'transcript', 'messageText', 'prompt', 'rawPayload', 'privateMetadata', 'source.url', 'userId', 'email', 'localStorage', 'fetch(', 'data-sync', 'approveCandidate', 'rejectCandidate']) assert.equal(preview.includes(term), false, term);

assert.ok(chatHtml.indexOf('js/ahaQualityStatusSurface.js') < chatHtml.indexOf('js/ahaExplorer.js'), 'legacy helper remains loaded before Explorer for compatibility');
assert.ok(fs.existsSync('js/ahaQualityStatusSurface.js'));
assert.ok(fs.existsSync('docs/AHA_QUALITY_STATUS_SURFACE_V1.md'));

console.log('aha-quality-status-surface-preview.test.cjs passed');
