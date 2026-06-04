const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const textUtilsCode = fs.readFileSync('js/ahaChatTextUtils.js', 'utf8');
const signalsCode = fs.readFileSync('js/ahaChatSignals.js', 'utf8');
const exportCode = fs.readFileSync('js/ahaChatExport.js', 'utf8');
const subjectsCode = fs.readFileSync('js/ahaChatSubjects.js', 'utf8');
const analysisCode = fs.readFileSync('js/ahaChatAnalysis.js', 'utf8');
const replyFormatCode = fs.readFileSync('js/ahaChatReplyFormat.js', 'utf8');
const chatCode = fs.readFileSync('js/ahaChat.js', 'utf8');

class TestElement {
  constructor(tagName) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.eventListeners = {};
    this.value = '';
    this.checked = false;
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
      },
      add: (className) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.add(className);
        this.className = [...classes].join(' ');
      },
      remove: (className) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        classes.delete(className);
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
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  prepend(child) { child.parentNode = this; this.children.unshift(child); return child; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  addEventListener(type, handler) { this.eventListeners[type] = handler; }
  dispatchEvent(event) { this.eventListeners[event.type]?.(event); return true; }
  focus() { this.focused = true; }
  scrollIntoView() {}
  matches(selector) {
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('[')) return false;
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

const store = new Map();
const pendingPayload = {
  type: 'meta_insight_prompt',
  source: 'meta_insights_engine',
  createdAt: '2026-06-04T00:00:00.000Z',
  prompt: 'Bygg videre på meta-innsikten min.'
};
store.set('aha_pending_chat_prompt_v1', JSON.stringify(pendingPayload));
store.set('aha_insight_chamber_v1', JSON.stringify({ insights: [], chatLog: [] }));

const elementsById = new Map();
const document = {
  readyState: 'complete',
  addEventListener: () => {},
  querySelectorAll: () => [],
  querySelector: () => null,
  body: new TestElement('body'),
  createElement: (tag) => new TestElement(tag),
  getElementById: (id) => elementsById.get(id) || null
};
[
  'chat-log', 'empty-state', 'chat-status-note', 'aha-memory-status', 'aha-memory-controls',
  'aha-processing-indicator', 'aha-processing-text', 'btn-send', 'msg', 'panel', 'highlights-rail'
].forEach((id) => {
  const el = new TestElement(id === 'msg' ? 'textarea' : id === 'btn-send' ? 'button' : 'div');
  el.id = id;
  elementsById.set(id, el);
});

const fetchCalls = [];
const ingestCalls = [];
const context = {
  window: null,
  console,
  fetch: async (url, options = {}) => {
    fetchCalls.push({ url, options });
    return { ok: true, json: async () => ({ ok: true, reply: 'Svar fra AHA', response_id: 'res-1', model: 'test-model' }) };
  },
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
  Event: function Event(type, options = {}) { this.type = type; this.bubbles = Boolean(options.bubbles); },
  Date,
  Math,
  JSON,
  AHA_AGENT_API: 'https://agent.example/api/aha-agent',
  AHAIngest: { ingest: (payload) => ingestCalls.push(payload) },
  cleanTextForConceptExtraction: (value) => String(value || ''),
  InsightsEngine: {
    createEmptyChamber: () => ({ insights: [], chatLog: [] }),
    getActiveInsights: (chamber) => (chamber.insights || []).filter((ins) => !ins.archived && !ins.rejected && !ins.merged_into),
    buildMetaProfile: () => ({})
  },
  MetaInsightsEngine: { buildUserMetaProfile: () => ({ learned: true }) }
};
context.window = context;
context.location = { hostname: 'localhost' };
context.addEventListener = () => {};
vm.createContext(context);
vm.runInContext(textUtilsCode, context, { filename: 'js/ahaChatTextUtils.js' });
vm.runInContext(signalsCode, context, { filename: 'js/ahaChatSignals.js' });
vm.runInContext(exportCode, context, { filename: 'js/ahaChatExport.js' });
vm.runInContext(subjectsCode, context, { filename: 'js/ahaChatSubjects.js' });
vm.runInContext(analysisCode, context, { filename: 'js/ahaChatAnalysis.js' });
vm.runInContext(replyFormatCode, context, { filename: 'js/ahaChatReplyFormat.js' });
vm.runInContext(chatCode, context, { filename: 'js/ahaChat.js' });

const textarea = elementsById.get('msg');
assert.equal(textarea.value, pendingPayload.prompt, 'pending prompt skal prefylle textarea');
assert.equal(store.has('aha_pending_chat_prompt_v1'), false, 'pending key skal fjernes etter konsum');
assert.equal(fetchCalls.length, 0, 'pending prompt skal ikke auto-sendes til AHA-agenten');
assert.equal(ingestCalls.length, 0, 'pending prompt skal ikke ingestes før eksplisitt send');
assert.ok(textarea.focused, 'textarea skal fokuseres etter pending prompt');

console.log('aha-chat-pending-prompt passed');
