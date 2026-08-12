const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = 'data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function localFetch() {
  return async (url) => {
    const relativePath = String(url || '').replace(/^\/+/, '');
    const absolutePath = path.resolve(ROOT, relativePath);
    if (!absolutePath.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(absolutePath)) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(absolutePath, 'utf8')) };
  };
}

const cases = [
  ['by', 'by', 'data-styring-kart-plan-medvirkning-algoritmer', 'fagverk_by_data-styring-kart-plan-medvirkning-algoritmer', 'Kommunens planvedtak bygger på algoritmisk styring og datastyring. Algoritmer påvirker hvordan den målte byen prioriteres.'],
  ['historie', 'historie', 'kilder_arkiv_spor', 'fagverk_historie_kilder_arkiv_spor', 'Arkivstudien bruker kildekritikk og undersøker arkivtaushet. En førstehåndskilde må leses med proveniens og kontekstualisering.'],
  ['kunst', 'kultur_kunst', 'estetisk-sprak-og-form', 'fagverk_kunst_estetisk-sprak-og-form', 'Verket analyseres gjennom ikonografi, appropriasjon og abstraksjon, med konseptkunst som tydelig referanseramme.'],
  ['musikk', 'musikk', 'musikalsk-analyse-lyd-struktur', 'fagverk_musikk_musikalsk-analyse-lyd-struktur', 'Den musikalske analysen kombinerer rytmemåling og tidskodet lytting med harmoni og motiv.'],
  ['naeringsliv', 'naeringsliv', 'regnskap-revisjon-okonomistyring', 'fagverk_naeringsliv_regnskap-revisjon-okonomistyring', 'Regnskapet følger periodisering og balanseføring. Kontantstrømoppstilling, revisjonsbevis og dekningsbidrag kontrolleres særskilt.'],
  ['natur', 'natur', 'botanikk_vegetasjon', 'fagverk_natur_botanikk_vegetasjon', 'Botanikeren undersøkte plantevev, xylem og floem med vegetasjonsanalyse og dokumenterte funnet som herbariebelegg.'],
  ['politikk', 'politikk', 'forvaltning', 'fagverk_forvaltning', 'Offentlig ansatte ønsker at evalueringer skal følges bedre opp og integreres i mål- og resultatstyring. Statsforvaltningen trenger evalueringsstrategier, lederforankring og bedre forvaltningsskjønn.'],
  ['subkultur', 'subkultur', 'subkulturteori_feltgrenser', 'fagverk_subkultur_subkulturteori_feltgrenser', 'Studien bruker subkulturell kapital og feltgrenser sammen med scene-teori, subkulturteori og postsubkultur.']
];

const registry = readJson(REGISTRY_PATH);
const subjectIndex = readJson('data/subjects/subjects_index.json');
const metaById = new Map((subjectIndex.subjects || []).map((item) => [item.subject_id, item]));
assert.equal(cases.length, Object.keys(registry.active_subjects || {}).length, 'Audit matrix must track every runtime-active canonical subject.');

const subjectContext = { window: null, globalThis: null, console, fetch: localFetch() };
subjectContext.window = subjectContext;
subjectContext.globalThis = subjectContext;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/ahaSubjectEngine.js'), 'utf8'), subjectContext, { filename: 'js/ahaSubjectEngine.js' });

