const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function createLocalStorage(seed = {}) {
  const state = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return state.has(key) ? state.get(key) : null;
    },
    setItem(key, value) {
      state.set(key, String(value));
    }
  };
}

function loadClient(context) {
  const code = fs.readFileSync('ahaEngineClient.js', 'utf8');
  vm.runInContext(code, context, { filename: 'ahaEngineClient.js' });
  return context.window.AHAEngineClient;
}

(async function run() {
  const canonical = {
    contentType: 'reflection',
    domain: 'learning',
    theme: 'metacognition',
    mainTension: 'theory vs practice',
    keyInsight: 'small loops build understanding',
    fieldConnections: [],
    historyGoLinks: [
      { type: 'event', id: 'hg_1', title: 'Old note', reason: 'relevant pattern' }
    ],
    suggestedActions: [],
    confidence: {
      contentType: 0.9,
      domain: 0.8,
      theme: 0.7,
      mainTension: 0.85,
      historyGoLinks: 0.6
    },
    warnings: []
  };

  const storage = createLocalStorage();
  const context = vm.createContext({
    window: { localStorage: storage },
    localStorage: storage,
    module: { exports: {} },
    exports: {},
    setTimeout,
    clearTimeout,
    JSON,
    fetch: async () => {
      throw new Error('fetch should not run when disabled');
    }
  });

  const client = loadClient(context);

  assert.equal(client.isCanonicalAhaAnalysis(canonical), true);
  assert.equal(client.isCanonicalAhaAnalysis({ ...canonical, domain: undefined }), false);

  const payload = client.buildAnalyzePayload('hei', 'svar', { imported: true });
  assert.deepEqual(payload, {
    message: 'hei',
    assistantReply: 'svar',
    historyGoContext: { imported: true }
  });

  const disabledResult = await client.analyzeWithPythonEngine(payload);
  assert.equal(disabledResult, null);

  console.log('aha-engine-client.test passed');
})();
