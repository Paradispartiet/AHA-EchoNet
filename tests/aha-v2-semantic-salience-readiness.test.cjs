const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { window: null, globalThis: null };
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.resolve(__dirname, '../js/ahaChatProviderLoader.js'), 'utf8'),
  context,
  { filename: 'js/ahaChatProviderLoader.js' }
);

const guard = context.AHAChatProviderLoader?.QUALITY_REPAIR_V2;
assert.ok(guard, 'provider loader must expose the V2 quality repair');
assert.equal(guard.schema, 'aha_semantic_quality_repair_v2');

const intro = [
  'Participation and trust in neighbourhood planning',
  'The article asks how participation practices shape trust between residents and local planning institutions.',
  'The study distinguishes formal invitations to participate from residents’ experience of meaningful influence.'
].join('\n');
const filler = (label, count) => Array.from({ length: count }, (_, index) =>
  `${label} ${index + 1}. Local planning brings residents and public institutions into repeated contact around priorities, timelines, documentation and neighbourhood change. Participants may hold different expectations about consultation and follow-up.`
).join('\n\n');
const method = 'Method\nThe study uses a qualitative comparative design based on 36 semi-structured interviews with residents, planners and local officials. Interview material was coded through thematic analysis.';
const framework = 'Theoretical framework\nThe analysis combines procedural justice with institutional trust. Procedural justice directs attention to voice, transparency and respectful treatment.';
const findings = 'Findings\nThe analysis identifies three recurring findings. Early participation strengthened trust when residents could trace their input into later planning documents, while repeated consultation without feedback weakened trust.';
const limitations = 'Limitations\nThe comparative design cannot establish a universal causal effect of participation on trust. Further research should test the same mechanisms in less organised neighbourhoods.';
const conclusion = 'Conclusion\nOverall, the study concludes that participation is most closely associated with institutional trust when residents receive visible feedback about influence, reasons and trade-offs.';
const sourceText = [intro, filler('Background', 18), method, framework, filler('Context', 24), findings, limitations, filler('Discussion', 18), conclusion].join('\n\n');

assert.ok(sourceText.length > 8000, 'fixture must reproduce a long academic source');
assert.doesNotMatch(sourceText, /livsark|omsorg|demens/iu, 'fixture must remain independent of the live failure domain');
const coverage = guard.detectAcademicCoverage(sourceText);
for (const role of ['research_question', 'method', 'framework', 'findings', 'limitations', 'conclusion']) {
  assert.ok(coverage.roles.includes(role), `academic coverage must detect ${role}`);
}
const focused = guard.focusLongSource(sourceText);
assert.ok(focused.length <= guard.longSourceLimit, 'focused source must stay within the candidate bound');
assert.match(focused, /36 semi-structured interviews/i);
assert.match(focused, /procedural justice with institutional trust/i);
assert.match(focused, /three recurring findings/i);
assert.match(focused, /cannot establish a universal causal effect/i);
assert.match(focused, /Overall, the study concludes/i);

function field(fieldId, itemId, status = 'passed') {
  const passed = status === 'passed';
  return {
    schema: 'aha_analysis_field_v2', field_id: fieldId, item_id: itemId,
    value_type: 'text', value: itemId,
    provenance: { status: passed ? 'verified' : 'identity_only' },
    topic: { status: passed ? 'verified' : 'unknown' },
    quality: { status }
  };
}
function primaryField() {
  const value = field('sources.primary', 'primary_core');
  value.value_type = 'record';
  value.value = { role: 'primary', kind: 'pasted_text' };
  value.topic.status = 'not_applicable';
  return value;
}
function bundleFixture() {
  return {
    schema: 'aha_analysis_bundle_v2', status: 'incomplete', validation: { valid: true, errors: [] },
    semantic_document: {
      schema: 'aha_semantic_document_v2',
      synthesis_gate: { authoritative: true, status: 'passed', candidate_count: 2, approved_count: 2, blocked_count: 0 },
      approved_insight_ids: ['semantic_1', 'semantic_2']
    },
    surfaces: {
      overview: {
        theme: field('overview.theme', 'theme_core'),
        strongest_insight: field('overview.strongest_insight', 'strongest_core'),
        central_tension: field('overview.central_tension', 'tension_core')
      },
      insights: [field('insights.item', 'insight_core_1'), field('insights.item', 'insight_core_2')],
      concepts: [field('concepts.item', 'concept_optional')],
      conversation_tracks: [field('conversation_tracks.item', 'track_optional', 'incomplete')],
      subjects: [field('subjects.item', 'subject_optional', 'incomplete')],
      sources: [primaryField(), field('sources.reference', 'reference_optional', 'incomplete')],
      source_structure: { evidence_method: field('source_structure.evidence_method', 'structure_optional', 'incomplete') },
      afterwork: { reflection: field('afterwork.reflection', 'afterwork_optional', 'incomplete') }
    },
    quality: {
      status: 'incomplete', reasons: ['item_level_evidence_or_topic_incomplete'],
      incomplete_field_ids: ['track_optional', 'subject_optional', 'reference_optional', 'structure_optional', 'afterwork_optional'],
      rejected_field_ids: []
    },
    policy: {
      product_store_write: false, automatic_product_write: false, remote_write: false, sync_write: false,
      chamber_write: false, meta_write: false, canonical_write: false, afterwork_history_merge: false
    }
  };
}

