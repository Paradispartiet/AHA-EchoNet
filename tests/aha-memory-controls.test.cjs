const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const textUtilsCode = fs.readFileSync('ahaChatTextUtils.js', 'utf8');
const signalsCode = fs.readFileSync('ahaChatSignals.js', 'utf8');
const exportCode = fs.readFileSync('ahaChatExport.js', 'utf8');
const subjectsCode = fs.readFileSync('ahaChatSubjects.js', 'utf8');
const analysisCode = fs.readFileSync('ahaChatAnalysis.js', 'utf8');
const replyFormatCode = fs.readFileSync('ahaChatReplyFormat.js', 'utf8');
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
    this.value = '';
    this.checked = false;
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
  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return this.attributes[name] || null; }
  addEventListener(type, handler) { this.eventListeners[type] = handler; }
  dispatchEvent(event) { this.eventListeners[event.type]?.(event); }
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
  const document = {
    readyState: 'loading',
    addEventListener: () => {},
    querySelectorAll: () => [],
    querySelector: () => null,
    body: new TestElement('body'),
    createElement: (tag) => new TestElement(tag),
    getElementById: (id) => elementsById.get(id) || null
  };
  ['chat-log', 'empty-state', 'chat-status-note', 'aha-memory-status', 'aha-memory-controls', 'aha-processing-indicator', 'aha-processing-text', 'btn-send', 'msg'].forEach((id) => {
    const el = new TestElement(id === 'msg' ? 'textarea' : 'div');
    el.id = id;
    elementsById.set(id, el);
  });
  const fetchCalls = [];
  const ingestCalls = [];
  const context = {
    window: null,
    console,
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url, options, body: JSON.parse(options.body || '{}') });
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
    Event: function Event(type) { this.type = type; },
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
  context.__store = store;
  context.__fetchCalls = fetchCalls;
  context.__ingestCalls = ingestCalls;
  context.__elementsById = elementsById;
  vm.createContext(context);
  vm.runInContext(textUtilsCode, context, { filename: 'ahaChatTextUtils.js' });
  vm.runInContext(signalsCode, context, { filename: 'ahaChatSignals.js' });
  vm.runInContext(exportCode, context, { filename: 'ahaChatExport.js' });
  vm.runInContext(subjectsCode, context, { filename: 'ahaChatSubjects.js' });
  vm.runInContext(analysisCode, context, { filename: 'ahaChatAnalysis.js' });
  vm.runInContext(replyFormatCode, context, { filename: 'ahaChatReplyFormat.js' });
  vm.runInContext(chatCode, context, { filename: 'ahaChat.js' });
  return context;
}

