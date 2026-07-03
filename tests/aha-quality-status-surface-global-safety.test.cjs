const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const file = (relativePath) => path.join(repoRoot, relativePath);
const exists = (relativePath) => fs.existsSync(file(relativePath));
const read = (relativePath) => fs.readFileSync(file(relativePath), 'utf8');

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

function sliceBetween(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `${label} start exists`);
  const end = source.indexOf(endNeedle, start);
  assert.notEqual(end, -1, `${label} end exists`);
  return source.slice(start, end);
}

function loadQualityApi() {
  const code = read('js/ahaQualityStatusSurface.js');
  const sandbox = { window: {}, globalThis: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'js/ahaQualityStatusSurface.js' });
  return sandbox.window.AHAQualityStatusSurface;
}

assert.equal(exists('js/ahaQualityStatusSurface.js'), true, 'quality status helper must exist');
assert.equal(exists('js/ahaSyncConfirmationGate.js'), false, 'must not introduce sync confirmation gate');

const helper = read('js/ahaQualityStatusSurface.js');
const helperWithoutSafetyKeyNames = helper
  .replace(/rawUserTextIncluded/g, '')
  .replace(/userIdentifiersIncluded/g, '')
  .replace(/approval" \+ "ActionAvailable/g, '')
  .replace(/echoNetAvailable/g, '');
const uiSources = ['js/ahaDashboard.js', 'js/ahaExplorer.js'].filter(exists).map((relativePath) => [relativePath, read(relativePath)]);
const htmlSources = ['index.html', 'chat.html'].filter(exists).map((relativePath) => [relativePath, read(relativePath)]);
const docs = ['docs/AHA_QUALITY_STATUS_SURFACE_V1.md', 'docs/AHA_IMPLEMENTATION_STATUS.md', 'docs/QUALITY_GATES.md'];
for (const docPath of docs) assert.equal(exists(docPath), true, `${docPath} must exist`);
assert.ok(uiSources.length > 0, 'at least one AHA UI source must exist');
assert.ok(htmlSources.length > 0, 'at least one AHA HTML source must exist');

for (const term of [
  'AHAQualityStatusSurface',
  'buildQualityStatusSurface',
  'normalizeQualityStatusInput',
  'buildQualityChecks',
  'deriveOverallQualityStatus',
  'buildQualitySafeSummary',
  'buildQualityStatusSafety',
  'aha_quality_status_surface_v1'
]) {
  assert.ok(helper.includes(term), `helper must expose ${term}`);
}

const api = loadQualityApi();
assert.equal(typeof api, 'object', 'quality namespace must be exported');
for (const name of ['buildQualityStatusSurface', 'normalizeQualityStatusInput', 'buildQualityChecks', 'deriveOverallQualityStatus', 'buildQualitySafeSummary', 'buildQualityStatusSafety']) {
  assert.equal(typeof api[name], 'function', `${name} must be a function`);
}

const emptySurface = api.buildQualityStatusSurface();
assert.equal(emptySurface.version, 'aha_quality_status_surface_v1');
assert.equal(emptySurface.localOnly, true);
assert.equal(emptySurface.readOnly, true);
assert.equal(emptySurface.noSync, true);
assert.equal(emptySurface.sourceScope, 'current_conversation_or_analysis');
assert.ok(emptySurface.status, 'status must exist');
assert.ok(emptySurface.checks, 'checks must exist');
assert.ok(emptySurface.safeSummary, 'safeSummary must exist');
assert.equal(emptySurface.safety.rawUserTextIncluded, false);
assert.equal(emptySurface.safety.privateUrlsIncluded, false);
assert.equal(emptySurface.safety.userIdentifiersIncluded, false);
assert.equal(emptySurface.safety.approvalActionAvailable, false);
assert.equal(emptySurface.safety.syncAvailable, false);
assert.equal(emptySurface.safety.echoNetAvailable, false);
assert.ok(['unknown', 'warning'].includes(emptySurface.status), 'empty input must be conservative');
assert.notEqual(emptySurface.status, 'ok', 'empty input must never be ok');

assert.equal(api.buildQualityStatusSurface({ sourceBinding: { sourceBound: true }, topicConsistency: { topicConsistent: true }, staleDataGuarded: true, isolated: true }).status, 'ok');
assert.notEqual(api.buildQualityStatusSurface({ sourceBinding: { sourceBound: false } }).status, 'ok');
assert.notEqual(api.buildQualityStatusSurface({ topicConsistency: { topicConsistent: false } }).status, 'ok');
assert.equal(api.buildQualityStatusSurface({ staleDataGuarded: false }).status, 'blocked');
assert.equal(api.buildQualityStatusSurface({ isolated: false }).status, 'blocked');
assert.notEqual(api.buildQualityStatusSurface({ sourceBinding: { sourceBound: true }, topicConsistency: { topicConsistent: true } }).status, 'ok');

