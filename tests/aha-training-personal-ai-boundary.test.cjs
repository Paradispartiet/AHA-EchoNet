const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function storage() {
  const m = new Map(); const writes = [];
  return { writes, getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>{writes.push(k);m.set(k,String(v));}, removeItem:k=>m.delete(k), clear:()=>m.clear() };
}
function ctx() { const localStorage = storage(); return vm.createContext({ console, localStorage, document:{body:{appendChild(){},removeChild(){}},createElement(){return {click(){}}}}, URL:{createObjectURL(){return 'blob:local'},revokeObjectURL(){}}, Blob: class Blob { constructor(parts){this.size=String(parts.join('')).length;} }, Date, Math, JSON }); }
function run(file, c) { vm.runInContext(fs.readFileSync(file,'utf8'), c, { filename:file }); }
function stripCommentsAndStrings(src){ return src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'').replace(/`(?:\\.|[^`])*`|'(?:\\.|[^'])*'|"(?:\\.|[^"])*"/g,''); }

{
  const matrix = fs.readFileSync('docs/AHA_MODULE_MATURITY_MATRIX.md','utf8');
  assert.match(matrix, /\| personal-ai \|[^\n]+\| ready \| Local-only kontroll-/);
  assert.match(matrix, /\| training \|[^\n]+\| ready \| Local-only review corpus/);
}

{
  const c = ctx(); run('js/ahaTrainingCorpus.js', c);
  const api = c.AHATrainingCorpus;
  assert.equal(api.defaultConsent().useForFineTuning, false);
  assert.equal(api.defaultConsent().useForTrainingExamples, false);
  const item = api.normalizeCorpusItem({ id:'c1', text:'Dette er lokal testtekst.' });
  ['local_only','review_required','approval_required','training_data_candidate_only'].forEach(k=>assert.equal(item[k], true, k));
  ['model_training_enabled','fine_tuning_enabled','remote_upload_enabled','backend_enabled','echonet_shared','sync_enabled','historygo_writeback_enabled','writes_to_insight_chamber','calls_model_api'].forEach(k=>assert.equal(item[k], false, k));
  c.localStorage.setItem('aha_notes_v1', JSON.stringify([{id:'n1',title:'Note',text:'Lokal note'}])); c.localStorage.writes.length=0;
  const imported = api.importFromExistingAhaSources({ feed:false, articles:false, sourceEvents:false, afterwork:false, insights:false });
  assert.equal(imported.local_only, true); assert.equal(imported.model_training_enabled, false); assert.deepEqual([...new Set(c.localStorage.writes)], ['aha_training_corpus_v1']);
  const approved = api.markCorpusItemStatus('corpus_missing','approved'); assert.equal(approved, null);
  const [saved] = api.loadCorpus(); c.localStorage.writes.length=0; api.markCorpusItemStatus(saved.id, 'approved'); api.setCorpusConsent(saved.id, { useForFineTuning:true });
  assert.deepEqual([...new Set(c.localStorage.writes)], ['aha_training_corpus_v1']);
  assert.equal(api.loadCorpus()[0].model_training_enabled, false);
}

{
  const c = ctx(); run('js/ahaTrainingCorpus.js', c); run('js/ahaTrainingExamples.js', c);
  const ex = c.AHATrainingExamples.normalizeExample({ corpusItemId:'c1', input:'Q', output:'A' });
  assert.equal(ex.local_only, true); assert.equal(ex.training_example_candidate_only, true); assert.equal(ex.remote_upload_enabled, false);
  const generated = c.AHATrainingExamples.generateExamplesFromCorpusItem({ id:'c1', status:'approved', title:'T', text:'Jeg jobber med AHA.', consent:{useForTrainingExamples:true} });
  assert.ok(generated.length); assert.ok(generated.every(e=>['needs_review','draft'].includes(e.status))); assert.ok(generated.every(e=>e.status !== 'approved'));
  c.AHATrainingCorpus.saveCorpus([
    {id:'ok', text:'Approved local corpus', status:'approved', consent:{useForTrainingExamples:true,useForFineTuning:true}},
    {id:'no', text:'No consent', status:'approved', consent:{useForTrainingExamples:false,useForFineTuning:true}},
    {id:'raw', text:'Raw', status:'raw', consent:{useForTrainingExamples:true,useForFineTuning:true}}
  ]); c.localStorage.writes.length=0;
  const result = c.AHATrainingExamples.generateExamplesFromApprovedCorpus();
  assert.equal(result.local_only, true); assert.equal(result.generated_examples_only, true); assert.deepEqual([...new Set(c.localStorage.writes)], ['aha_training_examples_v1']);
  const examples = c.AHATrainingExamples.loadExamples().map(e=>({...e,status:'approved'})); c.AHATrainingExamples.saveExamples(examples); c.localStorage.writes.length=0;
  const selected = c.AHATrainingExamples.selectExportableExamples(); assert.ok(selected.length); assert.ok(selected.every(e=>e.corpusItemId==='ok'));
  const jsonl = c.AHATrainingExamples.exportApprovedExamples('jsonl'); assert.equal(typeof jsonl, 'string'); assert.equal(c.localStorage.writes.length, 0);
  const bundle = c.AHATrainingExamples.exportApprovedExamplesBundle(); assert.equal(bundle.local_only, true); assert.equal(bundle.export_only, true); assert.equal(bundle.remote_upload_enabled, false);
  const dl = c.AHATrainingExamples.downloadApprovedExamples(); assert.equal(dl.local_only, true); assert.equal(dl.export_only, true); assert.equal(dl.remote_upload_enabled, false);
}

{
  const c = ctx();
  c.AHAChatPersonalContext={buildMessageContext(){return {local:true}}}; c.AHAPersonalRetrieval={buildRagContext(){return {results:[]}},getRetrievalStatus(){return {available:false}}};
  c.AHASemanticRetrieval={buildSemanticRagContext(){return {results:[]}},getSemanticStatus(){return {available:false}}}; c.AHAPersonalAnswerComposer={buildAnswerPackage(){return {localPreview:{answerText:'lokal preview'},context:{},status:{ready:true}}},composeLocalAnswerPreview(){return {answerText:'lokal preview'}}};
  c.AHAPersonalAnswerEvaluation={evaluateAnswer(){return {score:1,status:'weak'}},saveEvaluation(e){c.localStorage.setItem('aha_personal_answer_evaluations_v1', JSON.stringify([e])); return e;},collectEvaluationStats(){return {total:0}}};
  c.AHAPersonalAiLoopAudit={runAudit(){return {local:true}},loadLastAudit(){return null}};
  run('js/ahaPersonalAiControl.js', c); c.localStorage.writes.length=0;
  const status = c.AHAPersonalAiControl.buildControlStatus({save:false});
  ['local_only','control_surface_only','readiness_report_only'].forEach(k=>assert.equal(status[k], true)); ['model_training_enabled','fine_tuning_enabled','remote_upload_enabled','backend_enabled','echonet_shared','sync_enabled','historygo_writeback_enabled','writes_to_insight_chamber','calls_model_api'].forEach(k=>assert.equal(status[k], false)); assert.equal(c.localStorage.writes.length, 0);
  c.AHAPersonalAiControl.buildControlStatus(); assert.deepEqual([...new Set(c.localStorage.writes)], ['aha_personal_ai_control_status_v1']);
  const quick = c.AHAPersonalAiControl.runQuickHealthCheck(); assert.equal(quick.local_only, true); assert.equal(quick.evaluation_only, true);
  c.localStorage.writes.length=0; const full = c.AHAPersonalAiControl.runFullControlTest({query:'test'}); assert.equal(full.local_only, true); assert.equal(full.control_test_only, true); assert.equal(full.calls_model_api, false); assert.deepEqual([...new Set(c.localStorage.writes)], ['aha_personal_answer_evaluations_v1']);
}

{
  const files = ['js/ahaPersonalModelReadiness.js','js/ahaPersonalRetrieval.js','js/ahaSemanticRetrieval.js','js/ahaChatPersonalContext.js','js/ahaPersonalAnswerComposer.js','js/ahaPersonalAnswerEvaluation.js','js/ahaPersonalAiLoopAudit.js'];
  for (const f of files) { const src = fs.readFileSync(f,'utf8'); assert.match(src, /personalAiBoundaryMeta/); assert.match(src, /local_only/); assert.match(src, /model_training_enabled:\s*false/); assert.match(src, /remote_upload_enabled:\s*false/); }
}

{
  const training = fs.readFileSync('training.html','utf8'); const personal = fs.readFileSync('personal-ai.html','utf8');
  assert.match(training, /lokalt corpus og lokale examples/); assert.match(training, /Det trener ikke en modell/); assert.match(training, /Ingen opplasting eller modelltrening/); assert.match(training, /JSONL-eksport er lokal/);
  assert.match(personal, /lokal kontroll- og testflate/); assert.match(personal, /trener ikke en modell og kaller ikke backend/); assert.match(personal, /ikke et bevis på at en personlig modell er trent/); assert.match(personal, /Retrieval-indekser er lokale/);
}

{
  const files = ['js/ahaTrainingCorpus.js','js/ahaTrainingExamples.js','js/ahaTrainingDashboard.js','js/ahaPersonalAiControl.js','js/ahaPersonalAiDashboard.js','js/ahaPersonalModelReadiness.js','js/ahaPersonalRetrieval.js','js/ahaSemanticRetrieval.js','js/ahaChatPersonalContext.js','js/ahaPersonalAnswerComposer.js','js/ahaPersonalAnswerEvaluation.js','js/ahaPersonalAiLoopAudit.js'];
  const forbidden = ['AHARepository','Supabase','createClient','AHASyncHub','fetch(','navigator.sendBeacon','XMLHttpRequest','OpenAI','apiKey','fineTuning.jobs','files.create','AHAIngest.ingest','createSignalFromMessage','addSignalToChamber'];
  for (const f of files) { const code = stripCommentsAndStrings(fs.readFileSync(f,'utf8')); forbidden.forEach(p=>assert.ok(!code.includes(p), `${f} contains ${p}`)); assert.ok(!/setItem\(['"]aha_insight_chamber_v1/.test(code), f); assert.ok(!/setItem\(['"]aha_source_events_v1/.test(code), f); ['visited_places','hg_learning_log_v1','knowledge_universe','trivia_universe'].forEach(k=>assert.ok(!new RegExp(`setItem\\(['\"]${k}`).test(code), `${f} writes ${k}`)); }
}

{
  const privacy = fs.readFileSync('js/ahaPrivacy.js','utf8'); ['aha_training_corpus_v1','aha_training_examples_v1','aha_personal_ai_control_status_v1','aha_personal_ai_loop_audit_v1','aha_personal_answer_evaluations_v1','aha_personal_retrieval_index_v1','aha_personal_semantic_index_v1'].forEach(k=>assert.ok(privacy.includes(k), k));
  assert.match(privacy, /local-only/); assert.match(privacy, /ingen modelltrening/); assert.match(privacy, /ingen fine-tuning startes/); assert.match(privacy, /JSONL-eksport er lokal/);
}

{
  const doc = fs.readFileSync('docs/AHA_TRAINING_PERSONAL_AI_BOUNDARY.md','utf8'); ['local-only','no model training','no fine-tuning','upload','backend','EchoNet','Sync Hub','History Go','AHAIngest','insight chamber','local JSONL','retrieval','readiness','evaluation','audit'].forEach(t=>assert.ok(doc.toLowerCase().includes(t.toLowerCase()), t));
}
