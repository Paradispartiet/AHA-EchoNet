const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
function ctx(){const store={};return {console,window:null,globalThis:null,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]},document:null};}
function run(file,c){c.window=c;c.globalThis=c;vm.runInNewContext(fs.readFileSync(file,'utf8'),c,{filename:file});}
function sampleMap(){return {nodes:[
{id:'p1',nodeType:'project',label:'AHA',project:'AHA',concepts:[]},{id:'p2',nodeType:'project',label:'Weak',project:'Weak',concepts:[]},
{id:'c1',nodeType:'concept',label:'Data Intake',concepts:['Data Intake']},{id:'c2',nodeType:'concept',label:'Memory',concepts:['Memory']},
{id:'i1',nodeType:'curation_item',label:'AHA intake note',project:'AHA',concepts:['Data Intake'],weight:2,summary:'Jeg foretrekker Data Intake beslutning'},
{id:'i2',nodeType:'training_corpus_item',label:'Corpus AHA',project:'AHA',concepts:['Data Intake'],meta:{curationItemId:'i1'}},
{id:'e1',nodeType:'training_example',label:'Explain intake',concepts:['Data Intake'],meta:{corpusItemId:'i2'}},
{id:'m1',nodeType:'memory_claim',label:'AHA decision',concepts:['Memory'],summary:'viktig beslutning'},
{id:'iso',nodeType:'person',label:'Oslo artist',entities:['Oslo','artist']},
{id:'w1',nodeType:'curation_item',label:'Weak note',project:'Weak',concepts:['Memory'],summary:'artist place Oslo'}],edges:[
{id:'e-p1-i1',from:'i1',to:'p1',relationType:'belongs_to_project'},{id:'e-i1-c1',from:'i1',to:'c1',relationType:'has_concept'},{id:'e-i2-p1',from:'i2',to:'p1',relationType:'belongs_to_project'},{id:'e-i2-c1',from:'i2',to:'c1',relationType:'has_concept'},{id:'e-e1-i2',from:'e1',to:'i2',relationType:'training_example_for'},{id:'e-p1-c1',from:'p1',to:'c1',relationType:'related_to'},{id:'e-w1-p2',from:'w1',to:'p2',relationType:'belongs_to_project'}],stats:{nodes:10,edges:7,projects:2,concepts:2}}}
const c=ctx(); run('js/ahaKnowledgeGraphIntelligence.js',c); const api=c.AHAKnowledgeGraphIntelligence;
assert.ok(api);
c.AHAKnowledgeMap={loadKnowledgeMap:()=>({nodes:[],edges:[],stats:{nodes:0,edges:0}}),buildKnowledgeMap:()=>({nodes:[],edges:[],stats:{nodes:0,edges:0}}),collectMapStats:m=>m.stats||{nodes:m.nodes.length,edges:m.edges.length}};
assert.equal(api.analyzeKnowledgeGraph({save:false}).status,'empty');
const map=sampleMap();
const ps=api.analyzeProjectStrength(map); assert.ok(ps.projectScores[0].score>ps.projectScores[1].score); assert.ok(ps.weakProjects.some(p=>p.project==='Weak'));
const cc=api.analyzeConceptCentrality(map); assert.ok(cc.centralConcepts.some(c=>c.concept==='Data Intake'));
assert.ok(api.findIsolatedNodes(map).isolatedNodes.some(n=>n.id==='iso'));
assert.ok(api.suggestMissingLinks(map).suggestedLinks.some(l=>l.reason));
assert.ok(api.detectKnowledgeGaps(map).gaps.some(g=>g.gapType.includes('project_without')));
assert.ok(api.findTrainingOpportunities(map).opportunities.length);
assert.ok(api.findMemoryOpportunities(map).opportunities.every(o=>o.status==='needs_confirmation'));
assert.ok(api.findHistoryGoMusicOpportunities(map).historyGoOpportunities.length);
const analysis=api.analyzeKnowledgeGraph({map,save:false}); assert.ok(analysis.insights.length>=5); assert.ok(analysis.recommendations.length>=3);
api.saveAnalysis(analysis); assert.equal(api.loadAnalysis().generatedAt,analysis.generatedAt); const st=api.collectGraphIntelligenceStats(); assert.ok(st.insights); assert.ok(api.buildGraphIntelligenceSummary().topInsights.length);
assert.equal(JSON.stringify(c.localStorage).includes('consent'),false);
assert.equal(JSON.stringify(c.localStorage).includes('aha_training_corpus'),false);
console.log('aha-knowledge-graph-intelligence tests passed');
