const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaLists.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'lists.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'aha-lists.css'), 'utf8');

class Element {
  constructor(value = '') {
    this.value = value; this.innerHTML = ''; this.textContent = '';
    this.handlers = {}; this.dataset = {};
  }
  addEventListener(name, callback) { this.handlers[name] = callback; }
  focus() {}
  hasAttribute() { return false; }
}
function harness({ lists, concepts = [], notes = [] }) {
  const store = new Map([
    ['aha_lists_v1', JSON.stringify(lists)],
    ['aha_concept_lists_v1', JSON.stringify(concepts)],
    ['aha_notes_v1', JSON.stringify(notes)]
  ]);
  const writes = [];
  const storage = {
    getItem(key) { return store.get(key) ?? null; },
    setItem(key, value) { writes.push({ key, value }); store.set(key, String(value)); }
  };
  const elements = Object.fromEntries([
    'lists-count', 'list-items-count', 'lists-list', 'concept-lists-count',
    'concept-terms-count', 'concept-lists-list', 'lists-visible-count',
    'concept-lists-visible-count', 'lists-search', 'lists-type-filter',
    'lists-sort', 'concept-lists-search', 'concept-lists-sort'
  ].map((id) => [id, new Element()]));
  elements['lists-type-filter'].value = 'all';
  elements['lists-sort'].value = 'updated';
  elements['concept-lists-sort'].value = 'updated';
  let ready;
  const context = {
    console, Date, Math, Intl, JSON, localStorage: storage, HTMLElement: Element,
    document: {
      readyState: 'loading',
      addEventListener(type, callback) { if (type === 'DOMContentLoaded') ready = callback; },
      getElementById(id) { return elements[id] || null; },
      querySelector() { return null; }
    },
    AHAGroups: { getActiveGroups() { return []; } },
    AHAModules: {
      localPageHealth({ count }) { return { status: count ? 'ready' : 'empty' }; },
      updatePageHealth() {},
      buildModuleEmptyState({ title }) { return '<p>' + title + '</p>'; }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'js/ahaLists.js' });
  ready();
  return {
    Lists: context.AHALists, elements, writes, store,
    trigger(id, type) { elements[id].handlers[type](); },
    clickMove(action, fromId, itemId, targetId) {
      const status = { textContent: '' };
      const row = {
        querySelector(selector) {
          return selector === '[data-list-move-target]' ? { value: targetId } : status;
        }
      };
      const target = new Element();
      target.dataset = { listItemAction: action, listSourceId: fromId, listItemId: itemId };
      target.closest = () => row;
      elements['lists-list'].handlers.click({ target });
      return status.textContent;
    }
  };
}
const lists = [
  { id: 'A', title: 'Zebra samling', type: 'favorites', description: 'Lesestoff',
    createdAt: '2026-01-02', updatedAt: '2026-02-01',
    items: [
      { id: 'entry-1', source: 'aha_notes', refId: 'note-1', title: 'Kildedokument',
        type: 'note', membership_reason: 'Viktig kilde', meta: { human_note: 'Bevar' } },
      { id: 'entry-2', source: 'aha_notes', refId: 'note-2', title: 'Neste dokument', type: 'note' },
      { id: 'entry-3', source: 'aha_notes', refId: 'missing', title: 'Tidligere dokument', type: 'note' }
    ] },
  { id: 'B', title: 'Alfa samling', type: 'todo', description: 'Gjennomgang',
    createdAt: '2026-02-01', updatedAt: '2026-03-01', items: [] },
  { id: 'C', title: 'Beta samling', type: 'todo', createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    items: [{ id: 'duplicate', source: 'aha_notes', refId: 'note-1', title: 'Kildedokument' }] }
];
const concepts = [
  { id: 'c-1', title: 'Økologi', updatedAt: '2026-01-01',
    terms: [{ term: 'biomangfold' }, { term: 'natur' }] },
  { id: 'c-2', title: 'Demokrati', description: 'Valg og representasjon',
    updatedAt: '2026-03-01', terms: [{ term: 'folkestyre' }] }
];
const notes = [{ id: 'note-1', title: 'Kildedokument' }, { id: 'note-2', title: 'Neste dokument' }];
const t = harness({ lists, concepts, notes });
assert.equal(t.elements['lists-count'].textContent, '3');
assert.equal(t.elements['list-items-count'].textContent, '4');
assert.equal(t.elements['concept-lists-count'].textContent, '2');
assert.equal(t.elements['concept-terms-count'].textContent, '3');
assert.ok(t.elements['lists-list'].innerHTML.indexOf('Alfa samling') < t.elements['lists-list'].innerHTML.indexOf('Zebra samling'),
  'Default sort stays updated date');

