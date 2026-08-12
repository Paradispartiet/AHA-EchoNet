const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const registryPath = 'data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function makeLocalFetch() {
  return async function localFetch(url) {
    const relativePath = String(url || '').replace(/^\/+/, '');
    const absolutePath = path.resolve(repoRoot, relativePath);
    const insideRepo = absolutePath === repoRoot || absolutePath.startsWith(`${repoRoot}${path.sep}`);
    if (!insideRepo || !fs.existsSync(absolutePath)) {
      return { ok: false, status: insideRepo ? 404 : 403, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(fs.readFileSync(absolutePath, 'utf8'))
    };
  };
}

const matrix = [
  {
    fagverkSubjectId: 'by',
    ahaSubjectId: 'by',
    chapterId: 'data-styring-kart-plan-medvirkning-algoritmer',
    emneId: 'fagverk_by_data-styring-kart-plan-medvirkning-algoritmer',
    singleTerm: 'algoritmisk styring',
    text: 'Kommunens planvedtak bygger på algoritmisk styring og datastyring. Algoritmer påvirker hvordan den målte byen prioriteres.'
  },
  {
    fagverkSubjectId: 'historie',
    ahaSubjectId: 'historie',
    chapterId: 'kilder_arkiv_spor',
    emneId: 'fagverk_historie_kilder_arkiv_spor',
    singleTerm: 'arkivtaushet',
    text: 'Arkivstudien bruker kildekritikk og undersøker arkivtaushet. En førstehåndskilde må leses med proveniens og kontekstualisering.'
  },
  {
    fagverkSubjectId: 'kunst',
    ahaSubjectId: 'kultur_kunst',
    chapterId: 'estetisk-sprak-og-form',
    emneId: 'fagverk_kunst_estetisk-sprak-og-form',
    singleTerm: 'ikonografi',
    text: 'Verket analyseres gjennom ikonografi, appropriasjon og abstraksjon, med konseptkunst som tydelig referanseramme.'
  },
  {
    fagverkSubjectId: 'musikk',
    ahaSubjectId: 'musikk',
    chapterId: 'musikalsk-analyse-lyd-struktur',
    emneId: 'fagverk_musikk_musikalsk-analyse-lyd-struktur',
    singleTerm: 'rytmemåling',
    text: 'Den musikalske analysen kombinerer rytmemåling og tidskodet lytting med harmoni og motiv.'
  },
  {
    fagverkSubjectId: 'naeringsliv',
    ahaSubjectId: 'naeringsliv',
    chapterId: 'regnskap-revisjon-okonomistyring',
    emneId: 'fagverk_naeringsliv_regnskap-revisjon-okonomistyring',
    singleTerm: 'revisjonsbevis',
    text: 'Regnskapet følger periodisering og balanseføring. Kontantstrømoppstilling, revisjonsbevis og dekningsbidrag kontrolleres særskilt.'
  },
  {
    fagverkSubjectId: 'natur',
    ahaSubjectId: 'natur',
    chapterId: 'botanikk_vegetasjon',
    emneId: 'fagverk_natur_botanikk_vegetasjon',
    singleTerm: 'plantevev',
    text: 'Botanikeren undersøkte plantevev, xylem og floem med vegetasjonsanalyse og dokumenterte funnet som herbariebelegg.'
  },
  {
    fagverkSubjectId: 'politikk',
    ahaSubjectId: 'politikk',
    chapterId: 'forvaltning',
    emneId: 'fagverk_forvaltning',
    singleTerm: 'evalueringer',
    text: 'Offentlig ansatte ønsker at evalueringer skal følges bedre opp og integreres i mål- og resultatstyring. Statsforvaltningen trenger evalueringsstrategier, lederforankring og bedre forvaltningsskjønn.'
  },
  {
    fagverkSubjectId: 'subkultur',
    ahaSubjectId: 'subkultur',
    chapterId: 'subkulturteori_feltgrenser',
    emneId: 'fagverk_subkultur_subkulturteori_feltgrenser',
    singleTerm: 'subkulturell kapital',
    text: 'Studien bruker subkulturell kapital og feltgrenser sammen med scene-teori, subkulturteori og postsubkultur.'
  }
];

const materializer = spawnSync(
  process.execPath,
  ['scripts/materialize-history-go-fagverk-subjects.mjs', '--check'],
  { cwd: repoRoot, encoding: 'utf8' }
);
assert.equal(
  materializer.status,
  0,
  `Fagverk subject projections are stale:\n${materializer.stdout || ''}\n${materializer.stderr || ''}`
);

const subjectIndex = readJson('data/subjects/subjects_index.json');
const registry = readJson(registryPath);
const subjectFiles = new Map();
const canonicalToAha = new Map();
let generatedCount = 0;

