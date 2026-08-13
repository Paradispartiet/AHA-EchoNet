const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/ahaChatAcademicInsightView.js', 'utf8');
const registrations = [];
const context = {
  window: null,
  console,
  Object,
  Array,
  String,
  Math,
  AHAModuleApi: {
    register(name, api, options) { registrations.push({ name, api, options }); }
  }
};
context.window = context;
vm.runInNewContext(source, context, { filename: 'js/ahaChatAcademicInsightView.js' });

assert.equal(registrations.length, 1);
assert.equal(registrations[0].name, 'chat.academicInsightView');
assert.deepEqual(Array.from(registrations[0].options.exports), ['create']);

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-zæøå0-9]+/gi, ' ').trim();

function createView(overrides = {}) {
  return context.AHAChatAcademicInsightView.create({
    loadAutoOutputs: () => ({
      sourceText: 'En akademisk artikkel undersøker institusjoner og historisk endring.',
      payload: { textType: 'academic_article' }
    }),
    loadAfterworkEntries: () => [],
    detectTextType: () => 'academic_article',
    hasAcademicSignals: () => true,
    extractAcademicPhraseConcepts: () => ['institusjonell endring', 'historisk analyse'],
    getRuntimeKnowledgePolicy: () => ({ legacyArticleTemplatesEnabled: true }),
    buildSourceGroundedAcademicPayload: () => ({ insightCards: [] }),
    buildAutoOutputs: () => ({ sortItems: [], reflection: '' }),
    isFragmentaryInsightCard: () => false,
    normalizeConceptKey: normalizeKey,
    detectAutoAnalysisDomain: () => 'generic_academic',
    extractMainInstitutionName: () => 'institusjonen',
    ...overrides
  });
}

const view = createView();
const parsed = JSON.parse(JSON.stringify(view.parseLabeledInsightCards([
  { summary: 'Tema: Institusjonell endring' },
  { text: 'Hovedspenning: Autonomi og økonomi' },
  'Viktigste innsikt: Institusjoner formes over tid'
])));
assert.deepEqual(parsed, {
  tema: 'Institusjonell endring',
  hovedspenning: 'Autonomi og økonomi',
  viktigsteInnsikt: 'Institusjoner formes over tid'
});

const latest = view.readLatestAcademicContext();
assert.equal(latest.textType, 'academic_article');
assert.equal(latest.phraseConcepts.length, 2);
assert.equal(latest.payload.textType, 'academic_article');

const fallbackView = createView({
  loadAutoOutputs: () => ({ sourceText: 'En kort handleliste.', payload: { textType: 'note' } }),
  detectTextType: () => 'note',
  hasAcademicSignals: () => false,
  loadAfterworkEntries: () => [
    { textType: 'note', sourceText: 'Ignorer denne.' },
    { textType: 'academic_article', sourceText: 'Lagret akademisk kilde.' }
  ]
});
assert.equal(fallbackView.readLatestAcademicContext().sourceText, 'Lagret akademisk kilde.');

let groundedCalls = 0;
let legacyCalls = 0;
const groundedView = createView({
  getRuntimeKnowledgePolicy: () => ({ legacyArticleTemplatesEnabled: false }),
  buildSourceGroundedAcademicPayload: (text) => {
    groundedCalls += 1;
    assert.match(text, /akademisk artikkel/);
    return { insightCards: [{ title: 'Kildebundet', summary: 'Bygget direkte fra kilden.' }] };
  },
  buildAutoOutputs: () => { legacyCalls += 1; return {}; }
});
const groundedCards = groundedView.buildAcademicSyntheticInsightCards();
assert.equal(groundedCards.length, 1);
assert.equal(groundedCards[0].title, 'Kildebundet');
assert.equal(groundedCalls, 1);
assert.equal(legacyCalls, 0);

const mediaView = createView({
  loadAutoOutputs: () => ({
    sourceText: 'Morgenbladet er en kulturavis med redaksjonell historie, eierskap og statsstøtte.',
    payload: { textType: 'academic_article', ahaSer: { hovedspenning: 'Autonomi og økonomi' } }
  }),
  detectAutoAnalysisDomain: () => 'institutional_media_history',
  extractMainInstitutionName: () => 'Morgenbladet'
});
const mediaCards = mediaView.buildAcademicSyntheticInsightCards();
assert.equal(mediaCards.length, 3);
assert.equal(mediaCards[0].title, 'Morgenbladets institusjonelle omforming');
assert.equal(mediaCards[1].title, 'Autonomi og økonomi');

const isolatedView = createView({
  loadAutoOutputs: () => ({
    sourceText: 'NAV-reformen samlet statlige og kommunale tjenester i NAV-kontorene.',
    payload: {
      textType: 'academic_article',
      insightCards: [{ title: 'Hovedinnsikt', summary: 'Politisk økologi og ressursknapphet i Sahel.' }]
    }
  }),
  detectAutoAnalysisDomain: () => 'public_admin_nav'
});
const isolatedCards = isolatedView.buildAcademicSyntheticInsightCards();
assert.ok(isolatedCards.length > 0);
assert.equal(isolatedCards.some((card) => /sahel|ressursknapphet/i.test(`${card.title} ${card.summary}`)), false);

console.log('aha-chat-academic-insight-view passed');
