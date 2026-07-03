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
    'lists-count': makeElement(),
    'list-items-count': makeElement(),
    'lists-list': makeElement()
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
      buildModuleEmptyState({ type, title = 'No lists yet.', message = '', hint = '' }) {
        return `<article data-empty-state="${type}"><h2>${title}</h2><p>${message}</p><p>${hint}</p></article>`;
      }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaLists.js'), 'utf8'), context, { filename: 'js/ahaLists.js' });
  return { Lists: context.AHALists, elements, healthCalls };
}

const listsHtml = fs.readFileSync(path.join(__dirname, '..', 'lists.html'), 'utf8');
assert.match(listsHtml, /<h1 id="lists-module-title">Lists<\/h1>/, 'Lists page should render the module title');
assert.match(listsHtml, /Lokale samlinger av eksisterende AHA-objekter/, 'Lists page should render its purpose');
assert.match(listsHtml, /id="aha-module-health"/, 'Lists page should include a textual health badge');
assert.match(listsHtml, /href="#lists-create">Lag liste<\/a>/, 'existing create flow should remain the primary action');

const empty = makeContext({ aha_lists_v1: '[]' });
empty.Lists.render();
assert.equal(empty.elements['lists-count'].textContent, '0', 'empty Lists should render a zero count');
assert.match(empty.elements['lists-list'].innerHTML, /Ingen lister ennå\./, 'empty Lists should use the standard no-data title');
assert.match(empty.elements['lists-list'].innerHTML, /Lag en lokal liste/, 'empty Lists should explain when data appears');
assert.equal(empty.healthCalls.at(-1).health.status, 'empty', 'empty Lists should report empty health');

const rows = [
  {
    id: 'older',
    title: 'Older list',
    description: 'Earlier material',
    type: 'favorites',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    items: []
  },
  {
    id: 'newer',
    title: 'Reading queue',
    description: 'Items to revisit',
    status: 'ready',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    meta: { password: 'DO_NOT_RENDER', connectionString: 'postgres://secret' },
    items: [
      { id: 'one', title: 'First safe item', type: 'note', source: 'aha_notes', refId: 'private-ref-one', meta: { token: 'SECRET_TOKEN' } },
      { id: 'two', title: 'Second safe item', type: 'insight', source: 'aha_insights', refId: 'private-ref-two' }
    ]
  }
];
const populated = makeContext({ aha_lists_v1: JSON.stringify(rows) });
populated.Lists.render();
const overview = populated.elements['lists-list'].innerHTML;
assert.equal(populated.elements['lists-count'].textContent, '2', 'overview should render the list count');
assert.equal(populated.elements['list-items-count'].textContent, '2', 'overview should render the total item count');
assert.match(overview, /Reading queue/, 'overview should render list titles');
assert.match(overview, /2 items/, 'overview should render per-list item counts');
assert.ok(overview.indexOf('Reading queue') < overview.indexOf('Older list'), 'overview should sort the newest updated list first');
assert.doesNotMatch(overview, /DO_NOT_RENDER|postgres:\/\/secret|SECRET_TOKEN|private-ref/, 'overview should not dump metadata, secrets, or reference ids');
assert.equal(populated.healthCalls.at(-1).health.status, 'ready', 'populated Lists should report ready health');

populated.Lists.selectList('newer');
const preview = populated.elements['lists-list'].innerHTML;
assert.match(preview, /List preview/, 'selecting a list should open the details preview');
assert.match(preview, /First safe item/, 'preview should render safe item titles');
assert.match(preview, /Second safe item/, 'preview should render up to five item titles');
assert.match(preview, /Close list preview/, 'preview should provide an accessible close action');
assert.doesNotMatch(preview, /DO_NOT_RENDER|postgres:\/\/secret|SECRET_TOKEN|private-ref/, 'preview should not render raw metadata, secrets, or reference ids');

const invalid = makeContext({ aha_lists_v1: '{not-json' });
invalid.Lists.render();
assert.match(invalid.elements['lists-list'].innerHTML, /Could not read list data\./, 'invalid list data should render a short sanitized error');
assert.doesNotMatch(invalid.elements['lists-list'].innerHTML, /SyntaxError|stack|not-json/, 'error UI should not dump raw errors or payloads');
assert.equal(invalid.healthCalls.at(-1).health.status, 'blocked', 'read errors should report blocked health');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaLists.js'), 'utf8');
assert.equal(source.includes('autoSync'), false, 'Lists experience must not add autoSync');
assert.equal(source.includes('localStorage.setItem("aha_lists_selected'), false, 'selected preview state must not be persisted');
assert.equal(source.includes('JSON.stringify(list.meta'), false, 'Lists UI must not stringify metadata');

console.log('aha-lists-experience.test.cjs passed');
