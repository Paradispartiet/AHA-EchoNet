const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const helperPath = 'js/ahaConversationInsightSnapshot.js';
const code = fs.readFileSync(helperPath, 'utf8');
const context = { window: {} };
context.window.window = context.window;
vm.runInNewContext(code, context, { filename: helperPath });

const api = context.window.AHAConversationInsightSnapshot;
assert.ok(api, 'snapshot API is available');

const empty = api.buildConversationInsightSnapshot();
assert.deepEqual(empty.nextUnderstandingSteps, [], 'empty snapshot must not generate default steps');

const cleared = api.buildConversationInsightSnapshot({
  headline: '',
  shortDescription: '',
  concepts: [],
  openQuestions: [],
  perspectives: [],
  tensions: [''],
  conversationLinks: [],
  nextUnderstandingSteps: [''],
  quality: {}
});
assert.deepEqual(cleared.nextUnderstandingSteps, [], 'clear() shaped input must stay signal-empty');
assert.equal(
  Object.values(cleared.signals).some((items) => items.length > 0),
  false,
  'clear() shaped input must not contain structured signals'
);

const qualityOnly = api.buildConversationInsightSnapshot({
  quality: { sourceBound: false, topicConsistent: false }
});
assert.deepEqual(
  qualityOnly.nextUnderstandingSteps,
  [],
  'quality status alone must not create source-derived understanding steps'
);

const summaryOnly = api.buildConversationInsightSnapshot({
  headline: 'Et faktisk tema',
  shortDescription: 'En kildebundet oppsummering fra gjeldende analyse.'
});
assert.ok(summaryOnly.nextUnderstandingSteps.length > 0, 'real current-source summary may generate a cautious next step');

const conceptDriven = api.buildConversationInsightSnapshot({ concepts: ['Representasjon'] });
assert.deepEqual(
  conceptDriven.nextUnderstandingSteps,
  ['Undersøk hvorfor dette begrepet går igjen.'],
  'a real structured concept may generate one understanding step'
);

const explicit = api.buildConversationInsightSnapshot({
  nextUnderstandingSteps: ['Undersøk kildegrunnlaget nærmere.']
});
assert.deepEqual(
  explicit.nextUnderstandingSteps,
  ['Undersøk kildegrunnlaget nærmere.'],
  'explicit safe steps remain available without invented defaults'
);

console.log('aha-conversation-insight-empty-signals tests passed');
