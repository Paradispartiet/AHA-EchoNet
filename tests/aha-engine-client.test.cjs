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

function createContext(storage, fetchImpl, location = null) {
  return vm.createContext({
    window: { localStorage: storage, location },
    localStorage: storage,
    location,
    module: { exports: {} },
    exports: {},
    setTimeout,
    clearTimeout,
    JSON,
    AbortController,
    DOMException,
    TypeError,
    fetch: fetchImpl
  });
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

  {
    const storage = createLocalStorage();
    let fetchCalled = false;
    const context = createContext(storage, async () => {
      fetchCalled = true;
      throw new Error('fetch should not run when disabled');
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

    const detailed = await client.analyzeWithPythonEngineDetailed(payload);
    assert.deepEqual(detailed, { analysis: null, ok: false, reason: 'feature_flag_disabled', status: null, url: null });
    assert.equal(fetchCalled, false);

    const disabledResult = await client.analyzeWithPythonEngine(payload);
    assert.equal(disabledResult, null);
  }

  { // production-like host + enabled flag + no explicit URL => fail closed
    const storage = createLocalStorage({ aha_python_engine_enabled: 'true' });
    let calledUrl = null;
    const context = createContext(storage, async (url) => {
      calledUrl = url;
      return { ok: true, status: 200, json: async () => canonical };
    }, { hostname: 'paradispartiet.github.io' });
    const client = loadClient(context);

    const detailed = await client.analyzeWithPythonEngineDetailed(client.buildAnalyzePayload('a', 'b', {}));
    assert.equal(client.resolvePythonEngineUrl(), null);
    assert.equal(calledUrl, null);
    assert.deepEqual(detailed, { analysis: null, ok: false, reason: 'requires_explicit_url', status: null, url: null });

    const result = await client.analyzeWithPythonEngine(client.buildAnalyzePayload('a', 'b', {}));
    assert.equal(result, null);
  }

  { // production-like host + no explicit URL should resolve to null
    const storage = createLocalStorage();
    const context = createContext(storage, async () => ({ ok: true, status: 200, json: async () => canonical }));
    const client = loadClient(context);
    assert.equal(client.getConfiguredBaseUrl(), null);
  }

  {
    const storage = createLocalStorage({
      aha_python_engine_url: 'http://127.0.0.1:8000'
    });
    const context = createContext(storage, async () => ({ ok: true, status: 200, json: async () => canonical }), { hostname: 'paradispartiet.github.io' });
    const client = loadClient(context);
    assert.equal(client.getConfiguredBaseUrl(), 'http://127.0.0.1:8000');
  }

  {
    const storage = createLocalStorage({
      aha_python_engine_enabled: 'true',
      aha_python_engine_url: 'http://127.0.0.1:8000'
    });
    let calledUrl = null;
    const context = createContext(storage, async (url) => {
      calledUrl = url;
      return { ok: true, status: 200, json: async () => canonical };
    }, { hostname: 'paradispartiet.github.io' });
    const client = loadClient(context);

    const detailed = await client.analyzeWithPythonEngineDetailed(client.buildAnalyzePayload('a', 'b', {}));
    assert.equal(calledUrl, 'http://127.0.0.1:8000/api/aha/analyze');
    assert.equal(detailed.ok, true);
    assert.equal(detailed.reason, '');
    assert.equal(detailed.status, 200);
    assert.equal(detailed.url, 'http://127.0.0.1:8000');
    assert.deepEqual(detailed.analysis, canonical);

    const result = await client.analyzeWithPythonEngine(client.buildAnalyzePayload('a', 'b', {}));
    assert.deepEqual(result, canonical);
  }

  {
    const storage = createLocalStorage({ aha_python_engine_enabled: 'true' });
    let calledUrl = null;
    const context = createContext(storage, async (url) => {
      calledUrl = url;
      return { ok: true, status: 200, json: async () => canonical };
    }, { hostname: 'localhost' });
    const client = loadClient(context);
    const detailed = await client.analyzeWithPythonEngineDetailed(client.buildAnalyzePayload('a', 'b', {}));
    assert.equal(client.resolvePythonEngineUrl(), 'https://aha-engine-staging-7a3y.onrender.com');
    assert.equal(calledUrl, 'https://aha-engine-staging-7a3y.onrender.com/api/aha/analyze');
    assert.equal(detailed.ok, true);
    assert.equal(detailed.url, 'https://aha-engine-staging-7a3y.onrender.com');
  }

  {
    const storage = createLocalStorage({ aha_python_engine_enabled: 'true' });
    const invalid = { ...canonical, confidence: { ...canonical.confidence, domain: '0.8' } };
    const context = createContext(storage, async () => ({ ok: true, status: 200, json: async () => invalid }), { hostname: 'localhost' });
    const client = loadClient(context);

    const detailed = await client.analyzeWithPythonEngineDetailed(client.buildAnalyzePayload('a', 'b', {}));
    assert.equal(detailed.ok, false);
    assert.equal(detailed.reason, 'invalid_python_shape');
    assert.equal(detailed.status, 200);
    assert.equal(detailed.analysis, null);

    const result = await client.analyzeWithPythonEngine(client.buildAnalyzePayload('a', 'b', {}));
    assert.equal(result, null);
  }

  {
    const storage = createLocalStorage({ aha_python_engine_enabled: 'true' });
    const context = createContext(storage, async () => ({ ok: false, status: 500, json: async () => ({}) }), { hostname: 'localhost' });
    const client = loadClient(context);
    const detailed = await client.analyzeWithPythonEngineDetailed(client.buildAnalyzePayload('a', 'b', {}));
    assert.equal(detailed.ok, false);
    assert.equal(detailed.reason, 'http_error');
    assert.equal(detailed.status, 500);
    assert.equal(detailed.analysis, null);
  }

  {
    const storage = createLocalStorage({ aha_python_engine_enabled: 'true' });
    const context = createContext(storage, async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }), { hostname: 'localhost' });
    const client = loadClient(context);
    const detailed = await client.analyzeWithPythonEngineDetailed(client.buildAnalyzePayload('a', 'b', {}));
    assert.equal(detailed.ok, false);
    assert.equal(detailed.reason, 'invalid_json');
    assert.equal(detailed.status, 200);
  }

  {
    const storage = createLocalStorage({ aha_python_engine_enabled: 'true' });
    const context = createContext(storage, async () => { throw new TypeError('Failed to fetch'); }, { hostname: 'localhost' });
    const client = loadClient(context);
    const detailed = await client.analyzeWithPythonEngineDetailed(client.buildAnalyzePayload('a', 'b', {}));
    assert.equal(detailed.ok, false);
    assert.equal(detailed.reason, 'network_error');
    assert.equal(detailed.status, null);
  }

  {
    const storage = createLocalStorage({ aha_python_engine_enabled: 'true' });
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const context = createContext(storage, async () => { throw abortError; }, { hostname: 'localhost' });
    const client = loadClient(context);
    const detailed = await client.analyzeWithPythonEngineDetailed(client.buildAnalyzePayload('a', 'b', {}));
    assert.equal(detailed.ok, false);
    assert.equal(detailed.reason, 'timeout');
    assert.equal(detailed.status, null);
  }

  {
    const storage = createLocalStorage({ aha_python_engine_enabled: 'true' });
    const context = createContext(storage, async () => ({ ok: true, status: 200, json: async () => null }), { hostname: 'localhost' });
    const client = loadClient(context);
    const detailed = await client.analyzeWithPythonEngineDetailed(client.buildAnalyzePayload('a', 'b', {}));
    assert.equal(detailed.ok, false);
    assert.equal(detailed.reason, 'python_null');
    assert.equal(detailed.status, 200);
    assert.equal(detailed.analysis, null);
  }

  {
    const storage = createLocalStorage({ aha_python_engine_enabled: 'TRUE' });
    const context = createContext(storage, async () => {
      throw new Error('fetch should not run for uppercase TRUE');
    }, { hostname: 'localhost' });
    const client = loadClient(context);
    assert.equal(client.isEnabled(), false);
    const result = await client.analyzeWithPythonEngine(client.buildAnalyzePayload('a', 'b', {}));
    assert.equal(result, null);
  }

  {
    const storage = createLocalStorage({ aha_python_engine_enabled: ' true ' });
    const context = createContext(storage, async () => {
      throw new Error('fetch should not run for whitespace true');
    }, { hostname: 'localhost' });
    const client = loadClient(context);
    assert.equal(client.isEnabled(), false);
    const result = await client.analyzeWithPythonEngine(client.buildAnalyzePayload('a', 'b', {}));
    assert.equal(result, null);
  }

  console.log('aha-engine-client.test passed');
})();
