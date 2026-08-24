const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const enginePath = path.join(repoRoot, 'js', 'ahaSubjectEngine.js');
const bridgePath = path.join(repoRoot, 'data', 'integrations', 'history-go-fagverk-bridge.v2.json');
const indexPath = path.join(repoRoot, 'data', 'integrations', 'runtime', 'history-go-fagverk-canonical-index.v2.json');
const overlayPath = path.join(repoRoot, 'data', 'subjects', 'subjects_index.json');
const emnerLoaderPath = path.join(repoRoot, 'js', 'emnerLoader.js');

const bridge = JSON.parse(fs.readFileSync(bridgePath, 'utf8'));
const canonicalIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const overlayIndex = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
const engineSource = fs.readFileSync(enginePath, 'utf8');
const emnerLoaderSource = fs.readFileSync(emnerLoaderPath, 'utf8');

assert.equal(bridge.schema, 'aha_history_go_fagverk_bridge_v2');
assert.equal(bridge.authority, 'history_go_canonical_fagverk');
assert.match(bridge.canonical_source.source_ref, /^[a-f0-9]{40}$/);
assert.equal(bridge.expected.root_subject_count, 19);
assert.equal(bridge.expected.specialization_count, 1);
assert.equal(bridge.consumer_policy.fallback_to_partial_runtime_registry, false);
assert.equal(bridge.consumer_policy.fallback_to_local_subject_index_as_authority, false);

assert.equal(canonicalIndex.schema, 'aha_history_go_fagverk_canonical_index_v2');
assert.equal(canonicalIndex.authority, 'derived_cache_only');
assert.equal(canonicalIndex.canonical_source.source_ref, bridge.canonical_source.source_ref);
assert.equal(canonicalIndex.canonical_source.registry_content_sha256, bridge.expected.registry_sha256);
assert.equal(canonicalIndex.canonical_source.subject_inventory_content_sha256, bridge.expected.subject_inventory_sha256);
assert.equal(canonicalIndex.canonical_source.fag_manifest_content_sha256, bridge.expected.fag_manifest_sha256);
assert.equal(canonicalIndex.summary.root_subject_count, 19);
assert.equal(canonicalIndex.summary.specialization_count, 1);
assert.equal(canonicalIndex.summary.subject_count, 20);
assert.equal(canonicalIndex.summary.missing_file_count, 0);
assert.ok(canonicalIndex.summary.emne_count > 1000);
assert.ok(canonicalIndex.summary.method_count > 500);
assert.equal(canonicalIndex.summary.chapter_count, 174);

const canonicalIds = canonicalIndex.subjects.map((subject) => subject.subject_id);
for (const required of ['litteratur', 'media', 'helse', 'utdanning', 'religion', 'scenekunst', 'filosofi', 'film_tv', 'teknologi']) {
  assert.ok(canonicalIds.includes(required), `canonical subject missing: ${required}`);
}
assert.ok(!canonicalIds.includes('kultur_kunst'));
assert.ok(!canonicalIds.includes('psykologi_pedagogikk'));

const literature = canonicalIndex.subjects.find((subject) => subject.subject_id === 'litteratur');
assert.ok(literature);
assert.ok(literature.emner.length > 0);
assert.ok(literature.methods.length > 0);
assert.ok(literature.emner.some((item) => /livsskriv|fortelling|selvframstill/i.test(JSON.stringify(item))));
assert.ok(literature.emner.every((item) => item.source_ref === bridge.canonical_source.source_ref));
assert.ok(literature.methods.every((item) => item.source_ref === bridge.canonical_source.source_ref));

assert.equal(overlayIndex.schema, 'aha_subject_overlays_v1');
assert.equal(overlayIndex.authority, 'overlay_only');
assert.ok(overlayIndex.subjects.every((entry) => Array.isArray(entry.canonical_subject_ids) && entry.canonical_subject_ids.length));
assert.doesNotMatch(engineSource, /history-go-fagverk-runtime-registry\.v1\.json/);
assert.doesNotMatch(engineSource, /history-go-fagverk-corpus\.v1\.json/);
assert.doesNotMatch(emnerLoaderSource, /EMNER_INDEX\s*=/);

function response(data, ok = true, status = 200) {
  return { ok, status, async json() { return structuredClone(data); } };
}