(async () => {
  let checks = 0;
  for (const [canonicalSubjectId, ahaSubjectId, chapterId, emneId, text] of cases) {
    const runtime = registry.active_subjects[canonicalSubjectId];
    const corpus = readJson(runtime.runtime_corpus_path);
    const meta = metaById.get(ahaSubjectId);
    const subject = readJson(`data/subjects/${meta.file}`);
    const emne = (subject.emner || []).find((item) => item.emne_id === emneId);

    assert.ok(emne); checks += 1;
    assert.equal(emne.fagverk.canonical_subject_id, canonicalSubjectId); checks += 1;
    assert.equal(emne.fagverk.chapter_id, chapterId); checks += 1;
    assert.equal(emne.fagverk.source_ref, corpus.source_ref); checks += 1;
    assert.ok(emne.fagverk.source_path && emne.fagverk.corpus_path && emne.fagverk.policy_path); checks += 1;

    const matches = await subjectContext.AHASubjectEngine.matchText(text, { source: 'production_pipeline_audit', maxResults: 8 });
    assert.ok(matches.length > 0); checks += 1;
    assert.equal(matches[0].subject_id, ahaSubjectId); checks += 1;
    assert.equal(matches[0].emne_id, emneId); checks += 1;
    assert.equal(matches[0].provenance?.kind, 'canonical_fagverk'); checks += 1;
    assert.deepEqual(
      {
        canonical_subject_id: matches[0].provenance?.canonical_subject_id,
        chapter_id: matches[0].provenance?.chapter_id,
        source_ref: matches[0].provenance?.source_ref,
        evidence_role: matches[0].provenance?.evidence_role
      },
      {
        canonical_subject_id: canonicalSubjectId,
        chapter_id: chapterId,
        source_ref: corpus.source_ref,
        evidence_role: 'reference_support_not_source_evidence'
      }
    ); checks += 1;
  }

  assert.equal(checks, 80, `Expected 80 production assertions, got ${checks}`);

  const first = cases[0];
  let subjectEngineFinished = false;
  let forwarded = null;
  const clientContext = {
    window: null,
    globalThis: null,
    console,
    JSON,
    String,
    Number,
    Array,
    Object,
    TypeError,
    AbortController,
    setTimeout,
    clearTimeout,
    location: { hostname: 'localhost' },
    localStorage: { getItem: () => null },
    AHASubjectEngine: {
      async matchText(message, options) {
        assert.equal(subjectEngineFinished, false);
        assert.equal(options.source, 'agent_preflight');
        await Promise.resolve();
        subjectEngineFinished = true;
        return [{
          subject_id: first[1], subject_label: 'By og samfunnsrom', emne_id: first[3], title: 'Datastyring', type: 'concept', score: 12,
          matched_terms: ['algoritmisk styring', 'datastyring'],
          provenance: { kind: 'canonical_fagverk', canonical_subject_id: first[0], chapter_id: first[2], source_ref: 'source-sha', evidence_role: 'reference_support_not_source_evidence' }
        }];
      }
    },
    fetch: async (url, init) => {
      assert.equal(subjectEngineFinished, true, 'Subject Engine must finish before the agent network request.');
      forwarded = { url, init, body: JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
  };
  clientContext.window = clientContext;
  clientContext.globalThis = clientContext;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/ahaEngineClient.js'), 'utf8'), clientContext, { filename: 'js/ahaEngineClient.js' });

  await clientContext.fetch('https://example.test/api/aha-agent/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: first[4], ai_state: { mode: 'assistant' } })
  });

  assert.ok(forwarded);
  assert.equal(forwarded.body.subject_context.role, 'fagverk_reference_support');
  assert.equal(forwarded.body.subject_context.evidence_policy.source_evidence, 'user_message_only');
  assert.equal(forwarded.body.subject_context.evidence_policy.fagverk, 'reference_support_not_source_evidence');
  assert.equal(forwarded.body.ai_state.subject_context.matches[0].provenance.chapter_id, first[2]);

  const pythonGrounding = fs.readFileSync(path.join(ROOT, 'backend/aha_engine/app/engine/fagverk_grounding.py'), 'utf8');
  assert.match(pythonGrounding, /Mer detaljert tolkning må fortsatt dokumenteres direkte i kildeteksten/);
  assert.match(pythonGrounding, /Fagverk-grounding er referansestøtte, ikke automatisk sannhet eller modelltrening/);

  console.log(`AHA production analysis pipeline audit: PASS (${checks}/80 dynamic subject checks; ${cases.length} subjects)`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
