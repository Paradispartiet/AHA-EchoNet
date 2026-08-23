const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = {
  window: null,
  globalThis: null,
  AHAModuleApi: { register() {}, resolve() { return null; } }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.resolve(__dirname, '../js/ahaChatProviderLoader.js'), 'utf8'),
  context,
  { filename: 'js/ahaChatProviderLoader.js' }
);

const repair = context.AHAChatProviderLoader?.QUALITY_REPAIR_V2;
assert.ok(repair, 'V2 semantic quality repair must be exported for regression verification');
assert.equal(repair.schema, 'aha_semantic_quality_repair_v2');

// Synthetic long academic source reproducing the real failure class: a short
// Norwegian title, duplicated English title/chrome, then a substantive article
// longer than the old 8k insight-candidate ceiling.
const header = [
  'De skrev henne ned»',
  'Livsarket og fortellinger om identitet og omsorg',
  '«They wrote her down»',
  'The Life Sheet and Story-Telling Practices about Identity and Care',
  'Nora Simonhjell nora@example.no',
  'Statistikk',
  'Artikkelvisninger',
  '6 524',
  'Siste 12 måneder',
  'Sammendrag',
  'Livsarket er et fortellende verktøy i demensomsorgen og skal bidra til individualisert omsorg.',
  'Samtidig reiser livsarket etiske spørsmål om representasjon, identitet og retten til egen fortelling.'
].join('\n');
const body = Array.from({ length: 90 }, (_, index) => [
  `Avsnitt ${index}. Fortellingspraksiser og omsorg må forstås i lys av representasjon og fortolkning.`,
  index % 3 === 0
    ? 'Samtidig kan et skjematisk verktøy komme i konflikt med en fragmentert livsfortelling.'
    : 'Kritisk lesning krever oppmerksomhet på hvem som forteller og hva som blir holdt utenfor.'
].join(' ')).join('\n\n');
const conclusion = [
  'Avslutning',
  'Vi har argumentert for at livsarket krever kritisk forståelse av fortellingspraksiser, selvframstilling og tilgangskompetanse.',
  'Retten til egen fortelling står sentralt i narrativ omsorg.'
].join('\n');
const sourceText = `${header}\n\n${body}\n\n${conclusion}`;
assert.ok(sourceText.length > 8000, 'fixture must reproduce the old >8k failure');

