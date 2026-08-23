const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = {
  window: null,
  globalThis: null,
  console,
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  AHA_AGENT_API: ''
};
context.window = context;
context.globalThis = context;
context.AHAModuleApi = { resolve() { return null; } };
context.AHAChatProviderLoader = {
  create() {
    return {
      resolve() { return null; },
      require() { return null; },
      instantiate(key) {
        if (key === 'applicationComposition') return { install() {} };
        return null;
      }
    };
  }
};
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.resolve(__dirname, '../js/ahaChat.js'), 'utf8'),
  context,
  { filename: 'js/ahaChat.js' }
);

const guard = context.AHAV2ReleaseQualityGuard;
assert.ok(guard, 'release-quality guard must be available for regression verification');
assert.equal(guard.schema, 'aha_v2_release_quality_guard_v1');

const heading = [
  'Participation and trust in neighbourhood planning',
  'A comparative study of local planning processes',
  'Abstract',
  'The article asks how participation practices shape trust between residents and local planning institutions.',
  'The study distinguishes formal invitations to participate from residents’ experience of having meaningful influence.'
].join('\n');

const earlyBody = Array.from({ length: 18 }, (_, index) =>
  `Background section ${index + 1}. Local planning brings public authorities and residents into repeated contact around contested priorities, timelines and neighbourhood change. Participation can create expectations that institutions must explain how resident input affects later decisions.`
).join('\n\n');

const method = [
  'Method',
  'The study uses a qualitative comparative design based on 36 semi-structured interviews with residents, planners and local officials in three neighbourhoods. Interview material was coded through thematic analysis, and the cases were compared to identify recurring mechanisms and divergent experiences.'
].join('\n');

const framework = [
  'Theoretical framework',
  'The analysis combines procedural justice with institutional trust. Procedural justice directs attention to voice, transparency and respectful treatment, while institutional trust concerns expectations that public institutions act predictably and explain their decisions.'
].join('\n');

const middleBody = Array.from({ length: 22 }, (_, index) =>
  `Context section ${index + 1}. Planning meetings varied in format and timing. Residents described different expectations about consultation, documentation and follow-up, while officials described capacity constraints and competing statutory requirements.`
).join('\n\n');

const findings = [
  'Findings',
  'The analysis identifies three recurring findings. First, early participation strengthened trust when residents could trace their input into later planning documents. Second, repeated consultation without visible feedback weakened trust. Third, disagreement itself did not reduce trust when officials explained trade-offs and decision criteria.'
].join('\n');

const limitations = [
  'Limitations',
  'The comparative design cannot establish a universal causal effect of participation on trust, and the interview sample may overrepresent residents who were already engaged. Further research should test whether the same mechanisms appear in less organised neighbourhoods.'
].join('\n');

const lateBody = Array.from({ length: 16 }, (_, index) =>
  `Discussion section ${index + 1}. The comparison suggests that participation quality depends on how institutions connect invitations, deliberation, documented reasons and later decisions. Different neighbourhood histories may condition how the same administrative practice is interpreted.`
).join('\n\n');

const conclusion = [
  'Conclusion',
  'Overall, the study concludes that participation is most closely associated with institutional trust when residents receive visible feedback about influence, reasons and trade-offs. The findings therefore shift attention from the amount of participation to the institutional quality of the participation process.'
].join('\n');

const sourceText = [heading, earlyBody, method, framework, middleBody, findings, limitations, lateBody, conclusion].join('\n\n');
assert.ok(sourceText.length > 8000, 'fixture must reproduce a long academic source');
assert.doesNotMatch(sourceText, /livsark|omsorg|demens/iu, 'regression fixture must remain domain-independent from the live failure');

const coverage = guard.detectAcademicCoverage(sourceText);
for (const role of ['research_question', 'method', 'framework', 'findings', 'limitations', 'conclusion']) {
  assert.ok(coverage.roles.includes(role), `academic coverage must detect ${role}`);
}

