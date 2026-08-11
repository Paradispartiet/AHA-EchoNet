const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ahaContracts.js'), 'utf8');

const chamber = {
  insights: [
    { id: 'ins_1', title: 'Første' },
    { id: 'ins_2', title: 'Andre' }
  ]
};
let savedChamber = null;
let originalCalls = 0;
let receivedInput = null;
let receivedCandidates = null;

const context = {
  console,
  Date,
  Math,
  JSON,
  localStorage: {
    getItem(key) {
      if (key === 'aha_insight_chamber_v1') return JSON.stringify(chamber);
      return null;
    },
    setItem(key, value) {
      if (key === 'aha_insight_chamber_v1') savedChamber = JSON.parse(value);
    }
  },
  saveChamberToStorage(next) {
    savedChamber = JSON.parse(JSON.stringify(next));
  },
  AHAIngest: {
    ingestWithCandidates(input, candidates) {
      originalCalls += 1;
      receivedInput = input;
      receivedCandidates = candidates;
      return {
        ok: true,
        sourceEvent: { id: 'src_chat_1', meta: input.meta || {} },
        items: candidates.map((candidate, index) => ({
          signal: { text: candidate.text || candidate.summary || candidate },
          meta: { insight_id: index === 0 ? 'ins_1' : 'ins_2', action: 'created' }
        }))
      };
    }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'js/ahaContracts.js' });

assert.ok(context.AHAContracts, 'AHAContracts skal finnes');
assert.equal(typeof context.AHAContracts.prepareInsightCandidates, 'function');
assert.equal(typeof context.AHAContracts.installInsightQualityContract, 'function');
assert.equal(context.AHAIngest.__ahaInsightQualityContractInstalled, true, 'kvalitetskontrakten skal installeres når AHAIngest finnes');

const candidates = [
  {
    title: 'Makt og sted',
    text: 'Makt formes av stedet og institusjonene rundt det.',
    candidate_type: 'ai',
    functional_type: 'pattern'
  },
  {
    title: 'Duplikat med ulik whitespace',
    text: '  Makt   formes av stedet og institusjonene rundt det.  ',
    candidate_type: 'ai',
    functional_type: 'pattern'
  },
  {
    title: 'Et annet spor',
    summary: 'Institusjoner gjør bestemte handlingsrom mer sannsynlige.',
    candidate_type: 'semantic',
    functional_type: 'principle'
  }
];

const result = context.AHAIngest.ingestWithCandidates({
  source_type: 'chat',
  text: 'En lengre chattekst om makt, sted og institusjoner.',
  meta: { theme_id: 'th_makt', field_id: 'field_by' }
}, candidates);

assert.equal(originalCalls, 1, 'canonical AHAIngest skal fortsatt kalles nøyaktig én gang');
assert.equal(receivedCandidates.length, 2, 'identiske kandidater skal dedupliseres før canonical ingest');
assert.equal(result.duplicates_skipped, 1, 'resultatet skal gjøre deduplisering inspiserbar');
assert.equal(result.quality_contract, 'aha_insight_quality_contract_v1');

const first = receivedCandidates[0];
const second = receivedCandidates[1];
assert.match(first.candidate_fingerprint, /^cand_[0-9a-f]{8}$/);
assert.equal(first.candidate_origin, 'ai');
assert.equal(first.candidate_quality.status, 'accepted_for_ingest');
assert.equal(first.candidate_quality.acceptance_basis, 'chat_candidate_filter');
assert.equal(second.candidate_origin, 'semantic');
assert.equal(second.candidate_quality.acceptance_basis, 'chat_semantic_candidate_builder');
assert.notEqual(first.candidate_fingerprint, second.candidate_fingerprint);

assert.equal(receivedInput.meta.insight_quality_contract.version, 'aha_insight_quality_contract_v1');
assert.equal(receivedInput.meta.insight_quality_contract.candidate_count, 3);
assert.equal(receivedInput.meta.insight_quality_contract.unique_candidate_count, 2);
assert.equal(receivedInput.meta.insight_quality_contract.duplicates_skipped, 1);
assert.match(receivedInput.meta.insight_quality_contract.source_fingerprint, /^src_[0-9a-f]{8}$/);

assert.equal(result.items[0].signal.candidate_fingerprint, first.candidate_fingerprint, 'returnert signal skal ha kandidatfingeravtrykk');
assert.equal(result.items[0].signal.candidate_origin, 'ai');
assert.equal(result.items[0].signal.candidate_quality.source_event_id, 'src_chat_1');

assert.ok(savedChamber, 'chamber skal lagres etter metadata-berikelse');
const storedFirst = savedChamber.insights.find((item) => item.id === 'ins_1');
const storedSecond = savedChamber.insights.find((item) => item.id === 'ins_2');
assert.equal(storedFirst.source_event_id, 'src_chat_1');
assert.equal(storedFirst.candidate_fingerprint, first.candidate_fingerprint);
assert.equal(storedFirst.candidate_origin, 'ai');
assert.equal(storedFirst.candidate_provenance.length, 1);
assert.equal(storedFirst.candidate_provenance[0].source_event_id, 'src_chat_1');
assert.equal(storedSecond.candidate_origin, 'semantic');

const again = context.AHAContracts.prepareInsightCandidates([
  { text: 'Makt formes av stedet og institusjonene rundt det.', candidate_type: 'ai' },
  { text: 'makt formes av stedet og institusjonene rundt det', candidate_type: 'ai' }
]);
assert.equal(again.candidates.length, 1, 'normalisering skal gi stabil duplikatdeteksjon');
assert.equal(again.duplicatesSkipped, 1);

const base = context.AHAContracts.normalizeBaseItem({ title: 'Test' }, { type: 'note', source: 'aha' });
assert.equal(base.type, 'note', 'eksisterende AHAContracts-funksjoner skal bevares');
assert.equal(base.source, 'aha');

console.log('aha-chat-insight-quality-contract.test.cjs passed');
