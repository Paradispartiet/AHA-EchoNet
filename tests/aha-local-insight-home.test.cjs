const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const file = (relativePath) => path.join(root, relativePath);
const helperPath = 'js/ahaLocalInsightHome.js';

function read(relativePath) {
  return fs.readFileSync(file(relativePath), 'utf8');
}

function loadHelper(extra = {}) {
  const context = {
    console,
    window: {},
    globalThis: {}
  };
  Object.assign(context.window, extra);
  context.globalThis = context.window;
  vm.createContext(context);
  vm.runInContext(read(helperPath), context, { filename: helperPath });
  return context.window.AHALocalInsightHome;
}

function assertNoForbiddenText(text, forbidden, label) {
  for (const item of forbidden) {
    assert.equal(text.includes(item), false, `${label} must not include ${item}`);
  }
}

assert.equal(fs.existsSync(file(helperPath)), true, `${helperPath} must exist`);
const api = loadHelper();
assert.ok(api, 'must export AHALocalInsightHome');
for (const name of [
  'buildLocalInsightHome',
  'normalizeLocalInsightHomeInput',
  'buildHomeSections',
  'buildHomeDisplay',
  'buildHomeSafety'
]) {
  assert.equal(typeof api[name], 'function', `must export ${name}`);
}

const emptyHome = api.buildLocalInsightHome();
assert.equal(emptyHome.version, 'aha_local_insight_home_v1');
assert.equal(emptyHome.localOnly, true);
assert.equal(emptyHome.readOnly, true);
assert.equal(emptyHome.noSync, true);
assert.equal(emptyHome.sourceScope, 'current_conversation_or_analysis');
assert.ok(emptyHome.sections);
assert.ok(emptyHome.display);
assert.ok(emptyHome.safety);
assert.equal(emptyHome.sections.qualityStatus.status, 'unknown');
assert.equal(emptyHome.sections.qualityStatus.summaryLines.length, 0);
assert.equal(emptyHome.sections.conversationSnapshot.headline, '');
assert.equal(emptyHome.sections.syncOverview.headline, '');
assert.equal(emptyHome.display.actionsAvailable, false);
assert.equal(emptyHome.display.approvalAvailable, false);
assert.equal(emptyHome.display.syncAvailable, false);
assert.equal(emptyHome.display.echoNetAvailable, false);
assert.equal(emptyHome.safety.rawUserTextIncluded, false);
assert.equal(emptyHome.safety.privateUrlsIncluded, false);
assert.equal(emptyHome.safety.sourceExcerptsIncluded, false);
assert.equal(emptyHome.safety.userIdentifiersIncluded, false);
assert.equal(emptyHome.safety.approvalActionAvailable, false);
assert.equal(emptyHome.safety.syncAvailable, false);
assert.equal(emptyHome.safety.echoNetAvailable, false);

const home = api.buildLocalInsightHome({
  qualityStatus: {
    version: 'aha_quality_status_surface_v1',
    status: 'warning',
    checks: {
      sourceBinding: { status: 'passed' },
      topicConsistency: { status: 'warning' }
    },
    safeSummary: { lines: ['Kildebinding er kontrollert.', 'Tema trenger kontroll.', 'https://private.example/not-allowed'] }
  },
  conversationSnapshot: {
    version: 'aha_conversation_insight_snapshot_v1',
    summary: {
      headline: 'Trygg samtaleoversikt',
      shortDescription: 'Strukturert lokal forståelse.'
    },
    nextUnderstandingSteps: ['Avklar hovedspørsmålet.', 'Skill begrepene.', 'Sammenlign perspektivene.', 'Ekstra steg.']
  },
  syncOverview: {
    version: 'aha_sync_overview_v1',
    headline: 'Lokal oversikt',
    summaryLines: ['3 lokale signaler.', '2 dekningsmønstre.']
  }
});
assert.equal(home.sections.qualityStatus.status, 'warning');
assert.deepEqual(Array.from(home.sections.qualityStatus.summaryLines), ['Kildebinding er kontrollert.', 'Tema trenger kontroll.', 'topicConsistency: warning']);
assert.equal(home.sections.conversationSnapshot.headline, 'Trygg samtaleoversikt');
assert.equal(home.sections.conversationSnapshot.shortDescription, 'Strukturert lokal forståelse.');
assert.deepEqual(Array.from(home.sections.conversationSnapshot.nextUnderstandingSteps), ['Avklar hovedspørsmålet.', 'Skill begrepene.', 'Sammenlign perspektivene.']);
assert.equal(home.sections.syncOverview.headline, 'Lokal oversikt');
assert.deepEqual(Array.from(home.sections.syncOverview.summaryLines), ['3 lokale signaler.', '2 dekningsmønstre.']);

