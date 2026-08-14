const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/ahaChatKnowledgeView.js', 'utf8');
const context = { window: null, globalThis: null, console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'js/ahaChatKnowledgeView.js' });

assert.equal(typeof context.AHAChatKnowledgeView?.create, 'function');

const rendered = [];
const chamber = { insights: [] };
context.InsightsEngine = {
  computeTopicStats: () => ({ insights: 0 }),
  getRecurringThemes: () => ({}),
  buildConceptGraph: () => ({ nodes: {}, edges: [] }),
  detectTensions: () => []
};
context.MetaInsightsEngine = {
  buildUserMetaProfile: () => ({ insights: [], temporal: {}, tensions: {}, recommendations: {} })
};

const view = context.AHAChatKnowledgeView.create({
  subjectId: 'sub_test',
  loadChamberFromStorage: () => chamber,
  getThemeId: () => 'theme_test',
  out: (value) => rendered.push(['out', value]),
  currentInsights: () => [],
  loadAutoOutputs: () => null,
  loadAfterworkEntries: () => [],
  filterConceptLabels: (items) => items,
  canonicalizeDisplayConcept: (value) => String(value || ''),
  escHtml: (value) => String(value || ''),
  extractAcademicPhraseConcepts: () => [],
  extractAcademicTheoryLinks: () => [],
  prioritizeVisibleConceptEdges: (items) => items,
  isGenericDisplayConcept: () => false,
  normalizeAfterworkConcept: (value) => String(value || '').toLowerCase().trim(),
  normalizeConceptKey: (value) => String(value || '').toLowerCase().trim(),
  getCanonicalConceptLabel: (value) => String(value || '').trim(),
  getCanonicalConceptKey: (value) => String(value || '').toLowerCase().trim(),
  isBlockedStandaloneConcept: () => false,
  applyPhraseConceptDisplayPreference: (items) => items,
  detectPublicAdministrationReformSignal: () => ({ strong: false }),
  readLatestAcademicContext: () => ({ sourceText: '', payload: {} }),
  detectAutoAnalysisDomain: () => 'general',
  renderAuxPanel: (id, html) => rendered.push([id, html]),
  renderPanel: (html) => rendered.push(['panel', html])
});

for (const method of ['normalizeConceptKey', 'getCanonicalConceptLabel', 'isBlockedStandaloneConcept', 'showStatus', 'showConcepts', 'renderKnowledgeMapSection', 'renderMetaProfile', 'showMeta', 'showKnowledgeMap']) {
  assert.equal(typeof view[method], 'function', `knowledge view must expose ${method}`);
}

view.showStatus();
assert.match(rendered.at(-1)[1], /"insights": 0/);

view.showConcepts();
assert.match(rendered.at(-1)[1], /"concepts": \[\]/);

view.showMeta();
assert.ok(rendered.some(([target, html]) => target === 'meta-profile-panel' && html.includes('Hva AHA ser')));

view.showKnowledgeMap();
assert.ok(rendered.some(([target, html]) => target === 'panel' && html.includes('ikke nok innsikter')));

const activeRendered = [];
const activeView = context.AHAChatKnowledgeView.create({
  subjectId: 'sub_test',
  loadChamberFromStorage: () => ({ insights: [] }),
  getThemeId: () => 'theme_test',
  out: () => {},
  currentInsights: () => [],
  loadAutoOutputs: () => null,
  loadAfterworkEntries: () => [],
  filterConceptLabels: (items) => items,
  canonicalizeDisplayConcept: (value) => String(value || ''),
  escHtml: (value) => String(value || ''),
  extractAcademicPhraseConcepts: () => [],
  extractAcademicTheoryLinks: () => [],
  prioritizeVisibleConceptEdges: (items) => items,
  isGenericDisplayConcept: () => false,
  normalizeAfterworkConcept: (value) => String(value || '').toLowerCase().trim(),
  normalizeConceptKey: (value) => String(value || '').toLowerCase().trim(),
  getCanonicalConceptLabel: (value) => String(value || '').trim(),
  getCanonicalConceptKey: (value) => String(value || '').toLowerCase().trim(),
  isBlockedStandaloneConcept: () => false,
  applyPhraseConceptDisplayPreference: (items) => items,
  detectPublicAdministrationReformSignal: () => ({ strong: false }),
  readLatestAcademicContext: () => ({
    sourceText: 'AI i læring',
    payload: {
      canonicalAnalysis: {
        theme: 'AI og læring',
        mainTension: 'automatisering kontra egen vurdering',
        keyInsight: 'AI bør støtte, ikke erstatte, kritisk egenarbeid.',
        fieldConnections: ['pedagogikk', 'teknologi'],
        suggestedActions: ['Test kildenes usikkerhet.']
      },
      ahaSer: { nesteSteg: 'Test kildenes usikkerhet.' }
    }
  }),
  detectAutoAnalysisDomain: () => 'digital_pedagogy_knowledge_systems',
  renderAuxPanel: () => {},
  renderPanel: (html) => activeRendered.push(html)
});
activeView.showKnowledgeMap();
assert.match(activeRendered.at(-1), /Aktiv tekst · dette ser AHA nå/);
assert.match(activeRendered.at(-1), /AI og læring/);
assert.match(activeRendered.at(-1), /automatisering kontra egen vurdering/);
assert.match(activeRendered.at(-1), /pedagogikk ↔ teknologi/);
assert.match(activeRendered.at(-1), /data-analysis-artifact="mindmap"/);
assert.match(activeRendered.at(-1), /data-analysis-artifact="path"/);
assert.match(activeRendered.at(-1), /data-analysis-quality="useful"/);
assert.match(activeRendered.at(-1), /data-analysis-quality="too_generic"/);
assert.match(activeRendered.at(-1), /data-analysis-quality="misinterpreted"/);
assert.match(activeRendered.at(-1), /data-analysis-quality="missing_evidence"/);
assert.doesNotMatch(activeRendered.at(-1), /ikke nok innsikter/);

const html = fs.readFileSync('chat.html', 'utf8');
assert.ok(html.indexOf('js/ahaChatKnowledgeView.js') < html.indexOf('js/ahaChat.js'));
assert.ok(html.indexOf('js/ahaLists.js') < html.indexOf('js/ahaAnalysisArtifacts.js'));
assert.ok(html.indexOf('js/ahaPaths.js') < html.indexOf('js/ahaAnalysisArtifacts.js'));

console.log('aha-chat-knowledge-view passed');
