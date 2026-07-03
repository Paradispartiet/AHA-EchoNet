const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (path) => fs.readFileSync(path, 'utf8');
const exists = (path) => fs.existsSync(path);

assert.equal(exists('js/ahaQualityStatusSurface.js'), true, 'quality helper exists');
assert.equal(exists('js/ahaSyncConfirmationGate.js'), false, 'no sync confirmation gate is introduced');

const explorer = read('js/ahaExplorer.js');
const chatHtml = read('chat.html');
const helper = read('js/ahaQualityStatusSurface.js');
const docs = read('docs/AHA_QUALITY_STATUS_SURFACE_V1.md') + '\n' + read('docs/AHA_IMPLEMENTATION_STATUS.md');

function indexOfScript(html, scriptPath) {
  const escaped = scriptPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<script[^>]+src=["']${escaped}["'][^>]*>`, 'i'));
  return match ? match.index : -1;
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `${startNeedle} exists`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `${endNeedle} exists after ${startNeedle}`);
  return source.slice(start, end);
}

const qualityPreview = sliceBetween(explorer, 'function pickQualityStatusInput(b)', 'function renderEtterarbeid');
assert.match(qualityPreview, /AHAQualityStatusSurface/, 'preview uses quality namespace');
assert.match(qualityPreview, /buildQualityStatusSurface/, 'preview calls quality builder');

const helperIndex = indexOfScript(chatHtml, 'js/ahaQualityStatusSurface.js');
const explorerIndex = indexOfScript(chatHtml, 'js/ahaExplorer.js');
assert.ok(helperIndex >= 0, 'chat loads quality helper');
assert.ok(explorerIndex >= 0, 'chat loads explorer UI');
assert.ok(helperIndex < explorerIndex, 'quality helper loads before explorer UI');

assert.ok(qualityPreview.includes('Kvalitetsstatus') || qualityPreview.includes('Quality status'), 'preview title exists');
[
  /sourceBinding|Kildebinding/,
  /topicConsistency|Temakonsistens/,
  /staleData|Stale-data/,
  /analysisIsolation|Analyse-isolering/
].forEach((pattern) => assert.match(qualityPreview, pattern, String(pattern)));
[
  /read-only|lokal/i,
  /no-sync|ingen sync/i,
  /no raw user data|ingen rå brukerdata/i
].forEach((pattern) => assert.match(qualityPreview, pattern, String(pattern)));

[
  'rawText',
  'fullText',
  'transcript',
  'messageText',
  'prompt',
  'sourceEvent.text',
  'event.text',
  'candidate.text',
  'candidate.previewLabel',
  'privatePayload',
  'rawPayload',
  'privateMetadata',
  'source.url',
  'sourceEvent.url',
  'sourceExcerpt',
  'sourceExcerpts',
  'rawInvalidFields',
  'invalidFieldDetails',
  'userId',
  'email'
].forEach((term) => assert.equal(qualityPreview.includes(term), false, `preview must not reference ${term}`));

[
  'Sync now',
  'Start sync',
  'Kjør sync',
  'Synk',
  'Approve',
  'Reject',
  'Godkjenn',
  'Avvis',
  'Publish',
  'Share',
  'Send',
  'Connect EchoNet',
  'Export',
  'Save to memory',
  'data-sync',
  'data-approve',
  'data-reject',
  'approveCandidate',
  'rejectCandidate',
  'approvalAction'
].forEach((term) => assert.equal(qualityPreview.includes(term), false, `preview must not add action ${term}`));

[
  'localStorage.setItem',
  'localStorage.removeItem',
  'localStorage.getItem',
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
].forEach((term) => assert.equal(helper.includes(term), false, `helper must not include ${term}`));

[
  'phase',
  'priority',
  'health',
  'nextPr',
  'repoStatus',
  'buildStage',
  'projectRoadmap'
].forEach((term) => {
  assert.equal(helper.includes(term), false, `helper must not include project field ${term}`);
  assert.equal(qualityPreview.includes(term), false, `preview must not include project field ${term}`);
});

assert.match(docs, /Quality Status Surface V1 preview.*implementert|preview.*implemented/i, 'docs mention implemented preview');
assert.match(docs, /AHA Sync Overview V1.*uendret|AHA Sync Overview V1.*unchanged/i, 'docs keep sync overview unchanged');
assert.match(docs, /Conversation Insight Snapshot V1.*uendret|Conversation Insight Snapshot V1.*unchanged/i, 'docs keep snapshot contract unchanged');

console.log('aha-quality-status-surface-preview.test.cjs passed');
