const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
function makeContext(){ const store=new Map(); const ctx={ console, Date, Math, JSON, localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)} }; ctx.window=ctx; ctx.globalThis=ctx; vm.createContext(ctx); return ctx; }
function run(f,ctx){ vm.runInContext(fs.readFileSync(f,"utf8"),ctx,{filename:f}); }
function load(ctx){ ["js/metaInsightsMemory.js","js/ahaTrainingCorpus.js","js/ahaTrainingExamples.js","js/ahaPersonalModelReadiness.js","js/ahaPersonalRetrieval.js","js/ahaSemanticRetrieval.js","js/ahaChatPersonalContext.js","js/ahaPersonalAnswerComposer.js","js/ahaPersonalAnswerEvaluation.js","js/ahaPersonalAiLoopAudit.js","js/metaInsightsAgent.js"].forEach(f=>run(f,ctx)); }
const pack={ context:{ answerIntent:"project_status", answerPlan:{ suggestedFollowup:"Gi ett presist neste steg.", sections:["status","neste steg"] }, selectedSources:[{ source:"meta_insights_memory", sourceId:"c1", sourceType:"confirmed_claim", title:"AHA-EchoNet", excerpt:"AHA-EchoNet bruker Answer Composer og retrieval som personlig grunnlag.", hybridScore:.9, lexicalScore:.4, semanticScore:.8, reasons:["bekreftet selvinnsikt","semantisk nærhet"], project:"AHA-EchoNet", concepts:["Answer Composer","retrieval"] }], personalContext:{ context:{ projects:[{label:"AHA-EchoNet"}], activeSelfModel:{ confirmedClaims:["AHA-EchoNet er et viktig prosjekt"] } } } }, status:{ intent:"project_status", ready:true, selectedSourceCount:1, hasRetrieval:true, hasSemanticRetrieval:true } };
const answer="Status: AHA-EchoNet bruker personlig grunnlag fra Answer Composer og retrieval. Vurdering: kilden er relevant fordi den er bekreftet selvinnsikt. Neste steg: Gi ett presist neste steg.";
{
 const ctx=makeContext(); load(ctx); const api=ctx.AHAPersonalAnswerEvaluation;
 const input=api.buildEvaluationInput("Hvor er vi med AHA-EchoNet?", answer, pack); assert.equal(input.version,"v1"); assert.equal(input.selectedSources.length,1); assert.equal(input.evaluationCriteria.intentAlignment,true);
 const empty=api.evaluateAnswer("x","",pack); assert.equal(empty.status,"empty");
 assert.ok(api.evaluateIntentAlignment("status", answer, "project_status", pack.context.answerPlan).score>=80);
 assert.equal(api.evaluateSourceGrounding(answer, input.selectedSources).usedSources.length,1);
 assert.ok(api.evaluatePersonalRelevance(answer, pack).matchedPersonalSignals.includes("AHA-EchoNet"));
 assert.ok(api.evaluateTransparency("Basert på personlig grunnlag og kilder: status, vurdering og neste steg.", pack).score > api.evaluateTransparency("Kort svar.", pack).score);
 assert.equal(api.evaluateNextStep(answer, pack.context.answerPlan).nextStepFound,true);
 const evaln=api.evaluateAnswer("Hvor er vi med AHA-EchoNet?", answer, pack); assert.ok(evaln.score>=80); assert.ok(api.buildImprovementSuggestions(evaln).length>=2);
 const sug=api.buildTrainingSuggestion("Hvor er vi?", answer, evaln, pack); assert.equal(sug.shouldCreateExample,true); assert.equal(sug.draftExample.status,"needs_review");
 api.saveEvaluation(evaln); assert.equal(api.loadEvaluations().length,1); const stats=api.collectEvaluationStats(); assert.equal(stats.total,1); assert.ok(stats.averageScore>0);
 const audit=ctx.AHAPersonalAiLoopAudit.runAudit(); assert.ok(audit.answerEvaluation.available); assert.ok(audit.checks.answerEvaluation.ready);
 const agent=ctx.AHAMetaInsightsAgent.buildAgentContext({ meta_insight:{}, temporal:{} }); assert.ok(agent.answerEvaluationPack.available);
}
{
 const chatHtml=fs.readFileSync("chat.html","utf8"), chatJs=fs.readFileSync("js/ahaChat.js","utf8"), training=fs.readFileSync("training.html","utf8"), dashboard=fs.readFileSync("js/ahaTrainingDashboard.js","utf8");
 assert.ok(chatHtml.includes("js/ahaPersonalAnswerEvaluation.js")); assert.ok(chatJs.includes("Svar-evaluering")); assert.ok(chatJs.includes("Lagre som training example"));
 assert.ok(training.includes("Answer Evaluation")); assert.ok(dashboard.includes("renderAnswerEvaluation")); assert.ok(fs.readFileSync("js/ahaPersonalAiLoopAudit.js","utf8").includes("answerEvaluation")); assert.ok(fs.readFileSync("js/metaInsightsAgent.js","utf8").includes("answerEvaluationPack"));
}
console.log("aha-personal-answer-evaluation tests passed");
