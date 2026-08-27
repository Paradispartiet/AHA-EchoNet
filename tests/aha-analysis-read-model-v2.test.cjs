const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let forbiddenWrites = 0;
const context = {
  window: null, globalThis: null, console, Date, Math, JSON, Object, Array, Set, Map,
  localStorage: { getItem() { throw new Error('read models must not read storage'); }, setItem() { forbiddenWrites += 1; } },
  fetch() { forbiddenWrites += 1; },
  AHALists: { add() { forbiddenWrites += 1; } },
  AHAPaths: { add() { forbiddenWrites += 1; } },
  AHAMindmap: { add() { forbiddenWrites += 1; } }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of ['js/ahaModuleApi.js', 'js/ahaChatIngestRuntime.js', 'js/ahaSemanticModelShadowBridge.js', 'js/ahaChatAnalysisRunContract.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const sourceText = 'Livsarket samler erfaringer og kilder i ett system. Det gjør forbindelser synlige, men krever at tolkning skilles fra dokumentert belegg. Når kildebelegget følger hvert felt, kan leseren kontrollere analysen. https://example.invalid/livsarket';
const sourceSha256 = context.AHASemanticDocument.sha256Hex(sourceText);
const run = {
  analysisId: 'analysis_livsarket_ui', analysisRunId: 'run_livsarket_ui', runId: 'run_livsarket_ui',
  sourceId: 'source_livsarket_ui', sourceSha256, source_sha256: sourceSha256, sourceTextHash: sourceSha256,
  createdAt: '2026-08-21T15:00:00.000Z'
};
const approved = {
  insight: 'Feltvis kildebelegg og et eksplisitt skille mellom dokumentasjon og tolkning er komplementære vilkår for en kontrollerbar analyse.',
  type: 'tension',
  abstraction: 'Sammenstiller feltvis proveniens med skillet mellom dokumentasjon og tolkning.',
  evidence: [
    { quote: 'Det gjør forbindelser synlige, men krever at tolkning skilles fra dokumentert belegg.', role: 'supports' },
    { quote: 'Når kildebelegget følger hvert felt, kan leseren kontrollere analysen.', role: 'supports' }
  ],
  why_it_matters: 'Prinsippet kan brukes når et analysesystem må kombinere samlet oversikt med etterprøvbar proveniens for hvert felt.', confidence: 'high', uncertainty: 'Gjelder når belegget er presist.', causal_status: 'not_causal'
};
const payload = {
  ...run,
  source_binding: { valid: true },
  concepts: ['Livsarket', 'kildebelegg', 'dokumentert belegg'],
  canonicalAnalysis: {
    theme: 'Livsarket samler erfaringer og kilder i ett system.',
    mainTension: 'Det gjør forbindelser synlige, men krever at tolkning skilles fra dokumentert belegg.',
    keyInsight: approved.insight,
    suggestedActions: ['Tenk videre uten konkret belegg.']
  },
  ahaSer: { viktigsteInnsikt: approved.insight },
  insightCandidatesV2: [approved, { insight: 'Kilde registrert', type: 'pattern' }],
  subjectMatches: [
    { subject_id: 'sub_weak', title: 'Fag', score: 0.79, explanation: 'For svakt.', evidence: 'kilder' },
    { subject_id: 'sub_missing_reason', title: 'Arkivfag', score: 1.2, evidence: 'kilder' },
    { subject_id: 'sub_knowledge', title: 'Kunnskapsorganisering', score: 1.2, explanation: 'Kilden beskriver organisering av erfaringer og kilder.', evidence: 'samler erfaringer og kilder' }
  ],
  summary: 'Livsarket samler erfaringer og kilder i ett system.',
  reflection: 'Det gjør forbindelser synlige, men krever at tolkning skilles fra dokumentert belegg.',
  list: ['Skal aldri nå Kildens struktur'],
  path: ['Skal aldri nå Kildens struktur'],
  thoughts: { hovedspor: 'Livsarket', lose_tanker: 'tolkning skilles fra dokumentert belegg' }
};

const semantic = context.AHALiveSemanticBridgeV2.build({ activeRun: run, payload, sourceText });
const bundle = context.AHAAnalysisBundleV2.build({ activeRun: run, payload, sourceText, semanticDocument: semantic, primarySourceKind: 'pasted_text' });
assert.equal(bundle.validation.valid, true);
assert.ok(bundle.semantic_document.claim_records.length > 0);
assert.ok(bundle.semantic_document.relation_records.length > 0);
assert.equal(bundle.semantic_document.approved_insight_records.length, 1);

const pr3ReloadBundle = JSON.parse(JSON.stringify(bundle));
for (const key of ['claim_records', 'relation_records', 'tension_records', 'approved_insight_records']) delete pr3ReloadBundle.semantic_document[key];
assert.ok(context.AHAAnalysisBundleV2.hydrate(pr3ReloadBundle), 'a valid PR 3 cache must remain reload-compatible when PR 4 projection records are absent');

const analysis = context.AHAAnalysisReadModelV2.build(bundle);
assert.ok(analysis);
assert.equal(analysis.schema, 'aha_analysis_read_model_v2');
assert.equal(analysis.validation.valid, true);
assert.deepEqual(JSON.parse(JSON.stringify(analysis.identity)), JSON.parse(JSON.stringify(bundle.identity)));
assert.equal(analysis.sections.insights.length, 1);
assert.equal(analysis.sections.insights[0].display.insight, approved.insight);
assert.equal(analysis.sections.insights[0].display.uncertainty, approved.uncertainty);
assert.ok(analysis.sections.insights[0].provenance.evidence.length >= 2);
assert.equal(analysis.sections.conversation_tracks.length, 0, 'unsupported generic tracks must be suppressed');
assert.equal(analysis.sections.subjects.length, 1, 'only a thresholded, explained and evidenced subject may be shown');
assert.equal(analysis.sections.subjects[0].value.subject_id, 'sub_knowledge');
assert.equal(analysis.sections.sources[0].value.role, 'primary');
assert.equal(analysis.sections.sources[0].value.kind, 'pasted_text');
assert.ok(analysis.sections.sources.some((item) => item.value.role === 'reference'));
assert.equal('list' in analysis.sections.source_structure, false);
assert.equal('path' in analysis.sections.source_structure, false);
assert.equal(JSON.stringify(analysis).includes('Kilde registrert'), false);
assert.equal(JSON.stringify(analysis).includes('[object Object]'), false);
assert.equal(JSON.stringify(analysis).includes('Skal aldri nå Kildens struktur'), false);

const optionalOnlyBundle = JSON.parse(JSON.stringify(bundle));
optionalOnlyBundle.status = 'ready';
optionalOnlyBundle.quality.optional_withheld_field_ids = analysis.blocked_field_ids.slice();
const optionalOnlyAnalysis = context.AHAAnalysisReadModelV2.build(optionalOnlyBundle);
assert.ok(optionalOnlyAnalysis);
assert.equal(optionalOnlyAnalysis.status, 'ready', 'optional enrichment withholding must not make the analysis incomplete');
assert.equal(optionalOnlyAnalysis.quality.blocking_field_count, 0);
assert.equal(optionalOnlyAnalysis.quality.optional_withheld_field_count, analysis.blocked_field_ids.length);

const knowledge = context.AHAKnowledgeMapReadModelV2.build({
  analysisReadModel: analysis,
  historicalRelations: [
    { relation: 'historical_same_source_afterwork', id: 'afterwork_old', source_sha256: sourceSha256, createdAt: '2026-08-20' },
    { relation: 'explicit_historical_relation', id: 'unbound_history', label: 'Skal ikke omstemples' },
    { id: 'untyped_history', label: 'Morgenbladet skal ikke inn' }
  ]
});
assert.ok(knowledge);
assert.equal(knowledge.schema, 'aha_knowledge_map_read_model_v2');
assert.equal(knowledge.validation.valid, true);
assert.deepEqual(JSON.parse(JSON.stringify(knowledge.identity)), JSON.parse(JSON.stringify(analysis.identity)));
assert.equal(knowledge.scopes.current_analysis.nodes.some((node) => node.origin_scope === 'historical'), false);
assert.equal(knowledge.scopes.whole_map.nodes.filter((node) => node.origin_scope === 'historical').length, 1);
assert.equal(JSON.stringify(knowledge).includes('Morgenbladet'), false);
assert.equal(JSON.stringify(knowledge).includes('Skal ikke omstemples'), false);
for (const scope of Object.values(knowledge.scopes)) {
  const ids = new Set(scope.nodes.map((node) => node.id));
  scope.nodes.forEach((node) => {
    assert.equal(node.map_analysis_id, run.analysisId);
    assert.equal(node.map_analysis_run_id, run.analysisRunId);
    assert.equal(node.map_source_id, run.sourceId);
    assert.equal(node.map_source_sha256, sourceSha256);
    if (node.origin_scope === 'historical') {
      assert.equal(node.source_sha256, sourceSha256);
      assert.equal(node.analysis_id, null, 'an unbound historical node must not be restamped with the current analysis id');
      assert.equal(node.analysis_run_id, null, 'an unbound historical node must not be restamped with the current run id');
      assert.equal(node.source_id, null, 'an unbound historical node must not be restamped with the current source id');
    } else {
      assert.equal(node.analysis_id, run.analysisId);
      assert.equal(node.source_sha256, sourceSha256);
      assert.equal(node.analysis_run_id, run.analysisRunId);
      assert.equal(node.source_id, run.sourceId);
    }
  });
  scope.edges.forEach((edge) => {
    assert.equal(edge.analysis_id, run.analysisId);
    assert.ok(ids.has(edge.from) && ids.has(edge.to), 'no dangling Knowledge Map edges');
    assert.ok(edge.relation_type && edge.explanation, 'every edge must be typed and explained');
  });
}
assert.equal(knowledge.policy.direct_materialization, false);
assert.equal(knowledge.policy.product_store_write, false);

const tampered = JSON.parse(JSON.stringify(analysis));
tampered.sections.insights[0].source_sha256 = 'f'.repeat(64);
assert.equal(context.AHAAnalysisReadModelV2.hydrate(tampered), null, 'reload must fail closed on stale field identity');
assert.equal(forbiddenWrites, 0);

for (const schemaFile of ['schemas/aha-analysis-read-model-v2.schema.json', 'schemas/aha-knowledge-map-read-model-v2.schema.json']) {
  const schema = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
  assert.equal(schema.properties.version.const, 2);
}

console.log('aha-analysis-read-model-v2.test.cjs passed');
