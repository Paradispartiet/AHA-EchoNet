const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

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

const materializer = spawnSync(
  process.execPath,
  ['scripts/materialize-history-go-fagverk-subjects.mjs', '--subject', 'politikk', '--check'],
  { cwd: repoRoot, encoding: 'utf8' }
);
assert.equal(
  materializer.status,
  0,
  `Fagverk subject projection is stale:\n${materializer.stdout || ''}\n${materializer.stderr || ''}`
);

const subjectIndex = readJson('data/subjects/subjects_index.json');
const politicsMeta = (subjectIndex.subjects || []).find((subject) => subject.subject_id === 'politikk');
assert.ok(politicsMeta, 'subjects_index.json must register politikk');

const politics = readJson(`data/subjects/${politicsMeta.file}`);
const forvaltning = (politics.emner || []).find((emne) => emne.emne_id === 'fagverk_forvaltning');
assert.ok(forvaltning, 'actual politikk subject file must materialize canonical Forvaltning');
assert.equal(forvaltning.fagverk?.chapter_id, 'forvaltning');
assert.equal(forvaltning.fagverk?.corpus_path, politics.history_go_fagverk?.corpus_path);
assert.ok((forvaltning.core_concepts || []).some((term) => String(term).toLowerCase() === 'mål- og resultatstyring'));
assert.ok((forvaltning.core_concepts || []).some((term) => String(term).toLowerCase() === 'evaluering'));
assert.ok((forvaltning.core_concepts || []).some((term) => String(term).toLowerCase() === 'evalueringer'));

const corpus = readJson(politics.history_go_fagverk.corpus_path);
assert.equal(corpus.status, 'runtime_subject_corpus_active');
assert.equal(corpus.subject_id, 'politikk');
assert.equal(forvaltning.fagverk.source_ref, corpus.source_ref);
const canonicalForvaltning = (corpus.entries || []).find((entry) => entry.chapter_id === 'forvaltning');
assert.ok(canonicalForvaltning, 'runtime-active Politics corpus must contain Forvaltning');
const canonicalTerms = new Set((canonicalForvaltning.concept_terms || []).map((term) => String(term).toLowerCase()));
assert.ok(canonicalTerms.has('mål- og resultatstyring'));
assert.ok(canonicalTerms.has('evaluering'));

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

const source = `Sammendrag. Offentlig ansatte ønsker at evalueringer skal ha høyere kvalitet, bli tettere fulgt opp og integreres bedre med mål- og resultatstyringssystemet. Bare et lite mindretall ønsker flere evalueringer. I denne artikkelen diskuterer vi ulike former for nytte og hvordan den norske statsforvaltningen bruker evalueringer. Formålet er at evalueringer skal gi økt samfunnsnytte. I anledning Evalueringsåret 2015 gjennomførte EVA-forum og Norsk Evalueringsforening en spørreundersøkelse om bruken og nytten av evalueringer i statlig sektor. Undersøkelsen ble sendt til 276 respondenter, og 30 prosent svarte. Respondentene etterlyser mer systematikk, bedre oppfølging og bedre integrering av evalueringsresultater i mål- og resultatstyringssystemet. Det største behovet er økt fagkompetanse. Bare 25–30 prosent mener det er nødvendig med flere evalueringer. Potensialet for videreutvikling ligger ikke i å evaluere mer, men bedre. Deltakende metoder, referansegrupper, evalueringsstrategier og lederforankring påvirker bruk. Betydningen av kvalitet og relevans er stor.`;

(async () => {
  const matches = await context.AHASubjectEngine.matchText(source, { source: 'integration_test', maxResults: 8 });
  assert.ok(matches.length, 'actual Subject Engine must return a subject match for the evaluation article');
  assert.equal(matches[0].subject_id, 'politikk', `expected Politikk first, got ${matches[0].subject_id}`);
  assert.equal(matches[0].emne_id, 'fagverk_forvaltning', `expected Forvaltning first, got ${matches[0].emne_id}`);
  assert.ok((matches[0].matched_terms || []).some((term) => String(term).toLowerCase() === 'evalueringer'));
  console.log('aha-history-go-fagverk-subject-bridge integration tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