const focused = guard.focusAcademicSource(sourceText);
assert.ok(focused.length <= guard.longSourceLimit, 'academic source focus must stay within the bounded candidate window');
assert.match(focused, /36 semi-structured interviews/i, 'method evidence must survive the long-source focus');
assert.match(focused, /procedural justice with institutional trust/i, 'theoretical framework must survive the long-source focus');
assert.match(focused, /three recurring findings/i, 'findings must survive the long-source focus');
assert.match(focused, /cannot establish a universal causal effect/i, 'limitations and causal discipline must survive the long-source focus');
assert.match(focused, /Overall, the study concludes/i, 'conclusion must survive the long-source focus');
const focusedCoverage = guard.detectAcademicCoverage(focused);
for (const role of ['method', 'framework', 'findings', 'conclusion']) {
  assert.ok(focusedCoverage.roles.includes(role), `focused source must preserve ${role}`);
}

(async () => {
  let receivedText = '';
  let receivedContext = null;
  const wrappedPipeline = guard.wrapInsightPipelineInstance(Object.freeze({
    async generateAIInsightCandidates(text, nextContext) {
      receivedText = text;
      receivedContext = nextContext;
      return [{ summary: 'candidate' }];
    }
  }));
  const result = await wrappedPipeline.generateAIInsightCandidates(sourceText, { caller: 'test' });
  assert.equal(result.length, 1);
  assert.ok(receivedText.length <= guard.longSourceLimit, 'wrapped candidate generation must receive only the bounded academic focus');
  assert.match(receivedText, /36 semi-structured interviews/i);
  assert.match(receivedText, /procedural justice with institutional trust/i);
  assert.match(receivedText, /three recurring findings/i);
  assert.equal(receivedContext.caller, 'test');
  assert.equal(receivedContext.source_coverage_contract.schema, guard.schema);
  assert.equal(receivedContext.source_coverage_contract.require_cross_section_semantic_diversity, true);
  assert.ok(receivedContext.source_coverage_contract.academic_roles_present.includes('method'));
  assert.ok(receivedContext.source_coverage_contract.academic_roles_present.includes('findings'));

  const sha = 'a'.repeat(64);
  const identity = {
    analysis_id: 'analysis_generic_academic',
    analysis_run_id: 'run_generic_academic',
    source_id: 'source_generic_academic',
    source_sha256: sha
  };
  function field(fieldId, itemId, status = 'passed') {
    const passed = status === 'passed';
    return {
      schema: 'aha_analysis_field_v2',
      field_id: fieldId,
      item_id: itemId,
      value_type: 'text',
      value: itemId,
      source_sha256: sha,
      analysis_run_id: identity.analysis_run_id,
      source_id: identity.source_id,
      semantic_ids: [],
      provenance: {
        source_sha256: sha,
        analysis_run_id: identity.analysis_run_id,
        source_id: identity.source_id,
        origin: 'test',
        evidence: passed ? [{ excerpt: itemId, start: 0, end: itemId.length, exact_source_match: true }] : [],
        status: passed ? 'verified' : 'identity_only'
      },
      topic: passed
        ? { status: 'verified', valid: true, reason: 'test_verified' }
        : { status: 'unknown', valid: null, reason: 'optional_not_verified' },
      quality: { status, reason: status }
    };
  }
  function recordField(fieldId, itemId, status = 'passed') {
    const value = field(fieldId, itemId, status);
    value.value_type = 'record';
    value.value = fieldId === 'sources.primary' ? { role: 'primary', kind: 'pasted_text' } : { role: 'reference' };
    if (status === 'passed') value.topic = { status: 'not_applicable', valid: true, reason: 'source_metadata' };
    return value;
  }

  const optionalIds = ['subject_optional', 'track_optional', 'afterwork_optional', 'reference_optional', 'structure_optional'];
  const bundle = {
    schema: 'aha_analysis_bundle_v2',
    status: 'incomplete',
    identity,
    semantic_document: {
      schema: 'aha_semantic_document_v2',
      synthesis_gate: {
        authoritative: true,
        status: 'passed',
        candidate_count: 3,
        approved_count: 2,
        blocked_count: 1
      },
      approved_insight_ids: ['insight_1', 'insight_2']
    },
    surfaces: {
      overview: {
        theme: field('overview.theme', 'theme_core'),
        strongest_insight: field('overview.strongest_insight', 'strongest_core'),
        central_tension: field('overview.central_tension', 'tension_core')
      },
      insights: [field('insights.item', 'insight_core_1'), field('insights.item', 'insight_core_2')],
      concepts: [field('concepts.item', 'concept_core')],
      conversation_tracks: [field('conversation_tracks.item', optionalIds[1], 'incomplete')],
      subjects: [field('subjects.item', optionalIds[0], 'incomplete')],
      sources: [recordField('sources.primary', 'primary_core'), recordField('sources.reference', optionalIds[3], 'incomplete')],
      source_structure: { evidence_method: field('source_structure.evidence_method', optionalIds[4], 'incomplete') },
      afterwork: { reflection: field('afterwork.reflection', optionalIds[2], 'incomplete') }
    },
    quality: {
      status: 'incomplete',
      reasons: ['item_level_evidence_or_topic_incomplete'],
      incomplete_field_ids: optionalIds.slice(),
      rejected_field_ids: []
    },
    validation: { valid: true, errors: [] },
    policy: {
      product_store_write: false,
      automatic_product_write: false,
      remote_write: false,
      sync_write: false,
      chamber_write: false,
      meta_write: false,
      canonical_write: false,
      afterwork_history_merge: false
    }
  };

  const ready = guard.repairAnalysisBundleReadiness(bundle, { semanticDocument: bundle.semantic_document });
  assert.equal(ready.status, 'ready', 'optional enrichment must not poison a source-verified core analysis');
  assert.equal(ready.quality.status, 'ready');
  assert.deepEqual(Array.from(ready.quality.blocking_field_ids), []);
  for (const optionalId of optionalIds) {
    assert.ok(ready.quality.optional_withheld_field_ids.includes(optionalId), `optional field must remain explicitly withheld: ${optionalId}`);
  }
  assert.ok(ready.quality.reasons.includes('optional_enrichment_withheld_fail_closed'));
  assert.ok(!ready.quality.reasons.includes('item_level_evidence_or_topic_incomplete'));
  assert.equal(ready.policy.product_store_write, false);
  assert.equal(ready.policy.automatic_product_write, false);
  assert.equal(ready.policy.chamber_write, false);
  assert.equal(ready.policy.canonical_write, false);
  assert.equal(ready.policy.meta_write, false);
  assert.equal(ready.policy.remote_write, false);
  assert.equal(ready.policy.sync_write, false);

  const readModel = {
    schema: 'aha_analysis_read_model_v2',
    status: 'incomplete',
    blocked_field_ids: optionalIds.slice(),
    quality: { source_bundle_status: 'ready', visible_field_count: 7, blocked_field_count: optionalIds.length },
    validation: { valid: true, errors: [] }
  };
  const readyReadModel = guard.repairAnalysisReadModel(readModel, ready);
  assert.equal(readyReadModel.status, 'ready', 'read model must distinguish optional withheld enrichment from a blocked core analysis');
  assert.equal(readyReadModel.quality.blocking_field_count, 0);
  assert.equal(readyReadModel.quality.optional_withheld_field_count, optionalIds.length);

  const blockedBundle = JSON.parse(JSON.stringify(bundle));
  blockedBundle.surfaces.insights[0] = field('insights.item', 'insight_core_1', 'incomplete');
  const stillBlocked = guard.repairAnalysisBundleReadiness(blockedBundle, { semanticDocument: blockedBundle.semantic_document });
  assert.equal(stillBlocked.status, 'incomplete', 'a blocked authoritative insight must remain fail-closed');
  assert.ok(stillBlocked.quality.blocking_field_ids.includes('insight_core_1'));
  assert.ok(stillBlocked.quality.reasons.includes('core_analysis_readiness_blocked'));

  const synthesisNotReady = JSON.parse(JSON.stringify(bundle));
  synthesisNotReady.semantic_document.synthesis_gate.status = 'not_run';
  synthesisNotReady.semantic_document.synthesis_gate.approved_count = 0;
  const noSynthesis = guard.repairAnalysisBundleReadiness(synthesisNotReady, { semanticDocument: synthesisNotReady.semantic_document });
  assert.equal(noSynthesis.status, 'incomplete', 'semantic synthesis must still be authoritative and ready');
  assert.ok(noSynthesis.quality.reasons.includes('authoritative_semantic_synthesis_not_ready'));

  console.log('AHA V2 semantic salience and optional-readiness regression passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