const bundle = bundleFixture();
const ready = guard.repairAnalysisBundle(bundle, { sourceText, semanticDocument: bundle.semantic_document });
assert.equal(ready.status, 'ready', 'optional enrichment must not make a verified core analysis globally incomplete');
assert.deepEqual(Array.from(ready.quality.blocking_field_ids), []);
for (const id of ['track_optional', 'subject_optional', 'reference_optional', 'structure_optional', 'afterwork_optional']) {
  assert.ok(ready.quality.optional_withheld_field_ids.includes(id), `optional field must stay explicitly withheld: ${id}`);
}
assert.ok(ready.quality.reasons.includes('optional_enrichment_withheld_fail_closed'));
for (const key of ['product_store_write', 'automatic_product_write', 'remote_write', 'sync_write', 'chamber_write', 'meta_write', 'canonical_write']) {
  assert.equal(ready.policy[key], false, `${key} must remain closed`);
}

const readModel = {
  schema: 'aha_analysis_read_model_v2', status: 'incomplete',
  blocked_field_ids: ['track_optional', 'subject_optional', 'reference_optional', 'structure_optional', 'afterwork_optional'],
  quality: { source_bundle_status: 'ready', blocked_field_count: 5 }, validation: { valid: true, errors: [] }
};
const repairedReadModel = guard.repairAnalysisReadModel(readModel, ready);
assert.equal(repairedReadModel.status, 'ready', 'read model must distinguish optional withholding from core blocking');
assert.equal(repairedReadModel.quality.blocking_field_count, 0);
assert.equal(repairedReadModel.quality.optional_withheld_field_count, 5);

const blockedCore = bundleFixture();
blockedCore.surfaces.insights[0] = field('insights.item', 'insight_core_1', 'incomplete');
const stillBlocked = guard.repairAnalysisBundle(blockedCore, { sourceText, semanticDocument: blockedCore.semantic_document });
assert.equal(stillBlocked.status, 'incomplete');
assert.ok(stillBlocked.quality.blocking_field_ids.includes('insight_core_1'));

const noSynthesis = bundleFixture();
noSynthesis.semantic_document.synthesis_gate.status = 'not_run';
noSynthesis.semantic_document.synthesis_gate.approved_count = 0;
const synthesisBlocked = guard.repairAnalysisBundle(noSynthesis, { sourceText, semanticDocument: noSynthesis.semantic_document });
assert.equal(synthesisBlocked.status, 'incomplete');
assert.ok(synthesisBlocked.quality.reasons.includes('authoritative_semantic_synthesis_not_ready'));

