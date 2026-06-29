const assert=require('assert'), fs=require('fs'), vm=require('vm');
function ctx(extra={}){const store={};const c={console,module:{exports:{}},exports:{},localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>delete store[k]},...extra};c.window=c;c.globalThis=c;return c;}
function run(file,c){vm.runInNewContext(fs.readFileSync(file,'utf8'),c,{filename:file});return c;}
{const c=ctx();run('js/ahaKnowledgeMap.js',c);const m=c.AHAKnowledgeMap.buildKnowledgeMap();assert.equal(m.nodes.length,0);assert.equal(m.edges.length,0);}
{const c=ctx();run('js/ahaKnowledgeMap.js',c);const n=c.AHAKnowledgeMap.buildNodesFromIntake([{id:'i1',title:'AHA Personal AI',summary:'Retrieval',project:'AHA',concepts:['Retrieval'],tags:['AI'],entities:['Oslo'],sourceType:'manual_text'}]);assert.equal(n[0].nodeType,'intake_item');assert.equal(n[0].project,'AHA');}
{const c=ctx();run('js/ahaKnowledgeMap.js',c);assert.equal(c.AHAKnowledgeMap.buildNodesFromCuration([{id:'c1',title:'Curated',project:'AHA',concepts:['Curation']}])[0].nodeType,'curation_item');}
{const c=ctx();run('js/ahaKnowledgeMap.js',c);assert.equal(c.AHAKnowledgeMap.buildNodesFromTrainingCorpus([{id:'t1',title:'Corpus',project:'AHA',concepts:['Training']}])[0].nodeType,'training_corpus_item');}
{const c=ctx();run('js/ahaKnowledgeMap.js',c);assert.equal(c.AHAKnowledgeMap.buildNodesFromTrainingExamples([{id:'e1',input:'Q',output:'A',labels:['Training']}])[0].nodeType,'training_example');}
{const c=ctx();run('js/ahaKnowledgeMap.js',c);assert.equal(c.AHAKnowledgeMap.buildNodesFromMemory({confirmed_claims:['Jeg jobber med AHA'],important_claims:['Retrieval er viktig']}).length,2);}
{const c=ctx();run('js/ahaKnowledgeMap.js',c);assert.equal(c.AHAKnowledgeMap.buildProjectNodes([{project:'AHA'},{project:'aha'}]).length,1);}
{const c=ctx();run('js/ahaKnowledgeMap.js',c);assert.equal(c.AHAKnowledgeMap.buildConceptNodes([{concepts:['Retrieval'],tags:['retrieval']}]).length,1);}
{const c=ctx();run('js/ahaKnowledgeMap.js',c);let nodes=c.AHAKnowledgeMap.dedupeNodes([...c.AHAKnowledgeMap.buildNodesFromIntake([{id:'i1',title:'Item',project:'AHA',concepts:['Retrieval']}]),...c.AHAKnowledgeMap.buildProjectNodes([{project:'AHA'}]),...c.AHAKnowledgeMap.buildConceptNodes([{concepts:['Retrieval']}])]);let edges=c.AHAKnowledgeMap.buildEdges(nodes,{});assert.ok(edges.some(e=>e.relationType==='belongs_to_project'));assert.ok(edges.some(e=>e.relationType==='has_concept'));}
{const c=ctx();run('js/ahaKnowledgeMap.js',c);assert.equal(c.AHAKnowledgeMap.dedupeNodes([{nodeType:'concept',label:'AI'},{nodeType:'concept',label:'ai'}]).length,1);assert.equal(c.AHAKnowledgeMap.dedupeEdges([{from:'a',to:'b',relationType:'x'},{from:'a',to:'b',relationType:'x'}]).length,1);}
{const c=ctx();run('js/ahaKnowledgeMap.js',c);const m={nodes:[{id:'a',nodeType:'project',label:'AHA'},{id:'b',nodeType:'concept',label:'AI'}],edges:[{from:'a',to:'b',relationType:'related_to'}]};const s=c.AHAKnowledgeMap.collectMapStats(m);assert.equal(s.projects,1);assert.equal(s.byRelationType.related_to,1);}
{const c=ctx();run('js/ahaKnowledgeMap.js',c);const map=c.AHAKnowledgeMap.saveKnowledgeMap({nodes:[{id:'a',nodeType:'project',label:'AHA',project:'AHA',concepts:['AI']}],edges:[]});assert.equal(c.AHAKnowledgeMap.searchKnowledgeMap('AHA').results.length,1);}
{const c=ctx();run('js/ahaKnowledgeMap.js',c);c.AHAKnowledgeMap.saveKnowledgeMap({nodes:[{id:'a',nodeType:'project',label:'AHA'},{id:'b',nodeType:'concept',label:'AI'}],edges:[{from:'a',to:'b',relationType:'related_to'}]});assert.equal(c.AHAKnowledgeMap.findRelatedNodes('a').neighbors.length,1);}
const html=fs.readFileSync('knowledge-map.html','utf8');['js/ahaDataIntake.js','js/ahaKnowledgeCuration.js','js/ahaTrainingCorpus.js','js/ahaTrainingExamples.js','js/metaInsightsMemory.js','js/ahaKnowledgeMap.js','js/ahaKnowledgeMapDashboard.js'].forEach(x=>assert.ok(html.includes(x),x));
assert.ok(fs.readFileSync('js/ahaModules.js','utf8').includes('id: "knowledge-map"'));
assert.ok(fs.readFileSync('js/ahaKnowledgeCurationDashboard.js','utf8').includes('AHAKnowledgeMap'));
assert.ok(fs.readFileSync('js/ahaDataIntakeDashboard.js','utf8').includes('knowledge-map.html')||fs.readFileSync('intake.html','utf8').includes('knowledge-map.html'));
assert.ok(fs.readFileSync('js/ahaTrainingDashboard.js','utf8').includes('knowledge-map.html')||fs.readFileSync('training.html','utf8').includes('knowledge-map.html'));
assert.ok(fs.readFileSync('js/ahaPersonalAiControl.js','utf8').includes('knowledgeMap'));
assert.ok(fs.readFileSync('js/ahaProductIntegration.js','utf8').includes('knowledgeMap'));
assert.ok(fs.readFileSync('js/metaInsightsAgent.js','utf8').includes('knowledgeMapPack'));
console.log('aha-knowledge-map tests passed');