t.elements['lists-search'].value = 'lesestoff';
t.trigger('lists-search', 'input');
assert.match(t.elements['lists-list'].innerHTML, /Zebra samling/);
assert.doesNotMatch(t.elements['lists-list'].innerHTML, /Alfa samling/);
assert.equal(t.elements['lists-visible-count'].textContent, 'Viser 1 av 3 samlinger');
assert.equal(t.elements['lists-count'].textContent, '3');
assert.equal(t.writes.length, 0, 'Search is read-only');

t.elements['lists-search'].value = '';
t.trigger('lists-search', 'input');
t.elements['lists-type-filter'].value = 'todo';
t.trigger('lists-type-filter', 'change');
assert.doesNotMatch(t.elements['lists-list'].innerHTML, /Zebra samling/);
assert.equal(t.elements['lists-visible-count'].textContent, 'Viser 2 av 3 samlinger');
t.elements['lists-sort'].value = 'title';
t.trigger('lists-sort', 'change');
assert.ok(t.elements['lists-list'].innerHTML.indexOf('Alfa samling') < t.elements['lists-list'].innerHTML.indexOf('Beta samling'));
t.elements['lists-type-filter'].value = 'all';
t.elements['lists-sort'].value = 'items';
t.trigger('lists-type-filter', 'change');
assert.ok(t.elements['lists-list'].innerHTML.indexOf('Zebra samling') < t.elements['lists-list'].innerHTML.indexOf('Beta samling'));

t.elements['concept-lists-search'].value = 'biomangfold';
t.trigger('concept-lists-search', 'input');
assert.match(t.elements['concept-lists-list'].innerHTML, /Økologi/);
assert.doesNotMatch(t.elements['concept-lists-list'].innerHTML, /Demokrati/);
assert.equal(t.elements['concept-lists-visible-count'].textContent, 'Viser 1 av 2 begrepslister');
t.elements['concept-lists-search'].value = '';
t.elements['concept-lists-sort'].value = 'terms';
t.trigger('concept-lists-sort', 'change');
assert.ok(t.elements['concept-lists-list'].innerHTML.indexOf('Økologi') < t.elements['concept-lists-list'].innerHTML.indexOf('Demokrati'));
t.elements['concept-lists-search'].value = 'ikke et begrep';
t.trigger('concept-lists-search', 'input');
assert.match(t.elements['concept-lists-list'].innerHTML, /Ingen begrepslister matcher søket/);
assert.equal(t.elements['concept-lists-count'].textContent, '2');
assert.equal(t.writes.length, 0);

t.Lists.selectList('A');
t.elements['lists-type-filter'].value = 'todo';
t.trigger('lists-type-filter', 'change');
assert.match(t.elements['lists-list'].innerHTML, /id="list-preview-title"[^>]*>Zebra samling/);
assert.match(t.elements['lists-list'].innerHTML, /valgte samlingen er skjult/);

