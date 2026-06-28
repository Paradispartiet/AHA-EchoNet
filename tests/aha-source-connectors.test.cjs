const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
function ctx(extra={}){ const store=new Map(); const c={console,Date,Math,JSON, localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}, ...extra}; c.window=c; c.globalThis=c; vm.createContext(c); return {c,store}; }
function load(c,file){ vm.runInContext(fs.readFileSync(file,'utf8'), c, {filename:file}); }
{
  const {c}=ctx(); load(c,'js/ahaSourceConnectors.js');
  const s=c.AHASourceConnectors.collectConnectorStatus(); assert.ok(s.connectors.length>=10); assert.ok(s.missing>=1); assert.ok(s.planned>=1);
  const item=c.AHASourceConnectors.normalizeSourceCandidate({id:'n1',title:'T',text:'Dette er en lang nok testtekst',tags:'a,b'},'aha_notes'); assert.equal(item.source,'aha_notes'); assert.equal(item.sourceType,'note'); assert.ok(item.suggestedTargets.length);
}
{
  const added=[]; const {c}=ctx({AHADataIntake:{addIntakeItem:i=>(added.push(i), i)}}); load(c,'js/ahaSourceConnectors.js');
  const r=c.AHASourceConnectors.pushItemsToDataIntake([{source:'manual',text:'abc'}]); assert.equal(r.added,1); assert.equal(added.length,1);
}
{
  const {c}=ctx({AHADataIntake:{addIntakeItem:i=>i}, AHAPersonalAnswerEvaluation:{loadEvaluations:()=>[{id:'e1',score:88,summary:'Svar-evaluering med nok tekst til import.',trainingSuggestion:{shouldCreateExample:true,suggestedTaskType:'question_answer',draftExample:{input:'Hva?',output:'Dette er et godt svar med nok tekst til trening.',language:'no'}}}],collectEvaluationStats:()=>({total:1,trainingSuggestions:1})}}); load(c,'js/ahaSourceConnectors.js');
  const r=c.AHASourceConnectors.scanSource('personal_ai'); assert.ok(r.total>=1); assert.ok(r.items.some(i=>i.sourceType==='training_suggestion'));
}
{
  const {c}=ctx({AHADataIntake:{addIntakeItem:i=>i}, AHAMetaInsightsMemory:{summarizeMemory:()=>({confirmedClaims:[{claimId:'c1',claimText:'AHA bygger source connectors for reelle kilder.'}],importantClaims:[{claimId:'c2',claimText:'Ikke lag dummydata i source connectors.'}],activeSelfModel:{activePatterns:[],activeProjects:[],activeTensions:[]}}),buildMemoryPack:()=>({confirmed_claims:['AHA bygger source connectors for reelle kilder.'],important_claims:['Ikke lag dummydata i source connectors.']})}}); load(c,'js/ahaSourceConnectors.js');
  const r=c.AHASourceConnectors.scanSource('meta_insights'); assert.ok(r.total>=2);
}
{
  const {c}=ctx({AHADataIntake:{addIntakeItem:i=>i}}); load(c,'js/ahaSourceConnectors.js');
  assert.doesNotThrow(()=>c.AHASourceConnectors.scanSource('sync_hub'));
  assert.doesNotThrow(()=>c.AHASourceConnectors.scanSource('aha_music'));
  assert.doesNotThrow(()=>c.AHASourceConnectors.scanSource('history_go'));
  const all=c.AHASourceConnectors.scanAllSources(); assert.ok(Array.isArray(all.results));
}
assert.match(fs.readFileSync('intake.html','utf8'), /ahaSourceConnectors\.js/);
assert.match(fs.readFileSync('intake.html','utf8'), /Source Connectors/);
assert.match(fs.readFileSync('js/ahaDataIntakeDashboard.js','utf8'), /Source Connectors|source-connectors/);
assert.match(fs.readFileSync('js/ahaProductIntegration.js','utf8'), /sourceConnectors/);
assert.match(fs.readFileSync('js/ahaPersonalAiControl.js','utf8'), /sourceConnectors/);
assert.match(fs.readFileSync('js/metaInsightsAgent.js','utf8'), /sourceConnectorsPack/);
console.log('aha-source-connectors tests passed');
