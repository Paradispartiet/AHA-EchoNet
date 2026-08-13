const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const registrations = [];
const context = {
  window: null,
  globalThis: null,
  AHAModuleApi: {
    register: (...args) => registrations.push(args)
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/ahaChatConceptPolicy.js', 'utf8'), context, {
  filename: 'js/ahaChatConceptPolicy.js'
});

assert.equal(typeof context.AHAChatConceptPolicy?.create, 'function');
assert.equal(registrations[0]?.[0], 'chat.conceptPolicy');
assert.equal(registrations[0]?.[2]?.version, 1);

const normalize = (value) => String(value || '').toLowerCase().trim();
const policy = context.AHAChatConceptPolicy.create({
  normalizeAfterworkConcept: normalize,
  normalizeConceptSurface: (value) => String(value || '').trim(),
  normalizeVisibleAcademicLabel: (value) => String(value || '').trim(),
  isGenericDisplayConcept: () => false,
  detectPublicAdministrationReformSignal: (text) => ({ strong: /nav-reformen/i.test(String(text || '')) }),
  extractAcademicPhraseConcepts: () => []
});

assert.equal(policy.canonicalizeDisplayConcept('navkontorene'), 'NAV-kontor');
assert.equal(policy.canonicalizeDisplayConcept('stat og kommune'), 'Stat–kommune-samspill');
assert.equal(policy.getCanonicalConceptKey('NAV-kontorene'), 'nav-kontor');
assert.equal(policy.isWeakConceptWord('illustrasjon'), true);
assert.equal(policy.isBlockedStandaloneConcept('retning'), true);

assert.deepEqual(
  Array.from(policy.filterConceptLabels(['politisk økologi', 'økologi', 'illustrasjon', 'politisk økologi'])),
  ['politisk økologi']
);
assert.deepEqual(
  Array.from(policy.applyPhraseConceptDisplayPreference(['politisk økologi', 'økologi'], (value) => value)),
  ['politisk økologi']
);

const prioritized = policy.prioritizeVisibleConceptEdges([], [], {
  text: 'NAV-reformen har omstillingskostnader og strukturelle utfordringer.',
  concepts: ['omstillingskostnader', 'strukturelle utfordringer']
});
assert.ok(
  prioritized.some((edge) => edge.from === 'omstillingskostnader'
    && edge.to === 'strukturelle utfordringer'
    && edge.derived_visible === true),
  'public-administration phrases must derive the same visible concept edge'
);

console.log('aha-chat-concept-policy passed');
