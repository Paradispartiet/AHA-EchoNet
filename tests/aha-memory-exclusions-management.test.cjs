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
    this.attributes = {};
    this.eventListeners = {};
    this.disabled = false;
    this.checked = false;
    this._className = '';
    this._textContent = '';
    this._innerHTML = '';
  }

  set className(value) { this._className = String(value || ''); }
  get className() { return this._className; }
  set textContent(value) { this._textContent = String(value ?? ''); this.children = []; }
  get textContent() {
    const ownText = this._textContent || this._innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return [ownText, ...this.children.map((child) => child.textContent)].filter(Boolean).join(' ');
  }
  set innerHTML(value) {
    this._innerHTML = String(value ?? '');
    this.children = [];
    const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
    let match;
    while ((match = buttonPattern.exec(this._innerHTML))) {
      const button = new TestElement('button');
      button.textContent = match[2].replace(/<[^>]+>/g, '').trim();
      const attrs = match[1] || '';
      const attrPattern = /([a-zA-Z0-9:-]+)(?:="([^"]*)")?/g;
      let attrMatch;
      while ((attrMatch = attrPattern.exec(attrs))) {
        const [, name, attrValue] = attrMatch;
        if (name === 'disabled') button.disabled = true;
        button.setAttribute(name, attrValue === undefined ? '' : attrValue);
      }
      button.parentNode = this;
      this.children.push(button);
    }
  }
  get innerHTML() { return this._innerHTML; }

  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
    if (name === 'id') this.id = String(value);
  }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
  addEventListener(type, handler) { this.eventListeners[type] = handler; }
  click() {
    if (this.disabled) return;
    this.eventListeners.click?.({ type: 'click', target: this });
    this.parentNode?.eventListeners.click?.({ type: 'click', target: this });
  }
  closest(selector) {
    if (selector === '[data-aha-memory-exclusion-action]' && this.getAttribute('data-aha-memory-exclusion-action')) return this;
    return null;
  }
  matches(selector) {
    if (selector === 'button') return this.tagName === 'BUTTON';
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
  focus() {}
  scrollIntoView() {}
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
  ['chat-log', 'empty-state', 'chat-status-note', 'aha-memory-status', 'aha-memory-controls'].forEach((id) => {
    const el = new TestElement('div');
    el.id = id;
    elementsById.set(id, el);
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
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
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
  const controlsHost = ctx.__elementsById.get('aha-memory-controls');

  assert.deepEqual(hooks.getAhaExcludedMemoryItems(), [], 'empty exclusions should produce no management items');
  hooks.renderAhaMemoryControls();
  assert.match(controlsHost.innerHTML, /Ingen innsikter er ekskludert fra minnebruk\./, 'empty controls should explain that no insights are excluded');

  ctx.localStorage.setItem('aha_insight_chamber_v1', JSON.stringify({
    insights: [{ id: 'i1', title: 'AHA retning', summary: 'Neste steg for AHA-minne.' }]
  }));
  hooks.saveAhaMemoryExclusions({ excludedInsightIds: ['i1'], excludedKeys: [] });
  const idItems = hooks.getAhaExcludedMemoryItems();
  assert.equal(idItems.length, 1, 'matching excluded id should produce one item');
  assert.equal(idItems[0].foundInChamber, true, 'matching excluded id should be marked as found');
  assert.equal(idItems[0].title, 'AHA retning', 'matching excluded id should use chamber title');
  assert.equal(idItems[0].summary, 'Neste steg for AHA-minne.', 'matching excluded id should use chamber summary');

  hooks.saveAhaMemoryExclusions({ excludedInsightIds: [], excludedKeys: ['title:ukjent|summary:lokal-nokkel'] });
  const keyItems = hooks.getAhaExcludedMemoryItems();
  assert.equal(keyItems.length, 1, 'unmatched stable key should produce one fallback item');
  assert.equal(keyItems[0].foundInChamber, false, 'unmatched stable key should not be marked as found');
  assert.equal(keyItems[0].title, 'Ekskludert minnenøkkel', 'unmatched stable key should use fallback title');

  hooks.saveAhaMemoryExclusions({ excludedInsightIds: ['i1'], excludedKeys: [hooks.getAhaMemoryInsightStableKey({ title: 'AHA retning', summary: 'Neste steg for AHA-minne.' })] });
  hooks.bindAhaMemoryControls();
  const includeButton = controlsHost.querySelectorAll('button').find((button) => button.textContent === 'Bruk igjen');
  assert.ok(includeButton, 'management UI should render Bruk igjen button');
  includeButton.click();
  assert.equal(hooks.isAhaMemoryInsightExcluded({ id: 'i1', title: 'AHA retning', summary: 'Neste steg for AHA-minne.' }), false, 'Bruk igjen should remove id and stable-key exclusion');
  assert.match(ctx.__elementsById.get('chat-status-note').textContent, /Innsikten kan nå brukes som minne igjen\./, 'Bruk igjen should show status note');

  hooks.saveAhaMemoryExclusions({ excludedInsightIds: ['i1'], excludedKeys: ['title:annen|summary:nokkel'] });
  hooks.renderAhaMemoryControls();
  const resetButton = controlsHost.querySelectorAll('button').find((button) => button.textContent === 'Nullstill ekskluderinger');
  assert.ok(resetButton, 'management UI should render reset button');
  resetButton.click();
  const resetExclusions = hooks.loadAhaMemoryExclusions();
  assert.deepEqual(resetExclusions.excludedInsightIds, [], 'reset button should clear excluded ids');
  assert.deepEqual(resetExclusions.excludedKeys, [], 'reset button should clear excluded keys');

  hooks.saveAhaMemoryExclusions({ excludedInsightIds: ['i1'], excludedKeys: [] });
  assert.equal(ctx.AHAMemoryExclusions.items().length, 1, 'console helper should expose excluded presentation items');

  console.log('aha-memory-exclusions-management ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
