const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function loadScriptIntoContext(filePath, context) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, context, { filename: filePath });
}

const context = vm.createContext({
  console,
  module: { exports: {} },
  exports: {},
  setTimeout,
  clearTimeout,
  Date,
  Math,
  JSON
});

loadScriptIntoContext('insightsChamber.js', context);
const InsightsEngine = context.module.exports;

const signal = InsightsEngine.createSignalFromMessage(
  'Dette er en innsikt med kilde',
  'sub_laring',
  'tema_test',
  { source_event_id: 'src_evt_123', field_id: 'felt_1' }
);
assert.equal(signal.source_event_id, 'src_evt_123');

const chamber = InsightsEngine.createEmptyChamber();
InsightsEngine.addSignalToChamber(chamber, signal);
assert.equal(chamber.insights.length, 1);
assert.deepEqual(chamber.insights[0].source_event_ids, ['src_evt_123']);

// Eldre data uten source_event_ids skal fortsatt kunne forsterkes uten feil.
const oldInsight = {
  id: 'ins_old',
  subject_id: 'sub_laring',
  theme_id: 'tema_test',
  summary: 'Dette er en innsikt med kilde',
  text: 'Dette er en innsikt med kilde',
  strength: { evidence_count: 1, total_score: 10 },
  depth_score: 0,
  first_seen: new Date().toISOString(),
  last_updated: new Date().toISOString(),
  dimensions: [],
  raw_terms: [],
  concepts: [],
  claims: [],
  patterns: [],
  markers: [],
  semantic: {},
  narrative: {},
  semiotic: { emojis: [], markers: {}, domains: {} }
};
const legacyChamber = { insights: [oldInsight] };
InsightsEngine.addSignalToChamber(legacyChamber, signal);
assert.ok(Array.isArray(legacyChamber.insights[0].source_event_ids));
assert.ok(legacyChamber.insights[0].source_event_ids.includes('src_evt_123'));

console.log('aha-source-linking-check passed');