assert.match(t.elements['lists-list'].innerHTML, /id="list-member-search"/);
assert.match(t.elements['lists-list'].innerHTML, /Viser 3 av 3 objekter/);
const memberRows = [
  { dataset: { listMemberSearchText: 'Kildedokument note Viktig kilde' }, hidden: false },
  { dataset: { listMemberSearchText: 'Neste dokument note' }, hidden: false },
  { dataset: { listMemberSearchText: 'Tidligere dokument note' }, hidden: false }
];
const memberCount = { textContent: '' };
const mockPreview = {
  querySelectorAll(selector) {
    assert.equal(selector, '.aha-list-item-row');
    return memberRows;
  },
  querySelector(selector) {
    assert.equal(selector, '[data-list-member-count]');
    return memberCount;
  }
};
const memberInput = {
  value: 'neste',
  matches(selector) { return selector === '[data-list-member-search]'; },
  closest(selector) {
    assert.equal(selector, '.aha-list-preview');
    return mockPreview;
  }
};
t.elements['lists-list'].handlers.input({ target: memberInput });
assert.deepEqual(memberRows.map((row) => row.hidden), [true, false, true]);
assert.equal(memberCount.textContent, 'Viser 1 av 3 objekter');
assert.equal(t.writes.length, 0, 'Searching inside a collection does not write');
t.Lists.render();
assert.match(t.elements['lists-list'].innerHTML, /id="list-member-search"[^>]*value="neste"/,
  'Member filter is preserved across view rerenders');
assert.match(t.elements['lists-list'].innerHTML, /class="aha-list-item-row"[^>]*hidden>/,
  'Nonmatching members remain in the DOM but are hidden from the view');
assert.match(t.elements['lists-list'].innerHTML, /Viser 1 av 3 objekter/);
t.Lists.selectList('B');
t.Lists.selectList('A');
assert.match(t.elements['lists-list'].innerHTML, /Viser 3 av 3 objekter/,
  'Choosing another collection resets the temporary member search');
assert.equal(t.writes.length, 0, 'Changing the selected collection does not write');

const n = t.writes.length;
assert.equal(t.Lists.relocateListItem('A', 'entry-1', 'A', 'move').reason, 'invalid_target');
assert.equal(t.Lists.relocateListItem('A', 'entry-1', 'C', 'copy').reason, 'duplicate');
assert.equal(t.Lists.relocateListItem('A', 'entry-3', 'B', 'move').reason, 'invalid_reference');
assert.equal(t.Lists.relocateListItem('A', 'entry-1', 'not-exist', 'move').reason, 'list_not_found');
assert.equal(t.writes.length, n, 'Invalid actions cannot write');

assert.equal(t.Lists.relocateListItem('A', 'entry-1', 'B', 'copy').ok, true);
assert.equal(t.writes.length, n + 1, 'Copy writes once');
let saved = JSON.parse(t.store.get('aha_lists_v1'));
assert.equal(saved.find((x) => x.id === 'A').items.length, 3);
const copied = saved.find((x) => x.id === 'B').items[0];
assert.notEqual(copied.id, 'entry-1', 'Copied object gets new membership ID');
assert.equal(copied.membership_reason, 'Viktig kilde');
assert.equal(copied.meta.human_note, 'Bevar');
assert.equal(t.Lists.relocateListItem('A', 'entry-2', 'B', 'move').ok, true);
assert.equal(t.writes.length, n + 2, 'Move writes once');
saved = JSON.parse(t.store.get('aha_lists_v1'));
assert.equal(saved.find((x) => x.id === 'A').items.some((x) => x.id === 'entry-2'), false);
assert.equal(saved.find((x) => x.id === 'B').items.some((x) => x.id === 'entry-2'), true);

assert.match(t.clickMove('move', 'A', 'entry-1', ''), /Velg en annen samling/);
assert.match(t.clickMove('move', 'A', 'entry-1', 'C'), /finnes allerede/);
assert.equal(t.writes.length, n + 2);

assert.match(html, /id="concept-lists-search"/);
assert.match(html, /id="lists-type-filter"/);
assert.match(css, /aha-list-find-controls/);
assert.match(css, /max-width: 760px/);
assert.doesNotMatch(source, /localStorage\.setItem\(["']aha_lists_search/);
console.log('aha-lists-find-organize.test.cjs passed');