function repoFetch(overrides = new Map()) {
  return async (url) => {
    const key = String(url);
    if (overrides.has(key)) return overrides.get(key);
    if (!key.startsWith('/')) return response({}, false, 404);
    const local = path.join(repoRoot, key.replace(/^\//, ''));
    if (!local.startsWith(repoRoot) || !fs.existsSync(local)) return response({}, false, 404);
    return response(JSON.parse(fs.readFileSync(local, 'utf8')));
  };
}

function createContext(fetchImpl, globals = {}) {
  const context = {
    console: { warn() {}, log() {} },
    structuredClone,
    fetch: fetchImpl,
    window: null,
    ...globals
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(engineSource, context, { filename: 'ahaSubjectEngine.js' });
  return context;
}

(async () => {
  const context = createContext(repoFetch());
  const subjects = await context.AHASubjectEngine.listSubjects();
  assert.equal(subjects.length, 20);
  assert.ok(subjects.some((subject) => subject.subject_id === 'litteratur'));
  assert.ok(subjects.some((subject) => subject.subject_id === 'teknologi' && subject.kind === 'specialization'));
  assert.ok(subjects.every((subject) => subject.canonical === true));

  const projectRequests = [];
  const projectContext = createContext(async (url) => {
    const href = String(url);
    projectRequests.push(href);
    const pathname = new URL(href).pathname;
    const relative = pathname.replace(/^\/AHA-EchoNet\//, "");
    const local = path.join(repoRoot, relative);
    if (!local.startsWith(repoRoot) || !fs.existsSync(local)) return response({}, false, 404);
    return response(JSON.parse(fs.readFileSync(local, 'utf8')));
  }, { URL, location: { href: 'https://paradispartiet.github.io/AHA-EchoNet/chat.html' } });
  const projectSubjects = await projectContext.AHASubjectEngine.listSubjects();
  assert.equal(projectSubjects.length, 20);
  assert.deepEqual(projectRequests.sort(), [
    'https://paradispartiet.github.io/AHA-EchoNet/data/integrations/history-go-fagverk-bridge.v2.json',
    'https://paradispartiet.github.io/AHA-EchoNet/data/integrations/runtime/history-go-fagverk-canonical-index.v2.json'
  ]);

  const loadedLiterature = await context.AHASubjectEngine.loadSubject('litteratur');
  assert.equal(loadedLiterature.authority, 'history_go_canonical_fagverk');
  assert.ok(loadedLiterature.emner.some((item) => item?.fagverk?.canonical_subject_id === 'litteratur'));
  assert.ok(loadedLiterature.emner.every((item) => !item?.fagverk || item.fagverk.source_ref === bridge.canonical_source.source_ref));

  const matches = await context.AHASubjectEngine.matchText(
    'Artikkelen undersøker livsskriving, fortelling, narrativ form og selvframstilling som arbeid med identitet.',
    { maxResults: 8 }
  );
  assert.ok(matches.length > 0);
  assert.ok(matches.some((match) => match.subject_id === 'litteratur'));
  assert.equal(matches[0].subject_id, 'litteratur');
  assert.equal(matches[0].provenance.kind, 'canonical_fagverk');
  assert.equal(matches[0].provenance.source_ref, bridge.canonical_source.source_ref);
  assert.ok(matches.every((match) => match.subject_id !== 'kultur_kunst'));

  const longNarrativeSource = [
    'Fortelling, identitet og omsorg',
    'Sammendrag',
    'Artikkelen undersøker hvordan fortellingspraksiser former representasjon og selvframstilling i individualisert omsorg.',
    'Vi trekker veksler på litteraturteori, narrativ gerontologi og kritisk fortolkning som teoretisk rammeverk.',
    ...Array.from({ length: 20 }, (_, index) => `Avsnitt ${index + 1}. Fortellingspraksiser og narrativ form setter kultur, identitet, relasjoner og kunnskap inn i en litterær fortolkning av roman, selvframstilling og omsorg. Samtidig kan et skjematisk verktøy komme i konflikt med en fragmentert livsfortelling.`),
    'Avslutning',
    'Vi har argumentert for at retten til egen fortelling krever kritisk forståelse av situert kunnskap og narrativ omsorg.'
  ].join('\n');
  const longNarrativeMatches = await context.AHASubjectEngine.matchText(longNarrativeSource, { maxResults: 8 });
  assert.equal(longNarrativeMatches[0].subject_id, 'litteratur', 'specific chapters may supervise within a subject, but must not override stronger cross-subject support');

  const failedClosedContext = createContext(repoFetch(new Map([
    ['/data/integrations/runtime/history-go-fagverk-canonical-index.v2.json', response({}, false, 404)]
  ])));
  const failedClosed = await failedClosedContext.AHASubjectEngine.matchText('livsskriving fortelling selvframstilling');
  assert.deepEqual(Array.from(failedClosed), []);

  console.log('AHA canonical History-Go Fagverk bridge V2 regression: passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
