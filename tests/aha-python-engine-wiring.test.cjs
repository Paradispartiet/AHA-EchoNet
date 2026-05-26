const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const textUtilsCode = fs.readFileSync('ahaChatTextUtils.js', 'utf8');
const signalsCode = fs.readFileSync('ahaChatSignals.js', 'utf8');
const exportCode = fs.readFileSync('ahaChatExport.js', 'utf8');
const chatCode = fs.readFileSync('ahaChat.js', 'utf8');

function buildContext(seed = {}) {
  const store = new Map(Object.entries(seed));
  const context = {
    window: null,
    console,
    navigator: { clipboard: { writeText: async () => {} } },
    document: {
      readyState: 'loading',
      addEventListener: () => {},
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null,
      body: { appendChild: () => {} },
      createElement: () => ({ click: () => {}, remove: () => {} })
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
    InsightsEngine: { createEmptyChamber: () => ({ insights: [], chatLog: [] }), buildMetaProfile: () => ({}) }
  };
  context.window = context;
  context.addEventListener = () => {};
  vm.createContext(context);
  vm.runInContext(textUtilsCode, context, { filename: 'ahaChatTextUtils.js' });
  vm.runInContext(signalsCode, context, { filename: 'ahaChatSignals.js' });
  vm.runInContext(exportCode, context, { filename: 'ahaChatExport.js' });
  vm.runInContext(chatCode, context, { filename: 'ahaChat.js' });
  return context;
}

(async function run() {
  const ctx = buildContext();
  const hooks = ctx.AHATestHooks;
  const fallback = { contentType: 'academic_article', domain: 'general', theme: 'fallback', mainTension: 'tension', keyInsight: 'insight', fieldConnections: [], historyGoLinks: [], suggestedActions: [], confidence: {}, warnings: [] };

  let result = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({ message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback });
  assert.deepEqual(result, fallback, 'flag disabled should use fallback');

  ctx.localStorage.setItem('aha_python_engine_enabled', 'true');
  result = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({ message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback });
  assert.deepEqual(result, fallback, 'missing client should use fallback');

  const pythonCanonical = { ...fallback, theme: 'python-theme', confidence: { contentType: 0.9, domain: 0.8, theme: 0.7, mainTension: 0.6, historyGoLinks: 0.5 } };
  ctx.AHAEngineClient = {
    buildAnalyzePayload: () => ({ ok: true }),
    analyzeWithPythonEngine: async () => pythonCanonical
  };
  result = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({ message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback });
  assert.equal(result.theme, 'python-theme', 'valid python canonical should be used');


  ctx.AHAEngineClient.analyzeWithPythonEngine = async () => ({
    ...pythonCanonical,
    theme: 'invalid-confidence',
    confidence: {}
  });
  result = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({ message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback });
  assert.deepEqual(result, fallback, 'invalid confidence should fallback');

  ctx.AHAEngineClient.analyzeWithPythonEngine = async () => null;
  result = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({ message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback });
  assert.deepEqual(result, fallback, 'null python response should fallback');

  ctx.AHAEngineClient.analyzeWithPythonEngine = async () => { throw new Error('boom'); };
  result = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({ message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback });
  assert.deepEqual(result, fallback, 'exceptions should fallback');

  console.log('aha-python-engine-wiring.test passed');
})();
