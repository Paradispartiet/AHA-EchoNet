const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor() {
    this.dataset = {};
    this.innerHTML = '';
    this.textContent = '';
    this.disabled = false;
    this.hidden = false;
  }
}

const elements = new Map();
[
  'aha-auto-output', 'afterwork-panel', 'aha-answer-evaluation-status',
  'aha-processing-indicator', 'aha-processing-text', 'btn-send', 'chat-log',
  'meta-profile-panel', 'btn-export-analysis', 'btn-export-analysis-json',
  'btn-export-analysis-main', 'btn-export-analysis-json-main', 'btn-export'
].forEach((id) => elements.set(id, new Element()));

const bodyClasses = new Map();
const events = [];
const context = {
  console,
  Date,
  Map,
  Object,
  String,
  document: {
    body: { classList: { toggle(name, active) { bodyClasses.set(name, active); } } },
    getElementById(id) { return elements.get(id) || null; }
  },
  AHAExplorer: { clear(run) { events.push(`explorer:${run?.analysisRunId || ''}`); } }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/ahaModuleApi.js', 'utf8'), context, { filename: 'js/ahaModuleApi.js' });
vm.runInContext(fs.readFileSync('js/ahaChatAnalysisStateView.js', 'utf8'), context, { filename: 'js/ahaChatAnalysisStateView.js' });

const facade = context.AHAModuleApi.get('chat.analysisStateView', { version: 1 });
assert.equal(Object.isFrozen(facade), true);
assert.equal(typeof facade.create, 'function');

let activeRun = null;
let cacheClears = 0;
const stateView = facade.create({
  getActiveAnalysisRun: () => activeRun,
  setActiveAnalysisRun(run) { activeRun = run; events.push(`active:${run.analysisRunId}`); },
  clearAutoOutputs() { cacheClears += 1; },
  escHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },
  renderAhaPersonalRetrieval(value) { events.push(`retrieval:${value}`); },
  renderAhaAnswerComposer(value) { events.push(`composer:${value}`); },
  renderPanel(value) { events.push(`panel:${value}`); },
  renderHighlightsRail() { events.push('highlights'); },
  updateEmptyState() { events.push('empty-state'); },
  now: () => '2026-08-13T21:00:00.000Z'
});
assert.equal(Object.isFrozen(stateView), true);

stateView.setProcessing(true, 'Analyserer kontrakt');
assert.equal(elements.get('aha-processing-text').textContent, 'Analyserer kontrakt');
assert.equal(elements.get('aha-processing-indicator').hidden, false);
assert.equal(elements.get('btn-send').disabled, true);
assert.equal(bodyClasses.get('aha-is-processing'), true);
stateView.setProcessing(false);
assert.equal(elements.get('aha-processing-indicator').hidden, true);
assert.equal(elements.get('btn-send').disabled, false);
assert.equal(bodyClasses.get('aha-is-processing'), false);

stateView.setExportButtonsEnabled(true);
for (const id of ['btn-export-analysis', 'btn-export-analysis-json', 'btn-export-analysis-main', 'btn-export-analysis-json-main', 'btn-export']) {
  assert.equal(elements.get(id).disabled, false, `${id} must be enabled`);
}

const run = {
  analysisId: 'analysis_1',
  analysisRunId: 'run_1',
  sourceId: 'source_1',
  sourceHash: 'hash_1',
  sourcePreview: 'Kilde én'
};
stateView.clearActiveAnalysisState(run, 'Ny <kilde>');
const host = elements.get('aha-auto-output');
assert.equal(activeRun, run);
assert.equal(cacheClears, 1);
assert.equal(host.dataset.analysisId, 'analysis_1');
assert.equal(host.dataset.analysisRunId, 'run_1');
assert.equal(host.dataset.runId, 'run_1');
assert.equal(host.dataset.sourceId, 'source_1');
assert.equal(host.dataset.sourceTextHash, 'hash_1');
assert.equal(host.dataset.sourceTextPreview, 'Kilde én');
assert.match(host.innerHTML, /Ny &lt;kilde&gt;/);
assert.match(host.innerHTML, /activeRunId<\/dt><dd>run_1/);
assert.equal(elements.get('afterwork-panel').innerHTML, '');
assert.equal(elements.get('aha-answer-evaluation-status').textContent, 'Svar-evaluering venter på aktiv analyse.');
assert.ok(events.includes('explorer:run_1'));
for (const id of ['btn-export-analysis', 'btn-export-analysis-json', 'btn-export-analysis-main', 'btn-export-analysis-json-main', 'btn-export']) {
  assert.equal(elements.get(id).disabled, true, `${id} must be disabled for a new run`);
}

for (const id of ['chat-log', 'aha-auto-output', 'meta-profile-panel', 'afterwork-panel']) {
  elements.get(id).innerHTML = 'stale';
}
elements.get('aha-auto-output').dataset.sourceText = 'stale source';
elements.get('aha-auto-output').dataset.sourceTextHash = 'stale hash';
elements.get('aha-auto-output').dataset.sourceTextPreview = 'stale preview';
elements.get('afterwork-panel').dataset.sourceText = 'stale source';
stateView.resetView();
for (const id of ['chat-log', 'aha-auto-output', 'meta-profile-panel', 'afterwork-panel']) {
  assert.equal(elements.get(id).innerHTML, '', `${id} must be visually reset`);
}
assert.equal('sourceText' in elements.get('aha-auto-output').dataset, false);
assert.equal('sourceTextHash' in elements.get('aha-auto-output').dataset, false);
assert.equal('sourceTextPreview' in elements.get('aha-auto-output').dataset, false);
assert.ok(events.includes('highlights'));
assert.ok(events.includes('empty-state'));

console.log('aha-chat-analysis-state-view tests passed');
