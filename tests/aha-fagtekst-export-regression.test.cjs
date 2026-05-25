const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('ahaChat.js', 'utf8');

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
    buildMetaProfile: () => ({})
  }
};
context.window = context;
context.addEventListener = () => {};

vm.createContext(context);
vm.runInContext(code, context, { filename: 'ahaChat.js' });

const hooks = context.AHATestHooks;
assert.ok(hooks, 'AHATestHooks should exist');

const detected = hooks.detectTextType(pinseText);
assert.equal(detected, 'academic_article');
assert.notEqual(detected, 'day_log');
assert.notEqual(detected, 'general');
assert.notEqual(detected, 'literary_diary');

const payload = hooks.buildAutoOutputs(pinseText, '');
const canonical = hooks.buildCanonicalAnalysis(payload, pinseText);
assert.equal(canonical.contentType, 'academic_article');
assert.ok(canonical.ahaSer.tema && canonical.ahaSer.tema.trim().length > 0);
assert.ok(canonical.ahaSer.hovedspenning && canonical.ahaSer.hovedspenning.trim().length > 0);
assert.ok(canonical.ahaSer.viktigsteInnsikt && canonical.ahaSer.viktigsteInnsikt.trim().length > 0);
assert.ok(canonical.ahaSer.fagkoblinger && canonical.ahaSer.fagkoblinger.trim().length > 0);
assert.ok(canonical.ahaSer.nesteSteg && canonical.ahaSer.nesteSteg.trim().length > 0);

context.localStorage.setItem('aha_chat_auto_outputs_v1', JSON.stringify({
  createdAt: new Date().toISOString(),
  sourceText: pinseText,
  sourceTextHash: 'pinse_hash',
  payload
}));
context.localStorage.setItem('aha_afterwork_v1', JSON.stringify([
  {
    sourceTextHash: 'pinse_hash',
    textType: 'day_log',
    reflection: 'Dette leses som en dagslogg',
    summary: 'Kort dagsoppsummering: ...',
    learningPath: ['Oppsummer hendelsene kort', 'Finn ett mønster eller én følelse', 'Velg én ting du tar med videre i morgen'],
    concepts: []
  }
]));

const bundle = hooks.buildAhaAnalysisExportBundle();
const md = hooks.formatAhaAnalysisExportMarkdown(bundle);
const readableMd = md.split('## Full eksportdata')[0] || md;

assert.ok(md.includes('Kort fagoppsummering'));
assert.ok(!readableMd.includes('Kort dagsoppsummering'));
assert.ok(!readableMd.includes('Dette leses som en dagslogg'));
assert.ok(!readableMd.includes('Innholdstype: day_log'));
assert.ok(md.includes('Fagkoblinger:'));
assert.ok(md.includes('Den hellige ånd'));
assert.ok(md.includes('tungetale'));
assert.ok(md.includes('Babels tårn'));
assert.ok(!readableMd.includes('Oppsummer hendelsene kort'));
assert.ok(!readableMd.includes('Finn ett mønster eller én følelse'));
assert.ok(!readableMd.includes('Velg én ting du tar med videre i morgen'));
assert.ok(!md.includes('Tema: \n'));
assert.ok(!md.includes('Hovedspenning: \n'));
assert.ok(!md.includes('Viktigste innsikt: \n'));
assert.ok(!md.includes('Fagkoblinger: \n'));
assert.ok(!md.includes('Neste steg: \n'));
assert.ok(bundle.rawAutoPayload && typeof bundle.rawAutoPayload === 'object');
assert.ok(bundle.selectedAfterwork && typeof bundle.selectedAfterwork === 'object');
assert.ok(Array.isArray(bundle.relevantAfterworks));
assert.ok(typeof bundle.allAfterworkCount === 'number');
assert.ok(Array.isArray(bundle.chamberInsights));
assert.ok(Array.isArray(bundle.chamberChatLog));
assert.ok(bundle.chamberMeta && typeof bundle.chamberMeta === 'object');
assert.ok(bundle.fullChamberSnapshot && typeof bundle.fullChamberSnapshot === 'object');
assert.ok(md.includes('## Full eksportdata'));
assert.ok(md.includes('### Full bundle'));
assert.ok(md.includes('### Rå auto-output payload'));
assert.ok(md.includes('### Valgt afterwork'));
assert.ok(md.includes('### Relevante afterworks'));
assert.ok(md.includes('### Chamber insights'));
assert.ok(md.includes('### Chamber chatLog'));
assert.ok(md.includes('### Meta-profil'));
assert.ok(md.includes('### Chamber meta'));
assert.ok(md.includes('### KnowledgeMap / kunnskapstre'));
assert.ok(md.includes('### Calibration status'));

console.log('aha-fagtekst-export-regression passed');
