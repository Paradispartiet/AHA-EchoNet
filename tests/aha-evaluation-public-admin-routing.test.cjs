const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

class El {
  constructor(){ this.dataset={}; this._html=''; this.textContent=''; this.disabled=false; this.hidden=false; this.className=''; this.classList={toggle(){},add(){},remove(){}}; }
  set innerHTML(v){ this._html=String(v||''); }
  get innerHTML(){ return this._html; }
  querySelector(){ return null; }
  querySelectorAll(){ return []; }
  addEventListener(){}
  appendChild(){}
}

function makeContext(){
  const store=new Map(); const els=new Map();
  ['aha-auto-output','aha-answer-composer-status','aha-answer-composer-details','aha-answer-evaluation-status','aha-processing-indicator','aha-processing-text','btn-send'].forEach(id=>els.set(id,new El()));
  const c={window:null,console,document:{readyState:'loading',addEventListener(){},body:new El(),getElementById:id=>els.get(id)||null,querySelectorAll:()=>[],createElement:()=>new El()},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},navigator:{clipboard:{}},Event:function(t){this.type=t;},CustomEvent:function(t,o){this.type=t;this.detail=o&&o.detail;},setTimeout,clearTimeout,Date,Math,URL:{createObjectURL(){},revokeObjectURL(){}},Blob:function(){},fetch:async()=>({ok:true,json:async()=>({reply:'ok'})})};
  c.window=c; c.globalThis=c;
  ['js/ahaChatTextUtils.js','js/ahaChatSignals.js','js/ahaChatSubjects.js','js/ahaChatAnalysis.js','js/ahaChatReplyFormat.js','js/ahaChatExport.js','js/ahaChatMemoryControls.js','js/ahaChatAfterwork.js','js/ahaChatMemoryRuntime.js','js/ahaChatRunContext.js','js/ahaChatInsightView.js','js/ahaChatAutoAnalysis.js', 'js/ahaChatAutoOutputView.js', 'js/ahaChatAnalysisStateView.js', 'js/ahaChatChamberStore.js', 'js/ahaChatAnalysisPolicy.js', 'js/ahaChatConceptPolicy.js', 'js/ahaChatCanonicalAnalysis.js', 'js/ahaChatKnowledgeView.js', 'js/ahaChatInsightPipeline.js', 'js/ahaChatAgentRuntime.js', 'js/ahaChatIngestRuntime.js', 'js/ahaChatPersonalUi.js', 'js/ahaChatConversationView.js', 'js/ahaChatAnalysisRunContract.js', 'js/ahaChatAcademicInsightView.js', 'js/ahaChatUiRuntime.js', 'js/ahaChatProviderLoader.js', 'js/ahaChatCapabilityBindings.js', 'js/ahaChatRuntimeFacade.js', 'js/ahaChatRuntimeComposition.js', 'js/ahaChatApplicationComposition.js', 'js/ahaChat.js'].forEach(f=>vm.runInNewContext(fs.readFileSync(f,'utf8'),c,{filename:f}));
  return {c,store,els};
}

const source=`Sammendrag. Offentlig ansatte ønsker at evalueringer skal ha høyere kvalitet, bli tettere fulgt opp og integreres bedre med mål- og resultatstyringssystemet. Bare et lite mindretall ønsker flere evalueringer. I denne artikkelen diskuterer vi ulike former for nytte og hvordan den norske statsforvaltningen bruker evalueringer. Formålet er at evalueringer skal gi økt samfunnsnytte. I anledning Evalueringsåret 2015 gjennomførte EVA-forum og Norsk Evalueringsforening en spørreundersøkelse om bruken og nytten av evalueringer i statlig sektor. Undersøkelsen ble sendt til 276 respondenter, og 30 prosent svarte. Respondentene etterlyser mer systematikk, bedre oppfølging og bedre integrering av evalueringsresultater i mål- og resultatstyringssystemet. Det største behovet er økt fagkompetanse. Bare 25–30 prosent mener det er nødvendig med flere evalueringer. Potensialet for videreutvikling ligger ikke i å evaluere mer, men bedre. Deltakende metoder, referansegrupper, evalueringsstrategier og lederforankring påvirker bruk. Betydningen av kvalitet og relevans er stor.`;

const {c,store}=makeContext();
const h=c.AHATestHooks;
assert.equal(h.detectTextType(source),'academic_article');
assert.equal(c.AHAChatSignals.detectPublicAdministrationSignal(source).strong,true);
assert.equal(c.AHAChatSignals.detectInstitutionalMediaHistorySignal(source).strong,false);
assert.equal(c.AHAChatSignals.inferReligiousLexiconEvidence(source).strong,false);

const grounded=h.buildSourceGroundedAcademicPayload(source);
assert.match(grounded.ahaSer.viktigsteInnsikt,/evaluere mer, men bedre/i);
const method=(grounded.sortItems||[]).find(x=>/empiri|metode/i.test(x.label||''));
assert.ok(method);
assert.match(method.text,/276 respondenter|30 prosent/i);

const concepts=h.buildAcademicConceptCandidates(source, grounded);
assert.equal(concepts.some(x=>String(x).toLowerCase()==='tydning'),false);
assert.equal(concepts.some(x=>/evaluering/i.test(String(x))),true);
assert.equal(h.detectAutoAnalysisDomain(source,grounded),'public_administration');

c.AHACalibration={matchText(){return {matched_emner:[{emne_id:'politikk_forvaltning',subject_id:'politikk',title:'Forvaltning og styring',score:8}],matched_categories:[{id:'litteratur',label:'Nærlesning, stil og form',score:99}],matched_concepts:[{key:'stil',label:'stil',score:99,subject_id:'litteratur'}]};}};
const primary=[{emne_id:'politikk_forvaltning',subject_id:'politikk',subject_label:'Politikk',title:'Forvaltning og styring',score:12,matched_terms:['offentlig forvaltning','mål- og resultatstyring']}];
const run=h.createAnalysisRun(source,{sourceKind:'pasted_text'});
h.clearActiveAnalysisState(run);
(async()=>{
  await h.renderAutoOutputs(source,'',{subjectMatches:primary,analysisRun:run});
  const saved=JSON.parse(store.get('aha_chat_auto_outputs_v1'));
  const payload=saved.payload;
  assert.deepEqual(Array.from(payload.subjectMatches||[],x=>x.subject_id),['politikk']);
  assert.equal((payload.subjectMatches||[]).some(x=>x.subject_id==='litteratur'),false);
  assert.equal(payload.canonicalAnalysis.domain,'public_administration');
  assert.equal((payload.canonicalAnalysis.historyGoLinks||[]).some(x=>x.id==='litteratur'||/litteratur/i.test(x.title||'')),false);
  assert.equal((payload.canonicalAnalysis.concepts||[]).some(x=>String(x).toLowerCase()==='tydning'),false);
  assert.equal(payload.analysisKnowledgePolicy.currentDocumentRole,'analysis_source');
  assert.equal(payload.analysisKnowledgePolicy.persistAsMemory,false);
  console.log('aha-evaluation-public-admin-routing tests passed');
})().catch(err=>{console.error(err);process.exitCode=1;});