(async () => {
  const calls = [];
  context.AHASemanticDocument = { sha256Hex: () => 'a'.repeat(64) };
  context.AHAInsightQualityGateV2 = { evaluateCandidate() {} };
  context.AHALiveSemanticBridgeV2 = {
    build({ payload }) {
      const repaired = payload.insightCandidatesV2.some((item) => item.summary === 'repaired candidate');
      return {
        synthesis_gate: {
          candidate_count: payload.insightCandidatesV2.length,
          approved_count: repaired ? 1 : 0
        },
        candidate_insights: payload.insightCandidatesV2.map(() => ({
          status: repaired ? 'approved' : 'blocked',
          blocking_reasons: repaired ? [] : ['evidence_not_cross_claim', 'why_it_matters_weak']
        }))
      };
    }
  };
  const provider = guard.wrapInsightPipeline({
    create() {
      return {
        async generateAIInsightCandidates(value, nextContext) {
          calls.push({ value, nextContext });
          return [{ summary: nextContext.authoritative_quality_retry ? 'repaired candidate' : 'candidate' }];
        }
      };
    }
  });
  const pipeline = provider.create({});
  const result = await pipeline.generateAIInsightCandidates(sourceText, { caller: 'regression' });
  assert.equal(result[0].summary, 'repaired candidate');
  assert.equal(calls.length, 2, 'an all-blocked authoritative probe gets exactly one bounded repair attempt');
  assert.ok(calls.every((item) => item.value.length <= guard.longSourceLimit));
  assert.equal(calls[0].nextContext.caller, 'regression');
  assert.equal(calls[0].nextContext.semantic_source_focus.require_cross_section_semantic_diversity, true);
  assert.ok(calls[0].nextContext.semantic_source_focus.academic_roles_present.includes('method'));
  assert.equal(calls[0].nextContext.semantic_source_focus.authoritative_gate_contract.minimum_exact_evidence_quotes, 2);
  assert.deepEqual(Array.from(calls[1].nextContext.authoritative_quality_retry.blocking_reasons), [
    'evidence_not_cross_claim', 'why_it_matters_weak'
  ]);
  assert.equal(calls[1].nextContext.authoritative_quality_retry.attempt, 1);

  const breadthCalls = [];
  context.AHALiveSemanticBridgeV2 = {
    build({ payload }) {
      return {
        synthesis_gate: {
          candidate_count: payload.insightCandidatesV2.length,
          approved_count: payload.insightCandidatesV2.length
        },
        candidate_insights: payload.insightCandidatesV2.map(() => ({ status: 'approved', blocking_reasons: [] }))
      };
    }
  };
  const breadthProvider = guard.wrapInsightPipeline({
    create() {
      return {
        reviewInsightCandidates(items) { return { selected: items }; },
        async generateAIInsightCandidates(value, nextContext) {
          breadthCalls.push({ value, nextContext });
          return nextContext.authoritative_quality_retry
            ? [{ summary: 'second approved relation', type: 'boundary' }]
            : [{ summary: 'first approved relation', type: 'tension' }];
        }
      };
    }
  });
  const breadthPipeline = breadthProvider.create({});
  const breadthResult = await breadthPipeline.generateAIInsightCandidates(
    'Første kildepåstand avgrenser et felles begrep. Andre kildepåstand viser en annen relasjon til det samme begrepet.',
    {}
  );
  assert.equal(breadthCalls.length, 2, 'one approved candidate gets exactly one bounded projection-breadth attempt');
  assert.equal(breadthCalls[1].nextContext.authoritative_quality_retry.mode, 'projection_diversity_expansion');
  assert.equal(breadthCalls[1].nextContext.authoritative_quality_retry.required_total_approved_count, 2);
  assert.deepEqual(Array.from(breadthCalls[1].nextContext.authoritative_quality_retry.covered_primary_types), ['tension']);
  assert.deepEqual(Array.from(breadthResult.map((item) => item.summary)), ['first approved relation', 'second approved relation']);

  const accumulatedCalls = [];
  const accumulatedProvider = guard.wrapInsightPipeline({
    create() {
      return {
        reviewInsightCandidates(items) {
          const seen = new Set();
          return {
            selected: items.filter((item) => {
              const key = String(item.summary || '').toLowerCase();
              if (!key || seen.has(key)) return false;
              seen.add(key);
              return true;
            })
          };
        },
        async generateAIInsightCandidates(value, nextContext) {
          accumulatedCalls.push({ value, nextContext });
          if (!nextContext.authoritative_quality_retry) return [{ summary: 'first approved relation', type: 'tension' }];
          if (nextContext.authoritative_quality_retry.attempt === 1) return [{ summary: 'first approved relation', type: 'tension' }];
          return [{ summary: 'second approved relation', type: 'boundary' }];
        }
      };
    }
  });
  const accumulatedResult = await accumulatedProvider.create({}).generateAIInsightCandidates(
    'Første kildepåstand avgrenser et felles begrep. Andre kildepåstand viser en annen relasjon til det samme begrepet.',
    {}
  );
  assert.equal(accumulatedCalls.length, 3, 'the bounded diversity phase retries only while distinct approved breadth is still missing');
  assert.equal(accumulatedCalls[1].nextContext.authoritative_quality_retry.attempt, 1);
  assert.equal(accumulatedCalls[2].nextContext.authoritative_quality_retry.attempt, 2);
  assert.deepEqual(
    Array.from(accumulatedCalls[2].nextContext.authoritative_quality_retry.avoid_repeating_insights),
    ['first approved relation']
  );
  assert.deepEqual(Array.from(accumulatedResult.map((item) => item.summary)), ['first approved relation', 'second approved relation']);
  console.log('AHA V2 semantic salience and optional-readiness regression passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
