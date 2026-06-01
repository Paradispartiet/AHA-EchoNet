const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const textUtilsCode = fs.readFileSync('ahaChatTextUtils.js', 'utf8');
const signalsCode = fs.readFileSync('ahaChatSignals.js', 'utf8');
const exportCode = fs.readFileSync('ahaChatExport.js', 'utf8');
const chatCode = fs.readFileSync('ahaChat.js', 'utf8');

const STORAGE_KEY = 'aha_insight_chamber_v1';

function buildContext(seed = {}) {
  const store = new Map(Object.entries(seed));
  const fetchCalls = [];
  const context = {
    window: null,
    console,
    fetch: async (url, options) => {
      fetchCalls.push({ url, options, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ ok: true, reply: 'Svar fra agent' }) };
    },
    navigator: { clipboard: { writeText: async () => {} } },
    document: {
      readyState: 'loading',
      addEventListener: () => {},
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null,
      body: { appendChild: () => {} },
      createElement: () => ({ click: () => {}, remove: () => {}, style: {}, appendChild: () => {}, setAttribute: () => {}, addEventListener: () => {} })
    },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
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
  if (seed.__embeddings) context.AHAEmbeddings = seed.__embeddings;
  context.window = context;
  context.location = { hostname: 'localhost' };
  context.addEventListener = () => {};
  context.__fetchCalls = fetchCalls;
  vm.createContext(context);
  vm.runInContext(textUtilsCode, context, { filename: 'ahaChatTextUtils.js' });
  vm.runInContext(signalsCode, context, { filename: 'ahaChatSignals.js' });
  vm.runInContext(exportCode, context, { filename: 'ahaChatExport.js' });
  vm.runInContext(chatCode, context, { filename: 'ahaChat.js' });
  return context;
}

(async function run() {
  const chamber = {
    insights: [
      {
        id: 'echonet-plan',
        title: 'EchoNet neste steg',
        summary: 'EchoNet bør bygges videre med en tydelig Memory Relevance Gate for AHA Chat.',
        concepts: ['EchoNet', { label: 'AHA Chat' }, { key: 'minne' }, { term: 'neste steg' }],
        theme_id: 'th_default',
        subject_id: 'sub_laring'
      },
      {
        id: 'demokrati-general',
        title: 'Demokrati som folkestyre',
        summary: 'Demokrati betyr at folket deltar i politiske beslutninger.',
        concepts: ['demokrati', 'folkestyre'],
        archived: true
      },
      {
        id: 'dagen-project',
        title: 'Dagen som bokprosjekt',
        summary: 'Dagen-prosjektet handler om en bestemt tekst og skal ikke trigges av ordet dagen alene.',
        concepts: [{ name: 'Dagen-prosjektet' }, { title: 'bokprosjekt' }],
        theme_id: 'th_default',
        subject_id: 'sub_laring'
      }
    ],
    chatLog: []
  };
  const ctx = buildContext({ [STORAGE_KEY]: JSON.stringify(chamber) });
  const hooks = ctx.AHATestHooks;

  const general = await hooks.buildAhaMemoryContext('Hva betyr demokrati?');
  assert.equal(general.used, false, 'general knowledge question should not use memory');

  const ahaNext = await hooks.buildAhaMemoryContext('Hva gjør vi nå med AHA?');
  assert.equal(ahaNext.used, true, 'known AHA project + continuity should use relevant memory');
  assert.equal(ahaNext.mode, 'continuity', 'continuity should be the strongest gate mode for hva gjør vi nå');
  assert.match(ahaNext.summaryForAgent, /EchoNet neste steg/, 'memory package should include compact relevant insight');
  assert.doesNotMatch(ahaNext.summaryForAgent, /\[object Object\]/, 'object concepts should not leak into summaryForAgent');
  assert.match(ahaNext.summaryForAgent, /AHA Chat/, 'object concept labels should be normalized into readable labels');

  const continueContext = await hooks.buildAhaMemoryContext('Fortsett der vi slapp.');
  assert.equal(continueContext.used, true, 'explicit continuity should use compact recent memory when stored insights exist');

  const newTopic = await hooks.buildAhaMemoryContext('Hvordan lager jeg surdeig?');
  assert.equal(newTopic.used, false, 'unrelated new topic should not use memory');

  const ordinaryDagen = await hooks.buildAhaMemoryContext('Hvordan var dagen din?');
  assert.equal(ordinaryDagen.used, false, 'ordinary use of dagen should not activate the Dagen book/project memory');

  const echoNet = await hooks.buildAhaMemoryContext('Hva var neste steg for EchoNet?');
  assert.equal(echoNet.used, true, 'EchoNet question should use matching EchoNet memory');
  assert.equal(echoNet.selectedInsights.length <= 5, true, 'memory package should stay compact');

  await ctx.AHAChat.askAhaAgent('Hva var neste steg for EchoNet?', { memoryContext: echoNet });
  assert.equal(ctx.__fetchCalls.length, 1, 'askAhaAgent should call backend once');
  assert.equal(ctx.__fetchCalls[0].body.memory_context.used, true, 'request should include used memory_context');

  const semanticCtx = buildContext({
    [STORAGE_KEY]: JSON.stringify({ insights: [], chatLog: [] }),
    __embeddings: {
      health: async () => ({ ok: true, status: 'configured' }),
      findSimilarToText: async () => ({ ok: true, matches: [{ id: 'sem-1', title: 'Klasse og makt i byrom', summary: 'Relevant tidligere innsikt om klasse og makt.', concepts: ['klasse', 'makt'], similarity: 0.74 }] })
    }
  });
  const semantic = await semanticCtx.AHATestHooks.buildAhaMemoryContext('Hvordan henger klasse og makt sammen?');
  assert.equal(semantic.used, true, 'strong semantic matches should pass the relevance gate');
  assert.equal(semantic.mode, 'semantic_match', 'semantic-only use should report semantic_match mode');

  await ctx.AHAChat.askAhaAgent('Hva betyr demokrati?', { memoryContext: general });
  assert.equal(ctx.__fetchCalls[1].body.memory_context, null, 'request should send null memory_context when gate is off');
  assert.deepEqual(ctx.__fetchCalls[1].body.similar_insights, [], 'similar_insights should not be populated when memory is off');
  assert.deepEqual(ctx.__fetchCalls[1].body.ai_state.top_insights, [], 'top_insights should be empty when memory gate is off');
  assert.deepEqual(ctx.__fetchCalls[1].body.ai_state.concepts, [], 'concepts should be empty when memory gate is off');
  assert.deepEqual(ctx.__fetchCalls[1].body.ai_state.meta_profile, {}, 'meta_profile should be empty when memory gate is off');

  console.log('aha-memory-relevance-gate ok');
})();
