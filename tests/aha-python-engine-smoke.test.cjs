const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ENGINE_HOST = '127.0.0.1';
const ENGINE_PORT = 8011;
const ENGINE_URL = `http://${ENGINE_HOST}:${ENGINE_PORT}`;
const BACKEND_DIR = path.join(__dirname, '..', 'backend', 'aha_engine');

const TEST_MESSAGE =
  'Dette er en fagtekst om Morgenbladet, offentlighet, kulturkritikk og idédebatt.';

const fallbackAnalysis = {
  contentType: 'academic_article',
  domain: 'general',
  theme: 'fallback-theme',
  mainTension: 'fallback-tension',
  keyInsight: 'fallback-insight',
  fieldConnections: [],
  historyGoLinks: [],
  suggestedActions: [],
  confidence: {
    contentType: 0.5,
    domain: 0.5,
    theme: 0.5,
    mainTension: 0.5,
    historyGoLinks: 0.5
  },
  warnings: []
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${ENGINE_URL}/health`);
      if (response.ok) {
        const json = await response.json();
        if (json && json.status === 'ok' && json.service === 'aha-engine') {
          return;
        }
      }
    } catch (_) {
      // retry
    }
    await sleep(250);
  }
  throw new Error(
    'Python AHA Engine did not become healthy. Ensure backend dependencies are installed: cd backend/aha_engine && pip install -r requirements.txt'
  );
}

function buildContext(seed = {}) {
  const store = new Map(Object.entries(seed));
  const context = {
    window: null,
    console,
    fetch,
    AbortController,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
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
    URL: { createObjectURL: () => 'blob:dummy', revokeObjectURL: () => {} },
    Blob: function Blob() {},
    InsightsEngine: { createEmptyChamber: () => ({ insights: [], chatLog: [] }), buildMetaProfile: () => ({}) },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    }
  };
  context.window = context;
  context.addEventListener = () => {};

  vm.createContext(context);

  const files = [
    'ahaChatTextUtils.js',
    'ahaChatSignals.js',
    'ahaChatExport.js',
    'ahaChatSubjects.js',
    'ahaChatAnalysis.js',
    'ahaEngineClient.js',
    'ahaChat.js',
    'ahaChatPythonSmoke.js'
  ];

  for (const file of files) {
    const code = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }

  return context;
}

function assertSmokeTestScenarioHelpers() {
  const context = buildContext({
    aha_python_engine_enabled: 'old',
    aha_python_engine_url: 'https://old.example',
    aha_chat_auto_outputs_v1: '{"old":true}'
  });
  const helper = context.AHAPythonEngineSmokeTest;

  for (const method of [
    'reset',
    'enableWithStagingUrl',
    'enableWithoutUrl',
    'enableWithInvalidUrl',
    'printScenarioGuide',
    'printStatus'
  ]) {
    assert.equal(typeof helper[method], 'function', `${method} should exist on AHAPythonEngineSmokeTest`);
  }

  helper.reset();
  assert.equal(context.localStorage.getItem('aha_python_engine_enabled'), null, 'reset should remove feature flag');
  assert.equal(context.localStorage.getItem('aha_python_engine_url'), null, 'reset should remove engine URL');
  assert.equal(context.localStorage.getItem('aha_chat_auto_outputs_v1'), null, 'reset should remove auto-output');

  context.localStorage.setItem('aha_chat_auto_outputs_v1', '{"old":true}');
  helper.enableWithStagingUrl();
  assert.equal(context.localStorage.getItem('aha_python_engine_enabled'), 'true', 'staging helper should enable feature flag');
  assert.equal(
    context.localStorage.getItem('aha_python_engine_url'),
    'https://aha-engine-staging-7a3y.onrender.com',
    'staging helper should set Render staging URL'
  );
  assert.equal(context.localStorage.getItem('aha_chat_auto_outputs_v1'), null, 'staging helper should remove stale auto-output');

  context.localStorage.setItem('aha_python_engine_url', 'https://old.example');
  context.localStorage.setItem('aha_chat_auto_outputs_v1', '{"old":true}');
  helper.enableWithoutUrl();
  assert.equal(context.localStorage.getItem('aha_python_engine_enabled'), 'true', 'missing URL helper should enable feature flag');
  assert.equal(context.localStorage.getItem('aha_python_engine_url'), null, 'missing URL helper should remove engine URL');
  assert.equal(context.localStorage.getItem('aha_chat_auto_outputs_v1'), null, 'missing URL helper should remove stale auto-output');

  context.localStorage.setItem('aha_chat_auto_outputs_v1', '{"old":true}');
  helper.enableWithInvalidUrl();
  assert.equal(context.localStorage.getItem('aha_python_engine_enabled'), 'true', 'invalid URL helper should enable feature flag');
  assert.equal(
    context.localStorage.getItem('aha_python_engine_url'),
    'https://invalid-aha-engine-staging-url.example',
    'invalid URL helper should set invalid engine URL'
  );
  assert.equal(context.localStorage.getItem('aha_chat_auto_outputs_v1'), null, 'invalid URL helper should remove stale auto-output');
}

(async function run() {
  assertSmokeTestScenarioHelpers();

  const proc = spawn('python', ['-m', 'uvicorn', 'app.main:app', '--host', ENGINE_HOST, '--port', String(ENGINE_PORT)], {
    cwd: BACKEND_DIR,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  proc.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForHealth();

    const clientContext = buildContext({
      aha_python_engine_enabled: 'true',
      aha_python_engine_url: ENGINE_URL
    });

    const client = clientContext.AHAEngineClient;
    const payload = client.buildAnalyzePayload(TEST_MESSAGE, 'Takk for teksten.', {});
    const pythonResult = await client.analyzeWithPythonEngine(payload);

    assert.notEqual(pythonResult, null, 'Expected python backend to return canonical analysis object');
    assert.equal(typeof pythonResult.contentType, 'string');
    assert.equal(typeof pythonResult.domain, 'string');
    assert.equal(typeof pythonResult.theme, 'string');
    assert.equal(typeof pythonResult.confidence, 'object');
    assert.equal(Array.isArray(pythonResult.historyGoLinks), true);

    const hooks = clientContext.AHATestHooks;
    let resolved = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({
      message: TEST_MESSAGE,
      assistantReply: 'Takk for teksten.',
      historyGoContext: {},
      fallbackAnalysis
    });

    assert.equal(resolved.meta.source, 'python');
    assert.equal(client.isCanonicalAhaAnalysis(resolved.analysis), true);

    clientContext.localStorage.setItem('aha_python_engine_url', 'http://127.0.0.1:9999');
    resolved = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({
      message: TEST_MESSAGE,
      assistantReply: 'Takk for teksten.',
      historyGoContext: {},
      fallbackAnalysis
    });

    assert.equal(resolved.meta.source, 'javascript_fallback');
    assert.deepEqual(resolved.analysis, fallbackAnalysis);

    console.log('aha-python-engine-smoke.test passed');
  } catch (error) {
    const missingDependencySignal =
      /No module named|ModuleNotFoundError|ImportError|cannot import name/i.test(stderr);

    if (missingDependencySignal) {
      throw new Error(
        `Python AHA Engine failed to start due to missing dependencies. Run: cd backend/aha_engine && pip install -r requirements.txt\nOriginal stderr:\n${stderr}`
      );
    }

    throw error;
  } finally {
    if (!proc.killed) {
      proc.kill('SIGTERM');
      await sleep(250);
      if (!proc.killed && proc.exitCode === null) {
        proc.kill('SIGKILL');
      }
    }
  }
})();
