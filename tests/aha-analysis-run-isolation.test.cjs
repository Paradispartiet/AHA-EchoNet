const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

class El { constructor(){ this.dataset={}; this._html=''; this.textContent=''; this.disabled=false; this.hidden=false; this.className=''; this.classList={toggle(){},add(){},remove(){}}; } set innerHTML(v){this._html=String(v||'');} get innerHTML(){return this._html;} querySelector(){return null;} querySelectorAll(){return [];} addEventListener(){} appendChild(){} }
function ctx(){
  const store=new Map(); const els=new Map();
  ['aha-auto-output','aha-answer-composer-status','aha-answer-composer-details','aha-answer-evaluation-status','aha-processing-indicator','aha-processing-text','btn-send'].forEach(id=>els.set(id,new El()));
  const c={ window:null, console, document:{readyState:'loading', addEventListener(){}, body:new El(), getElementById:id=>els.get(id)||null, querySelectorAll:()=>[], createElement:()=>new El()}, localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}, navigator:{clipboard:{}}, Event:function(t){this.type=t;}, CustomEvent:function(t,o){this.type=t;this.detail=o&&o.detail;}, setTimeout, clearTimeout, Date, Math, URL:{createObjectURL(){},revokeObjectURL(){}}, Blob:function(){}, fetch:async()=>({ok:true,json:async()=>({reply:'ok'})})};
  c.window=c; c.globalThis=c;
  ['js/ahaChatTextUtils.js','js/ahaChatSignals.js','js/ahaChatSubjects.js','js/ahaChatAnalysis.js','js/ahaChatReplyFormat.js','js/ahaChatExport.js','js/ahaChat.js'].forEach(f=>vm.runInNewContext(fs.readFileSync(f,'utf8'),c,{filename:f}));
  return {c,els,store};
}

{
  const {c,els}=ctx(); const h=c.AHATestHooks;
  const run1=h.createAnalysisRun('Pinse Den hellige ånd tungetale Babel apostlene');
  const run2=h.createAnalysisRun('Lokal helsejournalistikk pasienter pårørende kommunal forvaltning mediedramaturgi');
  h.clearActiveAnalysisState(run2);
  const stale=h.bindAnalysisArtifact({ reflection:'Etterarbeid om pinse og Babel', sortItems:[{label:'Pinse',text:'Den hellige ånd'}], list:['tungetale'], insightCards:['apostlene'], path:['Babel'] }, run1);
  h.renderAutoOutputPayload(stale);
  assert.match(els.get('aha-auto-output').innerHTML, /Venter på etterarbeid for aktiv analyse/);
  assert.doesNotMatch(els.get('aha-auto-output').innerHTML, /pinse|Babel|tungetale|apostlene|hellige ånd/i);
}

{
  const {c}=ctx(); const h=c.AHATestHooks;
  const source='lokal helsejournalistikk pasienter pårørende mediedramaturgi kommunal forvaltning sykehus';
  const pack={ context:{ selectedSources:[
    {title:'Pinse', excerpt:'Den hellige ånd tungetale Babels tårn apostlene', reasons:['religion']},
    {title:'Helsejournalistikk', excerpt:'lokal helsejournalistikk om pasienter pårørende og kommunal forvaltning', reasons:['helsejournalistikk']}
  ]}, retrieval:{results:[{title:'Pinse', excerpt:'Den hellige ånd og tungetale'},{title:'Lokal journalistikk', excerpt:'pasienter og pårørende i kommunal helsejournalistikk'}]} };
  h.filterRetrievalForActiveSource(pack, source, h.createAnalysisRun(source));
  assert.equal(pack.context.selectedSources.length,1);
  assert.equal(pack.context.selectedSources[0].title,'Helsejournalistikk');
  assert.equal(pack.retrieval.results.length,1);
  assert.equal(pack.retrieval.results[0].title,'Lokal journalistikk');
}

{
  const {c,els}=ctx(); const h=c.AHATestHooks;
  const run=h.createAnalysisRun('fotball kamp trener scoring tabell');
  h.clearActiveAnalysisState(run);
  assert.doesNotMatch(els.get('aha-auto-output').innerHTML, /helsejournalistikk|pinse/i);
  assert.match(els.get('aha-answer-evaluation-status').textContent, /venter på aktiv analyse/i);
}
console.log('aha-analysis-run-isolation tests passed');
