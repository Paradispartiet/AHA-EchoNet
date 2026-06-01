const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const textUtilsCode = fs.readFileSync('ahaChatTextUtils.js', 'utf8');
const signalsCode = fs.readFileSync('ahaChatSignals.js', 'utf8');
const exportCode = fs.readFileSync('ahaChatExport.js', 'utf8');
const subjectsCode = fs.readFileSync('ahaChatSubjects.js', 'utf8');
const analysisCode = fs.readFileSync('ahaChatAnalysis.js', 'utf8');
const chatCode = fs.readFileSync('ahaChat.js', 'utf8');

class TestElement {
  constructor(tagName) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.eventListeners = {};
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.offsetTop = 0;
    this._className = '';
    this._textContent = '';
    this._innerHTML = '';
    this.classList = {
      toggle: (className, force) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        const shouldAdd = force === undefined ? !classes.has(className) : Boolean(force);
        if (shouldAdd) classes.add(className);
        else classes.delete(className);
        this.className = [...classes].join(' ');
      }
    };
  }

  set className(value) { this._className = String(value || ''); }
  get className() { return this._className; }
  set textContent(value) { this._textContent = String(value ?? ''); this.children = []; }
  get textContent() { return this._textContent + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(value) { this._innerHTML = String(value ?? ''); if (!value) this.children = []; }
  get innerHTML() { return this._innerHTML; }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  addEventListener(type, handler) { this.eventListeners[type] = handler; }
  scrollIntoView() {}

  matches(selector) {
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  querySelectorAll(selector) {
    const result = [];
    const visit = (node) => {
      node.children.forEach((child) => {
        if (child.matches(selector)) result.push(child);
        visit(child);
      });
    };
    visit(this);
    return result;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function buildContext() {
  const store = new Map();
  const elementsById = new Map();
  const document = {
    readyState: 'loading',
    addEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
    body: new TestElement('body'),
    createElement: (tag) => new TestElement(tag),
    getElementById: (id) => elementsById.get(id) || null
  };
  elementsById.set('chat-log', new TestElement('section'));
  elementsById.set('empty-state', new TestElement('div'));
  const context = {
    window: null,
    console,
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, reply: 'Svar' }) }),
    navigator: { clipboard: { writeText: async () => {} } },
    document,
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key)
    },
    setTimeout,
    clearTimeout,
    URL: { createObjectURL: () => 'blob:dummy', revokeObjectURL: () => {} },
    Blob: function Blob() {},
    Date,
    Math,
    JSON,
    AHA_AGENT_API: 'https://agent.example/api/aha-agent',
    InsightsEngine: {
      createEmptyChamber: () => ({ insights: [], chatLog: [] }),
      getActiveInsights: (chamber) => (chamber.insights || []).filter((ins) => !ins.archived && !ins.rejected && !ins.merged_into),
      buildMetaProfile: () => ({})
    },
    MetaInsightsEngine: { buildUserMetaProfile: () => ({}) }
  };
  context.window = context;
  context.location = { hostname: 'localhost' };
  context.addEventListener = () => {};
  context.__elementsById = elementsById;
  vm.createContext(context);
  vm.runInContext(textUtilsCode, context, { filename: 'ahaChatTextUtils.js' });
  vm.runInContext(signalsCode, context, { filename: 'ahaChatSignals.js' });
  vm.runInContext(exportCode, context, { filename: 'ahaChatExport.js' });
  vm.runInContext(subjectsCode, context, { filename: 'ahaChatSubjects.js' });
  vm.runInContext(analysisCode, context, { filename: 'ahaChatAnalysis.js' });
  vm.runInContext(chatCode, context, { filename: 'ahaChat.js' });
  return context;
}

function sampleMemoryContext(used = true) {
  return {
    used,
    reason: used ? 'Kontinuitet i AHA-arbeidet.' : 'Ingen tydelige, relevante minnetreff.',
    mode: used ? 'continuity' : 'off',
    confidence: used ? 0.824 : 0,
    selectedInsights: Array.from({ length: 7 }, (_, index) => ({
      id: `ins-${index + 1}`,
      title: `Innsikt ${index + 1}`,
      summary: `Kort sammendrag ${index + 1}`,
      concepts: ['AHA', { label: 'minne' }],
      source: 'local',
      score: 7 + index,
      similarity: 0.7 + index / 100
    }))
  };
}

const ctx = buildContext();
const hooks = ctx.AHATestHooks;

const used = hooks.buildAhaMemoryTransparency(sampleMemoryContext(true));
assert.equal(used.visible, true, 'used memory should be visible');
assert.match(used.label, /Brukte relevant AHA-minne/, 'used label should explain memory use');
assert.equal(used.selectedInsights.length, 5, 'selected insights should be capped at five');
const usedDetails = hooks.formatAhaMemoryTransparencyDetails(used);
assert.match(usedDetails, /Kontinuitet i AHA-arbeidet\./, 'details should include reason');
assert.match(usedDetails, /Modus: continuity/, 'details should include mode');
assert.match(usedDetails, /Sikkerhet: 0\.82/, 'details should include rounded confidence');
assert.match(usedDetails, /Innsikt 1/, 'details should include insight title');
assert.doesNotMatch(usedDetails, /\[object Object\]/, 'details should not leak object stringification');

const unusedNoDebug = hooks.buildAhaMemoryTransparency(sampleMemoryContext(false));
assert.equal(unusedNoDebug.visible, false, 'unused memory should be hidden when debug is off');

ctx.AHAMemoryDebug.enable();
const unusedDebug = hooks.buildAhaMemoryTransparency(sampleMemoryContext(false));
assert.equal(unusedDebug.visible, true, 'unused memory should be visible when debug is on');
assert.match(unusedDebug.label, /Minne ikke brukt/, 'unused debug label should explain no memory was used');
assert.match(hooks.formatAhaMemoryTransparencyDetails(unusedDebug), /Ingen tydelige, relevante minnetreff\./, 'unused debug details should include reason');
ctx.AHAMemoryDebug.disable();

hooks.appendChat('aha', 'AHA-svar', { memoryContext: sampleMemoryContext(true) });
let log = ctx.__elementsById.get('chat-log');
const ahaRow = log.children[0];
const transparencyNode = log.querySelector('.memory-transparency');
assert.equal(log.querySelectorAll('.memory-transparency').length, 1, 'appendChat should render memory transparency under AHA replies when memory was used');
assert.match(transparencyNode.textContent, /Brukte relevant AHA-minne/, 'rendered transparency should include the used label');
assert.match(ahaRow.className, /chat-line-row-aha/, 'memory transparency should be attached to the AHA row');
assert.equal(transparencyNode.parentNode, ahaRow, 'memory transparency should stay inside the AHA row below the reply');
assert.ok(ahaRow.children.indexOf(transparencyNode) > ahaRow.children.findIndex((child) => child.matches('.chat-line-aha')), 'memory transparency should be inserted after the AHA message bubble');

hooks.appendChat('user', 'Brukermelding', { memoryContext: sampleMemoryContext(true) });
assert.equal(log.querySelectorAll('.memory-transparency').length, 1, 'appendChat should not render memory transparency under user messages');

hooks.appendChat('aha', 'AHA-svar uten minne', { memoryContext: sampleMemoryContext(false) });
assert.equal(log.querySelectorAll('.memory-transparency').length, 1, 'appendChat should not render unused memory transparency when debug is off');

console.log('aha-memory-transparency ok');
