const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('js/ahaProvenanceSurface.js', 'utf8');
const insightsHtml = fs.readFileSync('insights.html', 'utf8');
const sourcesHtml = fs.readFileSync('sources.html', 'utf8');

const forbiddenCalls = [];
const forbiddenApi = (name) => new Proxy({}, {
  get(_target, prop) {
    forbiddenCalls.push(`${name}.${String(prop)}`);
    throw new Error(`${name} must remain untouched by provenance surface`);
  }
});

const context = {
  console,
  Date,
  Intl,
  Array,
  Object,
  String,
  Number,
  Set,
  Map,
  JSON,
  document: { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
  AHAIngest: forbiddenApi('AHAIngest'),
  AHARepository: forbiddenApi('AHARepository'),
  EchoNet: forbiddenApi('EchoNet'),
  fetch() { forbiddenCalls.push('fetch'); throw new Error('fetch forbidden'); }
};
context.window = context;
vm.createContext(context);
vm.runInContext(code, context, { filename: 'js/ahaProvenanceSurface.js' });

const surface = context.AHAProvenanceSurface;
assert.ok(surface, 'AHAProvenanceSurface should be exported');
assert.equal(surface.VERSION, 'aha_provenance_surface_v1');

const insight = {
  id: 'ins_1',
  analysis_provenance: [
    {
      analysisRunId: 'run_created_1234567890',
      conversationId: 'default_thread',
      turnId: 'turn_created_1234567890',
      sourceId: 'chat_message_msg_1',
      sourceKind: 'pasted_text',
      sourceHash: 'hash_created_abcdefghijklmnopqrstuvwxyz',
      source_event_id: 'src_chat_1',
      candidate_fingerprint: 'cand_11111111',
      candidate_origin: 'ai',
      ingest_action: 'created',
      createdAt: '2026-08-11T07:00:00.000Z'
    },
    {
      analysisRunId: 'run_reinforced_1234567890',
      conversationId: 'default_thread',
      turnId: 'turn_reinforced_1234567890',
      sourceId: 'chat_message_msg_2',
      sourceKind: 'chat',
      sourceHash: 'hash_reinforced_abcdefghijklmnopqrstuvwxyz',
      source_event_id: 'src_chat_2',
      candidate_fingerprint: 'cand_22222222',
      candidate_origin: 'semantic',
      ingest_action: 'reinforced',
      createdAt: '2026-08-11T08:00:00.000Z'
    }
  ],
  candidate_provenance: [
    { candidate_origin: 'ai' },
    { candidate_origin: 'semantic' }
  ]
};

const insightHtml = surface.renderInsightProvenance(insight);
assert.match(insightHtml, /Proveniens/);
assert.match(insightHtml, /Opprettet/);
assert.match(insightHtml, /Forsterket/);
assert.match(insightHtml, /tekst i Chat/);
assert.match(insightHtml, /2 kandidatsignaler/);
assert.match(insightHtml, /ai \/ semantic/);
assert.match(insightHtml, /Sporbarhet \(2 analyseledd\)/);
assert.match(insightHtml, /Analyse-run/);
assert.doesNotMatch(insightHtml, /hash_created_abcdefghijklmnopqrstuvwxyz/, 'full technical hashes should not be exposed in compact provenance');

assert.equal(surface.renderInsightProvenance({ id: 'legacy', title: 'Legacy' }), '', 'legacy insights without provenance should render unchanged');

const sourceEvent = {
  id: 'src_chat_2',
  text: 'PRIVATE RAW CHAT BODY MUST NOT APPEAR',
  linked_insights: [{ id: 'ins_1' }, { id: 'ins_2' }],
  meta: {
    analysis_trace: {
      analysisRunId: 'run_source_1234567890',
      conversationId: 'default_thread',
      turnId: 'turn_source_1234567890',
      sourceId: 'chat_message_msg_2',
      sourceKind: 'chat',
      sourceHash: 'source_hash_abcdefghijklmnopqrstuvwxyz',
      createdAt: '2026-08-11T08:00:00.000Z'
    },
    insight_quality_contract: {
      version: 'aha_insight_quality_contract_v1',
      source_fingerprint: 'src_12345678',
      candidate_count: 3,
      unique_candidate_count: 2,
      duplicates_skipped: 1,
      analysis_run_id: 'run_source_1234567890',
      turn_id: 'turn_source_1234567890',
      analysis_source_hash: 'source_hash_abcdefghijklmnopqrstuvwxyz'
    }
  }
};
const sourceHtml = surface.renderSourceEventProvenance(sourceEvent);
assert.match(sourceHtml, /Proveniens:/);
assert.match(sourceHtml, /2 insights/);
assert.match(sourceHtml, /3 → 2 kandidater/);
assert.match(sourceHtml, /1 duplikat filtrert/);
assert.match(sourceHtml, /Kvalitetskontrakt/);
assert.match(sourceHtml, /Analyse- og kvalitetsdetaljer/);
assert.doesNotMatch(sourceHtml, /PRIVATE RAW CHAT BODY MUST NOT APPEAR/, 'provenance surface must not repeat raw source text');
assert.doesNotMatch(sourceHtml, /source_hash_abcdefghijklmnopqrstuvwxyz/, 'full source hashes should remain secondary/shortened');

assert.equal(surface.renderSourceEventProvenance({ id: 'legacy-source', meta: {}, linked_insights: [] }), '', 'legacy source events should remain uncluttered');

assert.ok(insightsHtml.includes('<script src="js/ahaProvenanceSurface.js"></script>'), 'Insights should load provenance surface');
assert.ok(sourcesHtml.includes('<script src="js/ahaProvenanceSurface.js"></script>'), 'Sources should load provenance surface');
assert.ok(insightsHtml.indexOf('js/ahaInsights.js') < insightsHtml.indexOf('js/ahaProvenanceSurface.js'), 'Insights renderer should load before the enhancer');
assert.ok(sourcesHtml.indexOf('js/ahaSourcesAudit.js') < sourcesHtml.indexOf('js/ahaProvenanceSurface.js'), 'Sources audit should load before the enhancer');

assert.equal(/localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(code), false, 'provenance surface must not write localStorage');
assert.equal(/AHAIngest\s*\./.test(code), false, 'provenance surface must not call AHAIngest');
assert.equal(/AHARepository\s*\./.test(code), false, 'provenance surface must not call AHARepository');
assert.equal(/\bfetch\s*\(/.test(code), false, 'provenance surface must not fetch');
assert.equal(/EchoNet|syncFromDatabase|autoSync|createClient|supabase/i.test(code), false, 'provenance surface must not activate backend/sync/EchoNet');
assert.deepEqual(forbiddenCalls, [], 'loading and pure rendering must not touch forbidden APIs');

console.log('aha-provenance-surface.test.cjs passed');
