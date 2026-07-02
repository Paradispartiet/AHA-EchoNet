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
function ctx(){
  const store=new Map(); const els=new Map();
  ['aha-auto-output','aha-answer-composer-status','aha-answer-composer-details','aha-answer-evaluation-status','aha-processing-indicator','aha-processing-text','btn-send'].forEach(id=>els.set(id,new El()));
  const c={ window:null, console, document:{readyState:'loading', addEventListener(){}, body:new El(), getElementById:id=>els.get(id)||null, querySelectorAll:()=>[], createElement:()=>new El()}, localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}, navigator:{clipboard:{}}, Event:function(t){this.type=t;}, CustomEvent:function(t,o){this.type=t;this.detail=o&&o.detail;}, setTimeout, clearTimeout, Date, Math, URL:{createObjectURL(){},revokeObjectURL(){}}, Blob:function(){}, fetch:async()=>({ok:true,json:async()=>({reply:'ok'})})};
  c.window=c; c.globalThis=c;
  ['js/ahaChatTextUtils.js','js/ahaChatSignals.js','js/ahaChatSubjects.js','js/ahaChatAnalysis.js','js/ahaChatReplyFormat.js','js/ahaChatExport.js','js/ahaChat.js'].forEach(f=>vm.runInNewContext(fs.readFileSync(f,'utf8'),c,{filename:f}));
  return {c,els,store};
}

const staleWords = /pinse|apostlene|Den hellige ånd|Babel|tungetale/i;
const pinseText = 'Pinse handler om apostlene, Den hellige ånd, Babel og tungetale i kristen tradisjon.';
const boligText = 'Boligleiemarkedet preges av høye leiepriser, press i byene, depositum, kontrakter, utleiere og leietakere.';
const linkReaderSource = fs.readFileSync('js/ahaLinkReader.js', 'utf8');
assert.match(linkReaderSource, /function clearLatestArticleAnalysis\(\)/, 'link reader must expose stale article-analysis clearing');
assert.match(linkReaderSource, /function processUrlsFromMessage[\s\S]*clearLatestArticleAnalysis\(\);[\s\S]*for \(const url of urls\)/, 'new URL reads must clear previous article analysis before fetch attempts');
assert.match(linkReaderSource, /clearLatestArticleAnalysis/, 'link reader export must include clearLatestArticleAnalysis');
const explorerSource = fs.readFileSync('js/ahaExplorer.js', 'utf8');
assert.match(explorerSource, /const dataHost = getContainer\("data"\);[\s\S]*dataHost\.innerHTML = emptyNote/, 'AHAExplorer.clear must clear #exp-data/data export host');

{
  const {c,els}=ctx(); const h=c.AHATestHooks;
  const pinseRun = h.createAnalysisRun(pinseText, { sourceKind: 'pasted_text' });
  const boligRun = h.createAnalysisRun(boligText, { sourceKind: 'pasted_text' });
  h.clearActiveAnalysisState(boligRun);
  els.get('aha-auto-output').dataset.sourceText = boligText;
  const stalePayload = h.bindAnalysisArtifact({
    canonicalAnalysis: { theme:'Pinse', keyInsight:'Den hellige ånd og apostlene', sourceHash: pinseRun.sourceHash },
    reflection:'Etterarbeid om pinse og Babel',
    sortItems:[{label:'Struktur', text:'apostlene og tungetale'}],
    list:['Den hellige ånd'],
    path:['Babel'],
    insightCards:['pinse']
  }, pinseRun);
  h.renderAutoOutputPayload(stalePayload);
  const html = els.get('aha-auto-output').innerHTML;
  assert.match(html, /Venter på etterarbeid for aktiv analyse|Analyseobjektet matcher ikke aktiv tekst/);
  assert.doesNotMatch(html, staleWords, 'analysepanel/etterarbeid/fagkoblinger/struktur/læringssti/kilder/kunnskapskart skal ikke vise pinseord');
}

{
  const {c}=ctx(); const h=c.AHATestHooks;
  const run = h.createAnalysisRun(boligText, { sourceKind: 'pasted_text' });
  const fresh = h.bindAnalysisArtifact({
    canonicalAnalysis: {},
    reflection:'Analyse av boligleiemarked, leiepriser og kontrakter',
    sortItems:[{label:'Struktur', text:'leietakere og utleiere'}],
    list:['depositum'], path:['sammenlign kontrakter'], insightCards:['press i byene']
  }, run);
  h.bindAnalysisArtifact(fresh.canonicalAnalysis, run);
  assert.equal(fresh.analysisRunId, run.analysisRunId);
  assert.equal(fresh.canonicalAnalysis.analysisRunId, run.analysisRunId);
  assert.equal(fresh.sourceKind, 'pasted_text');
  assert.doesNotMatch(JSON.stringify(fresh), staleWords);
}

console.log('aha-stale-analysis-context-leak tests passed');
