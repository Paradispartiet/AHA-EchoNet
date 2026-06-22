const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function makeContext(){
  const store = new Map();
  const context = { console, Date, Math, JSON, Map, Set,
    localStorage:{ getItem:k=>store.get(k)||null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k) }
  };
  context.window = context; context.globalThis = context;
  vm.createContext(context);
  return { context, store };
}
function run(file, context){ vm.runInContext(fs.readFileSync(file,'utf8'), context, { filename:file }); }
function loadPersonalAi(context){[
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
  'js/ahaPersonalAiControl.js'
].forEach(f=>run(f, context)); }

{
  const personalHtml = fs.readFileSync('personal-ai.html','utf8');
  const trainingHtml = fs.readFileSync('training.html','utf8');
  const chatHtml = fs.readFileSync('chat.html','utf8');
  ['js/ahaPersonalAiControl.js','js/ahaPersonalAiDashboard.js','personal-ai-overall'].forEach(s=>assert.ok(personalHtml.includes(s), s));
  ['personal-ai.html','js/ahaPersonalRetrieval.js','js/ahaSemanticRetrieval.js','js/ahaPersonalAiLoopAudit.js','js/ahaPersonalAnswerComposer.js','js/ahaPersonalAnswerEvaluation.js'].forEach(s=>assert.ok(trainingHtml.includes(s), s));
  ['js/ahaChatPersonalContext.js','js/ahaPersonalRetrieval.js','js/ahaSemanticRetrieval.js','js/ahaPersonalAnswerComposer.js','js/ahaPersonalAnswerEvaluation.js','Svargrunnlag','Svar-evaluering'].forEach(s=>assert.ok(chatHtml.includes(s), s));
}

{
  const { context } = makeContext();
  loadPersonalAi(context);
  const empty = context.AHAPersonalAiControl.buildControlStatus({ save:false });
  assert.equal(empty.overall.status, 'starting');
  assert.ok(empty.overall.score < 35, 'empty data stays low even when modules are loaded');
  assert.ok(context.AHAPersonalAiControl.runQuickHealthCheck().findings.length);
}

{
  const { context } = makeContext();
  loadPersonalAi(context);
  context.AHAMetaInsightsMemory.addFeedback({ claimId:'m1', claimText:'AHA-EchoNet er mitt viktigste prosjekt for personlig AI og semantic retrieval.', response:'stemmer', confidence:.95 });
  context.AHAMetaInsightsMemory.addFeedback({ claimId:'m2', claimText:'Answer Composer og Answer Evaluation er viktige i AHA Personal AI V1.', response:'viktig', confidence:.9 });
  const approved = context.AHATrainingCorpus.addCorpusItem({ id:'c-approved', title:'AHA-EchoNet Personal AI grunnlag', text:'AHA-EchoNet bruker Meta Insights Memory, approved corpus, retrieval, semantic retrieval, Answer Composer og Answer Evaluation.', status:'approved', project:'AHA-EchoNet', concepts:['Personal AI','semantic retrieval','Answer Composer'], consent:{ useForKnowledge:true, useForMemory:true, useForTrainingExamples:true, useForFineTuning:true, useForStyle:false } });
  context.AHATrainingCorpus.addCorpusItem({ id:'c-rejected', title:'Skal ikke brukes', text:'rejected confidential material', status:'rejected', consent:{ useForKnowledge:true, useForMemory:true, useForTrainingExamples:true, useForFineTuning:true } });
  context.AHATrainingCorpus.addCorpusItem({ id:'c-no-consent', title:'Mangler kunnskapssamtykke', text:'approved but not for retrieval', status:'approved', consent:{ useForKnowledge:false, useForMemory:false, useForTrainingExamples:true, useForFineTuning:false } });
  const example = context.AHATrainingExamples.addExample({ id:'e-approved', corpusItemId: approved.id, taskType:'project_explanation', input:'Hvordan fungerer AHA Personal AI V1?', output:'AHA Personal AI V1 kobler godkjent minne, corpus, examples, retrieval, composer og evaluation.', status:'approved', language:'no', meta:{ project:'AHA-EchoNet', concepts:['Personal AI','retrieval'] } });
  context.AHATrainingExamples.addExample({ id:'e-rejected', corpusItemId: approved.id, input:'Skal ikke brukes', output:'Rejected example', status:'rejected' });

  const retrievalIndex = context.AHAPersonalRetrieval.refreshRetrievalIndex({ now:'2026-06-22T00:00:00.000Z' });
  assert.ok(retrievalIndex.items.some(i=>i.source==='training_corpus' && i.sourceId==='c-approved'));
  assert.ok(!retrievalIndex.items.some(i=>i.sourceId==='c-rejected' || i.sourceId==='c-no-consent'));
  assert.ok(retrievalIndex.items.some(i=>i.source==='training_examples' && i.sourceId===example.id && i.sourceType==='training_example'));

  const semanticIndex = context.AHASemanticRetrieval.refreshSemanticIndex({ now:'2026-06-22T00:00:00.000Z' });
  assert.ok(semanticIndex.items.every(i=>i.source && i.sourceId !== undefined));
  const semantic = context.AHASemanticRetrieval.buildSemanticRagContext('Hva vet AHA om AHA-EchoNet Personal AI retrieval composer evaluation?', { minScore:0 });
  assert.ok(semantic.results.length > 0);
  assert.ok(semantic.results.every(r=>Array.isArray(r.reasons) && r.source && r.sourceId !== undefined && typeof r.hybridScore === 'number'));

  const audit = context.AHAPersonalAiLoopAudit.runAudit({ query:'Hva vet AHA om AHA-EchoNet Personal AI retrieval composer evaluation?' });
  assert.ok(['working','strong'].includes(audit.status));
  const full = context.AHAPersonalAiControl.runFullControlTest({ query:'Hva vet AHA om AHA-EchoNet Personal AI retrieval composer evaluation?' });
  assert.ok(full.retrieval.results.length > 0);
  assert.ok(full.semanticRetrieval.results.length > 0);
  assert.ok(full.answerPackage.context.selectedSources.length > 0);
  assert.ok(full.answerPackage.context.selectedSources.every(s=>s.source && s.sourceId !== undefined && Array.isArray(s.reasons)));
  assert.ok(full.answerEvaluation.score > 0);
  assert.ok(Array.isArray(full.answerEvaluation.sourceUse.usedSources));
  assert.ok(Array.isArray(full.answerEvaluation.sourceUse.unusedSources));

  const status = context.AHAPersonalAiControl.buildControlStatus({ save:false });
  assert.ok(['working','strong'].includes(status.overall.status), `expected working/strong, got ${status.overall.status} ${status.overall.score}`);
  assert.ok(status.overall.score > emptyScoreFallback());
  const jsonl = context.AHATrainingExamples.exportApprovedExamples('jsonl');
  assert.ok(jsonl.includes('Hvordan fungerer AHA Personal AI V1?'));
  assert.ok(!jsonl.includes('Rejected example'));
}

function emptyScoreFallback(){ return 30; }
console.log('aha-personal-ai-v1-flow tests passed');
