const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

class El {
  constructor() {
    this.dataset = {};
    this._html = '';
    this.textContent = '';
    this.disabled = false;
    this.hidden = false;
    this.className = '';
    this.classList = { toggle() {}, add() {}, remove() {} };
  }
  set innerHTML(value) { this._html = String(value || ''); }
  get innerHTML() { return this._html; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
  appendChild() {}
}

function makeContext() {
  const store = new Map();
  const els = new Map();
  [
    'aha-auto-output',
    'aha-answer-composer-status',
    'aha-answer-composer-details',
    'aha-answer-evaluation-status',
    'aha-processing-indicator',
    'aha-processing-text',
    'btn-send'
  ].forEach((id) => els.set(id, new El()));

  const context = {
    window: null,
    console,
    document: {
      readyState: 'loading',
      addEventListener() {},
      body: new El(),
      getElementById: (id) => els.get(id) || null,
      querySelectorAll: () => [],
      createElement: () => new El()
    },
    localStorage: {
      getItem: (key) => store.get(key) || null,
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
    },
    navigator: { clipboard: {} },
    Event: function Event(type) { this.type = type; },
    CustomEvent: function CustomEvent(type, options) { this.type = type; this.detail = options && options.detail; },
    setTimeout,
    clearTimeout,
    Date,
    Math,
    URL: { createObjectURL() {}, revokeObjectURL() {} },
    Blob: function Blob() {},
    fetch: async () => ({ ok: true, json: async () => ({ reply: 'ok' }) })
  };

  context.window = context;
  context.globalThis = context;
  [
    'js/ahaChatTextUtils.js',
    'js/ahaChatSignals.js',
    'js/ahaChatSubjects.js',
    'js/ahaChatAnalysis.js',
    'js/ahaChatReplyFormat.js',
    'js/ahaChatExport.js',
    'js/ahaChatMemoryControls.js',
    'js/ahaChatAfterwork.js',
    'js/ahaChatMemoryRuntime.js',
    'js/ahaChatRunContext.js',
    'js/ahaChatInsightView.js',
    'js/ahaChatAutoAnalysis.js', 'js/ahaChatAutoOutputView.js',
    'js/ahaChatAnalysisPolicy.js', 'js/ahaChatConceptPolicy.js', 'js/ahaChatCanonicalAnalysis.js', 'js/ahaChatKnowledgeView.js', 'js/ahaChatInsightPipeline.js', 'js/ahaChatPersonalUi.js', 'js/ahaChatConversationView.js', 'js/ahaChatAnalysisRunContract.js', 'js/ahaChatAcademicInsightView.js', 'js/ahaChat.js'
  ].forEach((file) => vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file }));

  return context;
}

const cases = [
  {
    id: 'public_admin',
    anchor: 'Forvaltningskompasset',
    subject: { subject_id: 'politikk', title: 'Politikk' },
    source: `Sammendrag\nI denne artikkelen undersøker vi Forvaltningskompasset som betegnelse på hvordan NAV-reformen påvirker offentlig forvaltning, velferdsstat og arbeidslinja. Data fra intervjuer med ansatte i stat og kommune viser at styring og skjønnsutøvelse trekker i ulike retninger. Metoden kombinerer dokumentanalyse og kvalitative intervjuer. Resultatene viser at organisatoriske grenser påvirker hvordan reformen brukes i praksis.\nNøkkelord: NAV-reformen, offentlig forvaltning, stat og kommune, implementering, evaluering.`
  },
  {
    id: 'sahel',
    anchor: 'Sahelresiliens',
    subject: { subject_id: 'natur', title: 'Natur' },
    source: `Sammendrag\nI denne artikkelen undersøker vi Sahelresiliens i Mali og Sahel gjennom politisk økologi, ressursknapphet og miljødegradering. Empirien bygger på feltarbeid og intervjuer om beite, jordbruk og lokal konflikt. Funnene viser at klima alene ikke forklarer vold, fordi makt, produksjonsforhold og institusjoner former sårbarheten. Studien sammenligner miljøsikkerhet med alternative forklaringer.\nNøkkelord: Sahel, Mali, politisk økologi, miljøsikkerhet, ressursknapphet.`
  },
  {
    id: 'media_history',
    anchor: 'Redaksjonsarkivet',
    subject: { subject_id: 'historie', title: 'Historie' },
    source: `Sammendrag\nI denne artikkelen undersøker vi Redaksjonsarkivet som kilde til Morgenbladets institusjons- og mediehistorie. Avisens redaksjonelle praksis, eierskap og offentlig rolle analyseres gjennom historiske utgaver, arkivmateriale og redaksjonelle dokumenter. Funnene viser hvordan institusjonen endret seg gjennom teknologiske og økonomiske skifter. Metoden er historisk kildekritikk og komparativ medieanalyse.\nNøkkelord: Morgenbladet, mediehistorie, redaksjon, eierskap, institusjon.`
  },
  {
    id: 'literature',
    anchor: 'Fortellerbindingen',
    subject: { subject_id: 'litteratur', title: 'Litteratur' },
    source: `Sammendrag\nI denne artikkelen undersøker vi Fortellerbindingen i Karl Ove Knausgårds Min kamp som litterært grep mellom selvbiografi, hukommelse og tilknytning. Nærlesning av fortellerposisjon og komposisjon viser hvordan jeget skaper avstand til egne erfaringer samtidig som teksten søker autentisitet. Metoden kombinerer narratologi og litterær analyse. Studien diskuterer spenningen mellom levd liv og litterær form.\nNøkkelord: Knausgård, Min kamp, narratologi, tilknytning, selvbiografi.`
  },
  {
    id: 'religion',
    anchor: 'Åndsnarrativet',
    subject: { subject_id: 'historie', title: 'Historie' },
    source: `Sammendrag\nI denne artikkelen undersøker vi Åndsnarrativet i pinsefortellingen, der Den hellige ånd, tungetale og apostlene står sentralt. Teksten sammenligner Apostlenes gjerninger med senere kristen tradisjon og spør hvordan pinse forstås som kirkens fødsel. Metoden er teksthistorisk analyse og religionshistorisk sammenligning. Funnene viser variasjon mellom liturgisk tradisjon og moderne kirkesamfunn.\nNøkkelord: pinse, Den hellige ånd, tungetale, apostlene, religionshistorie.`
  }
];