(async () => {
  const ctx = buildContext();
  const hooks = ctx.AHATestHooks;

  const defaults = hooks.loadAhaMemoryControls();
  assert.equal(defaults.saveNewInsights, true, 'default should save new insights');
  assert.equal(defaults.useExistingMemory, true, 'default should use existing memory');

  ctx.AHAChat.saveChamberToStorage({
    insights: [{
      id: 'old-memory-1',
      title: 'Gammelt AHA-minne',
      summary: 'Dette skal ikke bli UI-chip når minnebruk er av.',
      subject_id: 'sub_laring',
      theme_id: 'th_default',
      concepts: [{ label: 'Gammel innsikt' }],
      patterns: [{ label: 'Minnemønster' }],
      emner: ['Eksisterende minne']
    }],
    chatLog: []
  });
  ctx.AHAMemoryControls.disableMemoryUse();
  const offResult = await hooks.submitAhaChatMessage('Hva gjør vi nå med AHA?');
  assert.equal(offResult.memoryContext.used, false, 'chat flow should pass an unused memory context when memory use is off');
  assert.equal(offResult.memoryContext.mode, 'off', 'chat flow should use explicit off memory mode');
  const offChatCalls = ctx.__fetchCalls.filter((call) => call.url.endsWith('/chat'));
  assert.equal(offChatCalls.length, 1, 'chat should still call the agent when memory use is off');
  const offBody = offChatCalls[0].body;
  assert.equal(offBody.memory_context, null, 'request should not send memory_context when memory use is off');
  assert.deepEqual(offBody.ai_state.top_insights, [], 'top insights should be empty when memory use is off');
  assert.deepEqual(offBody.ai_state.concepts, [], 'concepts should be empty when memory use is off');
  assert.deepEqual(offBody.ai_state.meta_profile, {}, 'meta profile should be empty when memory use is off');
  assert.deepEqual(offBody.similar_insights, [], 'similar insights should be empty when memory use is off');
  assert.equal(ctx.__elementsById.get('chat-log').querySelectorAll('.message-category-chip').length, 0, 'AHA reply should not render category chips from existing insights when memory use is off');
  const offContext = hooks.buildAhaMemoryOffContext();
  assert.equal(offContext.used, false, 'off context should mark memory as unused');
  assert.match(offContext.reason, /slått av av brukeren/, 'off context should explain user control');

  ctx.AHAMemoryDebug.enable();
  const transparency = hooks.buildAhaMemoryTransparency(offContext);
  assert.equal(transparency.visible, true, 'debug transparency should show unused memory');
  assert.match(hooks.formatAhaMemoryTransparencyDetails(transparency), /slått av av brukeren/, 'debug details should include off reason');
  ctx.AHAMemoryDebug.disable();

  const saveOffCtx = buildContext();
  saveOffCtx.AHAMemoryControls.disableSaving();
  await saveOffCtx.AHATestHooks.submitAhaChatMessage('Dette er en vanlig melding om AHA samtykke.');
  assert.equal(saveOffCtx.__fetchCalls.filter((call) => call.url.endsWith('/chat')).length, 1, 'agent reply should still be generated when saving is off');
  assert.equal(saveOffCtx.__ingestCalls.length, 0, 'agent reply should not be logged through AHAIngest when saving is off');
  assert.equal(saveOffCtx.__store.has('aha_insight_chamber_v1'), false, 'chat message should not create persistent chamber insights when saving is off');
  assert.equal(saveOffCtx.__store.has('aha_chat_auto_outputs_v1'), false, 'auto outputs should not be persisted when saving is off');
  assert.equal(saveOffCtx.__store.has('aha_afterwork_v1'), false, 'afterwork should not be persisted when saving is off');

  const onCtx = buildContext();
  const usedMemory = {
    used: true,
    reason: 'Eksplisitt testminne.',
    confidence: 0.9,
    mode: 'explicit_reference',
    semanticMatches: [{ id: 's1', title: 'Semantisk innsikt' }],
    selectedInsights: [{ id: 'i1', title: 'Innsikt', summary: 'Sammendrag', concepts: ['AHA'] }],
    summaryForAgent: '1. Innsikt: Sammendrag'
  };
  await onCtx.AHAChat.askAhaAgent('Bruk minne', { memoryContext: usedMemory });
  const onChatBody = onCtx.__fetchCalls.find((call) => call.url.endsWith('/chat')).body;
  assert.equal(onChatBody.memory_context.used, true, 'existing memory flow should send used memory context');
  assert.notDeepEqual(onChatBody.ai_state, { top_insights: [], concepts: [], meta_profile: {} }, 'memory-enabled flow should keep normal ai_state behavior');

  const learningOn = hooks.buildAhaLearningContractReply({ local: { state: 'empty', activeInsights: 0 }, afterwork: { available: true, count: 0 }, embedding: { status: 'not_configured' }, controls: { saveNewInsights: true, useExistingMemory: true } });
  assert.match(learningOn, /Lagring av nye innsikter er aktiv\./, 'learning contract should say saving is active');
  assert.match(learningOn, /AHA kan bruke relevant tidligere minne i svar\./, 'learning contract should say memory use is active');
  const learningOff = hooks.buildAhaLearningContractReply({ local: { state: 'empty', activeInsights: 0 }, afterwork: { available: true, count: 0 }, embedding: { status: 'not_configured' }, controls: { saveNewInsights: false, useExistingMemory: false } });
  assert.match(learningOff, /Lagring av nye innsikter er slått av\./, 'learning contract should say saving is off');
  assert.match(learningOff, /Bruk av tidligere minne i svar er slått av\./, 'learning contract should say memory use is off');

  ctx.AHAMemoryControls.disableSaving();
  assert.equal(ctx.AHAMemoryControls.get().saveNewInsights, false, 'console helper should disable saving');
  ctx.AHAMemoryControls.disableMemoryUse();
  assert.equal(ctx.AHAMemoryControls.get().useExistingMemory, false, 'console helper should disable memory use');
  const reset = ctx.AHAMemoryControls.reset();
  assert.equal(reset.saveNewInsights, true, 'reset should restore saving default');
  assert.equal(reset.useExistingMemory, true, 'reset should restore memory-use default');

  hooks.renderAhaMemoryControls({ saveNewInsights: false, useExistingMemory: true });
  assert.match(ctx.__elementsById.get('aha-memory-controls').innerHTML, /Minnestyring/, 'memory controls UI should render');
  assert.match(ctx.__elementsById.get('aha-memory-controls').innerHTML, /Lagring:<\/strong> av/, 'memory controls UI should show saving status');

  console.log('aha-memory-controls ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
