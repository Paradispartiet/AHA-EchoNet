const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
function makeContext(extra={}){const store=new Map(); const context={console,Date,Math,JSON,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},...extra}; context.window=context; context.globalThis=context; vm.createContext(context); return {context,store};}
function run(file, context){vm.runInContext(fs.readFileSync(file,"utf8"), context, {filename:file});}
function rich(){return makeContext({
  AHAMetaInsightsAgent:{buildAgentContext:()=>({})},
  AHAMetaInsightsMemory:{summarizeMemory:()=>({confirmedClaims:[{claimText:"AHA bygger personlige prosjekter"}],importantClaims:[]}),buildMemoryPack:()=>({})},
  AHATrainingCorpus:{collectCorpusStats:()=>({total:1,approved:1}),loadCorpus:()=>[{id:"c1",title:"AHA prosjekt",text:"AHA prosjekt lokal kunnskap",status:"approved",consent:{useForKnowledge:true}}]},
  AHATrainingExamples:{collectExampleStats:()=>({total:1,approved:1}),loadExamples:()=>[{id:"e1",input:"Hva er AHA?",output:"AHA er personlig AI.",status:"approved"}]},
  AHAPersonalModelReadiness:{buildReadinessReport:()=>({score:70,level:"klar for RAG",summary:"klar",generatedAt:"2026-06-22T00:00:00.000Z",corpus:{approved:1},examples:{approved:1}}),buildCompactPack:r=>r},
  AHAChatPersonalContext:{getPersonalContextStatus:()=>({available:true,approvedCorpus:1,approvedExamples:1,confirmedClaims:1}),buildMessageContext:(q)=>({query:q,status:{available:true}})},
  AHAPersonalRetrieval:{getRetrievalStatus:()=>({available:false,indexedItems:0}),buildRagContext:(q)=>({query:q,results:[]}),refreshRetrievalIndex:()=>({stats:{total:2}})},
  AHASemanticRetrieval:{getSemanticStatus:()=>({available:false,indexedItems:0}),buildSemanticRagContext:(q)=>({query:q,results:[]}),refreshSemanticIndex:()=>({stats:{total:2}})},
  AHAPersonalAiLoopAudit:{loadLastAudit:()=>null,runAudit:()=>({status:"working",score:80})},
  AHAPersonalAnswerComposer:{buildAnswerPackage:(q)=>({generatedAt:"2026-06-22T00:00:00.000Z",status:{ready:true,intent:"project_status",selectedSourceCount:1},context:{selectedSources:[{title:"AHA",source:"training_corpus"}]},localPreview:{summary:"Status: AHA har personlig grunnlag.",bullets:["Neste steg: test"],nextStep:"Åpne chat"}}),composeLocalAnswerPreview:p=>p.localPreview},
  AHAPersonalAnswerEvaluation:{collectEvaluationStats:()=>({total:0,averageScore:0}),evaluateAnswer:()=>({status:"good",score:72,summary:"ok"}),saveEvaluation:e=>e}
});}

{ const {context}=makeContext(); run("js/ahaPersonalAiControl.js", context); const s=context.AHAPersonalAiControl.buildControlStatus({save:false}); assert.equal(s.overall.status,"empty"); assert.equal(s.modules.trainingCorpus.available,false); }
{ const {context}=rich(); run("js/ahaPersonalAiControl.js", context); const m=context.AHAPersonalAiControl.collectModuleStatus(); assert.equal(m.metaInsightsMemory.available,true); assert.equal(m.personalAnswerComposer.available,true); }
{ const {context}=rich(); run("js/ahaPersonalAiControl.js", context); const s=context.AHAPersonalAiControl.buildControlStatus({save:false}); assert.ok(s.recommendations.some(r=>r.includes("søkeindeks"))); assert.equal(context.AHAPersonalAiControl.getNextAction(s).id,"build_retrieval_index"); }
{ const {context}=rich(); run("js/ahaPersonalAiControl.js", context); const h=context.AHAPersonalAiControl.runQuickHealthCheck(); assert.equal(typeof h.score,"number"); assert.ok(h.findings.length); }
{ const {context}=rich(); run("js/ahaPersonalAiControl.js", context); const r=context.AHAPersonalAiControl.runFullControlTest(); assert.ok(r.query.includes("viktigste prosjekter")); assert.equal(r.answerEvaluation.score,72); }
{ const {context}=rich(); run("js/ahaPersonalAiControl.js", context); const s=context.AHAPersonalAiControl.buildControlStatus({save:false}); context.AHAPersonalAiControl.saveLastControlStatus(s); assert.equal(context.AHAPersonalAiControl.loadLastControlStatus().overall.score, s.overall.score); }

const personalHtml=fs.readFileSync("personal-ai.html","utf8");
["js/metaInsightsMemory.js","js/metaInsightsAgent.js","js/ahaTrainingCorpus.js","js/ahaTrainingExamples.js","js/ahaPersonalModelReadiness.js","js/ahaChatPersonalContext.js","js/ahaPersonalRetrieval.js","js/ahaSemanticRetrieval.js","js/ahaPersonalAiLoopAudit.js","js/ahaPersonalAnswerComposer.js","js/ahaPersonalAnswerEvaluation.js","js/ahaPersonalAiControl.js","js/ahaPersonalAiDashboard.js"].forEach(src=>assert.ok(personalHtml.includes(src), src));
assert.ok(fs.readFileSync("js/ahaPersonalAiDashboard.js","utf8").includes("personal-ai-overall"));
assert.ok(fs.readFileSync("js/ahaModules.js","utf8").includes('id: "personal-ai"'));
assert.ok(fs.readFileSync("training.html","utf8").includes("personal-ai.html"));
assert.ok(fs.readFileSync("js/metaInsightsAgent.js","utf8").includes("personalAiControlPack"));
assert.ok(fs.readFileSync("js/ahaPersonalAiLoopAudit.js","utf8").includes("controlPanel"));
console.log("aha-personal-ai-control tests passed");
