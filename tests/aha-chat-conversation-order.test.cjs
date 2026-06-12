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
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.offsetTop = 0;
    this.value = '';
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
      },
      contains: (className) => this.className.split(/\s+/).includes(className)
    };
  }
  set className(value) { this._className = String(value || ''); }
  get className() { return this._className; }
  set textContent(value) { this._textContent = String(value ?? ''); this.children = []; }
  get textContent() { return this._textContent + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(value) { this._innerHTML = String(value ?? ''); if (!value) this.children = []; }
  get innerHTML() { return this._innerHTML; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  addEventListener(type, handler) { this.eventListeners[type] = handler; }
  focus() {}
  scrollIntoView() {}
  matches(selector) {
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
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
  const body = new TestElement('body');
  ['chat-log', 'empty-state', 'chat-highlights-rail', 'chat-status-note'].forEach((id) => {
    const el = new TestElement('div');
    el.id = id;
    if (id === 'chat-highlights-rail') el.className = 'chat-highlights-rail is-empty';
    elementsById.set(id, el);
    body.appendChild(el);
  });
  const actions = new TestElement('section');
  actions.className = 'answer-actions';
  body.appendChild(actions);

  const document = {
    readyState: 'loading',
    addEventListener: () => {},
    body,
    createElement: (tag) => new TestElement(tag),
    getElementById: (id) => elementsById.get(id) || null,
    querySelector: (selector) => body.querySelector(selector),
    querySelectorAll: (selector) => body.querySelectorAll(selector)
  };

  const context = {
    window: null,
    console,
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, reply: 'Svar fra AHA' }) }),
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
    Event: function Event(type) { this.type = type; },
    Date,
    Math,
    JSON,
    AHA_AGENT_API: 'https://agent.example/api/aha-agent',
    AHAIngest: { ingest: () => {} },
    cleanTextForConceptExtraction: (value) => String(value || ''),
    InsightsEngine: {
      createEmptyChamber: () => ({ insights: [], chatLog: [] }),
      getActiveInsights: (chamber) => (chamber.insights || []),
      buildMetaProfile: () => ({})
    },
    MetaInsightsEngine: { buildUserMetaProfile: () => ({}) }
  };
  context.window = context;
  context.location = { hostname: 'localhost' };
  context.addEventListener = () => {};
  context.__elementsById = elementsById;
  context.__answerActions = actions;
  vm.createContext(context);
  vm.runInContext(textUtilsCode, context, { filename: 'js/ahaChatTextUtils.js' });
  vm.runInContext(signalsCode, context, { filename: 'js/ahaChatSignals.js' });
  vm.runInContext(exportCode, context, { filename: 'js/ahaChatExport.js' });
  vm.runInContext(subjectsCode, context, { filename: 'js/ahaChatSubjects.js' });
  vm.runInContext(analysisCode, context, { filename: 'js/ahaChatAnalysis.js' });
  vm.runInContext(replyFormatCode, context, { filename: 'js/ahaChatReplyFormat.js' });
  vm.runInContext(chatCode, context, { filename: 'js/ahaChat.js' });
  return context;
}

const ctx = buildContext();
const hooks = ctx.AHATestHooks;
const log = ctx.__elementsById.get('chat-log');
const empty = ctx.__elementsById.get('empty-state');
const rail = ctx.__elementsById.get('chat-highlights-rail');

hooks.updateAnswerActionsVisibility();
assert.equal(ctx.__answerActions.classList.contains('has-aha-answer'), false, 'answer actions should be hidden before AHA has answered');

hooks.appendChat('user', 'Første spørsmål');
assert.equal(empty.style.display, 'none', 'empty state should hide as soon as the first user message is appended');
assert.equal(ctx.__answerActions.classList.contains('has-aha-answer'), false, 'answer actions should remain hidden after only a user message');

hooks.appendChat('aha', 'Første svar');
hooks.appendChat('user', 'Andre spørsmål');
hooks.appendChat('aha', 'Andre svar');

assert.deepEqual(log.children.map((child) => child.dataset.messageRole), ['user', 'assistant', 'user', 'assistant'], 'chat log should keep chronological user → assistant message order');
assert.deepEqual(log.children.map((child) => child.textContent).map((text) => text.replace('✦', '')), ['DuFørste spørsmål', 'AHAFørste svar', 'DuAndre spørsmål', 'AHAAndre svar'], 'messages should render in the same order as they are appended');
assert.equal(ctx.__answerActions.classList.contains('has-aha-answer'), true, 'answer actions should become compactly available after an AHA answer exists');
assert.equal(rail.classList.contains('is-empty'), true, 'highlights rail should stay marked empty when there are no highlights');

const html = fs.readFileSync('chat.html', 'utf8');
const css = fs.readFileSync('css/aha-chat.css', 'utf8');
assert.match(html, /chat-highlights-rail is-empty/, 'highlights rail should start empty in markup');
assert.match(css, /\.chat-highlights-rail\.is-empty \{ display: none; \}/, 'empty highlights rail should not occupy visible space');
assert.match(css, /\.chat-conversation \.chat-log \{ min-height: 0; max-height: none; \}/, 'chat log should not reserve a large empty panel');

console.log('aha-chat-conversation-order ok');