assertNoTerms(helper, [
  'localStorage.setItem', 'localStorage.removeItem', 'localStorage.getItem', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'supabase.',
  'insert(', 'update(', 'upsert(', 'delete(', 'executeSync', 'runSync', 'performSync', 'startSync', 'manualSync', 'autoSync',
  'backgroundSync', 'publish', 'share', 'approveCandidate', 'rejectCandidate', 'approvalAction'
], 'quality helper network/write/sync/approval runtime');

assertNoTerms(helperWithoutSafetyKeyNames, [
  'rawText', 'fullText', 'transcript', 'messageText', 'prompt', 'sourceEvent.text', 'event.text', 'candidate.text',
  'candidate.previewLabel', 'privatePayload', 'rawPayload', 'privateMetadata', 'source.url', 'sourceEvent.url', 'sourceExcerpt',
  'sourceExcerpts', 'rawInvalidFields', 'invalidFieldDetails', 'userId', 'email', 'fullTranscript', 'rawSourceEvents'
], 'quality helper raw output sources');

const rawInput = {
  rawText: 'RAW_SECRET_TEXT_QUALITY_123', fullText: 'FULL_SECRET_TEXT_QUALITY_123', transcript: 'TRANSCRIPT_SECRET_QUALITY_123',
  messageText: 'MESSAGE_SECRET_QUALITY_123', prompt: 'PROMPT_SECRET_QUALITY_123',
  sourceEvent: { text: 'SOURCE_EVENT_SECRET_QUALITY_123', url: 'https://example.com/private-quality-source-event' },
  event: { text: 'EVENT_SECRET_QUALITY_123' },
  candidate: { text: 'CANDIDATE_SECRET_QUALITY_123', previewLabel: 'CANDIDATE_PREVIEW_SECRET_QUALITY_123' },
  privatePayload: { secret: 'PRIVATE_PAYLOAD_SECRET_QUALITY_123' }, rawPayload: { secret: 'RAW_PAYLOAD_SECRET_QUALITY_123' },
  privateMetadata: { secret: 'PRIVATE_METADATA_SECRET_QUALITY_123' }, source: { url: 'https://example.com/private-quality-source' },
  sourceExcerpt: 'SOURCE_EXCERPT_SECRET_QUALITY_123', sourceExcerpts: ['SOURCE_EXCERPT_ARRAY_SECRET_QUALITY_123'],
  rawInvalidFields: ['RAW_INVALID_FIELD_SECRET_QUALITY_123'], invalidFieldDetails: { secret: 'INVALID_FIELD_DETAIL_SECRET_QUALITY_123' },
  url: 'https://example.com/private-quality-url', href: 'https://example.com/private-quality-href', userId: 'USER_SECRET_QUALITY_123',
  email: 'quality-person@example.com'
};
const rawSurfaceText = JSON.stringify(api.buildQualityStatusSurface(rawInput));
for (const secret of [
  'RAW_SECRET_TEXT_QUALITY_123', 'FULL_SECRET_TEXT_QUALITY_123', 'TRANSCRIPT_SECRET_QUALITY_123', 'MESSAGE_SECRET_QUALITY_123',
  'PROMPT_SECRET_QUALITY_123', 'SOURCE_EVENT_SECRET_QUALITY_123', 'https://example.com/private-quality-source-event',
  'EVENT_SECRET_QUALITY_123', 'CANDIDATE_SECRET_QUALITY_123', 'CANDIDATE_PREVIEW_SECRET_QUALITY_123',
  'PRIVATE_PAYLOAD_SECRET_QUALITY_123', 'RAW_PAYLOAD_SECRET_QUALITY_123', 'PRIVATE_METADATA_SECRET_QUALITY_123',
  'https://example.com/private-quality-source', 'SOURCE_EXCERPT_SECRET_QUALITY_123', 'SOURCE_EXCERPT_ARRAY_SECRET_QUALITY_123',
  'RAW_INVALID_FIELD_SECRET_QUALITY_123', 'INVALID_FIELD_DETAIL_SECRET_QUALITY_123', 'https://example.com/private-quality-url',
  'https://example.com/private-quality-href', 'USER_SECRET_QUALITY_123', 'quality-person@example.com'
]) {
  assert.equal(rawSurfaceText.includes(secret), false, `runtime output must not leak ${secret}`);
}

