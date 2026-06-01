const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const textUtilsCode = fs.readFileSync('ahaChatTextUtils.js', 'utf8');
const signalsCode = fs.readFileSync('ahaChatSignals.js', 'utf8');
const exportCode = fs.readFileSync('ahaChatExport.js', 'utf8');
const subjectsCode = fs.readFileSync('ahaChatSubjects.js', 'utf8');
const analysisCode = fs.readFileSync('ahaChatAnalysis.js', 'utf8');
const engineClientCode = fs.readFileSync('ahaEngineClient.js', 'utf8');
const chatCode = fs.readFileSync('ahaChat.js', 'utf8');
const pythonSmokeCode = fs.readFileSync('ahaChatPythonSmoke.js', 'utf8');

function buildContext(seed = {}) {
  const store = new Map(Object.entries(seed));
  const context = {
    window: null,
    console,
    fetch: async () => ({ ok: false, json: async () => ({}) }),
    AbortController,
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
  context.location = { hostname: 'paradispartiet.github.io' };
  context.addEventListener = () => {};
  vm.createContext(context);
  vm.runInContext(textUtilsCode, context, { filename: 'ahaChatTextUtils.js' });
  vm.runInContext(signalsCode, context, { filename: 'ahaChatSignals.js' });
  vm.runInContext(exportCode, context, { filename: 'ahaChatExport.js' });
  vm.runInContext(subjectsCode, context, { filename: 'ahaChatSubjects.js' });
  vm.runInContext(analysisCode, context, { filename: 'ahaChatAnalysis.js' });
  vm.runInContext(engineClientCode, context, { filename: 'ahaEngineClient.js' });
  vm.runInContext(chatCode, context, { filename: 'ahaChat.js' });
  vm.runInContext(pythonSmokeCode, context, { filename: 'ahaChatPythonSmoke.js' });
  return context;
}

(async function run() {
  const ctx = buildContext();
  const hooks = ctx.AHATestHooks;
  const fallback = { contentType: 'academic_article', domain: 'general', theme: 'fallback', mainTension: 'tension', keyInsight: 'insight', fieldConnections: [], historyGoLinks: [], suggestedActions: [], confidence: {}, warnings: [] };

  let result = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({ message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback });
  assert.deepEqual(result.analysis, fallback, 'flag disabled should use fallback');
  assert.equal(result.meta.source, 'javascript_default', 'flag disabled should report javascript_default source');

  ctx.localStorage.setItem('aha_python_engine_enabled', 'true');
  const preservedClient = ctx.AHAEngineClient;
  ctx.AHAEngineClient = null;
  result = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({ message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback });
  assert.deepEqual(result.analysis, fallback, 'missing client should use fallback');
  assert.equal(result.meta.source, 'javascript_fallback', 'missing client should report javascript_fallback source');
  assert.equal(result.meta.reason, 'client_missing', 'missing client should report client_missing reason');
  ctx.AHAEngineClient = preservedClient;

  result = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({ message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback });
  assert.deepEqual(result.analysis, fallback, 'production host without explicit URL should use fallback');
  assert.equal(result.meta.source, 'javascript_fallback', 'missing explicit URL should report javascript_fallback source');
  assert.equal(result.meta.reason, 'requires_explicit_url', 'missing explicit URL should report requires_explicit_url reason');

  const pythonCanonical = { ...fallback, theme: 'python-theme', confidence: { contentType: 0.9, domain: 0.8, theme: 0.7, mainTension: 0.6, historyGoLinks: 0.5 } };
  const realEngineClient = ctx.AHAEngineClient;
  ctx.AHAEngineClient = {
    buildAnalyzePayload: () => ({ ok: true }),
    analyzeWithPythonEngine: async () => pythonCanonical,
    getExplicitEngineUrl: () => realEngineClient.getExplicitEngineUrl(),
    resolvePythonEngineUrl: () => realEngineClient.resolvePythonEngineUrl()
  };
  result = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({ message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback });
  assert.equal(result.analysis.theme, 'python-theme', 'valid python canonical should be used');
  assert.equal(result.meta.source, 'python', 'valid python canonical should report python source');
  assert.equal(result.meta.reason, '', 'valid python canonical should have empty reason');

  const detailedScenarios = [
    ['timeout', { analysis: null, ok: false, reason: 'timeout', status: null, url: 'https://aha-engine-staging-7a3y.onrender.com' }],
    ['network error', { analysis: null, ok: false, reason: 'network_error', status: null, url: 'https://aha-engine-staging-7a3y.onrender.com' }],
    ['HTTP error', { analysis: null, ok: false, reason: 'http_error', status: 500, url: 'https://aha-engine-staging-7a3y.onrender.com' }],
    ['invalid JSON', { analysis: null, ok: false, reason: 'invalid_json', status: 200, url: 'https://aha-engine-staging-7a3y.onrender.com' }],
    ['invalid shape', { analysis: { nope: true }, ok: false, reason: 'invalid_python_shape', status: 200, url: 'https://aha-engine-staging-7a3y.onrender.com' }],
    ['null response', { analysis: null, ok: false, reason: 'python_null', status: 200, url: 'https://aha-engine-staging-7a3y.onrender.com' }]
  ];

  for (const [label, detailed] of detailedScenarios) {
    ctx.AHAEngineClient = {
      buildAnalyzePayload: () => ({ ok: true }),
      analyzeWithPythonEngineDetailed: async () => detailed,
      getExplicitEngineUrl: () => realEngineClient.getExplicitEngineUrl(),
      resolvePythonEngineUrl: () => realEngineClient.resolvePythonEngineUrl()
    };
    result = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({ message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback });
    assert.deepEqual(result.analysis, fallback, `${label} should fallback`);
    assert.equal(result.meta.source, 'javascript_fallback', `${label} should report javascript_fallback source`);
    assert.equal(result.meta.reason, detailed.reason, `${label} should preserve detailed reason`);
    if (typeof detailed.status === 'number') assert.equal(result.meta.status, detailed.status, `${label} should preserve status`);
    if (typeof detailed.url === 'string') assert.equal(result.meta.url, detailed.url, `${label} should preserve URL`);
  }

  ctx.AHAEngineClient = {
    buildAnalyzePayload: () => ({ ok: true }),
    analyzeWithPythonEngineDetailed: async () => ({ analysis: pythonCanonical, ok: true, reason: '', status: 200, url: 'https://aha-engine-staging-7a3y.onrender.com' }),
    getExplicitEngineUrl: () => realEngineClient.getExplicitEngineUrl(),
    resolvePythonEngineUrl: () => realEngineClient.resolvePythonEngineUrl()
  };
  result = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({ message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback });
  assert.equal(result.analysis.theme, 'python-theme', 'valid detailed python canonical should be used');
  assert.equal(result.meta.source, 'python', 'valid detailed python canonical should report python source');
  assert.equal(result.meta.reason, '', 'valid detailed python canonical should have empty reason');
  assert.equal(result.meta.status, undefined, 'successful python meta should not expose debug status');
  assert.equal(result.meta.url, undefined, 'successful python meta should not expose debug URL');

  ctx.AHAEngineClient = {
    buildAnalyzePayload: () => ({ ok: true }),
    analyzeWithPythonEngine: async () => pythonCanonical,
    getExplicitEngineUrl: () => realEngineClient.getExplicitEngineUrl(),
    resolvePythonEngineUrl: () => realEngineClient.resolvePythonEngineUrl()
  };

  const payloadWithCanonicalAnalysis = {
    textType: 'day_log',
    reflection: 'irrelevant',
    canonicalAnalysis: pythonCanonical
  };
  const canonicalFromPayload = hooks.buildCanonicalAnalysis(payloadWithCanonicalAnalysis, 'kildetekst');
  assert.deepEqual(canonicalFromPayload, pythonCanonical, 'buildCanonicalAnalysis should reuse valid payload.canonicalAnalysis');

  const invalidPayloadCanonical = {
    ...pythonCanonical,
    confidence: {}
  };
  const rebuiltCanonical = hooks.buildCanonicalAnalysis({
    textType: 'academic_article',
    reflection: 'Refleksjon fra JS',
    canonicalAnalysis: invalidPayloadCanonical,
    path: ['A', 'B'],
    sortItems: [],
    list: []
  }, 'Dette er en tekst om NAV-reformen og måloppnåelse.');
  assert.notDeepEqual(rebuiltCanonical, invalidPayloadCanonical, 'invalid payload.canonicalAnalysis should not be reused');
  assert.equal(rebuiltCanonical.contentType, 'academic_article', 'invalid payload.canonicalAnalysis should trigger JS canonical rebuild');

  ctx.AHAEngineClient.analyzeWithPythonEngine = async () => ({
    ...pythonCanonical,
    theme: 'invalid-confidence',
    confidence: {}
  });
  result = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({ message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback });
  assert.deepEqual(result.analysis, fallback, 'invalid confidence should fallback');
  assert.equal(result.meta.source, 'javascript_fallback', 'invalid confidence should report javascript_fallback source');
  assert.equal(result.meta.reason, 'invalid_python_shape', 'invalid confidence should report invalid_python_shape reason');

  ctx.AHAEngineClient.analyzeWithPythonEngine = async () => null;
  result = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({ message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback });
  assert.deepEqual(result.analysis, fallback, 'null python response should fallback');
  assert.equal(result.meta.source, 'javascript_fallback', 'null python response should report javascript_fallback source');
  assert.equal(result.meta.reason, 'python_null', 'null python response should report python_null reason');

  ctx.AHAEngineClient.analyzeWithPythonEngine = async () => { throw new Error('boom'); };
  result = await hooks.resolveCanonicalAnalysisWithOptionalPythonEngine({ message: 'm', assistantReply: 'a', historyGoContext: {}, fallbackAnalysis: fallback });
  assert.deepEqual(result.analysis, fallback, 'exceptions should fallback');
  assert.equal(result.meta.source, 'javascript_fallback', 'exceptions should report javascript_fallback source');
  assert.equal(result.meta.reason, 'python_error', 'exceptions should report python_error reason');


  assert.equal(typeof ctx.AHAPythonEngineSmokeTest, 'object', 'smoke helper should exist');
  const smokeStatus = ctx.AHAPythonEngineSmokeTest.printStatus();
  assert.equal(smokeStatus.featureFlagEnabled, true, 'smoke helper should read feature flag from localStorage');
  assert.equal(
    smokeStatus.configuredEngineUrl,
    null,
    'smoke helper should show null configured URL when override is missing'
  );
  assert.equal(smokeStatus.resolvedEngineUrl, null, 'smoke helper should fail closed on production-like host');
  assert.equal(smokeStatus.urlAvailable, false, 'smoke helper should report unavailable URL on production-like host');
  assert.equal(smokeStatus.requiresExplicitUrl, true, 'enabled feature flag should require explicit URL on production-like host');

  ctx.localStorage.setItem('aha_python_engine_url', 'http://127.0.0.1:8000');
  const smokeStatusWithCustomUrl = ctx.AHAPythonEngineSmokeTest.printStatus();
  assert.equal(
    smokeStatusWithCustomUrl.configuredEngineUrl,
    'http://127.0.0.1:8000',
    'smoke helper should use custom URL override when configured'
  );
  assert.equal(
    smokeStatusWithCustomUrl.resolvedEngineUrl,
    'http://127.0.0.1:8000',
    'smoke helper resolved URL should match explicit URL override'
  );

  ctx.localStorage.removeItem('aha_python_engine_url');
  ctx.location.hostname = 'localhost';
  const smokeStatusDev = ctx.AHAPythonEngineSmokeTest.printStatus();
  assert.equal(
    smokeStatusDev.resolvedEngineUrl,
    'https://aha-engine-staging-7a3y.onrender.com',
    'smoke helper should use staging URL as default on localhost'
  );

  const emptyCtx = buildContext();
  assert.equal(emptyCtx.AHAPythonEngineSmokeTest.getLatestAutoOutput(), null, 'missing auto-output should be handled safely');

  const storedPayload = {
    payload: {
      canonicalAnalysisMeta: { source: 'javascript_fallback', reason: 'http_error', status: 500, url: 'https://aha-engine-staging-7a3y.onrender.com' },
      canonicalAnalysis: pythonCanonical
    }
  };
  ctx.localStorage.setItem('aha_chat_auto_outputs_v1', JSON.stringify(storedPayload));
  const latestMeta = ctx.AHAPythonEngineSmokeTest.getLatestEngineMeta();
  assert.equal(latestMeta.source, 'javascript_fallback', 'smoke helper should return latest canonicalAnalysisMeta source');
  assert.equal(latestMeta.status, 500, 'smoke helper should return latest canonicalAnalysisMeta status');
  const storedSmokeStatus = ctx.AHAPythonEngineSmokeTest.printStatus();
  assert.equal(storedSmokeStatus.latestStatus, 500, 'smoke helper should print latest status');
  assert.equal(storedSmokeStatus.latestUrl, 'https://aha-engine-staging-7a3y.onrender.com', 'smoke helper should print latest URL');
  assert.equal(ctx.AHAPythonEngineSmokeTest.isPythonActive(), false, 'smoke helper should detect inactive fallback source');
  const payloadWithMeta = {
    canonicalAnalysis: pythonCanonical,
    canonicalAnalysisMeta: { source: 'python', reason: '' }
  };
  const canonicalWithoutMeta = hooks.buildCanonicalAnalysis(payloadWithMeta, 'kildetekst');
  assert.deepEqual(canonicalWithoutMeta, pythonCanonical, 'buildCanonicalAnalysis should only return canonical analysis object');
  assert.equal(canonicalWithoutMeta.canonicalAnalysisMeta, undefined, 'buildCanonicalAnalysis should not include canonicalAnalysisMeta');

  console.log('aha-python-engine-wiring.test passed');
})();
