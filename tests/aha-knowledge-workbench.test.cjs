const assert=require('assert'),fs=require('fs'),vm=require('vm');
function run(file,c){vm.runInNewContext(fs.readFileSync(file,'utf8'),c,{filename:file});}
function store(){const m={};return{getItem:k=>m[k]||null,setItem:(k,v)=>{m[k]=String(v)},removeItem:k=>delete m[k],_m:m};}
let c={window:null,globalThis:null,console,localStorage:store(),document:null}; c.window=c;c.globalThis=c;
run('js/ahaDataIntake.js',c);run('js/ahaKnowledgeCuration.js',c);run('js/ahaKnowledgeMap.js',c);run('js/ahaKnowledgeGraphIntelligence.js',c);run('js/ahaTrainingCorpus.js',c);run('js/ahaKnowledgeWorkbench.js',c);
let s=c.AHAKnowledgeWorkbench.buildWorkbenchStatus({save:false}); assert.ok(s.overall); assert.equal(s.counts.intakeTotal,0); assert.equal(c.AHAKnowledgeWorkbench.getPrimaryWorkbenchAction(s).id,'scan_sources');
c.AHADataIntake.addIntakeItem({title:'AHA Workbench test',text:'Dette er testmateriale om prosjekt og konsept.',status:'review',project:'AHA'});
s=c.AHAKnowledgeWorkbench.buildWorkbenchStatus({save:false}); assert.equal(s.counts.intakeTotal,1); assert.equal(c.AHAKnowledgeWorkbench.getPrimaryWorkbenchAction(s).id,'review_intake');
const q=c.AHAKnowledgeCuration.buildCurationItemsFromIntake(); assert.ok(q.created>=1); s=c.AHAKnowledgeWorkbench.buildWorkbenchStatus({save:false}); assert.ok(s.counts.curationTotal>=1);
const wf=c.AHAKnowledgeWorkbench.buildWorkflowState(s); assert.deepEqual(wf.stageCards.map(x=>x.id),['sources','intake','curation','map','graph_intelligence','training','personal_ai','chat']);
assert.ok(c.AHAKnowledgeWorkbench.buildWorkbenchRecommendations(s).length>=3);
const refresh=c.AHAKnowledgeWorkbench.runWorkbenchRefresh(); assert.ok(refresh.ok);
const pipe=c.AHAKnowledgeWorkbench.runWorkbenchPipeline(); assert.ok(pipe.steps.find(x=>x.id==='analyze_graph')); assert.ok(pipe.summary.includes('Ingen approval'));
c.AHAKnowledgeWorkbench.saveWorkbenchStatus(s); assert.ok(c.AHAKnowledgeWorkbench.loadWorkbenchStatus().overall);
const html=fs.readFileSync('knowledge-workbench.html','utf8'); ['js/ahaDataIntake.js','js/ahaSourceConnectors.js','js/ahaKnowledgeWorkbench.js','js/ahaKnowledgeWorkbenchDashboard.js'].forEach(x=>assert.ok(html.includes(x))); assert.ok(html.includes('Workflow board')); assert.ok(html.includes('data-workbench-action="safe_pipeline"'));
['intake.html','curation.html','knowledge-map.html','training.html','personal-ai.html','chat.html'].forEach(f=>assert.ok(fs.readFileSync(f,'utf8').includes('knowledge-workbench.html'),f));
assert.ok(fs.readFileSync('js/ahaModules.js','utf8').includes('id: "knowledge-workbench"'));
assert.ok(fs.readFileSync('js/ahaProductIntegration.js','utf8').includes('knowledgeWorkbench'));
assert.ok(fs.readFileSync('js/ahaPersonalAiControl.js','utf8').includes('knowledgeWorkbench'));
assert.ok(fs.readFileSync('js/metaInsightsAgent.js','utf8').includes('knowledgeWorkbenchPack'));
assert.ok(!fs.readFileSync('js/ahaKnowledgeWorkbenchDashboard.js','utf8').includes('approveCurationItem('));
console.log('aha-knowledge-workbench tests passed');
