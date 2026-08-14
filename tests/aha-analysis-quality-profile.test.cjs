const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const updates = [];
const sessions = [{
  id: 'session_active',
  messages: [{ id: 'assistant_1', role: 'assistant', meta: {} }]
}];
const storageWrites = [];
const context = {
  console,
  Date,
  JSON,
  Array,
  Object,
  String,
  Number,
  Set,
  Map,
  document: null,
  localStorage: {
    getItem() { return null; },
    setItem(key, value) { storageWrites.push([key, value]); }
  },
  AHAChatPersistence: {
    loadSessions() { return sessions; },
    updateMessage(id, patch) {
      const message = sessions[0].messages.find((item) => item.id === id);
      Object.assign(message, patch);
      updates.push([id, patch]);
      return message;
    }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/ahaAnalysisQualityProfile.js', 'utf8'), context, { filename: 'js/ahaAnalysisQualityProfile.js' });

const api = context.AHAAnalysisQualityProfile;
assert.equal(typeof api.buildProfile, 'function');
assert.equal(typeof api.adjustedThresholds, 'function');

const cache = {
  sessionId: 'session_active',
  sourceHash: 'hash_learning_1',
  payload: { canonicalAnalysis: { domain: 'education' } }
};
let result = api.recordFeedback(cache, 'too_generic', { now: '2026-08-14T08:00:00.000Z' });
assert.equal(result.ok, true);
cache.sourceHash = 'hash_learning_2';
api.recordFeedback(cache, 'too_generic', { now: '2026-08-14T08:01:00.000Z' });
let profile = api.buildProfile({ domain: 'education' });
assert.equal(profile.sampleSize, 2);
assert.equal(profile.adaptive, false, 'two ratings are not enough to change the quality gate');

cache.sourceHash = 'hash_learning_3';
api.recordFeedback(cache, 'missing_evidence', { now: '2026-08-14T08:02:00.000Z' });
profile = api.buildProfile({ domain: 'education' });
assert.equal(profile.sampleSize, 3);
assert.equal(profile.scope, 'domain');
assert.equal(profile.recommendations.requireMoreSpecificity, true);
assert.equal(profile.recommendations.requireStrongerEvidence, false, 'one evidence complaint must not over-calibrate the gate');
assert.deepEqual(JSON.parse(JSON.stringify(api.adjustedThresholds(profile))), { specificity: 0.6, actionability: 0.58 });
assert.deepEqual(JSON.parse(JSON.stringify(profile.boundary)), {
  local_only: true,
  raw_source_stored: false,
  model_training_enabled: false,
  sync_enabled: false,
  echonet_shared: false
});
assert.equal(storageWrites.length, 0, 'quality learning must reuse chat persistence instead of creating a parallel store');
assert.equal(updates.length, 3);
assert.equal(JSON.stringify(sessions).includes('AI can give quick support'), false, 'profile events must not contain raw source text');

result = api.undoFeedback(cache, { now: '2026-08-14T08:03:00.000Z' });
assert.equal(result.ok, true);
profile = api.buildProfile({ domain: 'education' });
assert.equal(profile.sampleSize, 2, 'undone feedback must not affect calibration');
assert.equal(profile.adaptive, false);

const code = fs.readFileSync('js/ahaAnalysisQualityProfile.js', 'utf8');
assert.equal(/\bfetch\s*\(/.test(code), false, 'local quality profile must not use the network');
assert.equal(/setItem\s*\(/.test(code), false, 'local quality profile must not own a storage key');

console.log('aha-analysis-quality-profile.test.cjs passed');
