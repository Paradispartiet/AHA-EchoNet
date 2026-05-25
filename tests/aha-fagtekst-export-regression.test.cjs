const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const textUtilsCode = fs.readFileSync('ahaChatTextUtils.js', 'utf8');
const signalsCode = fs.readFileSync('ahaChatSignals.js', 'utf8');
const exportCode = fs.readFileSync('ahaChatExport.js', 'utf8');
const chatCode = fs.readFileSync('ahaChat.js', 'utf8');

const store = new Map();
const pinseText = `Pinse er en kristen høytid. Ordet kommer fra gresk pentekosté. I Det nye testamentet fortelles det at apostlene fikk Den hellige ånd, og noen talte i tunger (tungetale) som måtte tydes. Fortellingen kontrasteres ofte med Babels tårn. Høytiden kalles kirkens fødselsdag og feires i ulike tradisjoner. Datoen beregnes i gregoriansk kalender, og noen kirker følger juliansk kalender frem til treenighetssøndag.`;

const context = {
  window: null,
  console,
  navigator: { clipboard: { writeText: async () => {} } },
  document: {
    readyState: 'loading',
    addEventListener: () => {},
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    body: { appendChild: () => {} },
    createElement: () => ({ click: () => {}, remove: () => {} })
  },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  },
  setTimeout,
  clearTimeout,
  URL: { createObjectURL: () => 'blob:dummy', revokeObjectURL: () => {} },
  Blob: function Blob() {},
  Date,
  Math,
  JSON,
  InsightsEngine: {
    createEmptyChamber: () => ({ insights: [], chatLog: [] }),
    buildMetaProfile: () => ({ profile: 'CHAMBER_META_PROFILE' })
  }
};
context.window = context;
context.addEventListener = () => {};

vm.createContext(context);
vm.runInContext(textUtilsCode, context, { filename: 'ahaChatTextUtils.js' });
vm.runInContext(signalsCode, context, { filename: 'ahaChatSignals.js' });
vm.runInContext(exportCode, context, { filename: 'ahaChatExport.js' });
vm.runInContext(chatCode, context, { filename: 'ahaChat.js' });

const hooks = context.AHATestHooks;
assert.ok(hooks, 'AHATestHooks should exist');

assert.ok(context.AHAChatTextUtils, 'AHAChatTextUtils should exist');
assert.equal(typeof context.AHAChatTextUtils.cleanArticleText, 'function');
assert.equal(typeof context.AHAChatTextUtils.toSentences, 'function');
assert.equal(typeof context.AHAChatTextUtils.collectOpinionArticleEvidence, 'function');

assert.ok(context.AHAChatSignals, 'AHAChatSignals should exist');
assert.equal(context.AHAChatSignals.detectTextType(pinseText), 'academic_article');
assert.ok(context.AHAChatSignals.inferReligiousLexiconEvidence(pinseText).strong);

const detected = hooks.detectTextType(pinseText);
assert.equal(detected, 'academic_article');
assert.notEqual(detected, 'day_log');
assert.notEqual(detected, 'general');
assert.notEqual(detected, 'literary_diary');

const payload = hooks.buildAutoOutputs(pinseText, '');
const canonical = hooks.buildCanonicalAnalysis(payload, pinseText);
assert.equal(canonical.contentType, 'academic_article');

