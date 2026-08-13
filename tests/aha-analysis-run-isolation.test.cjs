const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const chatHtml = fs.readFileSync('chat.html', 'utf8');
const memoryControlsAt = chatHtml.indexOf('js/ahaChatMemoryControls.js');
const afterworkAt = chatHtml.indexOf('js/ahaChatAfterwork.js');
const memoryRuntimeAt = chatHtml.indexOf('js/ahaChatMemoryRuntime.js');
const runContextAt = chatHtml.indexOf('js/ahaChatRunContext.js');
const insightViewAt = chatHtml.indexOf('js/ahaChatInsightView.js');
const autoAnalysisAt = chatHtml.indexOf('js/ahaChatAutoAnalysis.js');
const autoOutputViewAt = chatHtml.indexOf('js/ahaChatAutoOutputView.js');
const analysisStateViewAt = chatHtml.indexOf('js/ahaChatAnalysisStateView.js');
const chamberStoreAt = chatHtml.indexOf('js/ahaChatChamberStore.js');
const conceptPolicyAt = chatHtml.indexOf('js/ahaChatConceptPolicy.js');
const conversationViewAt = chatHtml.indexOf('js/ahaChatConversationView.js');
const canonicalAnalysisAt = chatHtml.indexOf('js/ahaChatCanonicalAnalysis.js');
const academicInsightViewAt = chatHtml.indexOf('js/ahaChatAcademicInsightView.js');
const analysisRunContractAt = chatHtml.indexOf('js/ahaChatAnalysisRunContract.js');
const chatAt = chatHtml.indexOf('js/ahaChat.js');
assert.ok(memoryControlsAt > -1 && memoryControlsAt < afterworkAt, 'memory controls must load before afterwork');
assert.ok(afterworkAt > -1 && afterworkAt < memoryRuntimeAt, 'afterwork must load before the memory runtime');
assert.ok(memoryRuntimeAt > -1 && memoryRuntimeAt < runContextAt, 'memory runtime must load before the run context');
assert.ok(runContextAt > -1 && runContextAt < insightViewAt, 'run context must load before the insight view');
assert.ok(insightViewAt > -1 && insightViewAt < autoAnalysisAt, 'insight view must load before auto-analysis');
assert.ok(autoAnalysisAt > -1 && autoAnalysisAt < autoOutputViewAt, 'auto-analysis must load before the auto-output view');
assert.ok(autoOutputViewAt > -1 && autoOutputViewAt < canonicalAnalysisAt, 'auto-output view must load before canonical analysis');
assert.ok(analysisStateViewAt > autoOutputViewAt && analysisStateViewAt < chatAt, 'analysis state view must load after auto-output view and before ahaChat.js');
assert.ok(chamberStoreAt > -1 && chamberStoreAt < chatAt, 'chamber store must load before ahaChat.js');
assert.ok(conceptPolicyAt > -1 && conceptPolicyAt < chatAt, 'concept policy must load before ahaChat.js');
assert.ok(conversationViewAt > -1 && conversationViewAt < chatAt, 'conversation view must load before ahaChat.js');
assert.ok(canonicalAnalysisAt > -1 && canonicalAnalysisAt < chatAt, 'canonical analysis must load before ahaChat.js');
assert.ok(academicInsightViewAt > -1 && academicInsightViewAt < chatAt, 'academic insight view must load before ahaChat.js');
assert.ok(analysisRunContractAt > -1 && analysisRunContractAt < runContextAt, 'analysis run contract must load before the run context');
const chatSource = fs.readFileSync('js/ahaChatInsightPipeline.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatPersonalUi.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatConversationView.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatAnalysisRunContract.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChatAcademicInsightView.js', 'utf8') + "\n" + fs.readFileSync('js/ahaChat.js', 'utf8');
const chatOrchestratorSource = fs.readFileSync('js/ahaChat.js', 'utf8');
assert.doesNotMatch(chatSource, /\blet activeAnalysisRun\b/, 'ahaChat.js must not keep a second active-run owner');
assert.doesNotMatch(chatSource, /function createAnalysisRun\s*\(/, 'run creation must remain extracted');
assert.doesNotMatch(chatSource, /function loadAhaMemoryControls\s*\(/, 'memory control storage must remain extracted');
assert.doesNotMatch(chatSource, /function loadAhaMemoryExclusions\s*\(/, 'memory exclusion storage must remain extracted');
assert.doesNotMatch(chatSource, /function findRelevantLocalMemory\s*\(/, 'memory retrieval must remain extracted');
assert.doesNotMatch(chatSource, /function buildAhaMemoryStatus\s*\(/, 'memory status must remain extracted');
assert.doesNotMatch(chatSource, /function renderInsightCard\s*\(/, 'insight card rendering must remain extracted');
assert.doesNotMatch(chatSource, /function showInsights\s*\(/, 'insight panel orchestration must remain extracted');
assert.doesNotMatch(chatSource, /function buildAutoOutputs\s*\(/, 'auto-output payload building must remain extracted');
assert.doesNotMatch(fs.readFileSync('js/ahaChat.js', 'utf8'), /function (?:parseLabeledInsightCards|readLatestAcademicContext|buildAcademicSyntheticInsightCards)\s*\(/, 'academic insight view logic must remain extracted');
assert.doesNotMatch(chatSource, /const AHA_RUNTIME_KNOWLEDGE_POLICY = Object\.freeze/, 'runtime knowledge policy must remain extracted');
assert.doesNotMatch(chatSource, /function loadAfterworkEntries\s*\(/, 'afterwork persistence must remain extracted');
assert.doesNotMatch(chatSource, /function showSavedAfterwork\s*\(/, 'afterwork presentation must remain extracted');
assert.doesNotMatch(chatSource, /function renderAutoOutputPayload\s*\(/, 'auto-output rendering must remain extracted');
assert.doesNotMatch(chatSource, /function buildAhaSerCard\s*\(/, 'AHA ser presentation must remain extracted');
assert.doesNotMatch(chatSource, /function buildCanonicalAnalysis\s*\(/, 'canonical analysis synthesis must remain extracted');
assert.doesNotMatch(chatSource, /function resolveCanonicalAnalysisWithOptionalPythonEngine\s*\(/, 'Python engine adapter must remain extracted');
assert.doesNotMatch(chatOrchestratorSource, /const (?:ACADEMIC_PHRASE_CONCEPTS|ACADEMIC_THEORY_RULES|GENERIC_DISPLAY_CONCEPTS)\b/, 'academic policy tables must remain extracted');
assert.doesNotMatch(chatOrchestratorSource, /function (?:isGenericDisplayConcept|extractAcademicPhraseConcepts|normalizeSimpleStringList|normalizeTheoreticalLinks|extractAcademicTheoryLinks|mergeTheoryLinks|buildAcademicConceptCandidates)\s*\(/, 'academic concept and theory policy must remain extracted');
assert.doesNotMatch(chatOrchestratorSource, /function (?:collectTheoryNodeLabels|buildConceptEdgeContext|resolveActiveAnalysisContext|prioritizeVisibleConceptEdges|applyPhraseConceptDisplayPreference|filterConceptLabels|canonicalizeDisplayConcept)\s*\(/, 'concept policy and active knowledge context must remain extracted');
assert.doesNotMatch(chatOrchestratorSource, /\bWEAK_CONCEPT_WORDS\b/, 'weak concept policy must remain extracted');
assert.doesNotMatch(chatOrchestratorSource, /function (?:normalizePreview|makeStableMessageId|loadHighlights|saveHighlights|dedupeSubjectMatches|renderSubjectChips|appendChat|previewText|toggleHighlight|isHighlighted|syncMessageHighlightState|renderHighlightsRail|updateEmptyState|updateAnswerActionsVisibility|setComposerText)\s*\(/, 'conversation rendering and highlight ownership must remain extracted');
assert.doesNotMatch(chatOrchestratorSource, /function (?:stripTrailingPunctuation|lowerFirst|sentence|sourceHasTerm|sourceHasAny|buildLiteraryDiarySortItems|collectLiteraryDiaryEvidence)\s*\(/, 'auto-analysis text routing and literary diary policy must remain extracted');
assert.doesNotMatch(chatOrchestratorSource, /function (?:shortHash|takeKeywords|sourceHash)\s*\(/, 'source identity and keyword primitives must remain extracted');
assert.doesNotMatch(chatOrchestratorSource, /aha_chat_auto_outputs_v1|function loadAutoOutputs\s*\(/, 'auto-output cache key and compatibility loading must remain extracted');
assert.doesNotMatch(chatOrchestratorSource, /aha_insight_chamber_v1|function (?:loadChamberFromStorage|saveChamberToStorage)\s*\(/, 'chamber key and persistence must remain extracted');
assert.doesNotMatch(chatOrchestratorSource, /AHA_INSIGHT_CONTRACT|INSIGHT_NOISE_PATTERN|function getInsightPipeline\s*\(/, 'insight candidate contract and pipeline ownership must remain extracted');
assert.doesNotMatch(chatOrchestratorSource, /function (?:renderAnalysisDebugPanel|clearActiveAnalysisState|setAhaProcessing|setExportButtonsEnabled)\s*\(/, 'analysis-state DOM ownership must remain extracted');
assert.doesNotMatch(fs.readFileSync('js/ahaChatAutoOutputView.js', 'utf8'), /global\.localStorage\.setItem\s*\(/, 'auto-output runtime must persist through the versioned store');
assert.match(fs.readFileSync('js/ahaExplorer.js', 'utf8'), /contractVersion === "aha_analysis_run_v1"/, 'Explorer must render through the versioned analysis-run view model');

class El { constructor(){ this.dataset={}; this._html=''; this.textContent=''; this.disabled=false; this.hidden=false; this.className=''; this.classList={toggle(){},add(){},remove(){}}; } set innerHTML(v){this._html=String(v||'');} get innerHTML(){return this._html;} querySelector(){return null;} querySelectorAll(){return [];} addEventListener(){} appendChild(){} }
function ctx(){
  const store=new Map(); const els=new Map();
  ['aha-auto-output','aha-answer-composer-status','aha-answer-composer-details','aha-answer-evaluation-status','aha-processing-indicator','aha-processing-text','btn-send'].forEach(id=>els.set(id,new El()));
  const c={ window:null, console, document:{readyState:'loading', addEventListener(){}, body:new El(), getElementById:id=>els.get(id)||null, querySelectorAll:()=>[], createElement:()=>new El()}, localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)}, navigator:{clipboard:{}}, Event:function(t){this.type=t;}, CustomEvent:function(t,o){this.type=t;this.detail=o&&o.detail;}, setTimeout, clearTimeout, Date, Math, URL:{createObjectURL(){},revokeObjectURL(){}}, Blob:function(){}, fetch:async()=>({ok:true,json:async()=>({reply:'ok'})})};
  c.window=c; c.globalThis=c;
  ['js/ahaChatTextUtils.js','js/ahaChatSignals.js','js/ahaChatSubjects.js','js/ahaChatAnalysis.js','js/ahaChatReplyFormat.js','js/ahaChatExport.js','js/ahaChatMemoryControls.js','js/ahaChatAfterwork.js','js/ahaChatMemoryRuntime.js','js/ahaChatRunContext.js','js/ahaChatInsightView.js','js/ahaChatAutoAnalysis.js', 'js/ahaChatAutoOutputView.js', 'js/ahaChatAnalysisStateView.js', 'js/ahaChatChamberStore.js', 'js/ahaChatAnalysisPolicy.js', 'js/ahaChatConceptPolicy.js', 'js/ahaChatCanonicalAnalysis.js', 'js/ahaChatKnowledgeView.js', 'js/ahaChatInsightPipeline.js', 'js/ahaChatPersonalUi.js', 'js/ahaChatConversationView.js', 'js/ahaChatAnalysisRunContract.js', 'js/ahaChatAcademicInsightView.js', 'js/ahaChat.js'].forEach(f=>vm.runInNewContext(fs.readFileSync(f,'utf8'),c,{filename:f}));
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

{
  const {c}=ctx(); const h=c.AHATestHooks;
  const source='lokal helsejournalistikk pasienter pårørende mediedramaturgi kommunal forvaltning sykehus';
  const run=h.createAnalysisRun(source);
  const memory={ used:true, reason:'Semantisk søk fant treff', confidence:.8, mode:'semantic_match',
    selectedInsights:[
      {id:'pinse', title:'Pinse', summary:'Den hellige ånd tungetale Babels tårn apostlene', concepts:['pinse']},
      {id:'helse', title:'Helsejournalistikk', summary:'lokal helsejournalistikk om pasienter pårørende og kommunal forvaltning', concepts:['helsejournalistikk']}
    ],
    localMatches:[{insight:{id:'pinse-local', title:'Pinse lokalt', summary:'tungetale og apostlene'}}],
    semanticMatches:[{id:'helse-sem', title:'Lokal helsejournalistikk', summary:'pasienter og pårørende i kommunal forvaltning'}],
    summaryForAgent:'gammel summary'
  };
  const filtered=h.filterMemoryContextForActiveSource(memory, source, run);
  assert.equal(filtered.used, true);
  assert.equal(filtered.selectedInsights.length,1);
  assert.equal(filtered.selectedInsights[0].id,'helse');
  assert.doesNotMatch(filtered.summaryForAgent, /pinse|Babel|tungetale|apostlene|hellige ånd/i);
}

{
  const {c}=ctx(); const h=c.AHATestHooks;
  const source='fotball kamp trener scoring tabell';
  const memory={ used:true, reason:'Semantisk søk fant treff', confidence:.8, mode:'semantic_match', selectedInsights:[{id:'helse', title:'Helsejournalistikk', summary:'pasienter pårørende kommunal forvaltning'}], localMatches:[], semanticMatches:[], summaryForAgent:'helsejournalistikk' };
  const filtered=h.filterMemoryContextForActiveSource(memory, source, h.createAnalysisRun(source));
  assert.equal(filtered.used, false);
  assert.equal(filtered.summaryForAgent, '');
}

console.log('aha-analysis-run-isolation tests passed');
