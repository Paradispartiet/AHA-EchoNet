const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(repoRoot, 'js', 'ahaSubjectEngine.js');
const bridgePath = path.join(repoRoot, 'data', 'integrations', 'history-go-fagverk-bridge.v2.json');
const overlayPath = path.join(repoRoot, 'data', 'subjects', 'subjects_index.json');
const emnerLoaderPath = path.join(repoRoot, 'js', 'emnerLoader.js');

const bridge = JSON.parse(fs.readFileSync(bridgePath, 'utf8'));
const overlayIndex = JSON.parse(fs.readFileSync(overlayPath, 'utf8'));
const source = fs.readFileSync(sourcePath, 'utf8');
const emnerLoaderSource = fs.readFileSync(emnerLoaderPath, 'utf8');

assert.equal(bridge.schema, 'aha_history_go_fagverk_bridge_v2');
assert.equal(bridge.authority, 'history_go_canonical_fagverk');
assert.match(bridge.canonical_source.source_ref, /^[a-f0-9]{40}$/);
assert.equal(bridge.expected.root_subject_count, 19);
assert.equal(bridge.expected.specialization_count, 1);
assert.equal(bridge.consumer_policy.fallback_to_partial_runtime_registry, false);
assert.equal(bridge.consumer_policy.fallback_to_local_subject_index_as_authority, false);
assert.equal(overlayIndex.authority, 'overlay_only');
assert.ok(overlayIndex.subjects.every((entry) => Array.isArray(entry.canonical_subject_ids) && entry.canonical_subject_ids.length));
assert.doesNotMatch(source, /const\s+INDEX_FILE\s*=\s*["']subjects_index\.json["']/);
assert.doesNotMatch(emnerLoaderSource, /EMNER_INDEX\s*=/);

function response(data, ok = true, status = 200) {
  return { ok, status, async json() { return structuredClone(data); } };
}

const release = {
  schema: 'history_go_fagverk_release_v2',
  registry: { content_sha256: bridge.expected.registry_sha256 },
  subject_inventory: { content_sha256: bridge.expected.subject_inventory_sha256 },
  fag_manifest: { content_sha256: bridge.expected.fag_manifest_sha256 },
  summary: { root_subject_count: 19, specialization_count: 1, missing_file_count: 0 },
  subjects: { litteratur: { title: 'Litteratur' }, helse: { title: 'Helse & medisin' } }
};
const inventory = {
  schema: 'history_go_fagverk_subject_inventory_v1',
  subjects: [
    { id: 'litteratur', schemaFamily: 'standard_canonical', requiredManifestFields: ['pensum', 'emner', 'fagkart', 'methods'] },
    { id: 'helse', schemaFamily: 'foundation_v1', requiredManifestFields: ['pensum', 'emner', 'fagkart', 'methods'] }
  ]
};
const registry = {
  schema: 'history_go_fagverk_registry_v1',
  subjects: {
    litteratur: {
      title: 'Litteratur',
      description: 'Litteraturvitenskap om fortelling, sjanger, stemme, lesing og offentlighet.',
      chapters: [{ id: 'livsskriving', title: 'Minne, vitnesbyrd og livsskriving', subtitle: 'Fortelling, selvframstilling og identitet.', file: 'data/fagverk/litteratur/livsskriving.json', emne_ids: ['em_lit_livsskriving_selvframstilling'] }]
    },
    helse: { title: 'Helse & medisin', description: 'Helsefag, klinikk og omsorg.', chapters: [] }
  }
};
const manifest = {
  litteratur: { pensum: 'litteratur/pensum.json', emner: 'litteratur/emner.json', fagkart: 'litteratur/fagkart.json', methods: 'litteratur/methods.json' },
  helse: { pensum: 'helse/pensum.json', emner: 'helse/emner.json', fagkart: 'helse/fagkart.json', methods: 'helse/methods.json' }
};
const literatureEmner = [{
  emne_id: 'em_lit_livsskriving',
  title: 'Livsskriving, fortelling og selvframstilling',
  definition: 'Studerer hvordan liv fremstilles gjennom fortelling og selvframstilling.',
  core_concepts: ['livsskriving', 'fortelling', 'selvframstilling', 'identitet'],
  keywords: ['narrativ', 'vitnesbyrd'],
  canonical_thinkers: ['Paul Ricoeur']
}];
const healthEmner = [{
  emne_id: 'em_helse_omsorg', title: 'Omsorgspraksis', definition: 'Helsefaglig omsorg og klinisk praksis.', core_concepts: ['omsorg', 'helse', 'klinikk']
}];

const base = `https://raw.githubusercontent.com/${bridge.canonical_source.repository}/${bridge.canonical_source.source_ref}/`;
const routes = new Map([
  ['/data/integrations/history-go-fagverk-bridge.v2.json', bridge],
  ['/data/subjects/subjects_index.json', { schema: 'aha_subject_overlays_v1', authority: 'overlay_only', subjects: [] }],
  [`${base}${bridge.canonical_source.paths.release}`, release],
  [`${base}${bridge.canonical_source.paths.subject_inventory}`, inventory],
  [`${base}${bridge.canonical_source.paths.registry}`, registry],
  [`${base}${bridge.canonical_source.paths.fag_manifest}`, manifest],
  [`${base}data/fag/litteratur/emner.json`, literatureEmner],
  [`${base}data/fag/helse/emner.json`, healthEmner]
]);

const context = {
  console: { warn() {}, log() {} },
  structuredClone,
  fetch: async (url) => routes.has(String(url)) ? response(routes.get(String(url))) : response({}, false, 404),
  window: null
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'ahaSubjectEngine.js' });

(async () => {
  const subjects = await context.AHASubjectEngine.listSubjects();
  assert.deepEqual(Array.from(subjects, (item) => item.subject_id), ['litteratur', 'helse']);
  assert.ok(subjects.every((item) => item.canonical === true));

  const literature = await context.AHASubjectEngine.loadSubject('litteratur');
  assert.equal(literature.authority, 'history_go_canonical_fagverk');
  assert.ok(literature.emner.some((item) => item.emne_id === 'em_lit_livsskriving'));
  assert.ok(literature.emner.every((item) => item?.fagverk?.source_ref === bridge.canonical_source.source_ref || item?.local_knowledge));

  const matches = await context.AHASubjectEngine.matchText(
    'Artikkelen undersøker livsskriving, fortelling og selvframstilling som arbeid med identitet.',
    { maxResults: 6 }
  );
  assert.ok(matches.length > 0);
  assert.equal(matches[0].subject_id, 'litteratur');
  assert.equal(matches[0].provenance.kind, 'canonical_fagverk');
  assert.equal(matches[0].provenance.source_ref, bridge.canonical_source.source_ref);
  assert.notEqual(matches[0].subject_id, 'kultur_kunst');

  context.AHASubjectEngineTestHooks.resetCacheForTests();
  routes.delete(`${base}${bridge.canonical_source.paths.registry}`);
  const failedClosed = await context.AHASubjectEngine.matchText('livsskriving fortelling selvframstilling');
  assert.deepEqual(Array.from(failedClosed), []);

  console.log('AHA canonical History-Go Fagverk bridge V2 regression: passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
