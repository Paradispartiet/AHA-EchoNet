import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const engineCode = await fs.readFile(new URL('../js/ahaSubjectEngine.js', import.meta.url), 'utf8');

const dataset = {
  subjects: [
    { subject_id: 's1', subject_label: 'Biology', file: 's1.json' },
    { subject_id: 's2', subject_label: 'Chemistry', file: 's2.json' }
  ],
  files: {
    's1.json': {
      subject_id: 's1',
      subject_label: 'Biology',
      emner: [
        {
          emne_id: 'bio-main',
          title: 'Photosynthesis',
          core_concepts: ['chlorophyll'],
          keywords: ['sunlight'],
          thinkers: ['Darwin'],
          summary: 'Plant energy systems',
          description: 'Leaf process',
          learning_goals: ['Understand plants'],
          checkpoints: ['Explain sugar production']
        }
      ]
    },
    's2.json': {
      subject_id: 's2',
      subject_label: 'Chemistry',
      emner: [
        {
          emne_id: 'chem-main',
          title: 'Reactions',
          core_concepts: ['molecule'],
          keywords: ['reaction'],
          thinkers: ['Lavoisier'],
          summary: 'Bonds and atoms',
          description: 'Reaction dynamics',
          learning_goals: ['Balance equations'],
          checkpoints: ['Use molarity']
        }
      ]
    }
  }
};

const sandbox = {
  window: {},
  fetch: async (url) => {
    const path = String(url).replace('data/subjects/', '');
    if (path === 'subjects_index.json') {
      return { ok: true, json: async () => ({ subjects: dataset.subjects }) };
    }
    const file = dataset.files[path];
    if (!file) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, json: async () => file };
  },
  console
};

vm.createContext(sandbox);
vm.runInContext(engineCode, sandbox);

const { matchText } = sandbox.window.AHASubjectEngine;

const onlyOneFieldText = 'We should study chlorophyll deeply.';
const results = await matchText(onlyOneFieldText, { maxResults: 5 });

assert.equal(results[0].emne_id, 'bio-main', 'Expected biology chip to rank first.');
assert.ok(results[0].score > 0, 'Expected positive score for matched concept.');
assert.deepEqual(Array.from(results[0].matched_terms), ['chlorophyll'], 'Expected only matched term in collector output.');

const unrelatedTerms = ['Darwin', 'sunlight', 'Plant energy systems', 'Leaf process', 'Understand plants', 'Explain sugar production'];
unrelatedTerms.forEach((term) => {
  assert.ok(!results[0].matched_terms.includes(term), `Unexpected unrelated matched term: ${term}`);
});

assert.equal(results[0].emne_id, 'bio-main', 'Expected stable top chip ordering without inflated boosts.');
assert.ok(!results.some((entry) => entry.emne_id === 'chem-main'), 'Unrelated chip must not be boosted into the result list.');

console.log('ahaSubjectEngine regression test passed');
