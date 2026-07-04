const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function storage(seed={}){const s={...seed};return{getItem:k=>Object.prototype.hasOwnProperty.call(s,k)?s[k]:null,setItem:(k,v)=>{s[k]=String(v)},removeItem:k=>delete s[k],dump:()=>({...s})};}
function run(file,c){vm.runInNewContext(fs.readFileSync(file,'utf8'),c,{filename:file});}
function ctx(extra={}){const c={console,Date,Math,JSON,localStorage:storage(),document:null,module:{exports:{}},exports:{},...extra};c.window=c;c.globalThis=c;return c;}

// 1-6. Core audit handles empty stores, modules, storage, consent and simulation.
let c=ctx();
['js/ahaChatPersistence.js','js/ahaSourceConnectors.js','js/ahaDataIntake.js','js/ahaKnowledgeWorkbench.js','js/ahaKnowledgeCuration.js','js/ahaKnowledgeMap.js','js/ahaKnowledgeGraphIntelligence.js','js/ahaTrainingCorpus.js','js/ahaTrainingExamples.js','js/ahaPersonalRetrieval.js','js/ahaSemanticRetrieval.js','js/ahaChatPersonalContext.js','js/ahaPersonalAnswerComposer.js','js/ahaPersonalAnswerEvaluation.js','js/ahaPersonalAiControl.js','js/ahaKnowledgeWorkflowAudit.js'].forEach(f=>run(f,c));
let audit=c.AHAKnowledgeWorkflowAudit.runWorkflowAudit({save:false});
assert.ok(['partial','working','strong','empty'].includes(audit.status));
assert.equal(audit.storage.invalid.length,0);
assert.ok(c.AHAKnowledgeWorkflowAudit.checkStageAvailability().available >= 10);
assert.equal(c.AHAKnowledgeWorkflowAudit.checkStorageKeys().knownKeys.includes('aha_chat_sessions_v1'),true);
assert.equal(c.AHAKnowledgeWorkflowAudit.checkConsentBoundaries().ok,true);
const sim=c.AHAKnowledgeWorkflowAudit.simulateWorkflow();
assert.equal(sim.ok,true);
['chat_message','data_intake','curation','knowledge_map','graph_intelligence','training_corpus','retrieval','semantic_retrieval','answer_package','answer_evaluation'].forEach(id=>assert.ok(sim.steps.some(s=>s.id===id),id));
assert.equal(sim.steps.find(s=>s.id==='answer_evaluation').result.trainingSuggestion.status,'needs_review');

// 7-15. Pages load audit and expose required links.
const pages={
  'index.html':['chat.html','knowledge-workbench.html','intake.html','training.html','personal-ai.html'],
  'knowledge-workbench.html':['js/ahaKnowledgeWorkflowAudit.js','Workflow Audit','intake.html','curation.html','knowledge-map.html','training.html','personal-ai.html','chat.html'],
  'chat.html':['knowledge-workbench.html','training.html','personal-ai.html'],
  'intake.html':['knowledge-workbench.html','curation.html','training.html'],
  'curation.html':['knowledge-workbench.html','knowledge-map.html','training.html'],
  'knowledge-map.html':['knowledge-workbench.html','curation.html','training.html'],
  'training.html':['knowledge-workbench.html','intake.html','curation.html','personal-ai.html','chat.html'],
  'personal-ai.html':['knowledge-workbench.html','training.html','chat.html']
};
for (const [file,needles] of Object.entries(pages)){const html=fs.readFileSync(file,'utf8'); needles.forEach(n=>assert.ok(html.includes(n),`${file} missing ${n}`));}
assert.ok(fs.readFileSync('knowledge-workbench.html','utf8').includes('Kjør trygg workflow-simulering'));

// 9. Workbench page load remains read-only for approvals/imports: no dashboard init action calls mutating approvals.
const dash=fs.readFileSync('js/ahaKnowledgeWorkbenchDashboard.js','utf8');
assert.equal(/function init\(\)\{bind\(\);render\(\);renderResult\(null\);renderWorkflowAudit/.test(dash),true);
assert.equal(/init\(\)[\s\S]{0,160}(approve|sendToTrainingCorpus|importApproved)/.test(dash),false);

// 16-18. Integration surfaces workflowAudit and Meta Insights pack.
assert.ok(fs.readFileSync('js/ahaProductIntegration.js','utf8').includes('workflowAudit'));
assert.ok(fs.readFileSync('js/ahaPersonalAiControl.js','utf8').includes('workflowAudit'));
assert.ok(fs.readFileSync('js/metaInsightsAgent.js','utf8').includes('knowledgeWorkflowAuditPack'));
c=ctx({AHAKnowledgeWorkflowAudit:{runWorkflowAudit:()=>({status:'strong',score:91,stages:{missing:[]},consent:{warnings:[]},recommendations:['Test Chat med kuratert materiale.']})}});
run('js/metaInsightsAgent.js',c);
assert.equal(c.AHAMetaInsightsAgent.buildAgentContext({}).knowledgeWorkflowAuditPack.available,true);

// 19-20. Full mock workflow and consent/approval boundaries are explicit.
c=ctx(); run('js/ahaKnowledgeWorkflowAudit.js',c);
const full=c.AHAKnowledgeWorkflowAudit.simulateWorkflow();
assert.equal(full.ok,true);
assert.ok(c.AHAKnowledgeWorkflowAudit.checkConsentBoundaries().checks.every(x=>x.ok));
console.log('aha-knowledge-workflow-audit tests passed');
