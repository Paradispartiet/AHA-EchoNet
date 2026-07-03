const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const file = (relativePath) => path.join(root, relativePath);
const exists = (relativePath) => fs.existsSync(file(relativePath));
const read = (relativePath) => fs.readFileSync(file(relativePath), 'utf8');

assert.ok(exists('js/ahaQualityStatusSurface.js'), 'quality status helper exists');
assert.equal(exists('js/ahaSyncConfirmationGate.js'), false, 'must not introduce sync confirmation gate');

for (const requiredPath of [
  'tests/aha-quality-status-surface.test.cjs',
  'tests/aha-quality-status-surface-safety.test.cjs',
  'tests/aha-quality-status-surface-preview.test.cjs',
  'docs/AHA_QUALITY_STATUS_SURFACE_V1.md',
  'docs/AHA_IMPLEMENTATION_STATUS.md',
  'js/ahaDashboard.js',
  'js/ahaExplorer.js',
  'index.html',
  'chat.html',
  'tests/aha-conversation-insight-snapshot-global-safety.test.cjs',
  'tests/aha-sync-global-safety.test.cjs'
]) {
  assert.ok(exists(requiredPath), `${requiredPath} must exist for quality status preview safety coverage`);
  assert.ok(read(requiredPath).length > 0, `${requiredPath} must not be empty`);
}

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

function assertNoTerms(source, terms, label) {
  for (const term of terms) {
    assert.equal(source.includes(term), false, `${label} must not include ${term}`);
  }
}

function assertMatchesAll(source, patterns, label) {
  for (const pattern of patterns) {
    assert.match(source, pattern, `${label} must match ${pattern}`);
  }
}

const helper = read('js/ahaQualityStatusSurface.js');
const explorer = read('js/ahaExplorer.js');
const chatHtml = read('chat.html');
const indexHtml = read('index.html');
const qualityPreview = sliceBetween(explorer, 'function pickQualityStatusInput(b)', 'function renderEtterarbeid');
const qualityInputBuilder = sliceBetween(explorer, 'function pickQualityStatusInput(b)', 'function renderQualityStatusPreview');

assert.match(qualityPreview, /AHAQualityStatusSurface/, 'preview must use quality namespace');
assert.match(qualityPreview, /buildQualityStatusSurface/, 'preview must call quality builder');
assert.doesNotMatch(qualityPreview, /function\s+deriveOverallQualityStatus|function\s+buildQualityChecks|sourceBound\s*\?|topicConsistent\s*\?/, 'preview must not reimplement the full quality mapping');

const chatHelperIndex = indexOfScript(chatHtml, 'js/ahaQualityStatusSurface.js');
const chatExplorerIndex = indexOfScript(chatHtml, 'js/ahaExplorer.js');
assert.ok(chatHelperIndex >= 0, 'chat.html must load quality helper');
assert.ok(chatExplorerIndex >= 0, 'chat.html must load explorer UI');
assert.ok(chatHelperIndex < chatExplorerIndex, 'chat.html must load quality helper before explorer UI');

if (indexHtml.includes('js/ahaExplorer.js')) {
  const indexHelperIndex = indexOfScript(indexHtml, 'js/ahaQualityStatusSurface.js');
  const indexExplorerIndex = indexOfScript(indexHtml, 'js/ahaExplorer.js');
  assert.ok(indexHelperIndex >= 0, 'index.html must load quality helper when explorer UI is loaded');
  assert.ok(indexHelperIndex < indexExplorerIndex, 'index.html must load quality helper before explorer UI');
}

assert.ok(/Kvalitetsstatus|Quality status/.test(qualityPreview), 'preview must have a clear quality status title');
assertMatchesAll(qualityPreview, [
  /Kildebinding|sourceBinding/,
  /Temakonsistens|topicConsistency/,
  /Stale-data|staleData/,
  /Analyse-isolering|analysisIsolation/,
  /unknown/,
  /ok|passed|failed|warning|blocked/
], 'quality preview safe status/check labels');
assertMatchesAll(qualityPreview, [
  /read-only|lokal/i,
  /no-sync|ingen sync/i,
  /no raw user data|ingen rå brukerdata/i
], 'quality preview safety copy');