assert.doesNotThrow(() => loadHelper().buildLocalInsightHome({ qualityStatusInput: { sourceBinding: { sourceBound: true } } }));
const withBuilders = loadHelper({
  AHAQualityStatusSurface: {
    buildQualityStatusSurface() {
      return { version: 'aha_quality_status_surface_v1', status: 'ok', checks: {}, safeSummary: { lines: ['Trygg quality.'] } };
    }
  },
  AHAConversationInsightSnapshot: {
    buildConversationInsightSnapshot() {
      return { version: 'aha_conversation_insight_snapshot_v1', summary: { headline: 'Bygget snapshot', shortDescription: 'Trygg beskrivelse.' }, nextUnderstandingSteps: ['Undersøk signalet.'] };
    }
  }
});
const builtHome = withBuilders.buildLocalInsightHome({ qualityStatusInput: { any: true }, conversationSnapshotInput: { any: true } });
assert.equal(builtHome.sections.qualityStatus.status, 'ok');
assert.equal(builtHome.sections.conversationSnapshot.headline, 'Bygget snapshot');

const rawLeakInput = {
  rawText: 'RAW_TEXT_SECRET',
  fullText: 'FULL_TEXT_SECRET',
  transcript: 'TRANSCRIPT_SECRET',
  messageText: 'MESSAGE_TEXT_SECRET',
  prompt: 'PROMPT_SECRET',
  sourceEvent: { text: 'SOURCE_EVENT_TEXT_SECRET', url: 'https://private.example/source' },
  event: { text: 'EVENT_TEXT_SECRET' },
  candidate: { text: 'CANDIDATE_TEXT_SECRET', previewLabel: 'CANDIDATE_PREVIEW_SECRET' },
  privatePayload: 'PRIVATE_PAYLOAD_SECRET',
  rawPayload: 'RAW_PAYLOAD_SECRET',
  privateMetadata: 'PRIVATE_METADATA_SECRET',
  source: { url: 'https://private.example/raw' },
  sourceExcerpt: 'SOURCE_EXCERPT_SECRET',
  sourceExcerpts: ['SOURCE_EXCERPTS_SECRET'],
  rawInvalidFields: ['RAW_INVALID_SECRET'],
  invalidFieldDetails: ['INVALID_FIELD_DETAILS_SECRET'],
  userId: 'USER_ID_SECRET',
  email: 'person@example.com',
  fullTranscript: 'FULL_TRANSCRIPT_SECRET',
  rawSourceEvents: ['RAW_SOURCE_EVENTS_SECRET'],
  qualityStatus: { version: 'aha_quality_status_surface_v1', status: 'unknown', safeSummary: { lines: ['SAFE_LINE'] } },
  conversationSnapshot: { version: 'aha_conversation_insight_snapshot_v1', summary: { headline: 'SAFE_HEADLINE', shortDescription: 'SAFE_DESCRIPTION' }, nextUnderstandingSteps: ['SAFE_STEP'] },
  syncOverview: { version: 'aha_sync_overview_v1', headline: 'SAFE_OVERVIEW', summaryLines: ['SAFE_OVERVIEW_LINE'] }
};
const rawHomeText = JSON.stringify(api.buildLocalInsightHome(rawLeakInput));
assertNoForbiddenText(rawHomeText, [
  'RAW_TEXT_SECRET',
  'FULL_TEXT_SECRET',
  'TRANSCRIPT_SECRET',
  'MESSAGE_TEXT_SECRET',
  'PROMPT_SECRET',
  'SOURCE_EVENT_TEXT_SECRET',
  'EVENT_TEXT_SECRET',
  'CANDIDATE_TEXT_SECRET',
  'CANDIDATE_PREVIEW_SECRET',
  'PRIVATE_PAYLOAD_SECRET',
  'RAW_PAYLOAD_SECRET',
  'PRIVATE_METADATA_SECRET',
  'https://private.example/source',
  'https://private.example/raw',
  'SOURCE_EXCERPT_SECRET',
  'SOURCE_EXCERPTS_SECRET',
  'RAW_INVALID_SECRET',
  'INVALID_FIELD_DETAILS_SECRET',
  'USER_ID_SECRET',
  'person@example.com',
  'FULL_TRANSCRIPT_SECRET',
  'RAW_SOURCE_EVENTS_SECRET'
], 'home output');

assertNoForbiddenText(JSON.stringify(home), [
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
  'Create PR'
], 'home output');

const helperSource = read(helperPath);
for (const pattern of [
  /localStorage\.setItem/,
  /localStorage\.removeItem/,
  /localStorage\.getItem/,
  /fetch\(/,
  /XMLHttpRequest/,
  /sendBeacon/,
  /supabase\./,
  /insert\(/,
  /update\(/,
  /upsert\(/,
  /delete\(/,
  /executeSync/,
  /runSync/,
  /performSync/,
  /startSync/,
  /manualSync/,
  /autoSync/,
  /backgroundSync/,
  /publish/,
  /share/,
  /approveCandidate/,
  /rejectCandidate/,
  /approvalAction/,
  /EchoNet/,
  /echonet/,
  /networkSync/,
  /graphSync/,
  /\bphase\b/,
  /\bpriority\b/,
  /\bhealth\b/,
  /\bnextPr\b/,
  /\brepoStatus\b/,
  /\bbuildStage\b/,
  /\bprojectRoadmap\b/
]) {
  assert.equal(pattern.test(helperSource), false, `${helperPath} must not match ${pattern}`);
}
assert.equal(fs.existsSync(file('js/ahaSyncConfirmationGate.js')), false);

console.log('aha-local-insight-home.test.cjs passed');
