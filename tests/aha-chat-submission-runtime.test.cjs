const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const code = fs.readFileSync('js/ahaChatRunContext.js', 'utf8');
const events = [];
const context = {
  window: null,
  console,
  Date,
  Math,
  AHAChatPersistence: {
    appendUserMessage: () => ({ id: 'user_1' }),
    appendAssistantMessage: () => ({ id: 'assistant_1' }),
    attachAnswerPackage: () => events.push('attach-package'),
    attachAnswerEvaluation: () => events.push('attach-evaluation')
  },
  AHALinkReader: { hasUrls: () => false },
  AHAIngest: { ingest: ({ source_type }) => events.push(`ingest:${source_type}`) }
};
context.window = context;
vm.createContext(context);
vm.runInContext(code, context, { filename: 'js/ahaChatRunContext.js' });

let activeRun = null;
const runtime = context.AHAChatRunContext.createSubmissionRuntime({
  config: { threadId: 'thread_test', subjectId: 'subject_test' },
  input: {
    getUrlDominanceInfo: () => ({ isSourceAction: false, urlOnly: false, urlDominated: false }),
    isTransientAnalysisDocument: () => false,
    isAhaSavingEnabled: () => true,
    getThemeId: () => 'theme_test',
    getFieldId: () => 'field_test',
    handleUserMessage: () => 1,
    handleUserMessageInsightCandidatesInBackground: async () => 0
  },
  memory: {
    isMemoryQuestion: (text) => text === 'Vis minne',
    buildMemoryStatus: async () => ({ ready: true }),
    renderMemoryStatus: () => events.push('render-memory-status'),
    buildLearningContractReply: () => 'Minnet er klart.',
    updateMemoryStatus: () => events.push('update-memory-status'),
    isMemoryUseEnabled: () => false,
    buildMemoryContext: async () => ({ used: false }),
    buildMemoryOffContext: () => ({ used: false, reason: 'off' }),
    filterMemoryContextForActiveSource: (value) => value,
    suggestCategoryChips: () => []
  },
  retrieval: {
    filterForActiveSource: (value) => value,
    buildPersonalMessageContext: () => ({ prompt: '', retrieval: { results: [] } }),
    buildAnswerPackage: () => ({ id: 'answer_1', status: { ready: false } }),
    renderPersonalRetrieval: () => events.push('render-retrieval'),
    renderAnswerComposer: () => events.push('render-composer'),
    renderPersonalContextStatus: () => {},
    renderPersonalAiLoopStatus: () => {}
  },
  analysis: {
    createAnalysisRun: () => ({ analysisRunId: 'run_1', runId: 'run_1', sourceId: 'source_1' }),
    setActiveAnalysisRun: (run) => { activeRun = run; },
    clearActiveAnalysisState: () => events.push('clear-analysis'),
    isActiveAnalysisRun: (run) => run === activeRun,
    buildArticleSourceTextFromAnalysis: () => '',
    askAgent: async () => ({ reply: 'Svar fra AHA', response_id: 'response_1', model: 'test' }),
    cleanArticleText: (value) => value,
    detectTextType: () => 'short_note',
    enrichSubjectMatchesForClimateConflict: (_text, matches) => matches,
    enrichSubjectMatchesForPublicAdministration: (_text, matches) => matches,
    detectAutoAnalysisDomain: () => 'general',
    getLiterarySubjectMatches: () => [],
    getInstitutionalMediaHistorySubjectMatches: () => [],
    stripFagkoblingerSections: (value) => value,
    forceLiteraryFagkoblingerInReply: (value) => value,
    forceInstitutionalMediaHistoryFagkoblingerInReply: (value) => value,
    normalizeVisibleReply: (value) => value,
    evaluateAnswerForChat: () => ({ status: 'ok', score: 1 }),
    maybeHandleMetaAiAgentReply: () => {},
    renderAutoOutputs: async () => events.push('render-auto-output'),
    ensureAfterworkForLatestAnalysis: () => events.push('ensure-afterwork')
  },
  ui: {
    renderChatMemoryStatus: () => events.push('render-chat-memory'),
    appendChat: (role, text) => { events.push(`chat:${role}:${text}`); return {}; },
    setProcessing: (active) => events.push(`processing:${active}`),
    setStatusNote: () => {}
  }
});

assert.equal(typeof runtime.prepareSubmission, 'function');
assert.equal(typeof runtime.handleMemoryQuestion, 'function');
assert.equal(typeof runtime.prepareRetrieval, 'function');
assert.equal(typeof runtime.executeAnalysis, 'function');
assert.equal(typeof runtime.submitAhaChatMessage, 'function');

(async () => {
  assert.equal(await runtime.submitAhaChatMessage('   '), null, 'blank input should stop before the pipeline');

  const textarea = { value: 'Vis minne' };
  const memoryResult = await runtime.submitAhaChatMessage('Vis minne', textarea);
  assert.equal(memoryResult.type, 'learning_contract');
  assert.equal(textarea.value, '');
  assert(events.indexOf('chat:user:Vis minne') < events.indexOf('chat:aha:Minnet er klart.'), 'memory flow should preserve conversation order');

  events.length = 0;
  const result = await runtime.submitAhaChatMessage('Analyser dette', { value: 'Analyser dette' });
  assert.equal(result.type, 'agent_reply');
  assert(events.indexOf('clear-analysis') < events.indexOf('render-retrieval'), 'analysis run must be cleared before retrieval is rendered');
  assert(events.indexOf('render-retrieval') < events.indexOf('chat:aha:Svar fra AHA'), 'retrieval must complete before the answer is rendered');
  assert(events.includes('render-auto-output'));
  assert(events.includes('ensure-afterwork'));
  assert(events.includes('ingest:aha_agent'));
  assert.equal(events.at(-2), 'processing:false');

  console.log('aha-chat-submission-runtime passed');
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
