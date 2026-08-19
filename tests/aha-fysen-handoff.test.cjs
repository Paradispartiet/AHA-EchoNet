const assert = require('assert');
const handoff = require('../js/ahaFysenHandoff.js');

const token = 'a'.repeat(64);
const location = { hash: `#handoff=${token}`, pathname: '/AHA-EchoNet/fysen.html', search: '', assign: (value) => { location.assigned = value; } };
assert.equal(handoff.handoffToken(location), token);

let replaced = null;
handoff.scrubFragment({ replaceState: (_a, _b, value) => { replaced = value; } }, location);
assert.equal(replaced, '/AHA-EchoNet/fysen.html');

const store = new Map();
const collection = {
  version: 'fysen_food_collection_v1', source: 'fysen', purpose: 'user_requested_analysis', generatedAt: '2026-08-19T17:00:00.000Z',
  privacy: { scope: 'private_user', includesSearchHistory: false, publicSharing: false, modelTrainingAllowed: false }, items: []
};
handoff.continueToChat(collection, {
  contract: { buildPrompt: () => 'Analyser min mat.' },
  storage: { setItem: (key, value) => store.set(key, value) },
  location
});
assert.equal(location.assigned, 'chat.html');
const pending = JSON.parse(store.get('aha_pending_chat_prompt_v1'));
assert.equal(pending.source, 'fysen');
assert.equal(pending.prompt, 'Analyser min mat.');
console.log('aha-fysen-handoff passed');
