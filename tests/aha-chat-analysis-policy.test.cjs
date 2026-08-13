const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/ahaChatAnalysisPolicy.js', 'utf8');
const registrations = [];
const context = {
  window: null,
  console,
  Object,
  Array,
  String,
  Set,
  Map,
  Math,
  AHAChatSignals: {},
  AHAModuleApi: {
    register(name, api, options) { registrations.push({ name, api, options }); }
  }
};
context.window = context;
vm.runInNewContext(source, context, { filename: 'js/ahaChatAnalysisPolicy.js' });

assert.equal(registrations.length, 1);
assert.equal(registrations[0].name, 'chat.analysisPolicy');
assert.deepEqual(Array.from(registrations[0].options.exports), ['create']);

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-zæøå0-9]+/gi, ' ').trim();
const policy = context.AHAChatAnalysisPolicy.create({
  signals: {
    detectLiteraryAttachmentSignal: (text) => ({ strong: /knausgård|tilknytning/i.test(String(text || '')) }),
    detectInstitutionalMediaHistorySignal: (text) => ({ strong: /morgenbladet|institusjon/i.test(String(text || '')) }),
    detectCanonicalAnalysisDomain: (text) => (/morgenbladet/i.test(String(text || '')) ? 'institutional_media_history' : '')
  },
  resolveConceptTerm: (value) => String(value || ''),
  normalizeDisplayText: (value) => String(value || ''),
  detectPublicAdministrationReformSignal: (text) => ({ strong: /nav-reform|nav-kontor/i.test(String(text || '')) }),
  detectPublicAdministrationSignal: (text) => ({ strong: /offentlig forvaltning/i.test(String(text || '')) }),
  toSentences: (text) => String(text || '').split(/(?<=[.!?])\s+/).filter(Boolean),
  cleanArticleText: (text) => String(text || '').trim(),
  sourceHash: () => 'source_hash',
  takeKeywords: (text, limit) => normalizeKey(text).split(/\s+/).filter((word) => word.length > 3).slice(0, limit),
  normalizeConceptKey: normalizeKey,
  inferReligiousLexiconEvidence: (text) => ({ strong: /pinse|hellige ånd/i.test(String(text || '')) }),
  detectTextType: () => 'academic_article',
  applyRuntimeKnowledgePolicy: (payload) => ({ ...payload, runtimePolicyApplied: true }),
  filterDomainInsightCards: (cards) => Array.isArray(cards) ? cards : [],
  getRuntimeKnowledgePolicy: () => ({ legacyArticleTemplatesEnabled: true })
});

assert.equal(policy.normalizeVisibleAcademicLabel('navkontorene og nav reformen'), 'NAV-kontorene og NAV-reformen');
assert.equal(policy.detectAutoAnalysisDomain('Morgenbladet er en avis med redaksjonell historie.'), 'institutional_media_history');
assert.equal(policy.detectAutoAnalysisDomain('Sanglyrikk og barnekultur i barnesanger.'), 'song_lyric_child_culture');

const unsupported = policy.enforceCanonicalSourceGrounding({
  reflection: 'Redaksjonell omforming og eierskap',
  sortItems: [{ label: 'Tema', text: 'Norsk politisk pressehistorie' }],
  canonicalAnalysis: { theme: 'Medieoffentlighet', keyInsight: 'Eierskapsskifter' }
}, 'Denne kilden handler bare om geologi og bergarter.');
assert.equal(unsupported.reflection, '');
assert.deepEqual(Array.from(unsupported.sortItems), []);
assert.equal(unsupported.canonicalAnalysis.theme, '');
assert.equal(unsupported.canonicalAnalysis.keyInsight, '');

const supported = policy.enforceCanonicalSourceGrounding({
  reflection: 'Redaksjonell omforming og eierskap',
  sortItems: [{ label: 'Tema', text: 'Norsk politisk pressehistorie' }]
}, 'Morgenbladet er en avis med redaksjonell historie, journalistikk og eierskap.');
assert.equal(supported.reflection, 'Redaksjonell omforming og eierskap');
assert.equal(supported.sortItems.length, 1);

const song = policy.enforceCanonicalSourceGrounding({}, 'Barnesang, sanglyrikk og rytme er viktige deler av barnekultur og barnelitteratur.');
assert.equal(song.textType, 'academic_article');
assert.equal(song.canonicalAnalysis.theme, 'Sang og sanglyrikk i barnekulturen');
assert.ok(song.subjectMatches.some((item) => item.title === 'Barnelitteratur'));

const adminCards = policy.filterDomainInsightCards([
  { title: 'NAV-reformen', summary: 'Stat og kommune i arbeidsrettet oppfølging.' },
  { title: 'Sahel', summary: 'Politisk økologi og ressursknapphet i Mali.' }
], 'NAV-reformen samlet statlige og kommunale tjenester i NAV-kontorene.');
assert.equal(adminCards.length, 1);
assert.equal(adminCards[0].title, 'NAV-reformen');

console.log('aha-chat-analysis-policy passed');
