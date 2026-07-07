const assert=require('assert'),fs=require('fs'),vm=require('vm');
function run(file,c){vm.runInNewContext(fs.readFileSync(file,'utf8'),c,{filename:file});}
function store(){const m={};return{getItem:k=>Object.prototype.hasOwnProperty.call(m,k)?m[k]:null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>delete m[k],_m:m};}
let c={window:null,globalThis:null,console,localStorage:store(),document:null}; c.window=c;c.globalThis=c;
assert.ok(fs.existsSync('js/ahaDailyOperatingLoop.js'));
['js/ahaDataIntake.js','js/ahaKnowledgeCuration.js','js/ahaKnowledgeMap.js','js/ahaKnowledgeGraphIntelligence.js','js/ahaTrainingCorpus.js','js/ahaTrainingExamples.js','js/ahaChatPersistence.js','js/ahaPersonalAnswerEvaluation.js','js/ahaKnowledgeWorkflowAudit.js','js/ahaKnowledgeWorkbench.js','js/ahaLocalInsightHome.js','js/ahaDailyOperatingLoop.js'].forEach(f=>run(f,c));
assert.ok(c.AHADailyOperatingLoop);
let status=c.AHADailyOperatingLoop.buildDailyLoopStatus({save:false,now:'2026-07-07T08:00:00.000Z'});
assert.ok(status.status); assert.ok(status.nextBestAction); assert.equal(status.meta.counts.chatMessages,0);
let counts=c.AHADailyOperatingLoop.collectDailyCounts(); assert.equal(counts.chatMessages,0); assert.equal(counts.intakeReview,0);
const changed=c.AHADailyOperatingLoop.detectChangedSinceLastRun({meta:{counts:{chatMessages:2,intakeReview:1,graphInsights:1},workflowStatus:'working',primaryAction:'A'}},{meta:{counts:{chatMessages:1,intakeReview:0,graphInsights:0},workflowStatus:'empty',primaryAction:'B'}});
assert.ok(changed.changed); assert.ok(changed.changes.find(x=>x.id==='chatMessages')); assert.ok(changed.changes.find(x=>x.id==='intakeReview')); assert.ok(changed.changes.find(x=>x.id==='graphInsights'));
assert.equal(c.AHADailyOperatingLoop.buildNextBestAction({meta:{counts:{workflowScore:0}}}).id,'run_workflow_audit');
assert.equal(c.AHADailyOperatingLoop.buildNextBestAction({meta:{counts:{workflowScore:90,intakeReview:2},workflowStatus:'strong',mapNodes:1}}).id,'review_data_intake');
assert.equal(c.AHADailyOperatingLoop.buildNextBestAction({meta:{counts:{workflowScore:90,curationReview:2},workflowStatus:'strong',mapNodes:1}}).id,'approve_curation');
assert.equal(c.AHADailyOperatingLoop.buildNextBestAction({meta:{counts:{workflowScore:90},workflowStatus:'strong',mapNodes:4}}).id,'run_graph_intelligence');
const prompts=c.AHADailyOperatingLoop.buildSuggestedPrompts({meta:{counts:{trainingReady:1}}}); assert.ok(prompts.length>=3&&prompts.length<=6); assert.ok(prompts.every(p=>p.href==='chat.html'&&/[æøåAHA]/i.test(p.prompt)));
const queue=c.AHADailyOperatingLoop.buildActionQueue({meta:{counts:{workflowScore:90,intakeReview:1,curationReview:1},workflowStatus:'strong',mapNodes:1}}); assert.ok(queue.length>=3); assert.equal(queue[0].id,'review_data_intake');
const before=JSON.stringify(c.localStorage._m); c.AHADailyOperatingLoop.refreshDailyLoop({save:false}); assert.equal(JSON.stringify(c.localStorage._m),before);
const html=fs.readFileSync('index.html','utf8'); assert.ok(html.includes('js/ahaDailyOperatingLoop.js')); assert.ok(html.includes('Dagens AHA-løype')); assert.ok(html.includes('aha-local-home-daily-loop'));
const homeDash=fs.readFileSync('js/ahaLocalInsightHomeDashboard.js','utf8'); assert.ok(homeDash.includes('nextBestAction')); assert.ok(homeDash.includes('suggestedPrompts'));
const chat=fs.readFileSync('chat.html','utf8'); assert.ok(chat.includes('Dagens AHA-løype')); assert.ok(chat.includes('data-daily-prompt')); assert.ok(!chat.includes('btn-send.click()'));
const wb=fs.readFileSync('knowledge-workbench.html','utf8')+fs.readFileSync('js/ahaKnowledgeWorkbenchDashboard.js','utf8'); assert.ok(wb.includes('workbench-daily-loop')); assert.ok(wb.includes('Dette er neste steg i daglig løype.'));
assert.ok(fs.readFileSync('js/ahaProductIntegration.js','utf8').includes('dailyOperatingLoop'));
assert.ok(fs.readFileSync('js/ahaPersonalAiControl.js','utf8').includes('dailyOperatingLoop'));
assert.ok(fs.readFileSync('js/metaInsightsAgent.js','utf8').includes('dailyOperatingLoopPack'));
const dailyCopy=['Dagens AHA-løype','Neste beste handling','currentFocus','changedSinceLastRun'].join(' '); ['payload','undefined','[object Object]','localStorage key'].forEach(word=>assert.ok(!dailyCopy.includes(word),word));
['scanExistingSources','approveForTrainingCorpus','approveCurationItem','sendToTrainingCorpus','appendUserMessage','appendAssistantMessage'].forEach(mut=>assert.ok(!fs.readFileSync('js/ahaDailyOperatingLoop.js','utf8').includes(mut),mut));
console.log('aha-daily-operating-loop tests passed');