(async () => {
  const focused = repair.focusLongSource(sourceText);
  assert.ok(focused.length <= repair.longSourceLimit, 'candidate request must fit the bounded source window');
  assert.match(focused, /Livsarket og fortellinger om identitet og omsorg/);
  assert.match(focused, /Vi har argumentert for/);
  assert.match(focused, /Samtidig kan et skjematisk verktøy/);

  let receivedSource = '';
  const wrappedPipeline = repair.wrapProvider('chat.insightPipeline', {
    create() {
      return Object.freeze({
        async generateAIInsightCandidates(text) {
          receivedSource = text;
          return [{ summary: 'bounded candidate' }];
        },
        buildSemanticInsightCandidates() { return []; }
      });
    }
  }).create({});
  await wrappedPipeline.generateAIInsightCandidates(sourceText, {});
  assert.ok(receivedSource.length <= repair.longSourceLimit, 'provider wrapper must never send the full oversized source to the 8k endpoint');
  assert.match(receivedSource, /Livsarket og fortellinger om identitet og omsorg/);

  const concepts = [
    ['con_1', 'skrev'],
    ['con_2', 'henne'],
    ['con_3', 'Livsarket'],
    ['con_4', 'fortellingspraksiser'],
    ['con_5', 'omsorg'],
    ['con_6', 'wrote'],
    ['con_7', 'Statistikk'],
    ['con_8', 'representasjon'],
    ['con_9', 'https']
  ].map(([id, label]) => ({ id, label, mentions: [] }));
  const claims = Array.from({ length: 24 }, (_, index) => ({
    id: `clm_${index + 1}`,
    text: index === 0
      ? 'Livsarket er et fortellende verktøy i demensomsorgen og skal bidra til individualisert omsorg.'
      : 'Fortellingspraksiser og omsorg må forstås i lys av representasjon og fortolkning.',
    mentioned_concept_ids: ['con_3', 'con_4', 'con_5', 'con_8']
  }));
  const semanticDocument = repair.repairSemanticDocument({
    schema: 'aha_semantic_document_v2',
    status: 'ready',
    concepts,
    claims,
    relations: [],
    tensions: [],
    candidate_insights: [],
    synthesis_gate: { status: 'not_run' },
    quality: { status: 'passed', reasons: [] },
    policy: {
      canonical_write: false,
      chamber_write: false,
      meta_write: false,
      persistent_write: false,
      remote_write: false,
      sync_write: false,
      product_write: false
    }
  }, { sourceText, payload: { insightCandidatesV2: [] } });

  const conceptLabels = semanticDocument.concepts.map((item) => item.label);
  for (const forbidden of ['skrev', 'henne', 'wrote', 'Statistikk', 'https']) {
    assert.ok(!conceptLabels.includes(forbidden), `lexical/chrome noise must be suppressed: ${forbidden}`);
  }
  for (const required of ['Livsarket', 'fortellingspraksiser', 'omsorg', 'representasjon']) {
    assert.ok(conceptLabels.includes(required), `substantive recurring concept must survive: ${required}`);
  }
  assert.equal(semanticDocument.quality.status, 'incomplete', 'substantive source with synthesis not_run must never claim semantic quality passed');
  assert.ok(semanticDocument.quality.reasons.includes('semantic_synthesis_not_run_for_substantive_source'));
  assert.equal(semanticDocument.policy.canonical_write, false);
  assert.equal(semanticDocument.policy.product_write, false);

  const sourceTheme = repair.deriveSourceTheme(sourceText, semanticDocument);
  assert.equal(sourceTheme, 'Livsarket og fortellinger om identitet og omsorg');

  const payload = {
    canonicalAnalysis: {
      theme: 'Morgenbladet som idéoffentlig institusjon',
      mainTension: 'stale tension',
      keyInsight: 'stale insight'
    },
    ahaSer: {
      tema: 'Morgenbladet som idéoffentlig institusjon',
      hovedspenning: 'stale tension',
      viktigsteInnsikt: 'stale insight',
      nesteSteg: 'stale next step'
    },
    thoughts: { hovedspor: 'Morgenbladet som idéoffentlig institusjon' },
    insightCandidatesV2: []
  };
  repair.repairPayloadSourceFields(payload, sourceText, semanticDocument);
  assert.equal(payload.canonicalAnalysis.theme, sourceTheme);
  assert.equal(payload.ahaSer.tema, sourceTheme);
  assert.equal(payload.thoughts.hovedspor, sourceTheme);
  assert.doesNotMatch(JSON.stringify(payload), /Morgenbladet som idéoffentlig institusjon/);

  const bundle = repair.repairAnalysisBundle({
    schema: 'aha_analysis_bundle_v2',
    status: 'ready',
    identity: {
      analysis_id: 'analysis_test',
      analysis_run_id: 'run_test',
      source_id: 'source_test',
      source_sha256: 'a'.repeat(64)
    },
    surfaces: {
      overview: {
        theme: {
          schema: 'aha_analysis_field_v2',
          field_id: 'overview.theme',
          item_id: 'old_theme',
          value_type: 'text',
          value: 'Morgenbladet som idéoffentlig institusjon',
          quality: { status: 'incomplete' }
        }
      }
    },
    semantic_document: {
      claim_records: claims,
      tension_records: Array.from({ length: 10 }, (_, index) => ({ id: `ten_${index}`, label: `Samtidig spenning ${index}` }))
    },
    quality: { status: 'ready' }
  }, { sourceText, semanticDocument });
  assert.equal(bundle.surfaces.overview.theme.value, sourceTheme);
  assert.equal(bundle.surfaces.overview.theme.quality.status, 'passed');
  assert.equal(bundle.surfaces.overview.theme.provenance.status, 'verified');
  assert.ok(bundle.semantic_document.claim_records.length <= 12, 'Knowledge Map must not dump every source sentence as a visible claim node');
  assert.ok(bundle.semantic_document.tension_records.length <= 6, 'Knowledge Map must cap visible tension records');
  assert.equal(bundle.status, 'incomplete', 'not_run synthesis on a substantive source must remain fail-closed');

  console.log('AHA V2 long-source semantic quality regression passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
