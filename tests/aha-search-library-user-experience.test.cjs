const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('js/ahaSearchLibraryExperience.js', 'utf8');
const html = fs.readFileSync('search.html', 'utf8');

function load() {
  const context = { console, Date, Array, Object, String, Number, Set, JSON, document: null };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'js/ahaSearchLibraryExperience.js' });
  return context.AHASearchLibraryExperience;
}

const api = load();
assert.ok(api, 'Search Library experience API should load without DOM');

const items = [
  { id: 'n1', title: 'AHA notat', type: 'note', source: 'aha_notes', text: 'Et notat om prosjektet.', updatedAt: '2026-08-10T10:00:00Z', local_only: true, read_only: true, href: 'notes.html' },
  { id: 'i1', title: 'Ny innsikt', type: 'insight', source: 'aha_insights', text: 'En innsikt.', updatedAt: '2026-08-11T08:00:00Z', local_only: true, read_only: true, href: 'insights.html' },
  { id: 'p1', title: 'Min sti', type: 'path', source: 'aha_paths', text: 'En læringssti.', updatedAt: '2026-08-09T08:00:00Z', local_only: true, read_only: true, href: 'paths.html' },
  { id: 'm1', title: 'Bilde', type: 'gallery_item', source: 'aha_gallery', text: 'Et galleriobjekt.', updatedAt: '2026-08-08T08:00:00Z', local_only: true, read_only: true, href: 'gallery.html' },
  { id: 'c1', title: 'Kuratering', type: 'knowledge_curation_item', source: 'aha_knowledge_curation', text: 'Review-materiale.', updatedAt: '2026-08-07T08:00:00Z', local_only: true, read_only: true, href: 'curation.html' },
  { id: 'e1', title: 'Svar-evaluering', type: 'personal_answer_evaluation', source: 'aha_personal_answer_evaluations', text: 'Evaluering.', updatedAt: '2026-08-06T08:00:00Z', local_only: true, read_only: true, href: 'personal-ai.html' },
  { id: 'r1', title: 'Reanalysert', type: 'note', source: 'aha_notes', text: 'Eldre notat, nylig analysert på nytt.', createdAt: '2024-01-01T00:00:00Z', last_reanalyzed_at: '2026-08-11T09:00:00Z', local_only: true, read_only: true, href: 'notes.html' },
  { id: 'unsafe', title: 'Ikke read-only', type: 'note', source: 'aha_notes', updatedAt: '2026-08-11T10:00:00Z', local_only: true, read_only: false },
  { id: 'remote', title: 'Ikke lokal', type: 'note', source: 'aha_notes', updatedAt: '2026-08-11T11:00:00Z', local_only: false, read_only: true }
];

assert.equal(api.libraryGroupFor(items[0]), 'thoughts');
assert.equal(api.libraryGroupFor(items[2]), 'collections');
assert.equal(api.libraryGroupFor(items[3]), 'media');
assert.equal(api.libraryGroupFor(items[4]), 'knowledge');
assert.equal(api.libraryGroupFor(items[5]), 'personal_ai');

assert.equal(api.sourceLabel(items[0]), 'Notater');
assert.equal(api.sourceLabel(items[4]), 'Kuratering');
assert.equal(api.sourceLabel(items[5]), 'Svar-evalueringer');
assert.equal(api.typeLabel(items[0]), 'Notat');
assert.equal(api.typeLabel(items[2]), 'Sti');
assert.equal(api.typeLabel(items[5]), 'Svar-evaluering');

const model = api.buildLibraryModel(items);
assert.equal(model.total, 7, 'library must include only local/read-only canonical search items');
assert.equal(model.items[0].id, 'r1', 'last_reanalyzed_at should drive recent ordering');
assert.equal(model.items[1].id, 'i1');
assert.equal(model.groups.find((group) => group.id === 'thoughts').count, 3);
assert.equal(model.groups.find((group) => group.id === 'collections').count, 1);
assert.equal(model.groups.find((group) => group.id === 'media').count, 1);
assert.equal(model.groups.find((group) => group.id === 'knowledge').count, 1);
assert.equal(model.groups.find((group) => group.id === 'personal_ai').count, 1);
assert.equal(model.items.some((item) => item.id === 'unsafe'), false);
assert.equal(model.items.some((item) => item.id === 'remote'), false);

assert.match(html, /Finn igjen det du har tenkt, skrevet og lagret/);
assert.match(html, /Bla i det du allerede har i AHA/);
assert.match(html, /Nylig lagret eller oppdatert/);
assert.match(html, /id="search-results-panel"[^>]*hidden/);
assert.match(html, /Avansert søk og dekning/);
assert.match(html, /Søk leser bare eksplisitt godkjente lokale AHA-lag/);
assert.match(html, /Music vises som metadata-only/);
assert.match(html, /ikke som trent modell/);
assert.ok(html.includes('<script src="js/ahaSearch.js"></script>'));
assert.ok(html.includes('<script src="js/ahaSearchLibraryExperience.js"></script>'));
assert.ok(html.indexOf('js/ahaSearch.js') < html.indexOf('js/ahaSearchLibraryExperience.js'), 'canonical search must load before the browse adapter');

assert.match(code, /AHASearch\?\.collectSearchItems/);
assert.match(code, /Biblioteket er en read-only visning av den samme indeksen som Søk bruker/);
assert.match(code, /hasActiveSearch/);
assert.match(code, /updateSearchResultsVisibility/);
assert.equal(/localStorage\s*\./.test(code), false, 'library adapter must not read or write localStorage directly');
assert.equal(/\bfetch\s*\(/.test(code), false, 'library adapter must not fetch');
assert.equal(/AHARepository|AHASyncHub|EchoNet|Supabase|createClient|AHAIngest/i.test(code), false, 'library adapter must not activate backend/sync/ingest');

console.log('aha-search-library-user-experience.test.cjs passed');
