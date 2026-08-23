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
      package: { emner_path: 'data/fag/chemistry/emner.json', methods_path: '' }, methods: [], chapters: [],
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

console.log('ahaSubjectEngine canonical-index regression test passed');