context.localStorage.setItem('aha_chat_auto_outputs_v1', JSON.stringify({
  createdAt: new Date().toISOString(),
  sourceText: pinseText,
  sourceTextHash: 'pinse_hash',
  payload: Object.assign({}, payload, {
    rawMarker: 'RAW_PAYLOAD_MARKER_TEST_228'
  })
}));
context.localStorage.setItem('aha_afterwork_v1', JSON.stringify([
  {
    id: 'afterwork_test_228',
    createdAt: '2026-05-25T10:00:00.000Z',
    sourceTextHash: 'pinse_hash',
    textType: 'day_log',
    reflection: 'Dette leses som en dagslogg',
    summary: 'Kort dagsoppsummering: ...',
    learningPath: [
      'Oppsummer hendelsene kort',
      'Finn ett mønster eller én følelse',
      'Velg én ting du tar med videre i morgen'
    ],
    concepts: [],
    details: { note: 'AFTERWORK_NOTE' }
  }
]));
context.localStorage.setItem('aha_insight_chamber_v1', JSON.stringify({
  insights: [{ id: 'insight_test_228', text: 'CHAMBER_INSIGHT_TEXT' }],
  chatLog: [{ role: 'user', text: 'CHAMBER_CHAT_TEXT' }],
  meta: { profile: 'CHAMBER_META_PROFILE' },
  knowledgeMap: {
    nodes: [{ id: 'knowledge_node_test_228', title: 'KNOWLEDGE_NODE_TITLE' }]
  }
}));

const bundle = hooks.buildAhaAnalysisExportBundle();
const md = hooks.formatAhaAnalysisExportMarkdown(bundle);
const readableMd = md.split('## Full eksportdata')[0] || md;

assert.ok(readableMd.includes('Kort fagoppsummering'));
assert.ok(!readableMd.includes('Kort dagsoppsummering'));
assert.ok(!readableMd.includes('Dette leses som en dagslogg'));
assert.ok(!readableMd.includes('Innholdstype: day_log'));
assert.ok(readableMd.includes('Den hellige ånd'));
assert.ok(readableMd.includes('tungetale'));
assert.ok(readableMd.includes('Babels tårn'));

for (const phrase of [
  'Kort dagsoppsummering',
  'Dette leses som en dagslogg',
  'Innholdstype: day_log',
  'Oppsummer hendelsene kort',
  'Finn ett mønster eller én følelse',
  'Velg én ting du tar med videre i morgen',
  'knapphetsskolen',
  'politisk økologi',
  'konkurrerende forklaringsmodeller',
  'metode, funn og teori',
  'hovedforklaring og alternativ forklaring',
  'Samtidshistoriske brudd',
  'Historiske lag i byrom',
  'Digital litteratur',
  'Nærlesning'
]) assert.ok(!readableMd.includes(phrase), `Readable markdown should not include: ${phrase}`);

for (const phrase of [
  'Den hellige ånd',
  'tungetale',
  'Babels tårn',
  'kirkens fødselsdag',
  'pentekosté',
  'Kristendom',
  'Kirkehistorie',
  'Det nye testamentet',
  'Det gamle testamentet'
]) assert.ok(readableMd.includes(phrase), `Readable markdown should include: ${phrase}`);

for (const section of [
  '## Full eksportdata',
  '### Full bundle',
  '### Rå auto-output payload',
  '### Valgt afterwork',
  '### Relevante afterworks',
  '### Chamber insights',
  '### Chamber chatLog',
  '### Meta-profil',
  '### Chamber meta',
  '### KnowledgeMap / kunnskapstre',
  '### Calibration status',
  '### Full chamber snapshot'
]) assert.ok(md.includes(section), `Markdown should include section: ${section}`);

for (const marker of [
  'RAW_PAYLOAD_MARKER_TEST_228',
  'afterwork_test_228',
  'AFTERWORK_NOTE',
  'CHAMBER_INSIGHT_TEXT',
  'CHAMBER_CHAT_TEXT',
  'CHAMBER_META_PROFILE',
  'KNOWLEDGE_NODE_TITLE'
]) assert.ok(md.includes(marker), `Markdown should include marker: ${marker}`);

for (const key of [
  'rawAutoPayload',
  'selectedAfterwork',
  'relevantAfterworks',
  'allAfterworkCount',
  'chamberInsights',
  'chamberChatLog',
  'chamberMeta',
  'fullChamberSnapshot'
]) assert.ok(Object.prototype.hasOwnProperty.call(bundle, key), `Bundle should include key: ${key}`);

console.log('aha-fagtekst-export-regression passed');
