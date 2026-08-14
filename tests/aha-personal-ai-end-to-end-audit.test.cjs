const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function makeContext() {
  const store = new Map();
  const context = {
    console,
    Date,
    Math,
    JSON,
    Map,
    Set,
    Array,
    Object,
    String,
    Number,
    localStorage: {
      getItem(key) { return store.get(key) || null; },
      setItem(key, value) { store.set(key, String(value)); },
      removeItem(key) { store.delete(key); }
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  return { context, store };
}

function run(file, context) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { context } = makeContext();
[
  'js/metaInsightsMemory.js',
  'js/ahaTrainingCorpus.js',
  'js/ahaTrainingExamples.js',
  'js/ahaPersonalModelReadiness.js',
  'js/ahaPersonalRetrieval.js',
  'js/ahaSemanticRetrieval.js',
  'js/ahaChatPersonalContext.js',
  'js/ahaPersonalAnswerComposer.js',
  'js/ahaPersonalAnswerEvaluation.js',
  'js/ahaPersonalAiLoopAudit.js',
  'js/ahaPersonalAiControl.js',
  'js/ahaPersonalAiSelfKnowledge.js'
].forEach((file) => run(file, context));

// 1. Start with real user-confirmed Meta Insights Memory.
context.AHAMetaInsightsMemory.addFeedback({
  claimId: 'claim-confirmed',
  claimText: 'AHA-EchoNet er mitt aktive prosjekt for personlig innsikt og Personal AI.',
  response: 'stemmer',
  basis: ['PRIVATE CONFIRMED BASIS'],
  confidence: 0.96
});
context.AHAMetaInsightsMemory.addFeedback({
  claimId: 'claim-important',
  claimText: 'Tydelig kildegrunnlag i AHA-svar er viktig for meg.',
  response: 'viktig',
  confidence: 0.91
});
context.AHAMetaInsightsMemory.addFeedback({
  claimId: 'claim-rejected',
  claimText: 'REJECTED PERSONAL CLAIM MUST NOT BE USED',
  response: 'feil',
  confidence: 0.99
});

// 2. Add real approved/rejected corpus through the production Training APIs.
const approvedCorpus = context.AHATrainingCorpus.addCorpusItem({
  id: 'corpus-approved',
  title: 'AHA Personal AI arkitektur',
  text: 'AHA-EchoNet kobler Meta Insights Memory, personlig retrieval, semantic retrieval, Answer Composer og Answer Evaluation i en lokal Personal AI-sløyfe.',
  status: 'approved',
  project: 'AHA-EchoNet',
  concepts: ['Personal AI', 'retrieval', 'Answer Composer', 'Answer Evaluation'],
  consent: {
    useForKnowledge: true,
    useForMemory: true,
    useForTrainingExamples: true,
    useForFineTuning: false,
    useForStyle: false
  }
});
context.AHATrainingCorpus.addCorpusItem({
  id: 'corpus-rejected',
  title: 'REJECTED CORPUS TITLE',
  text: 'REJECTED CORPUS BODY MUST NOT ENTER PERSONAL AI',
  status: 'rejected',
  consent: { useForKnowledge: true, useForMemory: true, useForTrainingExamples: true }
});
context.AHATrainingCorpus.addCorpusItem({
  id: 'corpus-no-consent',
  title: 'NO CONSENT CORPUS TITLE',
  text: 'APPROVED BUT NOT CONSENTED FOR PERSONAL KNOWLEDGE',
  status: 'approved',
  consent: { useForKnowledge: false, useForMemory: false, useForTrainingExamples: true }
});

const approvedExample = context.AHATrainingExamples.addExample({
  id: 'example-approved',
  corpusItemId: approvedCorpus.id,
  taskType: 'project_explanation',
  input: 'Hvordan fungerer AHA Personal AI?',
  output: 'AHA bruker bare godkjent personlig grunnlag, finner relevante kilder og evaluerer hvor tydelig de brukes i svaret.',
  status: 'approved',
  language: 'no',
  meta: { project: 'AHA-EchoNet', concepts: ['Personal AI', 'retrieval'] }
});
context.AHATrainingExamples.addExample({
  id: 'example-rejected',
  corpusItemId: approvedCorpus.id,
  taskType: 'project_explanation',
  input: 'REJECTED EXAMPLE INPUT',
  output: 'REJECTED EXAMPLE OUTPUT',
  status: 'rejected',
  language: 'no'
});

// 3. Build the production lexical + semantic indexes from those approved sources.
const lexicalIndex = context.AHAPersonalRetrieval.refreshRetrievalIndex({ now: '2026-08-11T10:00:00.000Z' });
const semanticIndex = context.AHASemanticRetrieval.refreshSemanticIndex({ now: '2026-08-11T10:00:00.000Z' });
assert.ok(lexicalIndex.items.some((item) => item.sourceId === 'corpus-approved'));
assert.ok(lexicalIndex.items.some((item) => item.sourceId === approvedExample.id));
assert.ok(!lexicalIndex.items.some((item) => ['corpus-rejected', 'corpus-no-consent', 'example-rejected'].includes(item.sourceId)));
assert.ok(semanticIndex.items.length > 0);

const query = 'Hvor står AHA-EchoNet Personal AI med retrieval, Answer Composer og Answer Evaluation?';

// 4. The real Chat Personal Context must retrieve approved personal material for this message.
const messageContext = context.AHAChatPersonalContext.buildMessageContext(query);
assert.equal(messageContext.local_only, true);
assert.equal(messageContext.context_only, true);
assert.ok(messageContext.prompt.includes('AHA'));
assert.ok(messageContext.retrieval && messageContext.retrieval.results.length > 0);
assert.doesNotMatch(JSON.stringify(messageContext), /REJECTED CORPUS|NO CONSENT CORPUS|REJECTED EXAMPLE/);

// 5. The real Answer Composer must turn the same message into a grounded answer package.
const answerPackage = context.AHAPersonalAnswerComposer.buildAnswerPackage(query, { limit: 6 });
assert.equal(answerPackage.local_only, true);
assert.equal(answerPackage.preview_only, true);
assert.equal(answerPackage.calls_model_api, false);
assert.equal(answerPackage.status.ready, true);
assert.ok(answerPackage.context.selectedSources.length > 0);
assert.ok(answerPackage.prompt.includes('AHA Personal Answer Composer'));
assert.doesNotMatch(answerPackage.prompt, /REJECTED CORPUS|NO CONSENT CORPUS|REJECTED EXAMPLE/);

// 6. A real Answer Evaluation must identify visible personal grounding in a plausible answer.
const topSource = answerPackage.context.selectedSources[0];
const answerText = [
  'Status: AHA Personal AI bruker personlig grunnlag fra godkjent materiale.',
  topSource.title,
  topSource.project || 'AHA-EchoNet',
  ...(Array.isArray(topSource.concepts) ? topSource.concepts.slice(0, 3) : []),
  'Neste steg: bruk Chat med et konkret prosjektspørsmål og kontroller Personlig grunnlag under svaret.'
].filter(Boolean).join(' ');
const evaluation = context.AHAPersonalAnswerEvaluation.evaluateAnswer(query, answerText, answerPackage, { now: '2026-08-11T10:01:00.000Z' });
assert.ok(evaluation.score > 0);
assert.ok(evaluation.sourceUse.usedSources.length > 0, 'evaluation should identify at least one selected source as visibly used');
assert.ok(evaluation.dimensions.sourceGrounding.score > 0);
assert.ok(evaluation.dimensions.personalRelevance.score > 0);
assert.equal(evaluation.local_only, true);
assert.equal(evaluation.evaluation_only, true);
assert.equal(evaluation.calls_model_api, false);
assert.equal(evaluation.backend_enabled, false);
assert.equal(evaluation.writes_to_insight_chamber, false);
assert.ok(Array.isArray(evaluation.evidence.selectedSources));
assert.equal(evaluation.evidence.answerIntent, answerPackage.context.answerIntent);
assert.equal(Object.prototype.hasOwnProperty.call(evaluation.evidence, 'answerPackage'), false,
  'saved evaluation evidence should not duplicate the whole answer package');

// 7. The real self-knowledge display model must reflect safe memory buckets, not rejected content or private feedback internals.
const selfKnowledge = context.AHAPersonalAiSelfKnowledge.buildSelfKnowledgeModel();
assert.ok(selfKnowledge.confirmed.includes('AHA-EchoNet er mitt aktive prosjekt for personlig innsikt og Personal AI.'));
assert.ok(selfKnowledge.important.includes('Tydelig kildegrunnlag i AHA-svar er viktig for meg.'));
assert.equal(selfKnowledge.excluded.rejectedCount, 1);
assert.equal(selfKnowledge.local_only, true);
assert.equal(selfKnowledge.read_only, true);
assert.doesNotMatch(JSON.stringify(selfKnowledge), /REJECTED PERSONAL CLAIM|PRIVATE CONFIRMED BASIS|claim-confirmed|claim-important|claim-rejected/);

// 8. The real loop audit/control status must see the same chain as healthy/working.
const audit = context.AHAPersonalAiLoopAudit.runAudit({ query, now: '2026-08-11T10:02:00.000Z' });
assert.ok(['working', 'strong'].includes(audit.status), `unexpected audit status ${audit.status}`);
const control = context.AHAPersonalAiControl.buildControlStatus({ save: false, now: '2026-08-11T10:03:00.000Z' });
assert.ok(['working', 'strong'].includes(control.overall.status), `unexpected Personal AI status ${control.overall.status}`);
assert.equal(control.local_only, true);
assert.equal(control.calls_model_api, false);
assert.equal(control.backend_enabled, false);
assert.equal(control.sync_enabled, false);
assert.equal(control.echonet_shared, false);
assert.equal(control.historygo_writeback_enabled, false);

// 9. Lock the production Chat wiring that hands this package to the answer path and evaluates the resulting response.
const chatCode = fs.readFileSync('js/ahaChatInsightPipeline.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatAgentRuntime.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatIngestRuntime.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatPersonalUi.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatConversationView.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatAnalysisRunContract.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatAcademicInsightView.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatUiRuntime.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatRuntimeFacade.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatRuntimeComposition.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChat.js', 'utf8');
const submissionCode = fs.readFileSync('js/ahaChatRunContext.js', 'utf8');
const chatWiringCode = `${chatCode}\n${submissionCode}`;
for (const required of [
  'buildAhaPersonalMessageContext',
  'buildAhaAnswerPackage',
  'personalContext.answerPackage = answerPackage',
  'answer_composer_prompt',
  'personal_context',
  'evaluateAhaAnswerForChat'
]) {
  assert.ok(chatWiringCode.includes(required), `Chat must retain Personal AI wiring: ${required}`);
}
assert.ok(
  chatWiringCode.indexOf('buildAhaPersonalMessageContext') < chatWiringCode.lastIndexOf('personal_context'),
  'Chat must build personal context before sending personal_context'
);

// 10. Lock the two user-facing Personal AI surfaces now completing the loop.
const personalHtml = fs.readFileSync('personal-ai.html', 'utf8');
assert.ok(personalHtml.includes('js/ahaPersonalAiDashboard.js'));
assert.ok(personalHtml.includes('js/ahaPersonalAiSelfKnowledge.js'));
assert.ok(personalHtml.includes('Dette vet AHA om deg'));
const feedbackCode = fs.readFileSync('js/ahaChatInsightFeedback.js', 'utf8');
assert.ok(feedbackCode.includes('buildPersonalAnswerTransparency'));
assert.ok(feedbackCode.includes('Personlig grunnlag'));

console.log('aha-personal-ai-end-to-end-audit.test.cjs passed');