const forbiddenRawFields = [
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
  'email',
  'fullTranscript',
  'rawSourceEvents'
];
assertNoTerms(qualityPreview, forbiddenRawFields, 'quality preview rendering');
assertNoTerms(qualityInputBuilder, forbiddenRawFields.filter((term) => term !== 'fullTranscript' && term !== 'rawSourceEvents'), 'quality builder input mapping');

for (const allowed of [
  'quality',
  'sourceBinding',
  'topicConsistency',
  'staleData',
  'staleDataGuarded',
  'analysisIsolation',
  'isolated',
  'canonicalAnalysis',
  'analysis',
  'snapshotQuality'
]) {
  assert.ok(qualityInputBuilder.includes(allowed), `quality builder input mapping may include safe field ${allowed}`);
}

assertNoTerms(qualityPreview, [
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
  'Open backend',
  'Review source',
  'Fix repo',
  'Create PR',
  'data-sync',
  'data-approve',
  'data-reject',
  'approveCandidate',
  'rejectCandidate',
  'approvalAction'
], 'quality preview action surface');

assert.equal(exists('quality-status.html'), false, 'quality status preview must not add a standalone page');
assert.equal(exists('js/ahaQualityStatusDashboard.js'), false, 'quality status preview must not add a large dashboard module');
assert.equal(exists('js/ahaQualityStatusPreview.js'), false, 'quality status preview must remain in the existing AHA UI');

assertNoTerms(helper, [
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
], 'quality status helper');

assertNoTerms(helper + '\n' + qualityPreview, [
  'EchoNet',
  'echonet',
  'networkSync',
  'graphSync',
  'phase',
  'priority',
  'health',
  'nextPr',
  'repoStatus',
  'buildStage',
  'projectRoadmap'
], 'quality helper and preview runtime');

const previewBaseTest = read('tests/aha-quality-status-surface-preview.test.cjs');
assert.match(previewBaseTest, /AHAQualityStatusSurface/, 'base preview test must keep functional builder coverage');
assert.match(read('tests/aha-conversation-insight-snapshot-global-safety.test.cjs'), /aha-conversation-insight-snapshot-preview-safety/i, 'snapshot global safety must run preview safety boundary');
assert.match(read('tests/aha-sync-global-safety.test.cjs'), /approvalAction|approveCandidate|rejectCandidate/, 'sync global safety must guard sync approval actions');

for (const [docPath, docSource] of [
  ['docs/AHA_QUALITY_STATUS_SURFACE_V1.md', read('docs/AHA_QUALITY_STATUS_SURFACE_V1.md')],
  ['docs/AHA_IMPLEMENTATION_STATUS.md', read('docs/AHA_IMPLEMENTATION_STATUS.md')]
]) {
  assertMatchesAll(docSource, [
    /preview.*implementert|preview.*implemented/i,
    /read-only/i,
    /local-only/i,
    /no-sync|ingen sync/i,
    /raw user text|rå brukerdata|rå brukertekst/i,
    /transcript/i,
    /source excerpts/i,
    /URL-er\/private URL-er|URLs\/private URLs|private URLs/i,
    /userId.*email|email.*userId|user identifiers/i,
    /approval actions|approval/i,
    /EchoNet/i,
    /backend/i,
    /AHA Sync Overview V1.*uendret|AHA Sync Overview V1.*unchanged/i,
    /Conversation Insight Snapshot V1.*uendret|Conversation Insight Snapshot V1.*unchanged|Conversation Insight Snapshot V1-kontrakt.*unchanged/i
  ], docPath);
}

console.log('aha-quality-status-surface-preview-safety.test.cjs passed');
