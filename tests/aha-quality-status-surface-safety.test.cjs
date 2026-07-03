const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const helperPath = 'js/ahaQualityStatusSurface.js';
assert.equal(fs.existsSync(helperPath), true, 'quality status helper exists');

const helperSource = fs.readFileSync(helperPath, 'utf8');
const context = { window: {}, globalThis: {}, console };
vm.createContext(context);
vm.runInContext(helperSource, context, { filename: helperPath });

const api = context.window.AHAQualityStatusSurface;
assert.ok(api, 'AHAQualityStatusSurface export exists');
assert.equal(typeof api.buildQualityStatusSurface, 'function');

const rawValues = [
  'RAW_TEXT_SECRET',
  'FULL_TEXT_SECRET',
  'TRANSCRIPT_SECRET',
  'MESSAGE_TEXT_SECRET',
  'PROMPT_SECRET',
  'SOURCE_EVENT_TEXT_SECRET',
  'EVENT_TEXT_SECRET',
  'CANDIDATE_TEXT_SECRET',
  'CANDIDATE_LABEL_SECRET',
  'PRIVATE_PAYLOAD_SECRET',
  'RAW_PAYLOAD_SECRET',
  'PRIVATE_METADATA_SECRET',
  'https://private.example/source',
  'SOURCE_EXCERPT_SECRET',
  'RAW_INVALID_SECRET',
  'user-123-secret',
  'person@example.com'
];

const surface = api.buildQualityStatusSurface({
  quality: { sourceBound: true, topicConsistent: true, staleDataGuarded: true, isolated: true },
  rawText: rawValues[0],
  fullText: rawValues[1],
  transcript: rawValues[2],
  messageText: rawValues[3],
  prompt: rawValues[4],
  sourceEvent: { text: rawValues[5], url: rawValues[12] },
  event: { text: rawValues[6] },
  candidate: { text: rawValues[7], previewLabel: rawValues[8] },
  privatePayload: rawValues[9],
  rawPayload: rawValues[10],
  privateMetadata: rawValues[11],
  source: { url: rawValues[12] },
  sourceExcerpt: rawValues[13],
  sourceExcerpts: [rawValues[13]],
  rawInvalidFields: [rawValues[14]],
  invalidFieldDetails: rawValues[14],
  userId: rawValues[15],
  email: rawValues[16]
});

const serialized = JSON.stringify(surface);
for (const value of rawValues) {
  assert.equal(serialized.includes(value), false, `surface must not leak ${value}`);
}

assert.equal(surface.localOnly, true);
assert.equal(surface.readOnly, true);
assert.equal(surface.noSync, true);
assert.equal(surface.safety.rawUserTextIncluded, false);
assert.equal(surface.safety.privateUrlsIncluded, false);
assert.equal(surface.safety.userIdentifiersIncluded, false);
assert.equal(surface.safety.syncAvailable, false);
assert.equal(surface.safety.echoNetAvailable, false);

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
  'approvalAction',
  'phase',
  'priority',
  'health',
  'nextPr',
  'repoStatus',
  'buildStage',
  'projectRoadmap'
].forEach((term) => assert.equal(helperSource.includes(term), false, `helper must not include ${term}`));

console.log('aha-quality-status-surface-safety.test.cjs passed');
