const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const avisaCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaAvisa.js'), 'utf8');

function makeStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    readJson(key, fallback) { return store.has(key) ? JSON.parse(store.get(key)) : fallback; },
    writeJson(key, value) { store.set(key, JSON.stringify(value)); }
  };
}

function makeElement() { return { textContent: '', innerHTML: '', hidden: false, addEventListener() {}, classList: { toggle() {} } }; }

function makeContext({ seed = {}, repository, config, allowPublicPublishing = false } = {}) {
  const repoCalls = [];
  const storage = makeStorage(seed);
  const elements = {
    'avisa-articles': makeElement(),
    'avisa-draft-count': makeElement(),
    'avisa-review-count': makeElement(),
    'avisa-ready-count': makeElement(),
    'avisa-published-count': makeElement(),
    'avisa-sections-count': makeElement(),
    'avisa-last-updated': makeElement(),
    'avisa-privacy-warning': makeElement(),
    'avisa-personal-count': makeElement(),
    'avisa-group-count': makeElement(),
    'avisa-public-candidate-count': makeElement()
  };
  const context = {
    console, Date, Intl, Math, JSON, localStorage: storage,
    document: { addEventListener() {}, getElementById(id) { return elements[id] || null; }, querySelector() { return null; }, querySelectorAll() { return []; } },
    addEventListener() {},
    fetch() { throw new Error('fetch must not be used by AHAavisa'); },
    EchoNet: new Proxy({}, { get() { throw new Error('EchoNet must not be used by AHAavisa'); } }),
    AHASyncHub: new Proxy({}, { get() { throw new Error('Sync Hub must not be used by AHAavisa'); } }),
    AHA_CONFIG: config,
    AHARepository: repository || {
      saveArticle(article) { repoCalls.push(['saveArticle', JSON.parse(JSON.stringify(article))]); return { ok: true, article }; },
      loadArticles() { repoCalls.push(['loadArticles']); return { ok: true, data: [] }; }
    },
    AHAContracts: { normalizeTags(tags) { return String(tags || '').split(',').map((tag) => tag.trim()).filter(Boolean); } },
    AHAPrivacy: { loadSettings() { return { allowPublicPublishing }; } },
    AHAGroups: { getActiveGroups() { return []; } },
    AHAModules: { localPageHealth(input) { return { status: input.count ? 'ready' : 'empty' }; }, updatePageHealth() {}, buildModuleEmptyState({ type, moduleId, hint }) { return `<h2>${type}:${moduleId}</h2><p>${hint}</p>`; } },
    CSS: { escape(value) { return String(value); } },
    HTMLElement: function HTMLElement() {},
    HTMLSelectElement: function HTMLSelectElement() {}
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(avisaCode, context, { filename: 'js/ahaAvisa.js' });
  return { Avisa: context.AHAAvisa, storage, repoCalls, elements };
}

(async () => {
  const { Avisa, storage, repoCalls, elements } = makeContext();
  const created = Avisa.createArticle({ title: 'Local article', section: 'aha', summary: 'Only here', tags: 'local, avisa' });
  assert.ok(created.id, 'createArticle should create an id');
  assert.equal(storage.readJson('aha_articles_v1', []).length, 1, 'createArticle should save locally');
  assert.equal(created.local_only, true, 'new article should be local_only');
  assert.equal(created.published_external, false, 'new article should not be externally published');
  assert.equal(created.echonet_shared, false, 'new article should not be EchoNet shared');
  assert.equal(created.sync_enabled, false, 'new article should not have sync enabled');
  assert.equal(created.external_publish_enabled, false, 'new article should not have external publish enabled');
  assert.equal(created.meta.local_only, true, 'meta should be local_only');
  assert.equal(repoCalls.length, 0, 'createArticle should not call repository without explicit database sync flag');

  Avisa.updateArticle(created.id, { body: 'Updated locally' });
  assert.equal(repoCalls.length, 0, 'updateArticle should not call repository without explicit database sync flag');
  const deleted = Avisa.deleteArticle(created.id);
  assert.ok(deleted.deletedAt, 'deleteArticle should soft-delete');
  Avisa.render();
  assert.equal(elements['avisa-draft-count'].textContent, '0', 'deleted articles should not show as active');

  storage.writeJson('aha_articles_v1', [{ id: 'archived-article', title: 'Archived', archived: true, status: 'draft' }]);
  Avisa.render();
  assert.equal(elements['avisa-draft-count'].textContent, '0', 'archived articles should not show as active');

  const article = Avisa.createArticle({ title: 'Publish local' });
  const published = Avisa.setArticleStatus(article.id, 'published_local');
  assert.equal(published.status, 'published_local', 'published_local should set local status');
  assert.equal(published.published_local, true, 'published_local should set published_local flag');
  assert.ok(published.publishedLocalAt, 'published_local should set publishedLocalAt');
  assert.equal(published.published_external, false, 'published_local must not set published_external');
  assert.equal(published.external_publish_enabled, false, 'published_local must not set external_publish_enabled');

  const candidate = Avisa.setArticlePublicationLayer(article.id, 'public_candidate');
  assert.equal(candidate.publicationLayer, 'public_candidate', 'public_candidate should be accepted');
  assert.equal(candidate.published_external, false, 'public_candidate should not publish externally');
  assert.equal(candidate.external_publish_enabled, false, 'public_candidate should not enable external publish');
  assert.equal(candidate.sync_enabled, false, 'public_candidate should not enable sync');
  assert.equal(candidate.echonet_shared, false, 'public_candidate should not share to EchoNet');

  storage.writeJson('aha_insight_chamber_v1', { insights: [{ id: 'ins-1', title: 'Insight' }, { id: 'ins-del', title: 'Deleted insight', deletedAt: '2026-01-01' }] });
  storage.writeJson('aha_lists_v1', [{ id: 'list-1', title: 'List' }, { id: 'list-arch', title: 'Archived list', archived: true }]);
  storage.writeJson('aha_paths_v1', [{ id: 'path-1', title: 'Path' }, { id: 'path-del', title: 'Deleted path', deleted_at: '2026-01-01' }]);
  storage.writeJson('aha_notes_v1', [{ id: 'note-1', title: 'Note' }, { id: 'note-arch', title: 'Archived note', archived: true }]);
  const sourceKeys = new Set(Avisa.collectAvailableArticleSources().map((item) => `${item.source}::${item.refId}`));
  for (const key of ['aha_insights::ins-1', 'aha_lists::list-1', 'aha_paths::path-1', 'aha_notes::note-1']) assert.ok(sourceKeys.has(key), `${key} should be collected`);
  for (const key of ['aha_insights::ins-del', 'aha_lists::list-arch', 'aha_paths::path-del', 'aha_notes::note-arch']) assert.equal(sourceKeys.has(key), false, `${key} should be ignored`);

  assert.equal(Avisa.validateArticleReference({ source: 'aha_notes', refId: 'note-1' }).ok, true, 'valid local reference should pass');
  assert.equal(Avisa.validateArticleReference({ source: 'web', refId: 'note-1' }).reason, 'unknown_source', 'unknown source should fail');
  assert.equal(Avisa.validateArticleReference({ source: 'aha_notes' }).reason, 'missing_refId', 'missing refId should fail');
  storage.writeJson('aha_groups_v1', [{ id: 'group-1', title: 'Group' }, { id: 'group-arch', title: 'Archived group', archived: true }]);
  assert.equal(Avisa.validateArticleReference({ source: 'aha_groups', refId: 'group-1' }).ok, true, 'valid aha_groups reference should pass when local group exists');
  assert.equal(Avisa.validateArticleReference({ source: 'aha_groups', refId: 'group-arch' }).reason, 'target_unavailable', 'archived aha_groups reference should fail');
  assert.equal(Avisa.addReferenceToArticle(article.id, { source: 'web', refId: 'x' }).reason, 'invalid_reference', 'invalid add should be rejected');
  const addOk = Avisa.addReferenceToArticle(article.id, { source: 'aha_notes', refId: 'note-1' });
  assert.equal(addOk.ok, true, 'valid add should return ok:true');
  assert.ok(addOk.reference.id, 'valid add should return the new reference');
  assert.equal(Avisa.addReferenceToArticle(article.id, { source: 'aha_notes', refId: 'note-1' }).reason, 'duplicate', 'duplicate add should be rejected');

  storage.writeJson('aha_articles_v1', [{ id: 'missing-ref', title: 'Missing ref', references: [{ id: 'r-miss', title: 'Gone', type: 'note', source: 'aha_notes', refId: 'missing' }] }]);
  Avisa.render();
  assert.ok(elements['avisa-articles'].innerHTML.includes('ikke lenger tilgjengelig'), 'missing refs should render as unavailable');

  const syncDisabled = await Avisa.syncFromDatabase();
  assert.equal(syncDisabled.fallback, 'localOnly', 'syncFromDatabase should fall back to localOnly by default');
  assert.equal(syncDisabled.database_sync_disabled, true, 'syncFromDatabase should say database sync is disabled');
  assert.equal(repoCalls.length, 0, 'default AHAavisa should not use repository, fetch, EchoNet or Sync Hub');

  const enabledRepoCalls = [];
  const enabledRepo = { saveArticle(article) { enabledRepoCalls.push(['saveArticle', article.id]); return { ok: true }; }, loadArticles() { enabledRepoCalls.push(['loadArticles']); return { ok: true, data: [] }; } };
  const enabled = makeContext({ repository: enabledRepo, config: { avisa: { enableDatabaseSync: true } } });
  const enabledArticle = enabled.Avisa.createArticle({ title: 'Explicit sync' });
  enabled.Avisa.updateArticle(enabledArticle.id, { body: 'Explicit update' });
  await enabled.Avisa.syncFromDatabase();
  assert.ok(enabledRepoCalls.some(([name]) => name === 'saveArticle'), 'repository saveArticle should work when database sync flag is true');
  assert.ok(enabledRepoCalls.some(([name]) => name === 'loadArticles'), 'repository loadArticles should work when database sync flag is true');

  assert.equal(/\bfetch\s*\(/.test(avisaCode), false, 'AHAavisa runtime should not call fetch');
  assert.equal(/EchoNet/.test(avisaCode), false, 'AHAavisa runtime should not reference EchoNet');
  assert.equal(/Sync Hub|AHASyncHub|SyncHub/.test(avisaCode), false, 'AHAavisa runtime should not reference Sync Hub');
  assert.equal(/Supabase|createClient/.test(avisaCode), false, 'AHAavisa runtime should not create Supabase clients');
  assert.equal(/externalPublish\s*[:=(]|publishTo|publishExternal\s*[:=(]/i.test(avisaCode), false, 'AHAavisa should not define external publish APIs');

  console.log('aha-avisa.test.cjs passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
