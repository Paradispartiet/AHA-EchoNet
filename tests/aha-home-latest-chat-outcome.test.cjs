const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('js/ahaLocalInsightHomeDashboard.js', 'utf8');

const store = new Map();
const latestNode = { textContent: '' };
const hintNode = { textContent: '' };
const elements = {
  'aha-latest-insight': latestNode,
  'aha-insight-empty-hint': hintNode
};
const registeredEvents = [];

const context = {
  console,
  Date,
  Array,
  Object,
  String,
  Number,
  Set,
  Map,
  JSON,
  localStorage: {
    getItem(key) { return store.has(key) ? store.get(key) : null; }
  },
  document: {
    getElementById(id) { return elements[id] || null; },
    addEventListener() {}
  },
  addEventListener(name) { registeredEvents.push(name); }
};
context.window = context;
vm.createContext(context);
vm.runInContext(code, context, { filename: 'js/ahaLocalInsightHomeDashboard.js' });

const dashboard = context.AHALocalInsightHomeDashboard;
assert.ok(dashboard, 'Home dashboard should export its API');
assert.equal(typeof dashboard.buildLatestChatOutcome, 'function');
assert.equal(typeof dashboard.buildLatestInsightHomeModel, 'function');
assert.equal(typeof dashboard.renderLatestInsightOutcome, 'function');

const chamber = {
  insights: [
    {
      id: 'old-insight',
      title: 'Eldre samtaleinnsikt',
      created_at: '2026-08-11T07:00:00.000Z',
      analysis_provenance: [{
        conversationId: 'conversation-old',
        analysisRunId: 'run-old',
        sourceKind: 'chat',
        ingest_action: 'created',
        createdAt: '2026-08-11T07:00:00.000Z'
      }]
    },
    {
      id: 'insight-a',
      title: 'Makt og ansvar henger sammen',
      summary: 'En strukturert innsikt, ikke rå samtaletekst.',
      private_raw_source_text: 'PRIVATE RAW CHAT BODY MUST NOT APPEAR',
      analysis_provenance: [
        {
          conversationId: 'conversation-new',
          analysisRunId: 'run-new-1',
          sourceKind: 'pasted_text',
          ingest_action: 'created',
          createdAt: '2026-08-11T09:00:00.000Z'
        },
        {
          conversationId: 'conversation-new',
          analysisRunId: 'run-new-2',
          sourceKind: 'chat',
          ingest_action: 'reinforced',
          createdAt: '2026-08-11T10:00:00.000Z'
        },
        {
          conversationId: 'conversation-new',
          analysisRunId: 'run-new-2',
          sourceKind: 'chat',
          ingest_action: 'reinforced',
          createdAt: '2026-08-11T10:00:00.000Z'
        }
      ]
    },
    {
      id: 'insight-b',
      title: 'Institusjoner former handlingsrommet',
      analysis_provenance: [{
        conversationId: 'conversation-new',
        analysisRunId: 'run-new-1',
        sourceKind: 'url',
        ingest_action: 'created',
        createdAt: '2026-08-11T09:30:00.000Z'
      }]
    }
  ]
};

const outcome = dashboard.buildLatestChatOutcome(chamber);
assert.ok(outcome, 'latest Chat conversation should be found');
assert.equal(outcome.mode, 'chat_provenance');
assert.equal(outcome.insightCount, 2, 'latest conversation should count unique insights');
assert.equal(outcome.createdCount, 2, 'two unique insights were created in the latest conversation');
assert.equal(outcome.reinforcedCount, 1, 'duplicate provenance entries must not double-count reinforcement');
assert.equal(outcome.processedCount, 0);
assert.equal(outcome.latestAction, 'reinforced');
assert.equal(outcome.latestInsight.id, 'insight-a', 'latest provenance event should determine the highlighted insight');

const model = dashboard.buildLatestInsightHomeModel(chamber);
assert.equal(model.mode, 'chat_provenance');
assert.equal(model.text, 'Makt og ansvar henger sammen');
assert.equal(model.createdCount, 2);
assert.equal(model.reinforcedCount, 1);
assert.equal(model.insightCount, 2);
assert.doesNotMatch(JSON.stringify(model), /conversation-new|run-new|PRIVATE RAW CHAT BODY MUST NOT APPEAR/, 'Home model must not expose raw source text or technical conversation/run identifiers');

store.set('aha_insight_chamber_v1', JSON.stringify(chamber));
assert.equal(dashboard.renderLatestInsightOutcome(), true, 'Home should render the latest Chat outcome');
assert.equal(latestNode.textContent, 'Forsterket: Makt og ansvar henger sammen');
assert.equal(hintNode.textContent, 'Siste Chat-analyse · 2 nye · 1 forsterket · 2 innsikter');
assert.doesNotMatch(`${latestNode.textContent} ${hintNode.textContent}`, /conversation-new|run-new|PRIVATE RAW CHAT BODY MUST NOT APPEAR/);

const legacyModel = dashboard.buildLatestInsightHomeModel({
  insights: [
    { id: 'legacy-old', title: 'Gammel legacy', created_at: '2026-08-10T09:00:00.000Z' },
    { id: 'legacy-new', title: 'Nyeste lagrede innsikt', created_at: '2026-08-11T08:00:00.000Z' }
  ]
});
assert.equal(legacyModel.mode, 'legacy_insight');
assert.equal(legacyModel.text, 'Nyeste lagrede innsikt', 'legacy fallback should show the actual latest stored insight');

assert.equal(dashboard.buildLatestInsightHomeModel({ insights: [] }), null, 'empty chamber should preserve existing empty-state fallback');
assert.ok(registeredEvents.includes('load'), 'Home should refresh the real insight outcome after dashboard DOMContentLoaded handlers finish');
assert.equal(/localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(code), false, 'latest insight Home presentation must not add localStorage writes');
assert.equal(/private_raw_source_text/.test(code), false, 'Home renderer must not know about raw source-text fields');

console.log('aha-home-latest-chat-outcome.test.cjs passed');