for (const check of Object.values(emptySurface.checks)) {
  assert.deepEqual(Object.keys(check).sort(), Object.keys(check).filter((key) => ['status', 'sourceBound', 'topicConsistent', 'staleDataGuarded', 'isolated'].includes(key)).sort(), 'checks must only contain safe status/boolean fields');
  for (const value of Object.values(check)) assert.ok(typeof value === 'string' || typeof value === 'boolean' || value === null, 'check values must be string/boolean/null only');
}
assert.ok(emptySurface.safeSummary.headline.length <= 80, 'safeSummary headline must be short');
assert.ok(Array.isArray(emptySurface.safeSummary.lines), 'safeSummary lines must be an array');
for (const line of emptySurface.safeSummary.lines) {
  assert.ok(line.length <= 140, 'safeSummary lines must be short');
  assert.doesNotMatch(line, /https?:\/\/|@|userId|source excerpt|raw invalid/i, 'safeSummary lines must not contain raw/private indicators');
}

const explorerSource = uiSources.find(([relativePath, source]) => relativePath === 'js/ahaExplorer.js' && source.includes('buildQualityStatusSurface'))?.[1];
assert.ok(explorerSource, 'quality status preview must remain in an existing AHA UI file');
const qualityPreview = sliceBetween(explorerSource, 'function pickQualityStatusInput(b)', 'function renderEtterarbeid', 'quality preview');
const qualityInputBuilder = sliceBetween(explorerSource, 'function pickQualityStatusInput(b)', 'function renderQualityStatusPreview', 'quality input builder');
assert.match(qualityPreview, /AHAQualityStatusSurface/, 'preview must use quality namespace');
assert.match(qualityPreview, /buildQualityStatusSurface/, 'preview must call builder');
assertMatchesAll(qualityPreview, [/read-only|lokal/i, /no-sync|ingen sync/i, /no raw user data|ingen rå brukerdata/i], 'preview safety copy');
assertNoTerms(qualityPreview, ['Sync now', 'Start sync', 'Kjør sync', 'Synk', 'Approve', 'Reject', 'Godkjenn', 'Avvis', 'Publish', 'Share', 'Send', 'Connect EchoNet', 'Export', 'Save to memory', 'Open backend', 'Review source', 'Fix repo', 'Create PR', 'data-sync', 'data-approve', 'data-reject', 'approveCandidate', 'rejectCandidate', 'approvalAction'], 'quality preview actions');
assertNoTerms(qualityInputBuilder, ['rawText', 'fullText', 'transcript', 'messageText', 'prompt', 'sourceEvent.text', 'event.text', 'candidate.text', 'candidate.previewLabel', 'privatePayload', 'rawPayload', 'privateMetadata', 'source.url', 'sourceEvent.url', 'sourceExcerpt', 'sourceExcerpts', 'rawInvalidFields', 'invalidFieldDetails', 'userId', 'email'], 'quality preview builder input');

const runtimeSurface = helperWithoutSafetyKeyNames + '\n' + qualityPreview;
assertNoTerms(runtimeSurface, ['EchoNet', 'echonet', 'networkSync', 'graphSync', 'phase', 'priority', 'health', 'nextPr', 'repoStatus', 'buildStage', 'projectRoadmap'], 'quality runtime project/sync terms');

assert.match(read('js/ahaConversationInsightSnapshot.js'), /aha_conversation_insight_snapshot_v1/, 'snapshot helper must keep V1 contract');
assert.doesNotMatch(read('js/ahaConversationInsightSnapshot.js'), /aha_quality_status_surface_v1/, 'quality status must not alter snapshot helper contract');
assert.match(read('tests/aha-sync-global-safety.test.cjs'), /approvalAction|approveCandidate|rejectCandidate/, 'sync global safety must still guard approval actions');

for (const docPath of docs) {
  const doc = read(docPath);
  assertMatchesAll(doc, [
    /AHA Quality Status Surface V1/i, /read-only/i, /local-only/i, /no-sync|ingen sync/i, /builder.*implement/i,
    /preview.*implement/i, /global safety gate/i, /raw user text|rå brukerdata|rå brukertekst/i, /transcript/i,
    /source excerpts/i, /URL-er\/private URL-er|URLs\/private URLs|private URLs/i, /userId.*email|email.*userId|user identifiers/i,
    /approval actions|approval/i, /EchoNet/i, /backend/i, /AHA Sync Overview V1.*uendret|AHA Sync Overview V1.*unchanged/i,
    /Conversation Insight Snapshot V1.*uendret|Conversation Insight Snapshot V1.*unchanged|Conversation Insight Snapshot V1-kontrakt.*unchanged/i
  ], docPath);
}

console.log('aha-quality-status-surface-global-safety.test.cjs passed');
