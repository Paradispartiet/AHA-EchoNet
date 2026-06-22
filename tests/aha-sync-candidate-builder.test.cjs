const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const writes = [];
const context = {
  window: {},
  console,
  localStorage: {
    getItem() { return null; },
    setItem(key, value) { writes.push([key, value]); },
    removeItem(key) { writes.push([key, null]); }
  },
  fetch() { throw new Error('fetch should not be called'); }
};
context.window.window = context.window;
context.window.localStorage = context.localStorage;
context.window.fetch = context.fetch;
vm.createContext(context);

vm.runInContext(fs.readFileSync(path.join(root, 'js/ahaSyncChannelsRegistry.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/ahaSyncChannelRouter.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/ahaSyncCandidateBuilder.js'), 'utf8'), context);

const builder = context.window.AHASyncCandidateBuilder;
assert.ok(builder, 'window.AHASyncCandidateBuilder should exist');
assert.equal(builder.buildCandidates(null).length, 0);

const questionEvent = {
  id: 'src_question_1',
  title: 'Kort trygt spørsmål',
  text: 'Privat rå tekst som ikke skal bli label?'
};
const candidates = builder.buildCandidateForEvent(questionEvent);
const questionCandidate = candidates.find((candidate) => candidate.channelId === 'open-questions');
assert.ok(questionCandidate, 'question source event should create an open-questions candidate');
assert.equal(questionCandidate.id, 'candidate:src_question_1:open-questions');
assert.equal(questionCandidate.sourceId, 'src_question_1');
assert.equal(questionCandidate.requiresUserConfirmation, true);
assert.equal(questionCandidate.visibility, 'local_only');
assert.equal(questionCandidate.confidence, 'candidate');
assert.equal(questionCandidate.createdFrom, 'read_only_route_candidate');
assert.equal(questionCandidate.previewLabel, 'Kort trygt spørsmål');
assert.doesNotMatch(questionCandidate.previewLabel, /Privat rå tekst/);

const textOnlyCandidate = builder.buildCandidateForEvent({ id: 'src_text_only', text: 'Hva er skjult tekst?' })[0];
assert.equal(textOnlyCandidate.previewLabel, 'Lokal source event');
assert.doesNotMatch(textOnlyCandidate.previewLabel, /skjult tekst/);

const sourceEvents = [
  questionEvent,
  { id: 'src_concept', title: 'Begrep', tags: ['demokrati'] }
];
const before = JSON.stringify(sourceEvents);
const flatCandidates = builder.buildCandidates(sourceEvents);
assert.equal(JSON.stringify(sourceEvents), before, 'builder should not mutate source events');

const summary = builder.summarizeCandidates(flatCandidates);
assert.equal(summary.total, flatCandidates.length);
assert.equal(summary.byChannel['open-questions'], 1);
assert.equal(summary.byChannel['concept-links'], 1);
assert.equal(summary.requiresConfirmation, flatCandidates.length);
assert.equal(summary.localOnly, flatCandidates.length);
assert.deepEqual(writes, [], 'candidate builder must not write localStorage');

console.log('aha-sync-candidate-builder.test.cjs passed');
