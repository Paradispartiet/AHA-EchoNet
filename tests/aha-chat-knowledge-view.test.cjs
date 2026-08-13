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
  filterConceptLabels: (items) => items,
  canonicalizeDisplayConcept: (value) => String(value || ''),
  escHtml: (value) => String(value || ''),
  resolveActiveAnalysisContext: () => ({}),
  extractAcademicPhraseConcepts: () => [],
  extractAcademicTheoryLinks: () => [],
  prioritizeVisibleConceptEdges: (items) => items,
  isGenericDisplayConcept: () => false,
  normalizeConceptSurface: (value) => String(value || ''),
  normalizeVisibleAcademicLabel: (value) => String(value || ''),
  normalizeAfterworkConcept: (value) => String(value || '').toLowerCase().trim(),
  applyPhraseConceptDisplayPreference: (items) => items,
  detectPublicAdministrationReformSignal: () => ({ strong: false }),
  buildConceptEdgeContext: () => ({ text: '' }),
  collectTheoryNodeLabels: () => [],
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

const html = fs.readFileSync('chat.html', 'utf8');
assert.ok(html.indexOf('js/ahaChatKnowledgeView.js') < html.indexOf('js/ahaChat.js'));

console.log('aha-chat-knowledge-view passed');
