const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = [
  'Livsarket organiserer opplysninger for helsepersonell, men skjemaet velger samtidig hvilke deler av livet som blir synlige.',
  'Forfatterne undersøker livsarket som fortellende sjanger i demensomsorgen og som praktisk kunnskapsverktøy.',
  'Analysen trekker veksler på litteraturteori, humanistisk omsorgsforskning og narrativ gerontologi.',
  'Et standardisert dokument kan støtte kommunikasjon, samtidig som personens stemme blir bearbeidet av andre.',
  'Materialet diskuterer derfor representasjon, fortolkning og tilgangskompetanse uten å gjøre én praksis til en enkel årsak.',
  'Forfatterne understreker at retten til egen fortelling også omfatter brudd, taushet og motstridende selvframstillinger.',
  'Avslutningen argumenterer for kritisk refleksjon når livsfortellinger brukes som grunnlag for individualisert omsorg.'
].concat(Array.from({ length: 18 }, (_, index) => (
  `Del ${index + 1} drøfter hvordan fortellingspraksis, dokumentform og omsorg opptrer sammen med spørsmål om identitet og representasjon.`
))).join(' ');
assert.ok(source.length > 1200);

const runtime = {
  schema: 'aha_runtime_manifest_v1',
  analysis_contract: 'aha_active_analysis_contract_v3',
  synthesis_contract: 'aha_insight_synthesis_contract_v2',
  synthesis_output_schema: 'aha_insight_synthesis_output_v2',
  prompt_version: 'aha_insight_synthesis_prompt_v3',
  quality_gate_schema: 'aha_insight_quality_gate_v2',
  semantic_document_schema: 'aha_semantic_document_v2',
  backend_build_sha: 'f'.repeat(40)
};
const strictCandidate = {
  insight: 'Livsarkets standardiserte kunnskapsform står i spenning med retten til fragmenterte og selvdefinerte livsfortellinger.',
  type: 'tension',
  abstraction: 'Kobler dokumentets praktiske standardisering med etiske grenser for representasjon og fortolkning.',
  evidence: [
    { quote: 'Livsarket organiserer opplysninger for helsepersonell, men skjemaet velger samtidig hvilke deler av livet som blir synlige.', role: 'supports' },
    { quote: 'Forfatterne understreker at retten til egen fortelling også omfatter brudd, taushet og motstridende selvframstillinger.', role: 'limits' }
  ],
  why_it_matters: 'Det synliggjør hvorfor et nyttig omsorgsverktøy fortsatt krever kritisk tilgangskompetanse og respekt for personens stemme.',
  confidence: 'high',
  uncertainty: '',
  causal_status: 'not_causal'
};
const gateRejectedCandidate = {
  insight: 'Standardisert dokumentasjon og personlige fortellinger krever ulike former for oppmerksomhet i omsorgspraksisen.',
  type: 'generalization',
  abstraction: 'Kort',
  evidence: strictCandidate.evidence,
  why_it_matters: 'Viktig',
  confidence: 'medium',
  uncertainty: '',
  causal_status: 'not_causal'
};

const requests = [];
const registrations = new Map();
const context = {
  window: null,
  globalThis: null,
  console,
  TextEncoder,
  AHA_FRONTEND_BUILD_SHA: 'f'.repeat(40),
  AHA_AGENT_API: 'https://agent.example/api/aha-agent',
  fetch: async (url, options = {}) => {
    if (String(url).endsWith('/health')) return { ok: true, json: async () => ({ runtime }) };
    requests.push({ url: String(url), body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({
      ok: true,
      schema: 'aha_insight_synthesis_contract_v2',
      synthesis: { schema: 'aha_insight_synthesis_output_v2', candidates: [strictCandidate, gateRejectedCandidate] },
      runtime,
      model: 'gpt-test',
      response_id: 'resp_contract_v3',
      synthesis_attempts: 1
    }) };
  },
  AHAModuleApi: {
    register(name, api) { registrations.set(name, api); return api; },
    resolve(name) { return registrations.get(name) || null; }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of [
  'js/ahaAnalysisQualityEvaluator.js',
  'js/ahaChatInsightPipeline.js',
  'js/ahaChatIngestRuntime.js',
  'js/ahaSemanticModelShadowBridge.js',
  'js/ahaChatAnalysisRunContract.js',
  'js/ahaChatProviderLoader.js'
]) vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });

const identity = (items) => Array.isArray(items) ? items.map(String).filter(Boolean) : [];
const basePipeline = context.AHAChatInsightPipeline;
const wrapped = context.AHAChatProviderLoader.QUALITY_REPAIR_V2.wrapProvider('chat.insightPipeline', basePipeline).create({
  filterConceptLabels: identity,
  normalizeSimpleStringList: (items, limit) => identity(items).slice(0, limit),
  normalizeTheoreticalLinks: () => [],
  extractAcademicPhraseConcepts: () => [],
  normalizeAfterworkConcept: (value) => String(value || '').toLowerCase(),
  weakConceptWords: new Set()
});

