const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const textUtilsCode = fs.readFileSync('ahaChatTextUtils.js', 'utf8');
const signalsCode = fs.readFileSync('ahaChatSignals.js', 'utf8');
const exportCode = fs.readFileSync('ahaChatExport.js', 'utf8');
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
    this.disabled = false;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.offsetTop = 0;
    this._className = '';
    this._textContent = '';
    this._innerHTML = '';
    this.classList = {
      add: (className) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.add(className);
        this.className = [...classes].join(' ');
      },
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
  click() { if (!this.disabled && this.eventListeners.click) this.eventListeners.click({ target: this }); }
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
  ['chat-log', 'empty-state', 'chat-status-note', 'aha-memory-status', 'aha-memory-controls', 'panel'].forEach((id) => {
    elementsById.set(id, new TestElement('div'));
  });
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
  context.dispatchEvent = () => true;
  context.__elementsById = elementsById;
  context.__store = store;
  vm.createContext(context);
  vm.runInContext(textUtilsCode, context, { filename: 'ahaChatTextUtils.js' });
  vm.runInContext(signalsCode, context, { filename: 'ahaChatSignals.js' });
  vm.runInContext(exportCode, context, { filename: 'ahaChatExport.js' });
  vm.runInContext(chatCode, context, { filename: 'ahaChat.js' });
  return context;
}

(async () => {
  const ctx = buildContext();
  const hooks = ctx.AHATestHooks;

  const defaults = hooks.loadAhaMemoryExclusions();
  assert.deepEqual(defaults.excludedInsightIds, [], 'default excludedInsightIds should be empty');
  assert.deepEqual(defaults.excludedKeys, [], 'default excludedKeys should be empty');

  hooks.excludeAhaMemoryInsight({ id: 'i1', title: 'Test', summary: '...' });
  assert.equal(hooks.isAhaMemoryInsightExcluded({ id: 'i1', title: 'Test', summary: '...' }), true, 'excluded id should be detected');

  hooks.includeAhaMemoryInsight('i1');
  assert.equal(hooks.isAhaMemoryInsightExcluded({ id: 'i1', title: 'Test', summary: '...' }), false, 'included id should not remain excluded');

  const chamber = {
    insights: [
      { id: 'excluded', title: 'AHA minne plan', summary: 'AHA trenger en tydelig minne plan og neste steg.', concepts: ['AHA', 'minne'] },
      { id: 'kept', title: 'AHA minne retning', summary: 'AHA trenger trygg minne retning og neste steg.', concepts: ['AHA', 'minne'] }
    ]
  };
  hooks.excludeAhaMemoryInsight({ id: 'excluded', title: 'AHA minne plan', summary: 'AHA trenger en tydelig minne plan og neste steg.' });
  const localMatches = hooks.findRelevantLocalMemory('Hva gjør vi nå med AHA minne?', chamber, { explicitReference: true, continuity: true, limit: 5 });
  assert.deepEqual(localMatches.map((match) => match.insight.id), ['kept'], 'local matching should filter excluded insights before scoring');

  const memoryContext = await hooks.buildAhaMemoryContext('Hva husker du om AHA minne?', { chamber });
  assert.equal(memoryContext.used, true, 'memory context should still use non-excluded matches');
  assert.equal(memoryContext.selectedInsights.some((insight) => insight.id === 'excluded'), false, 'selectedInsights should omit excluded insight');
  assert.doesNotMatch(memoryContext.summaryForAgent, /AHA minne plan/, 'summaryForAgent should omit excluded insight');
  assert.match(memoryContext.summaryForAgent, /AHA minne retning/, 'summaryForAgent should include non-excluded insight');

  hooks.resetAhaMemoryExclusions();
  const row = new TestElement('article');
  hooks.renderAhaMemoryTransparency(row, {
    used: true,
    reason: 'Testminne.',
    mode: 'continuity',
    confidence: 0.8,
    selectedInsights: [{ id: 'transparent-1', title: 'Transparent innsikt', summary: 'Brukt i svaret.', concepts: ['AHA'] }]
  });
  const buttons = row.querySelectorAll('button');
  const excludeButton = buttons.find((button) => button.textContent === 'Ikke bruk igjen');
  assert.ok(excludeButton, 'transparency should render Ikke bruk igjen action');
  excludeButton.click();
  assert.equal(hooks.isAhaMemoryInsightExcluded({ id: 'transparent-1', title: 'Transparent innsikt', summary: 'Brukt i svaret.' }), true, 'clicking transparency action should store exclusion');

  ctx.AHAMemoryExclusions.exclude({ id: 'console-1', title: 'Console', summary: 'Helper' });
  assert.equal(ctx.AHAMemoryExclusions.isExcluded({ id: 'console-1' }), true, 'console helper should exclude insights');
  ctx.AHAMemoryExclusions.include('console-1');
  assert.equal(ctx.AHAMemoryExclusions.isExcluded({ id: 'console-1' }), false, 'console helper should include insights again');
  ctx.AHAMemoryExclusions.exclude({ title: 'Nøkkel', summary: 'Uten id' });
  assert.equal(ctx.AHAMemoryExclusions.get().excludedKeys.length, 1, 'console helper should store stable keys for insights without id');
  const reset = ctx.AHAMemoryExclusions.reset();
  assert.deepEqual(reset.excludedInsightIds, [], 'console helper reset should clear ids');
  assert.deepEqual(reset.excludedKeys, [], 'console helper reset should clear keys');

  console.log('aha-memory-exclusions ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