const context = makeContext();
const hooks = context.AHATestHooks;
const seenAnchors = [];
const seenRuns = new Set();
const seenHashes = new Set();
let previousCanonical = null;
let previousRun = null;

for (const testCase of cases) {
  assert.equal(hooks.detectTextType(testCase.source), 'academic_article', `${testCase.id} must enter the academic document path`);
  assert.equal(hooks.isTransientAnalysisDocument(testCase.source), true, `${testCase.id} must stay transient analysis material`);

  const raw = hooks.buildAutoOutputs(testCase.source, '');
  assert.equal(raw.analysisKnowledgePolicy.durableKnowledgeSource, 'fagverk');
  assert.equal(raw.analysisKnowledgePolicy.currentDocumentRole, 'analysis_source');
  assert.equal(raw.analysisKnowledgePolicy.legacyArticleTemplatesEnabled, false);
  assert.equal(raw.analysisKnowledgePolicy.persistAsMemory, false);

  const routed = hooks.applyRuntimeKnowledgePolicy({ ...raw, subjectMatches: [testCase.subject] }, testCase.source);
  const serialized = JSON.stringify(routed);
  assert.match(serialized, new RegExp(testCase.anchor, 'i'), `${testCase.id} output must remain grounded in its own source`);
  for (const oldAnchor of seenAnchors) {
    assert.doesNotMatch(serialized, new RegExp(oldAnchor, 'i'), `${testCase.id} must not inherit content from an earlier analysis`);
  }

  assert.deepEqual(
    Array.from(routed.subjectMatches || [], (item) => String(item.subject_id || item.id || item.title || '')),
    [testCase.subject.subject_id],
    `${testCase.id} must keep only its current Fagverk routing`
  );

  const canonical = hooks.buildCanonicalAnalysis(routed, testCase.source);
  assert.notEqual(canonical.domain, 'fagverk_routed_academic', 'semantic domain and Fagverk routing must remain separate');
  assert.ok(canonical.domain, `${testCase.id} must have a semantic analysis domain`);
  assert.deepEqual(
    Array.from(canonical.historyGoLinks || [], (item) => item.title),
    [testCase.subject.title],
    `${testCase.id} canonical History Go links must come only from the current Fagverk match`
  );

  const run = hooks.createAnalysisRun(testCase.source, { sourceKind: 'pasted_text' });
  hooks.bindAnalysisArtifact(canonical, run);
  assert.equal(hooks.artifactMatchesActiveRun(canonical, run), true);
  assert.equal(seenRuns.has(run.runId), false, `${testCase.id} must have a unique run id`);
  assert.equal(seenHashes.has(run.sourceHash), false, `${testCase.id} must have a unique source hash`);

  if (previousCanonical && previousRun) {
    assert.equal(hooks.artifactMatchesActiveRun(previousCanonical, run), false, `${testCase.id} must reject the previous run artifact`);
    assert.equal(hooks.artifactMatchesActiveRun(canonical, previousRun), false, `${testCase.id} artifact must not bind backwards to the previous run`);
  }

  seenAnchors.push(testCase.anchor);
  seenRuns.add(run.runId);
  seenHashes.add(run.sourceHash);
  previousCanonical = canonical;
  previousRun = run;
}

assert.equal(seenRuns.size, cases.length);
assert.equal(seenHashes.size, cases.length);
console.log(`aha-cross-domain-isolation-gate passed: ${cases.length}/${cases.length} sequential academic domains isolated`);
