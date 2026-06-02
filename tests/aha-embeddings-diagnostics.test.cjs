const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadAHAEmbeddings(overrides = {}) {
  const warnings = [];
  const window = {
    console: {
      warn(...args) { warnings.push(args); }
    },
    fetch: overrides.fetch,
    AHA_AGENT_API: overrides.AHA_AGENT_API,
    AHADb: overrides.AHADb,
    AHAAuth: overrides.AHAAuth
  };
  window.window = window;
  window.globalThis = window;
  const context = vm.createContext(window);
  const source = fs.readFileSync('js/ahaEmbeddings.js', 'utf8');
  vm.runInContext(source, context, { filename: 'js/ahaEmbeddings.js' });
  return { AHAEmbeddings: context.AHAEmbeddings, warnings };
}

async function testHealthNotConfigured() {
  const { AHAEmbeddings } = loadAHAEmbeddings();
  const health = await AHAEmbeddings.health();
  assert.equal(health.ok, false);
  assert.equal(health.status, 'not_configured');
  assert.equal(health.reason, 'not_configured');
  assert.equal(health.configured, false);
  assert.equal(health.backendConfigured, false);
  assert.equal(health.backendReachable, null);
}

async function testEmbedAndStoreNotConfigured() {
  const { AHAEmbeddings, warnings } = loadAHAEmbeddings();
  const result = await AHAEmbeddings.embedAndStore({ id: 'insight-1', summary: 'tekst' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not_configured');
  assert.equal(result.legacyReason, 'no_backend');
  assert.equal(warnings[0][0], 'AHAEmbeddings.embedAndStore skipped: not_configured');
}

async function testEmbedAndStoreMissingProviderKey() {
  const { AHAEmbeddings, warnings } = loadAHAEmbeddings({
    AHA_AGENT_API: 'https://example.test/api/aha-agent',
    fetch: async () => ({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ ok: false, error: 'missing_api_key' })
    })
  });
  const result = await AHAEmbeddings.embedAndStore({ id: 'insight-1', summary: 'tekst' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing_provider_key');
  assert.equal(result.status, 503);
  assert.equal(warnings[0][0], 'AHAEmbeddings.embedAndStore failed: missing_provider_key');
}

async function testEmbedAndStoreStorageUnavailable() {
  const { AHAEmbeddings, warnings } = loadAHAEmbeddings({
    AHA_AGENT_API: 'https://example.test/api/aha-agent',
    fetch: async () => ({
      ok: true,
      json: async () => ({ model: 'test-model', embeddings: [[0.1, 0.2]] })
    })
  });
  const result = await AHAEmbeddings.embedAndStore({ id: 'insight-1', summary: 'tekst' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'storage_unavailable');
  assert.equal(result.legacyReason, 'no_supabase');
  assert.equal(warnings[0][0], 'AHAEmbeddings.embedAndStore failed: storage_unavailable');
}

async function testEmbedAndStoreBackendUnreachable() {
  const { AHAEmbeddings, warnings } = loadAHAEmbeddings({
    AHA_AGENT_API: 'https://example.test/api/aha-agent',
    fetch: async () => { throw new TypeError('network down'); }
  });
  const result = await AHAEmbeddings.embedAndStore({ id: 'insight-1', summary: 'tekst' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'backend_unreachable');
  assert.equal(warnings[0][0], 'AHAEmbeddings.embedAndStore failed: backend_unreachable');
}

(async () => {
  await testHealthNotConfigured();
  await testEmbedAndStoreNotConfigured();
  await testEmbedAndStoreMissingProviderKey();
  await testEmbedAndStoreStorageUnavailable();
  await testEmbedAndStoreBackendUnreachable();
  console.log('aha-embeddings-diagnostics: ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