(async () => {
  const manifestModule = await import(`${require('node:url').pathToFileURL(require('node:path').resolve('server/ahaRuntimeManifest.js')).href}?test=${Date.now()}`);
  const serverRuntime = manifestModule.buildRuntimeManifest();
  Object.entries(context.AHAChatInsightPipeline.expectedRuntimeManifest()).forEach(([key, value]) => {
    assert.equal(serverRuntime[key], value, `server/browser contract drift: ${key}`);
  });
  assert.deepEqual(
    Array.from(context.AHAChatInsightPipeline.deploymentMismatchReasons({ ...runtime, backend_build_sha: 'b'.repeat(40) })),
    ['runtime_build_mismatch:frontend_backend_sha']
  );
  assert.deepEqual(
    Array.from(context.AHAChatInsightPipeline.runtimeCompatibilityReasons(null)),
    ['runtime_manifest_missing:backend'],
    'revision-locked production frontend must reject a backend without a runtime manifest'
  );
  context.AHA_FRONTEND_BUILD_SHA = 'local';
  assert.deepEqual(
    Array.from(context.AHAChatInsightPipeline.runtimeCompatibilityReasons(null)),
    [],
    'unstamped local/PR browser builds may negotiate the strict V2 response envelope during a staged rollout'
  );
  context.AHA_FRONTEND_BUILD_SHA = 'f'.repeat(40);
  const candidates = await wrapped.generateAIInsightCandidates(source, { subject_id: 'literature' });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/semantic-document$/);
  assert.equal(requests[0].body.format, 'aha_insight_synthesis_output_v2');
  assert.ok(requests[0].body.semantic_context.source_claims.length >= 2);
  assert.ok(requests[0].body.context.deterministic_evidence_packets.length >= 2);
  assert.equal(candidates.length, 2);

  const sourceSha256 = context.AHASemanticDocument.sha256Hex(source);
  const activeRun = {
    analysisId: 'analysis_contract_v3',
    analysisRunId: 'run_contract_v3',
    sourceId: 'source_contract_v3',
    sourceSha256
  };
  const semantic = context.AHALiveSemanticBridgeV2.build({
    sourceText: source,
    activeRun,
    payload: { insightCandidatesV2: candidates }
  });
  assert.equal(semantic.synthesis_gate.status, 'passed');
  assert.equal(semantic.synthesis_gate.approved_count, 1);
  assert.equal(semantic.synthesis_gate.blocked_count, 1);
  assert.deepEqual(Array.from(semantic.candidate_insights[0].blocking_reasons), []);
  assert.ok(semantic.candidate_insights[1].blocking_reasons.includes('abstraction_too_thin'));
  assert.ok(semantic.candidate_insights[1].blocking_reasons.includes('why_it_matters_weak'));

  const trace = context.AHAChatInsightPipeline.getLastRuntimeTrace();
  assert.equal(trace.backend.backend_build_sha, 'f'.repeat(40));
  assert.equal(trace.frontend_build_sha, 'f'.repeat(40));
  assert.equal(trace.final_authoritative_gate_status, 'passed');
  assert.equal(trace.evidence_plan.schema, 'aha_deterministic_evidence_packets_v1');

  const bundle = context.AHAAnalysisBundleV2.build({
    activeRun,
    sourceText: source,
    semanticDocument: semantic,
    payload: { analysisRuntime: trace, canonicalAnalysis: {}, ahaSer: {}, subjectMatches: [] }
  });
  assert.equal(bundle.runtime.backend.backend_build_sha, 'f'.repeat(40));
  assert.equal(bundle.semantic_document.candidate_diagnostics.length, 2);
  assert.equal(bundle.semantic_document.candidate_diagnostics[0].status, 'approved');
  assert.deepEqual(Array.from(bundle.semantic_document.candidate_diagnostics[0].blocking_reasons), []);
  assert.equal(bundle.semantic_document.candidate_diagnostics[1].status, 'blocked');
  assert.ok(bundle.semantic_document.candidate_diagnostics[1].blocking_reasons.includes('abstraction_too_thin'));
  assert.ok(bundle.semantic_document.candidate_diagnostics[1].evidence.length >= 2);
  assert.ok(bundle.semantic_document.candidate_diagnostics[1].evidence.length <= 3);
  assert.equal(bundle.semantic_document.synthesis_gate.authoritative_gate_attempts[0].ready, true);

  let legacyFallbackCalls = 0;
  const strictEmptyProvider = context.AHAChatProviderLoader.QUALITY_REPAIR_V2.wrapProvider('chat.insightPipeline', {
    ACTIVE_ANALYSIS_CONTRACT: 'aha_active_analysis_contract_v3',
    create() {
      return {
        async generateAIInsightCandidates() { return []; },
        buildSemanticInsightCandidates() { legacyFallbackCalls += 1; return [strictCandidate]; }
      };
    }
  }).create({});
  assert.deepEqual(Array.from(await strictEmptyProvider.generateAIInsightCandidates(source, {})), []);
  assert.equal(legacyFallbackCalls, 0, 'strict V3 must fail closed instead of entering the legacy local fallback');

  console.log('aha-active-analysis-contract-v3.test.cjs passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
