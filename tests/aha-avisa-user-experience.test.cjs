const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('js/ahaAvisaUserExperience.js', 'utf8');
const html = fs.readFileSync('avisa.html', 'utf8');

function load() {
  const context = { console, Date, Array, Object, String, Number, Set, JSON, document: null };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'js/ahaAvisaUserExperience.js' });
  return context.AHAAvisaUserExperience;
}

const api = load();
assert.ok(api, 'AHAavisa user experience API should load without DOM');

assert.equal(api.statusExperience('draft').label, 'Utkast');
assert.equal(api.statusExperience('review').label, 'Til gjennomgang');
assert.equal(api.statusExperience('ready').label, 'Klar');
assert.equal(api.statusExperience('published_local').label, 'Publisert i AHAavisa');

const draft = api.buildArticleExperience({ id: 'a1', status: 'draft', publicationLayer: 'personal' });
assert.equal(draft.nextAction.status, 'review');
assert.equal(draft.nextAction.label, 'Send til gjennomgang');
assert.equal(draft.layerLabel, 'Personlig avis');
assert.equal(draft.localOnly, true);

const review = api.buildArticleExperience({ id: 'a2', status: 'review', publicationLayer: 'group' });
assert.equal(review.nextAction.status, 'ready');
assert.equal(review.layerLabel, 'Gruppeavis');

const ready = api.buildArticleExperience({ id: 'a3', status: 'ready', publicationLayer: 'public_candidate' });
assert.equal(ready.nextAction.status, 'published_local');
assert.equal(ready.nextAction.label, 'Publiser i min AHAavis');
assert.equal(ready.isPublicCandidate, true);
assert.match(ready.layerExplanation, /lokal merking/i);

const published = api.buildArticleExperience({ id: 'a4', status: 'published_local', publicationLayer: 'personal' });
assert.equal(published.nextAction.status, 'draft');
assert.match(published.nextAction.after, /uten å sende noe ut av AHA/i);

assert.match(code, /Neste naturlige steg/);
assert.match(code, /Flere handlinger og publiseringslag/);
assert.match(code, /Dette publiserer ikke artikkelen/);
assert.match(code, /Jeg forstår – marker lokalt/);
assert.match(code, /data-avisa-layer-public-candidate/);
assert.match(code, /stopImmediatePropagation/);
assert.match(code, /setArticlePublicationLayer\(confirmId, "public_candidate"\)/);
assert.match(code, /setArticleStatus\(guidedArticle, guidedStatus\)/);
assert.equal(/localStorage\s*\./.test(code), false, 'UX adapter must not read or write localStorage directly');
assert.equal(/\bfetch\s*\(/.test(code), false, 'UX adapter must not fetch');
assert.equal(/AHARepository|AHASyncHub|EchoNet|Supabase|createClient|AHAIngest/.test(code), false, 'UX adapter must not activate backend/sync/ingest');

assert.ok(html.includes('<script src="js/ahaAvisa.js"></script>'));
assert.ok(html.includes('<script src="js/ahaAvisaUserExperience.js"></script>'));
assert.ok(html.indexOf('js/ahaAvisa.js') < html.indexOf('js/ahaAvisaUserExperience.js'), 'canonical AHAavisa must load before the UX adapter');
assert.match(html, /Skriv, gjennomgå og organiser artikler/);
assert.match(html, /Utkast:/);
assert.match(html, /Til gjennomgang:/);
assert.match(html, /Publisert i AHAavisa:/);
assert.match(html, /Avansert og teknisk status/);

console.log('aha-avisa-user-experience.test.cjs passed');
