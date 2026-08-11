const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class StorageMock {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
}

const searchCode = fs.readFileSync('js/ahaSearch.js', 'utf8');
const libraryCode = fs.readFileSync('js/ahaSearchLibraryExperience.js', 'utf8');
const searchHtml = fs.readFileSync('search.html', 'utf8');

const chamber = {
  insights: [
    { id: 'active', title: 'Makt i byen', summary: 'Institusjoner og byrom', status: 'suggested', tags: ['makt', 'by'] },
    { id: 'rejected', title: 'Ikke en innsikt', summary: 'Brukeren avviste dette', status: 'rejected', rejection_reason: 'user_not_insight' },
    { id: 'archived', title: 'Arkivert innsikt', status: 'archived' },
    { id: 'merged', title: 'Slått sammen', status: 'merged' },
    { id: 'merged_into', title: 'Tidligere variant', status: 'suggested', merged_into: 'active' }
  ]
};
const storage = new StorageMock({ aha_insight_chamber_v1: JSON.stringify(chamber) });
const document = {
  addEventListener() {},
  getElementById() { return null; }
};
const searchContext = { console, Date, JSON, Array, Object, String, Number, Set, Map, localStorage: storage, document };
searchContext.window = searchContext;
vm.createContext(searchContext);
vm.runInContext(searchCode, searchContext, { filename: 'js/ahaSearch.js' });

const items = searchContext.AHASearch.collectSearchItems();
const insightItems = items.filter((item) => item.source === 'aha_insights');
assert.equal(insightItems.length, 1, 'Search must index only active canonical insights');
assert.equal(insightItems[0].refId, 'active');
assert.equal(items.some((item) => item.refId === 'rejected'), false, 'user-rejected insight must not survive into Search/Library');
assert.equal(items.some((item) => item.refId === 'archived'), false);
assert.equal(items.some((item) => item.refId === 'merged'), false);
assert.equal(items.some((item) => item.refId === 'merged_into'), false);
assert.equal(searchContext.AHASearch.isSearchableInsight(chamber.insights[0]), true);
assert.equal(searchContext.AHASearch.isSearchableInsight(chamber.insights[1]), false);

const libraryStorage = new StorageMock();
const libraryContext = { console, Date, JSON, Array, Object, String, Number, Set, Map, localStorage: libraryStorage, document: null };
libraryContext.window = libraryContext;
libraryContext.globalThis = libraryContext;
vm.createContext(libraryContext);
vm.runInContext(libraryCode, libraryContext, { filename: 'js/ahaSearchLibraryExperience.js' });
const library = libraryContext.AHASearchLibraryExperience;
assert.ok(library);

const seed = {
  id: 'note_oslo', title: 'Makt i Oslo', text: 'Institusjoner former byrom og offentlighet',
  tags: ['makt', 'byrom'], type: 'note', source: 'aha_notes', local_only: true, read_only: true
};
const relatedByTags = {
  id: 'ins_makt', title: 'Institusjonell makt', text: 'Makt og offentlighet i byrom',
  tags: ['makt', 'byrom'], type: 'insight', source: 'aha_insights', local_only: true, read_only: true
};
const relatedByText = {
  id: 'article_city', title: 'Byrom og offentlighet', text: 'Hvordan institusjoner former offentligheten',
  tags: [], type: 'article', source: 'aha_avisa', local_only: true, read_only: true
};
const unrelated = {
  id: 'music', title: 'Album', text: 'Trommer gitar konsert', tags: ['musikk'],
  type: 'music_album', source: 'aha_music_library', local_only: true, read_only: true
};

const model = library.buildLibraryModel([seed, relatedByTags, relatedByText, unrelated]);
assert.equal(model.total, 4);
const related = library.findRelatedItems(seed, model.items, 6);
assert.ok(related.length >= 1);
assert.equal(related[0].item.id, 'ins_makt', 'shared explicit tags/concepts should dominate related ranking');
assert.ok(related.every((entry) => entry.item.id !== seed.id));
assert.equal(related.some((entry) => entry.item.id === 'music'), false, 'unrelated material should not be forced into related results');

const queued = library.queueItemForChat(seed);
assert.equal(queued.ok, true);
const pending = JSON.parse(libraryStorage.getItem('aha_pending_chat_prompt_v1'));
assert.equal(pending.type, 'library_item_prompt');
assert.equal(pending.source, 'aha_search_library');
assert.match(pending.prompt, /Makt i Oslo/);
assert.match(pending.prompt, /Institusjoner former byrom/);
assert.equal(libraryStorage.map.size, 1, 'Library action may only use the existing transient Chat prompt key');

assert.match(searchHtml, /id="search-library-related-panel"/);
assert.match(searchHtml, /Relatert materiale/);
assert.ok(searchHtml.indexOf('js/ahaSearch.js') < searchHtml.indexOf('js/ahaSearchLibraryExperience.js'));
assert.match(libraryCode, /Finn relatert/);
assert.match(libraryCode, /Spør AHA/);
assert.match(libraryCode, /ikke en ny database eller modell/);
assert.equal(/\bfetch\s*\(/.test(libraryCode), false, 'Library related/Chat handoff must not call backend directly');
assert.equal(/aha_[a-z0-9_]+_v\d+/.test(libraryCode.replace(/aha_pending_chat_prompt_v1/g, '')), false, 'Library experience must not create another versioned storage key');

console.log('aha-library-related-and-rejected-insight-boundary.test.cjs passed');
