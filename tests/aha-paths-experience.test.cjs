const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); }
  };
}

function makeElement() {
  return { textContent: '', innerHTML: '', addEventListener() {}, focus() {} };
}

function makeContext(seed = {}) {
  const elements = {
    'paths-count': makeElement(),
    'path-steps-count': makeElement(),
    'paths-list': makeElement()
  };
  const healthCalls = [];
  const context = {
    console,
    Date,
    Intl,
    Math,
    JSON,
    localStorage: makeStorage(seed),
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById(id) { return elements[id] || null; },
      querySelector() { return null; }
    },
    AHAGroups: { getActiveGroups() { return []; } },
    AHAModules: {
      localPageHealth(input) {
        if (input.error) return { status: 'blocked' };
        if (!input.datasetExists) return { status: 'missing', count: null };
        return { status: input.count ? 'ready' : 'empty', count: input.count };
      },
      updatePageHealth(moduleId, health) { healthCalls.push({ moduleId, health }); },
      buildModuleEmptyState({ type, title = 'No paths yet.', message = '', hint = '' }) {
        return `<article data-empty-state="${type}"><h2>${title}</h2><p>${message}</p><p>${hint}</p></article>`;
      }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaPaths.js'), 'utf8'), context, { filename: 'js/ahaPaths.js' });
  return { Paths: context.AHAPaths, elements, healthCalls };
}

const pathsHtml = fs.readFileSync(path.join(__dirname, '..', 'paths.html'), 'utf8');
assert.match(pathsHtml, /<h1 id="paths-module-title">Paths<\/h1>/, 'Paths page should render the module title');
assert.match(pathsHtml, /Lokale sekvenser av eksisterende AHA-objekter\. Paths organiserer rekkefølge/, 'Paths page should render its purpose');
assert.match(pathsHtml, /id="aha-module-health"/, 'Paths page should include a textual health badge');
assert.match(pathsHtml, /href="#paths-create">Lag sti<\/a>/, 'localized create flow should remain the primary action');
assert.match(pathsHtml, />Lag sti<\/button>/, 'create form submit should use Lag sti label');

const empty = makeContext({ aha_paths_v1: '[]' });
empty.Paths.render();
assert.equal(empty.elements['paths-count'].textContent, '0', 'empty Paths should render a zero count');
assert.equal(empty.elements['path-steps-count'].textContent, '0', 'empty Paths should render a zero step count');
assert.match(empty.elements['paths-list'].innerHTML, /Ingen stier ennå\./, 'empty Paths should use the standard no-data title');
assert.match(empty.elements['paths-list'].innerHTML, /Lag en lokal sti for å sette innsikter, lister eller notater i rekkefølge\./, 'empty Paths should explain when data appears');
assert.equal(empty.healthCalls.at(-1).health.status, 'empty', 'empty Paths should report empty health');

const rows = [
  {
    id: 'older',
    title: 'Older path',
    description: 'Earlier route',
    type: 'reading',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    steps: []
  },
  {
    id: 'newer',
    title: 'Learning sprint',
    summary: 'Sequence to revisit',
    type: 'learning',
    category: 'study',
    status: 'ready',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    meta: { password: 'DO_NOT_RENDER', connectionString: 'postgres://secret' },
    sequence: [
      { id: 'step-secret-ref', name: 'Read first note', type: 'note', source: 'aha_notes', refId: 'private-ref-one', meta: { token: 'SECRET_TOKEN' } },
      { key: 'second-key', label: 'Review concept', type: 'insight', source: 'aha_insights', refId: 'private-ref-two' }
    ]
  }
];
const populated = makeContext({ aha_paths_v1: JSON.stringify(rows) });
populated.Paths.render();
const overview = populated.elements['paths-list'].innerHTML;
assert.equal(populated.elements['paths-count'].textContent, '2', 'overview should render the path count');
assert.equal(populated.elements['path-steps-count'].textContent, '2', 'overview should render the total step count');
assert.match(overview, /Learning sprint/, 'overview should render path titles');
assert.match(overview, /2 steps/, 'overview should render per-path step counts');
assert.ok(overview.indexOf('Learning sprint') < overview.indexOf('Older path'), 'overview should sort the newest updated path first');
assert.doesNotMatch(overview, /DO_NOT_RENDER|postgres:\/\/secret|SECRET_TOKEN|private-ref/, 'overview should not dump metadata, secrets, or reference ids');
assert.equal(populated.healthCalls.at(-1).health.status, 'ready', 'populated Paths should report ready health');

populated.Paths.selectPath('newer');
const preview = populated.elements['paths-list'].innerHTML;
assert.match(preview, /Path preview/, 'selecting a path should open the details preview');
assert.match(preview, /Sequence/, 'preview should label the sequence');
assert.match(preview, /Read first note/, 'preview should render first safe step title');
assert.match(preview, /Review concept/, 'preview should render step fallback labels');
assert.match(preview, /Close path preview/, 'preview should provide an accessible close action');
assert.doesNotMatch(preview, /DO_NOT_RENDER|postgres:\/\/secret|SECRET_TOKEN|private-ref/, 'preview should not render raw metadata, secrets, or reference ids');

populated.Paths.selectPath('older');
assert.match(populated.elements['paths-list'].innerHTML, /No steps available\./, 'preview should show a short no-steps message when sequence is empty');

const invalid = makeContext({ aha_paths_v1: '{not-json' });
invalid.Paths.render();
assert.match(invalid.elements['paths-list'].innerHTML, /Could not read path data\./, 'invalid path data should render a short sanitized error');
assert.doesNotMatch(invalid.elements['paths-list'].innerHTML, /SyntaxError|stack|not-json/, 'error UI should not dump raw errors or payloads');
assert.equal(invalid.healthCalls.at(-1).health.status, 'blocked', 'read errors should report blocked health');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaPaths.js'), 'utf8');
assert.equal(source.includes('autoSync'), false, 'Paths experience must not add autoSync');
assert.equal(source.includes('localStorage.setItem("aha_paths_selected'), false, 'selected preview state must not be persisted');
assert.equal(source.includes('JSON.stringify(path.meta'), false, 'Paths UI must not stringify metadata');
assert.equal(source.includes('AHADb.getClient'), false, 'Paths UI must not create a database client');

console.log('aha-paths-experience.test.cjs passed');
