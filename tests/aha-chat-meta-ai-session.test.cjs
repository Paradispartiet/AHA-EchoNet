// Test for Meta Insights AI-session i AHA Chat: en pending payload med
// type meta_insights_ai_session skal prefylle agentprompten, vise en
// session-boks (sessionId, readiness, læringsmodus, topp temaer/begreper),
// parse strukturert AI-svar til claims med feedback-knapper og lagre
// feedback i AHAMetaInsightsMemory. Fritekst-svar håndteres rolig.

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

// chat.html skal laste minne- og agent-modulene etter metaInsightsEngine.js.
{
  const html = fs.readFileSync('chat.html', 'utf8');
  const engineAt = html.indexOf('js/metaInsightsEngine.js');
  const memoryAt = html.indexOf('js/metaInsightsMemory.js');
  const agentAt = html.indexOf('js/metaInsightsAgent.js');
  const chatAt = html.indexOf('js/ahaChat.js');
  assert.ok(memoryAt > -1, 'chat.html skal laste js/metaInsightsMemory.js');
  assert.ok(agentAt > -1, 'chat.html skal laste js/metaInsightsAgent.js');
  assert.ok(engineAt < memoryAt && memoryAt < agentAt && agentAt < chatAt, 'modulene skal lastes etter engine og før ahaChat.js');
}

