const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const textUtilsCode = fs.readFileSync('ahaChatTextUtils.js', 'utf8');
const signalsCode = fs.readFileSync('ahaChatSignals.js', 'utf8');
const exportCode = fs.readFileSync('ahaChatExport.js', 'utf8');
const chatCode = fs.readFileSync('ahaChat.js', 'utf8');

function makeContext(seed = {}) {
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
    InsightsEngine: {
      createEmptyChamber: () => ({ insights: [], chatLog: [] }),
      buildMetaProfile: () => ({ profile: 'meta' })
    }
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
  const fallback = { domain: 'fallback', keyInsight: 'js' };

  const ctxDisabled = makeContext();
  let disabledCallCount = 0;
  ctxDisabled.AHAEngineClient = {
    buildAnalyzePayload: () => ({}),
    analyzeWithPythonEngine: async () => {
      disabledCallCount += 1;
      return { domain: 'python' };
    },
    isCanonicalAhaAnalysis: () => true
  };
  const resDisabled = await ctxDisabled.AHATestHooks.resolveCanonicalAnalysisWithOptionalPythonEngine({
    message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback
  });
  assert.equal(resDisabled.analysis, fallback);
  assert.equal(resDisabled.source, 'javascript_default');
  assert.equal(disabledCallCount, 0);

  const ctxEnabled = makeContext({ aha_python_engine_enabled: 'true' });
  const pythonCanonical = { domain: 'python', keyInsight: 'py' };
  ctxEnabled.AHAEngineClient = {
    buildAnalyzePayload: (m, a, h) => ({ message: m, assistantReply: a, historyGoContext: h }),
    analyzeWithPythonEngine: async () => pythonCanonical,
    isCanonicalAhaAnalysis: (v) => v && v.domain === 'python'
  };
  const resEnabled = await ctxEnabled.AHATestHooks.resolveCanonicalAnalysisWithOptionalPythonEngine({
    message: 'm', assistantReply: 'a', historyGoContext: { sample: true }, fallbackAnalysis: fallback
  });
  assert.equal(resEnabled.analysis, pythonCanonical);
  assert.equal(resEnabled.source, 'python');

  const ctxNull = makeContext({ aha_python_engine_enabled: 'true' });
  ctxNull.AHAEngineClient = {
    buildAnalyzePayload: () => ({}),
    analyzeWithPythonEngine: async () => null,
    isCanonicalAhaAnalysis: () => false
  };
  const resNull = await ctxNull.AHATestHooks.resolveCanonicalAnalysisWithOptionalPythonEngine({
    message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback
  });
  assert.equal(resNull.analysis, fallback);
  assert.equal(resNull.source, 'javascript_fallback');

  const ctxMissing = makeContext({ aha_python_engine_enabled: 'true' });
  const resMissing = await ctxMissing.AHATestHooks.resolveCanonicalAnalysisWithOptionalPythonEngine({
    message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback
  });
  assert.equal(resMissing.analysis, fallback);
  assert.equal(resMissing.source, 'javascript_fallback');

  const ctxThrow = makeContext({ aha_python_engine_enabled: 'true' });
  ctxThrow.AHAEngineClient = {
    buildAnalyzePayload: () => { throw new Error('boom'); },
    analyzeWithPythonEngine: async () => null,
    isCanonicalAhaAnalysis: () => false
  };
  const resThrow = await ctxThrow.AHATestHooks.resolveCanonicalAnalysisWithOptionalPythonEngine({
    message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback
  });
  assert.equal(resThrow.analysis, fallback);
  assert.equal(resThrow.source, 'javascript_fallback');

  console.log('aha-python-engine-wiring.test passed');
})();
