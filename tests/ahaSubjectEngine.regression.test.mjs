import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const engineCode = await fs.readFile(new URL('../js/ahaSubjectEngine.js', import.meta.url), 'utf8');
const ref = 'a'.repeat(40);
const bridge = {
  schema: 'aha_history_go_fagverk_bridge_v2',
  authority: 'history_go_canonical_fagverk',
  canonical_source: { repository: 'Example/History-Go', source_ref: ref },
  expected: {
    registry_sha256: 'registry-hash',
    subject_inventory_sha256: 'inventory-hash',
    fag_manifest_sha256: 'manifest-hash',
    root_subject_count: 2,
    specialization_count: 0
  }
};
const canonicalIndex = {
  schema: 'aha_history_go_fagverk_canonical_index_v2',
  authority: 'derived_cache_only',
  canonical_source: {
    repository: 'Example/History-Go',
    source_ref: ref,
    registry_content_sha256: 'registry-hash',
    subject_inventory_content_sha256: 'inventory-hash',
    fag_manifest_content_sha256: 'manifest-hash'
  },
  summary: { root_subject_count: 2, specialization_count: 0, subject_count: 2, missing_file_count: 0 },
  subjects: [
    {
      subject_id: 's1', subject_label: 'Biology', description: '', kind: 'subject', source_ref: ref,
      package: { emner_path: 'data/fag/biology/emner.json', methods_path: '' }, methods: [], chapters: [],
      emner: [{
        emne_id: 'bio-main', title: 'Photosynthesis', definition: 'Plant energy systems', why_it_matters: 'Leaf process',
        core_concepts: ['chlorophyll'], keywords: ['sunlight'], thinkers: ['Darwin'], methods: [],
        source_path: 'data/fag/biology/emner.json', source_ref: ref
      }]
    },
    {
      subject_id: 's2', subject_label: 'Chemistry', description: '', kind: 'subject', source_ref: ref,
      package: { emner_path: 'data/fag/chemistry/emner.json', methods_path: '' }, methods: [],
      chapters: [
        {
          chapter_id: 'kilder_arkiv_spor',
          title: 'Kilder, arkiv og spor',
          subtitle: 'Hvordan fortiden blir dokumenterbar, ordnet og taus',
          primary_domain_id: 'his_kilder_arkiv_spor',
          core_concepts: ['kildekritikk', 'proveniens', 'arkiv', 'arkivtaushet', 'levning', 'beretning', 'kildegrunnlag'],
          keywords: ['kontekstualisering', 'førstehåndskilder', 'historisk kunnskap'],
          thinkers: [],
          methods: ['Kildekritikk', 'Proveniensanalyse'],
          source_path: 'data/fagverk/historie/kilder_arkiv_spor.json',
          source_ref: ref
        },
        {
          chapter_id: 'minne_kulturarv_historiebruk',
          title: 'Minne, kulturarv og historiebruk',
          subtitle: 'Hvordan fortiden velges, bevares, brukes og bestrides',
          primary_domain_id: 'his_minne_kulturarv_historiebruk',
          core_concepts: ['proveniens', 'arkiv', 'fortellinger', 'kontekstualisering'],
          keywords: ['offentlig', 'kildekritikk', 'arkiv', 'proveniens', 'kontekstualisering'],
          thinkers: [],
          methods: ['Kildekritikk', 'Proveniensanalyse', 'Arkivlesning'],
          source_path: 'data/fagverk/historie/minne_kulturarv_historiebruk.json',
          source_ref: ref
        }
      ],
      emner: [{
        emne_id: 'chem-main', title: 'Reactions', definition: 'Bonds and atoms', why_it_matters: 'Reaction dynamics',
        core_concepts: ['molecule'], keywords: ['reaction'], thinkers: ['Lavoisier'], methods: [],
        source_path: 'data/fag/chemistry/emner.json', source_ref: ref
      }]
    }
  ]
};

const sandbox = {
  window: {},
  fetch: async (url) => {
    const key = String(url);
    if (key === '/data/integrations/history-go-fagverk-bridge.v2.json') return { ok: true, json: async () => bridge };
    if (key === '/data/integrations/runtime/history-go-fagverk-canonical-index.v2.json') return { ok: true, json: async () => canonicalIndex };
    if (key === '/data/subjects/subjects_index.json') return { ok: true, json: async () => ({ schema: 'aha_subject_overlays_v1', authority: 'overlay_only', subjects: [] }) };
    return { ok: false, status: 404, json: async () => ({}) };
  },
  console
};

vm.createContext(sandbox);
vm.runInContext(engineCode, sandbox);

const { matchText } = sandbox.window.AHASubjectEngine;
const results = await matchText('We should study chlorophyll deeply.', { maxResults: 5 });

assert.equal(results[0].emne_id, 'bio-main', 'Expected biology concept to rank first.');
assert.ok(results[0].score > 0, 'Expected positive score for matched concept.');
assert.deepEqual(Array.from(results[0].matched_terms), ['chlorophyll'], 'Expected only matched term in collector output.');
assert.equal(results[0].provenance.kind, 'canonical_fagverk');
assert.equal(results[0].provenance.source_ref, ref);

const unrelatedTerms = ['Darwin', 'sunlight', 'Plant energy systems', 'Leaf process'];
unrelatedTerms.forEach((term) => {
  assert.ok(!results[0].matched_terms.includes(term), `Unexpected unrelated matched term: ${term}`);
});
assert.ok(!results.some((entry) => entry.emne_id === 'chem-main'), 'Unrelated subject must not be boosted into the result list.');

const archiveResults = await matchText(
  'Arkivstudien bygger på kildekritikk, proveniens og kontekstualisering av brev og kommunale protokoller. Den sammenligner førstehåndskilder med senere beretninger, drøfter arkivtaushet og vurderer hvilke grupper som mangler i det bevarte materialet. Analysen skiller mellom levning og beretning og forklarer hvordan utvalget av kilder påvirker historisk kunnskap. Forfatteren sammenholder materialet med et offentlig arkiv, markerer usikkerhet i dateringen og viser hvordan arkivets ordning påvirker hvilke fortellinger senere historikere kan bygge. Det gjør kildegrunnlaget eksplisitt og etterprøvbart.',
  { maxResults: 5 }
);
assert.ok(archiveResults.length > 0, 'Expected canonical archive evidence to produce a match.');
assert.equal(archiveResults[0].emne_id, 'fagverk_s2_kilder_arkiv_spor', 'Specific archive/provenance evidence must outrank a broader memory/history-use chapter.');
assert.equal(archiveResults[0].provenance.chapter_id, 'kilder_arkiv_spor');
assert.ok(archiveResults[0].matched_terms.includes('arkiv'));
assert.ok(archiveResults[0].matched_terms.includes('kildekritikk'));

console.log('ahaSubjectEngine canonical-index regression test passed');