const textUtilsCode = fs.readFileSync('js/ahaChatTextUtils.js', 'utf8');
const signalsCode = fs.readFileSync('js/ahaChatSignals.js', 'utf8');
const exportCode = fs.readFileSync('js/ahaChatExport.js', 'utf8');
const subjectsCode = fs.readFileSync('js/ahaChatSubjects.js', 'utf8');
const analysisCode = fs.readFileSync('js/ahaChatAnalysis.js', 'utf8');
const replyFormatCode = fs.readFileSync('js/ahaChatReplyFormat.js', 'utf8');
const memoryCode = fs.readFileSync('js/metaInsightsMemory.js', 'utf8');
const agentCode = fs.readFileSync('js/metaInsightsAgent.js', 'utf8');
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
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this._className = '';
    this._textContent = '';
    this._innerHTML = '';
    this.classList = {
      toggle: () => {},
      add: () => {},
      remove: () => {}
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
  type: 'meta_insights_ai_session',
  source: 'meta_insights_agent',
  createdAt: '2026-06-10T00:00:00.000Z',
  sessionId: 'meta_ai_session_test1',
  prompt: 'AHA Meta Insights AI — selvforståelsesagent\n\n1. Rolle\nDu er AHA Meta Insights AI.',
  agentContext: {
    agent: 'aha_meta_insights_ai',
    version: 'v1',
    algorithmicSummary: {
      readiness: { level: 'middels', score: 42 },
      learning_mode: 'bygger forståelse',
      strongest_themes: ['klimapolitikk'],
      strongest_concepts: ['kapitalisme', 'habitus']
    }
  }
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

const context = {
  window: null,
  console,
  fetch: async () => ({ ok: true, json: async () => ({ ok: true, reply: 'Svar', response_id: 'res-1', model: 'test-model' }) }),
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
  AHAIngest: { ingest: () => {} },
  cleanTextForConceptExtraction: (value) => String(value || ''),
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
vm.createContext(context);
vm.runInContext(textUtilsCode, context, { filename: 'js/ahaChatTextUtils.js' });
vm.runInContext(signalsCode, context, { filename: 'js/ahaChatSignals.js' });
vm.runInContext(exportCode, context, { filename: 'js/ahaChatExport.js' });
vm.runInContext(subjectsCode, context, { filename: 'js/ahaChatSubjects.js' });
vm.runInContext(analysisCode, context, { filename: 'js/ahaChatAnalysis.js' });
vm.runInContext(replyFormatCode, context, { filename: 'js/ahaChatReplyFormat.js' });
vm.runInContext(memoryCode, context, { filename: 'js/metaInsightsMemory.js' });
vm.runInContext(agentCode, context, { filename: 'js/metaInsightsAgent.js' });
vm.runInContext(chatCode, context, { filename: 'js/ahaChat.js' });

const hooks = context.AHATestHooks;

// 15. Pending session åpner chat med riktig type.
const textarea = elementsById.get('msg');
assert.equal(textarea.value, pendingPayload.prompt, 'agentprompten skal prefylle textarea');
assert.equal(store.has('aha_pending_chat_prompt_v1'), false, 'pending key skal fjernes etter konsum');
assert.ok(textarea.focused, 'textarea skal fokuseres');

const activeSession = hooks.getActiveMetaAiSession();
assert.ok(activeSession, 'chatten skal merkes som Meta Insights AI-session');
assert.equal(activeSession.sessionId, 'meta_ai_session_test1');
assert.ok(activeSession.agentContext, 'session skal bære agentContext');

// Session-boksen skal vises med id, readiness, læringsmodus og topplister.
const log = elementsById.get('chat-log');
const sessionBox = log.querySelector('.meta-ai-session-box');
assert.ok(sessionBox, 'session-boksen skal rendres i chat-loggen');
const boxText = sessionBox.textContent;
assert.ok(boxText.includes('Meta Insights AI'), 'boksen skal vise Meta Insights AI');
assert.ok(boxText.includes('meta_ai_session_test1'), 'boksen skal vise sessionId');
assert.ok(boxText.includes('middels'), 'boksen skal vise readiness');
assert.ok(boxText.includes('bygger forståelse'), 'boksen skal vise læringsmodus');
assert.ok(boxText.includes('klimapolitikk'), 'boksen skal vise topp temaer');
assert.ok(boxText.includes('kapitalisme'), 'boksen skal vise topp begreper');

// Strukturert AI-svar skal gi claims med feedback-knapper.
const structuredReply = JSON.stringify({
  agent: 'aha_meta_insights_ai',
  interpretation: 'Materialet peker mot et vekstkritisk prosjekt.',
  claims: [
    { id: 'claim_1', text: 'Du bygger et arbeid rundt kapitalisme.', basis: ['2 innsikter'], confidence: 0.7, status: 'hypothesis' }
  ],
  questions: ['Stemmer dette?'],
  suggested_next_step: 'Lag en sti for «kapitalisme».',
  memory_update_suggestion: { confirmed_if_user_agrees: ['Vekstkritisk prosjekt'], watch_next: [] }
});
const parsed = hooks.maybeHandleMetaAiAgentReply(structuredReply);
assert.ok(parsed && parsed.ok, 'strukturert svar skal parses via AHAMetaInsightsAgent');
assert.equal(parsed.claims.length, 1);

const claimsSection = log.querySelector('.meta-ai-claims');
assert.ok(claimsSection, 'claims-modulen skal rendres');
const claimCard = claimsSection.querySelector('.meta-ai-claim-card');
assert.ok(claimCard, 'claim-kortet skal rendres');
assert.ok(claimCard.textContent.includes('Du bygger et arbeid rundt kapitalisme.'), 'claim-teksten skal vises');
const feedbackButtons = claimCard.querySelectorAll('.meta-ai-feedback-btn');
assert.equal(feedbackButtons.length, 5, 'alle fem feedback-knappene skal vises');
assert.deepEqual(
  feedbackButtons.map((btn) => btn.textContent),
  ['Stemmer', 'Delvis', 'Feil', 'Viktig', 'Utdatert'],
  'feedback-knappene skal ha norske etiketter'
);

// Feedback skal lagres i meta-minnet og gi en kort bekreftelse.
const stemmerBtn = feedbackButtons.find((btn) => btn.dataset.feedbackResponse === 'stemmer');
stemmerBtn.eventListeners.click();
const memoryRaw = store.get('aha_meta_insights_memory_v1');
assert.ok(memoryRaw, 'feedback skal lagres i aha_meta_insights_memory_v1');
const memory = JSON.parse(memoryRaw);
assert.equal(memory.feedback.length, 1);
assert.equal(memory.feedback[0].sessionId, 'meta_ai_session_test1', 'feedback skal kobles til sesjonen');
assert.equal(memory.feedback[0].claimId, 'claim_1');
assert.equal(memory.feedback[0].response, 'stemmer');
assert.equal(memory.selfModel.confirmedClaims.length, 1, 'selfModel skal oppdateres fra feedback');
const statusEl = claimCard.querySelector('.meta-ai-claim-status');
assert.ok(statusEl.textContent.includes('Feedback lagret'), 'kort bekreftelse skal vises på kortet');

// Fritekst-svar håndteres rolig: ingen claims, men modulen står klar.
const freeParsed = hooks.maybeHandleMetaAiAgentReply('AHA tenker høyt i fritekst.');
assert.equal(freeParsed.ok, false, 'fritekst skal gi ok: false');
const sections = log.querySelectorAll('.meta-ai-claims');
assert.equal(sections.length, 2, 'fritekst skal også gi en seksjon');
assert.ok(sections[1].textContent.includes('fritekst'), 'fritekst skal forklares rolig');
assert.equal(sections[1].querySelectorAll('.meta-ai-claim-card').length, 0, 'fritekst skal ikke gi claim-kort');

console.log('aha-chat-meta-ai-session passed');
