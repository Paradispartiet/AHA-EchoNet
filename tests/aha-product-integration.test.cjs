const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function read(file) { return fs.readFileSync(file, 'utf8'); }
function makeContext() {
  const store = new Map();
  const context = { console, Date, Math, JSON, Map, Set,
    localStorage: { getItem: (key) => store.get(key) || null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) },
    document: { getElementById: () => null }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  return context;
}
function run(file, context) { vm.runInContext(read(file), context, { filename: file }); }

{
  const context = makeContext();
  run('js/ahaModules.js', context);
  run('js/ahaProductIntegration.js', context);
  assert.ok(context.AHAProductIntegration, 'window.AHAProductIntegration should be exposed');

  const emptyContext = makeContext();
  run('js/ahaProductIntegration.js', emptyContext);
  const empty = emptyContext.AHAProductIntegration.buildProductStatus({ save: false, now: '2026-06-22T00:00:00.000Z' });
  assert.equal(empty.overall.status, 'starting', 'empty product status should start safely');

  const nav = context.AHAProductIntegration.collectNavigationStatus();
  assert.equal(nav.homeHref, 'index.html');
  assert.equal(nav.chatHref, 'chat.html');
  assert.equal(nav.trainingHref, 'training.html');
  assert.equal(nav.personalAiHref, 'personal-ai.html');

  const modules = context.AHAProductIntegration.collectModuleStatus();
  assert.equal(modules.hasChat, true);
  assert.equal(modules.hasPersonalAI, true);
  assert.equal(modules.hasTraining, true);
  assert.equal(modules.hasSyncHub, true);
  assert.equal(modules.hasMusic, true);
  assert.equal(modules.hasHistoryGo, true);

  const status = context.AHAProductIntegration.buildProductStatus({ save: false });
  assert.ok(status.nextActions.length >= 3, 'product status should include next actions');
  assert.ok(status.nextActions.some((action) => /Training Corpus/.test(action.label)), 'next actions should guide training approval');

  const readyStatus = { ...status, personalAI: { ...status.personalAI, ready: true }, navigation: nav };
  const primary = context.AHAProductIntegration.getPrimaryNextAction(readyStatus);
  assert.equal(primary.id, 'chat', 'Chat should be primary when Personal AI is ready');
}

{
  const indexHtml = read('index.html');
  const chatHtml = read('chat.html');
  const trainingHtml = read('training.html');
  const personalHtml = read('personal-ai.html');
  const modulesJs = read('js/ahaModules.js');

  assert.ok(indexHtml.includes('js/ahaProductIntegration.js'), 'index.html should load product integration');
  ['href="chat.html"', 'href="personal-ai.html"', 'href="training.html"'].forEach((text) => assert.ok(indexHtml.includes(text), `Home should include ${text}`));
  assert.ok(indexHtml.includes('aha-product-flow-panel'), 'Home should show product flow panel');
  ['id: "chat"', 'id: "personal-ai"', 'id: "training"', 'id: "sync-hub"', 'id: "music"', 'id: "historygo"'].forEach((text) => assert.ok(modulesJs.includes(text), `modules should include ${text}`));
  ['personal-ai.html', 'training.html'].forEach((text) => assert.ok(chatHtml.includes(text), `Chat should link ${text}`));
  ['personal-ai.html', 'chat.html'].forEach((text) => assert.ok(trainingHtml.includes(text), `Training should link ${text}`));
  ['chat.html', 'training.html'].forEach((text) => assert.ok(personalHtml.includes(text), `Personal AI should link ${text}`));
}

console.log('aha-product-integration.test.cjs passed');
