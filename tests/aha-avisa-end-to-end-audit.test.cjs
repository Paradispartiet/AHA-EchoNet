const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const avisaCode = fs.readFileSync('js/ahaAvisa.js', 'utf8');
const uxCode = fs.readFileSync('js/ahaAvisaUserExperience.js', 'utf8');
const html = fs.readFileSync('avisa.html', 'utf8');

function makeStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    readJson(key, fallback) { return store.has(key) ? JSON.parse(store.get(key)) : fallback; }
  };
}

function loadProductionModules() {
  const storage = makeStorage({
    aha_notes_v1: JSON.stringify([{ id: 'note-source', title: 'Research note', body: 'Local research material' }]),
    aha_lists_v1: JSON.stringify([{ id: 'list-source', title: 'Source list' }])
  });
  const repositoryCalls = [];
  const context = {
    console, Date, Intl, Math, JSON, Array, Object, String, Number, Set,
    localStorage: storage,
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { throw new Error('DOM rendering is not needed for this contract audit'); }
    },
    CSS: { escape(value) { return String(value); } },
    HTMLElement: function HTMLElement() {},
    HTMLSelectElement: function HTMLSelectElement() {},
    MutationObserver: function MutationObserver() {},
    AHAContracts: {
      normalizeTags(tags) {
        if (Array.isArray(tags)) return tags;
        return String(tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
      }
    },
    AHAPrivacy: { loadSettings() { return { allowPublicPublishing: false }; } },
    AHAGroups: { getActiveGroups() { return []; } },
    AHAModules: {
      localPageHealth(input) { return { status: input.count ? 'ready' : 'empty' }; },
      updatePageHealth() {},
      buildModuleEmptyState() { return ''; }
    },
    AHARepository: {
      saveArticle(article) { repositoryCalls.push(['saveArticle', article.id]); return { ok: true }; },
      loadArticles() { repositoryCalls.push(['loadArticles']); return { ok: true, data: [] }; }
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(avisaCode, context, { filename: 'js/ahaAvisa.js' });
  vm.runInContext(uxCode, context, { filename: 'js/ahaAvisaUserExperience.js' });
  return { Avisa: context.AHAAvisa, UX: context.AHAAvisaUserExperience, storage, repositoryCalls };
}

const { Avisa, UX, storage, repositoryCalls } = loadProductionModules();
assert.ok(Avisa, 'canonical AHAavisa API should load');
assert.ok(UX, 'AHAavisa user experience API should load');

const article = Avisa.createArticle({
  title: 'AHA workflow article',
  section: 'aha',
  summary: 'A local article moving through the complete workflow.',
  tags: 'workflow, local'
});
assert.equal(article.status, 'draft');
assert.equal(article.publicationLayer, 'personal');
assert.equal(article.local_only, true);
assert.equal(article.published_external, false);
assert.equal(repositoryCalls.length, 0, 'default workflow must not use repository persistence');

const noteReference = Avisa.addReferenceToArticle(article.id, { source: 'aha_notes', refId: 'note-source' });
const listReference = Avisa.addReferenceToArticle(article.id, { source: 'aha_lists', refId: 'list-source' });
assert.equal(noteReference.ok, true, 'real local note should attach as a canonical reference');
assert.equal(listReference.ok, true, 'real local list should attach as a canonical reference');

let current = Avisa.loadArticles().find((item) => item.id === article.id);
let experience = UX.buildArticleExperience(current);
assert.equal(experience.statusLabel, 'Utkast');
assert.equal(experience.nextAction.status, 'review');

current = Avisa.setArticleStatus(article.id, experience.nextAction.status);
experience = UX.buildArticleExperience(current);
assert.equal(current.status, 'review');
assert.equal(experience.statusLabel, 'Til gjennomgang');
assert.equal(experience.nextAction.status, 'ready');

current = Avisa.setArticleStatus(article.id, experience.nextAction.status);
experience = UX.buildArticleExperience(current);
assert.equal(current.status, 'ready');
assert.equal(experience.statusLabel, 'Klar');
assert.equal(experience.nextAction.status, 'published_local');
assert.equal(current.references.length, 2, 'references must survive review/ready transitions');

current = Avisa.setArticleStatus(article.id, experience.nextAction.status);
experience = UX.buildArticleExperience(current);
assert.equal(current.status, 'published_local');
assert.equal(experience.statusLabel, 'Publisert i AHAavisa');
assert.equal(experience.nextAction.status, 'draft');
assert.equal(current.published_local, true);
assert.equal(current.published_external, false);
assert.equal(current.external_publish_enabled, false);
assert.equal(current.sync_enabled, false);
assert.equal(current.echonet_shared, false);
assert.equal(repositoryCalls.length, 0, 'local publication must not use repository persistence');

assert.equal(Avisa.loadArticles().find((item) => item.id === article.id).publicationLayer, 'personal', 'public candidate must not appear without an explicit layer change');
assert.match(uxCode, /data-avisa-layer-public-candidate/);
assert.match(uxCode, /stopImmediatePropagation\(\)/, 'legacy one-click candidate action must be intercepted');
assert.match(uxCode, /Dette publiserer ikke artikkelen/);
assert.match(uxCode, /data-avisa-confirm-public-candidate/);
assert.match(uxCode, /setArticlePublicationLayer\(confirmId, "public_candidate"\)/, 'only the explicit confirmation path should apply public_candidate in the UX adapter');

current = Avisa.setArticlePublicationLayer(article.id, 'public_candidate');
experience = UX.buildArticleExperience(current);
assert.equal(experience.isPublicCandidate, true);
assert.equal(experience.layerLabel, 'Offentlig kandidat');
assert.match(experience.layerExplanation, /lokal merking/i);
assert.equal(current.published_external, false);
assert.equal(current.external_publish_enabled, false);
assert.equal(current.sync_enabled, false);
assert.equal(current.echonet_shared, false);
assert.equal(repositoryCalls.length, 0, 'public-candidate marking must remain local by default');

current = Avisa.setArticleStatus(article.id, experience.nextAction.status);
assert.equal(current.status, 'draft', 'published article should be reopenable through the canonical next action');
assert.equal(current.references.length, 2, 'references must survive the complete workflow loop');
assert.equal(current.publicationLayer, 'public_candidate', 'reopening should not silently rewrite the chosen publication layer');

const stored = storage.readJson('aha_articles_v1', []).find((item) => item.id === article.id);
assert.ok(stored, 'the complete workflow should persist in the canonical AHAavisa store');
assert.equal(stored.local_only, true);
assert.equal(stored.published_external, false);
assert.equal(stored.sync_enabled, false);

assert.ok(html.indexOf('js/ahaAvisa.js') < html.indexOf('js/ahaAvisaUserExperience.js'), 'canonical AHAavisa must load before the UX adapter');
assert.match(html, /Alt her er fortsatt lokalt; AHAavisa publiserer ikke eksternt/);
assert.equal(/localStorage\s*\./.test(uxCode), false, 'UX adapter must not create a parallel storage path');
assert.equal(/\bfetch\s*\(/.test(uxCode), false, 'UX adapter must not fetch');
assert.equal(/AHARepository|AHASyncHub|Supabase|createClient|AHAIngest/.test(uxCode), false, 'UX adapter must not activate backend, sync or ingest');

console.log('aha-avisa-end-to-end-audit.test.cjs passed');
