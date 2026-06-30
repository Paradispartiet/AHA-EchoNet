const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

class El { constructor(){ this.dataset={}; this._html=''; this.textContent=''; this.disabled=false; this.hidden=false; this.className=''; this.classList={toggle(){},add(){},remove(){}}; } set innerHTML(v){ this._html=String(v||''); } get innerHTML(){ return this._html; } querySelector(){ return null; } querySelectorAll(){ return []; } addEventListener(){} appendChild(){} }
function ctx(){ const store=new Map(); const els=new Map(); ['aha-auto-output','aha-answer-composer-status','aha-answer-composer-details','aha-answer-evaluation-status','aha-processing-indicator','aha-processing-text','btn-send'].forEach(id=>els.set(id,new El())); const c={ window:null, console, document:{readyState:'loading', addEventListener(){}, body:new El(), getElementById:id=>els.get(id)||null, querySelectorAll:()=>[], createElement:()=>new El()}, localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}, navigator:{clipboard:{}}, Event:function(t){this.type=t;}, CustomEvent:function(t,o){this.type=t;this.detail=o&&o.detail;}, setTimeout, clearTimeout, Date, Math, URL:{createObjectURL(){},revokeObjectURL(){}}, Blob:function(){}, fetch:async()=>({ok:true,json:async()=>({reply:'ok'})})}; c.window=c; c.globalThis=c; c.InsightsEngine={createEmptyChamber:()=>({insights:[],meta:{}}),buildMetaProfile:()=>({})}; ['js/ahaChatTextUtils.js','js/ahaChatSignals.js','js/ahaChatSubjects.js','js/ahaChatAnalysis.js','js/ahaChatReplyFormat.js','js/ahaChatExport.js','js/ahaChat.js','js/ahaPersonalAnswerEvaluation.js'].forEach(f=>vm.runInNewContext(fs.readFileSync(f,'utf8'),c,{filename:f})); return {c,els,store}; }

const badWords = /redaksjonell uavhengighet|økonomisk avhengighet|eierskapsskifter|medieoffentlighet|\bpresse\b|norsk politisk pressehistorie|institusjonell omforming/i;
const mediaText = 'Morgenbladet er en norsk avis med lang historie, redaksjonell linje, eierskapsskifter og rolle i presse og offentlighet.';
const pinseText = 'Pinse handler om apostlene, Den hellige ånd, Babel og tungetale i kristen tradisjon.';
const boligText = 'Boligleiemarkedet preges av høye leiepriser, press i byene, depositum, kontrakter, utleiere og leietakere.';
const sangText = 'Sang og sanglyrikk i barnekulturen handler om barnesang, barnelitteratur, barnekultur, sjangerrikdom, rytme, språk, musikk, utdanning, oppdragelse, identitetsdannelse, ritualer og behov for mer kultur- og litteraturforskning.';

{
  const {c,els}=ctx(); const h=c.AHATestHooks;
  for (const text of [mediaText, pinseText, boligText, sangText]) {
    const run = h.createAnalysisRun(text, { sourceKind:'pasted_text' });
    h.clearActiveAnalysisState(run);
    els.get('aha-auto-output').dataset.sourceText = text;
    const payload = h.bindAnalysisArtifact(h.buildAutoOutputs(text, 'Kort svar om aktiv tekst.'), run);
    h.renderAutoOutputPayload(payload);
    const html = els.get('aha-auto-output').innerHTML;
    if (text === sangText) {
      assert.match(html, /Barnelitteratur|Barnekultur|Sanglyrikk|Identitetsdannelse/i);
      assert.doesNotMatch(html, badWords, 'sanglyrikk-test skal ikke lekke mediehistorisk template');
    }
  }
}

{
  const {c}=ctx();
  const answer = 'Teksten handler om barnesang, sanglyrikk, barnekultur, barnelitteratur, musikk, utdanning og identitetsdannelse.';
  const pack = { sourceText: sangText, canonicalAnalysis: { theme:'Morgenbladets historie', mainTension:'Redaksjonell uavhengighet ↔ økonomisk avhengighet', keyInsight:'Eierskapsskifter former presse og medieoffentlighet.', fieldConnections:['Norsk politisk pressehistorie'], historyGoLinks:[], suggestedActions:[], warnings:[], confidence:{contentType:1,domain:1,theme:1,mainTension:1,historyGoLinks:1} } };
  const evaluation = c.AHAPersonalAnswerEvaluation.evaluateAnswer('Analyser teksten', answer, pack);
  assert.equal(evaluation.status, 'panel_mismatch');
  assert.ok(evaluation.score < 60);
}

console.log('aha-canonical-source-grounding tests passed');