for (const meta of subjectIndex.subjects || []) {
  const subject = readJson(`data/subjects/${meta.file}`);
  subjectFiles.set(subject.subject_id, subject);
  const bridge = subject.history_go_fagverk;
  if (!bridge) continue;
  assert.equal(bridge.source, 'runtime_active_subject_registry');
  assert.equal(bridge.registry_path, registryPath);
  assert.equal(bridge.projection_mode, 'all_runtime_chapters');
  assert.ok(!canonicalToAha.has(bridge.fagverk_subject_id), `${bridge.fagverk_subject_id} must have exactly one AHA bridge`);
  canonicalToAha.set(bridge.fagverk_subject_id, subject.subject_id);

  const runtimeConfig = registry.active_subjects[bridge.fagverk_subject_id];
  assert.ok(runtimeConfig, `${bridge.fagverk_subject_id} must be runtime-active`);
  const corpus = readJson(runtimeConfig.runtime_corpus_path);
  const generated = (subject.emner || []).filter((emne) => emne.fagverk?.generation_mode === 'canonical_runtime_subject_projection_v2');
  assert.equal(generated.length, corpus.entries.length, `${subject.subject_id} must project every active canonical chapter`);
  assert.deepEqual(
    new Set(generated.map((emne) => emne.fagverk.chapter_id)),
    new Set(corpus.entries.map((entry) => entry.chapter_id)),
    `${subject.subject_id} chapter projection differs from its runtime corpus`
  );
  for (const emne of generated) {
    assert.equal(emne.fagverk.canonical_subject_id, bridge.fagverk_subject_id);
    assert.equal(emne.fagverk.source_ref, corpus.source_ref);
    assert.equal(emne.fagverk.corpus_path, runtimeConfig.runtime_corpus_path);
    assert.equal(emne.fagverk.policy_path, runtimeConfig.runtime_policy_path);
    assert.ok(emne.fagverk.minimum_matched_terms >= 2);
    assert.ok((emne.core_concepts || []).length >= emne.fagverk.minimum_matched_terms);
  }
  generatedCount += generated.length;
}

assert.deepEqual([...canonicalToAha.keys()].sort(), Object.keys(registry.active_subjects).sort());
assert.equal(generatedCount, 98, 'Subject Engine must materialize all 98 runtime-active canonical chapters');
assert.equal(canonicalToAha.get('kunst'), 'kultur_kunst', 'canonical Kunst must map explicitly to the existing AHA subject');

const politics = subjectFiles.get('politikk');
const forvaltning = (politics.emner || []).find((emne) => emne.emne_id === 'fagverk_forvaltning');
assert.ok(forvaltning, 'actual politikk subject file must preserve canonical Forvaltning contract');
assert.ok((forvaltning.core_concepts || []).some((term) => String(term).toLowerCase() === 'mål- og resultatstyring'));
assert.ok((forvaltning.core_concepts || []).some((term) => String(term).toLowerCase() === 'evalueringer'));

const context = {
  window: null,
  globalThis: null,
  console,
  fetch: makeLocalFetch()
};
context.window = context;
context.globalThis = context;
vm.runInNewContext(
  fs.readFileSync(path.join(repoRoot, 'js/ahaSubjectEngine.js'), 'utf8'),
  context,
  { filename: 'js/ahaSubjectEngine.js' }
);

(async () => {
  for (const testCase of matrix) {
    const subject = subjectFiles.get(testCase.ahaSubjectId);
    const emne = (subject.emner || []).find((item) => item.emne_id === testCase.emneId);
    assert.ok(emne, `${testCase.fagverkSubjectId}: actual subject file lacks ${testCase.emneId}`);
    assert.equal(emne.fagverk.chapter_id, testCase.chapterId);
    assert.equal(emne.fagverk.canonical_subject_id, testCase.fagverkSubjectId);

    const matches = await context.AHASubjectEngine.matchText(testCase.text, {
      source: 'cross_subject_integration_test',
      maxResults: 8
    });
    assert.ok(matches.length, `${testCase.fagverkSubjectId}: actual Subject Engine returned no match`);
    assert.equal(matches[0].subject_id, testCase.ahaSubjectId, `${testCase.fagverkSubjectId}: wrong top subject ${matches[0].subject_id}`);
    assert.equal(matches[0].emne_id, testCase.emneId, `${testCase.fagverkSubjectId}: wrong top chapter ${matches[0].emne_id}`);
    assert.ok(
      (matches[0].matched_terms || []).length >= emne.fagverk.minimum_matched_terms,
      `${testCase.fagverkSubjectId}: top match does not satisfy canonical minimum term count`
    );

    const competing = matches.find((match) => match.subject_id !== testCase.ahaSubjectId);
    if (competing) {
      assert.ok(
        matches[0].score - competing.score >= emne.fagverk.ambiguity_margin,
        `${testCase.fagverkSubjectId}: competing ${competing.subject_id} match is inside canonical ambiguity margin`
      );
    }

    const singleTermMatches = await context.AHASubjectEngine.matchText(testCase.singleTerm, {
      source: 'cross_subject_single_term_guard',
      maxResults: 8
    });
    assert.ok(
      !singleTermMatches.some((match) => match.emne_id === testCase.emneId),
      `${testCase.fagverkSubjectId}: one Fagverk term must not activate ${testCase.emneId}`
    );
  }
  console.log('aha-history-go-fagverk cross-subject bridge integration tests passed (8 subjects, 98 chapters)');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
