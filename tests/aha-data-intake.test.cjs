const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function storage(){ const m=new Map(); return { getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k) }; }
function ctx(){ const c={ console, localStorage:storage(), Date, Math }; c.window=c; c.globalThis=c; vm.createContext(c); return c; }
function load(c, files){ files.forEach(f=>vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f})); }
let c=ctx(); load(c,['js/ahaDataIntake.js']); const api=c.AHADataIntake;
assert.equal(api.loadQueue().length, 0, 'loadQueue handles empty storage');
const norm=api.normalizeIntakeItem({title:'T',text:'Prosjekt tekst med begrep',concepts:['A']});
assert.equal(norm.type,'data_intake_item'); assert.equal(norm.source,'manual'); assert.equal(norm.consent.useForRetrieval,true);
const added=api.addIntakeItem({source:'manual',sourceType:'manual_text',title:'Manual',text:'Prosjekt med begreper og tekst nok til training corpus',status:'review',project:'AHA'});
assert.equal(api.loadQueue().length,1); assert.ok(added.suggestedTargets.some(t=>t.target==='training_corpus'));
assert.equal(api.dedupeQueue([{source:'manual',sourceType:'manual_text',title:'D',text:'same text'},{source:'manual',sourceType:'manual_text',title:'D2',text:'same text'}]).length,1);
api.addIntakeItem({source:'aha_music',sourceType:'music_track',title:'Song'});
api.addIntakeItem({source:'history_go',sourceType:'history_go_discovery',title:'Place',text:'Discovery text project'});
const stats=api.collectIntakeStats(); assert.equal(stats.total,3); assert.equal(stats.bySource.manual,1);
assert.ok(api.suggestTargets({source:'manual',text:'Project concept text long enough for training',project:'X'}).some(t=>t.target==='training_corpus'));
assert.ok(api.suggestTargets({source:'aha_music',sourceType:'artist',title:'Artist'}).some(t=>t.target==='aha_music_canon'));
assert.ok(api.suggestTargets({source:'history_go',sourceType:'history_go_discovery',title:'Discovery'}).some(t=>t.target==='history_go_discovery'));
c=ctx(); load(c,['js/ahaDataIntake.js']); { const r=c.AHADataIntake.scanExistingSources(); assert.equal(r.ok,true); assert.equal(r.added,0); assert.equal(r.skipped,0); assert.equal(r.total,0); }
const item=c.AHADataIntake.addIntakeItem({title:'Train',text:'Training text project concept',status:'review'}); c.AHADataIntake.approveForTrainingCorpus(item.id); const approved=c.AHADataIntake.loadAllQueue()[0]; assert.equal(approved.status,'approved'); assert.equal(approved.consent.useForTrainingCorpus,true);
let imported=0; c.AHATrainingCorpus={addCorpusItem(x){ imported++; return {id:'c1',...x}; }}; const res=c.AHADataIntake.importApprovedToTrainingCorpus(); assert.equal(res.imported,1); assert.equal(imported,1); assert.equal(c.AHADataIntake.loadAllQueue()[0].status,'imported');
const intakeHtml=fs.readFileSync('intake.html','utf8'); assert.ok(intakeHtml.includes('js/ahaDataIntake.js')); assert.ok(intakeHtml.includes('js/ahaDataIntakeDashboard.js'));
assert.ok(fs.readFileSync('js/ahaModules.js','utf8').includes('id: "data-intake"'));
assert.ok(fs.readFileSync('js/ahaTrainingDashboard.js','utf8').includes('handleDataIntakeImport'));
assert.ok(fs.readFileSync('js/ahaProductIntegration.js','utf8').includes('dataIntake'));
assert.ok(fs.readFileSync('js/ahaPersonalAiControl.js','utf8').includes('dataIntake'));
assert.ok(fs.readFileSync('js/metaInsightsAgent.js','utf8').includes('dataIntakePack'));
console.log('aha-data-intake tests passed');
