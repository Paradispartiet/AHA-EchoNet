const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function storage() {
  const data = new Map(); const writes = [];
  return { data, writes, getItem:k=>data.has(k)?data.get(k):null, setItem(k,v){writes.push(k); data.set(k,String(v));}, removeItem:k=>data.delete(k), clear:()=>data.clear() };
}
function load(file, extra={}) {
  const localStorage = extra.localStorage || storage();
  const ctx = { console, localStorage, module:{exports:{}}, exports:{}, ...extra };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ctx, { filename:file });
  return ctx;
}
function assertBoundary(o, fields) { for (const [k,v] of Object.entries(fields)) assert.equal(o[k], v, `${k}`); }

const forbiddenFiles = [
  'js/ahaKnowledgeWorkbench.js','js/ahaKnowledgeWorkbenchDashboard.js','js/ahaDataIntake.js','js/ahaDataIntakeDashboard.js','js/ahaSourceConnectors.js','js/ahaKnowledgeCuration.js','js/ahaKnowledgeCurationDashboard.js','js/ahaKnowledgeMap.js','js/ahaKnowledgeMapDashboard.js','js/ahaKnowledgeGraphIntelligence.js'
];
const forbidden = /AHARepository|Supabase|createClient|EchoNet|AHASyncHub|fetch\(|AHAIngest\.ingest|createSignalFromMessage|addSignalToChamber|aha_insight_chamber_v1|aha_source_events_v1|visited_places|hg_learning_log_v1|knowledge_universe|trivia_universe/;
for (const file of forbiddenFiles) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  assert(!forbidden.test(src), `${file} contains forbidden backend/sync/insight/history pattern`);
}

{
  const ls = storage();
  const ctx = load('js/ahaDataIntake.js', { localStorage: ls });
  const api = ctx.AHADataIntake;
  assert.equal(api.DEFAULT_CONSENT.useForTrainingCorpus, false);
  assert.equal(api.DEFAULT_CONSENT.useForFineTuning, false);
  assert.equal(api.DEFAULT_CONSENT.useForHistoryGo, false);
  const item = api.normalizeIntakeItem({ title:'T', text:'Long local text for review', consent:{ useForFineTuning:true }});
  assertBoundary(item, { local_only:true, candidate_only:true, manual_review_required:true, approval_required:true, auto_training_enabled:false, fine_tuning_enabled:false, backend_enabled:false, echonet_shared:false, sync_enabled:false, historygo_writeback_enabled:false, writes_to_insight_chamber:false });
  ls.setItem('aha_notes_v1', JSON.stringify([{ id:'n1', title:'Note', text:'A local note with enough text for intake.' }]));
  ls.writes.length = 0;
  const scan = api.scanExistingSources();
  assert.equal(scan.local_only, true); assert.equal(scan.candidate_only, true); assert.equal(scan.manual_review_required, true);
  assert.deepEqual([...new Set(ls.writes)], ['aha_data_intake_queue_v1']);
  const queued = api.loadAllQueue()[0];
  const approved = api.approveForTrainingCorpus(queued.id);
  assert.equal(approved.status, 'approved'); assert.equal(approved.consent.useForTrainingCorpus, true); assert.equal(approved.consent.useForFineTuning, false);
  const corpus = [];
  ctx.AHATrainingCorpus = { addCorpusItem(x){ corpus.push(x); return { id:'c1', ...x }; } };
  const imported = api.importApprovedToTrainingCorpus();
  assert.equal(imported.imported, 1); assert.equal(corpus.length, 1); assert.match(corpus[0].status, /^(raw|needs_review)$/); assert.equal(corpus[0].consent.useForFineTuning, false);
}

{
  const ls = storage();
  const data = load('js/ahaDataIntake.js', { localStorage: ls });
  const ctx = load('js/ahaKnowledgeCuration.js', { localStorage: ls, AHADataIntake:data.AHADataIntake });
  const api = ctx.AHAKnowledgeCuration;
  const item = api.normalizeCurationItem({ title:'Group', summary:'Review this' });
  assertBoundary(item, { local_only:true, curation_only:true, manual_review_required:true, approval_required:true, auto_export_enabled:false, auto_training_enabled:false, fine_tuning_enabled:false, backend_enabled:false, echonet_shared:false, sync_enabled:false, historygo_writeback_enabled:false, writes_to_insight_chamber:false, canonical_engine:false });
  data.AHADataIntake.addIntakeItem({ id:'i1', title:'A', text:'Enough local text for a curation candidate', concepts:['AHA'] });
  ls.writes.length = 0; const dry = api.buildCurationItemsFromIntake({ dryRun:true });
  assert(dry.items.every(i => i.status === 'review')); assert(!ls.writes.includes(api.STORAGE_KEY));
  const real = api.buildCurationItemsFromIntake(); assert(ls.writes.includes(api.STORAGE_KEY));
  const c = real.items[0]; assert.equal(api.sendToTrainingCorpus(c.id).error, 'needs_approval');
  api.approveCurationItem(c.id); const corpus=[]; ctx.AHATrainingCorpus={ addCorpusItem(x){ corpus.push(x); return { id:'tc1', ...x }; } };
  const sent = api.sendToTrainingCorpus(c.id); assert.equal(sent.ok, true); assert.match(corpus[0].status, /^(raw|needs_review)$/); assert.equal(corpus[0].consent.useForFineTuning, false);
  const examples=[]; ctx.AHATrainingExamples={ addExample(x){ examples.push(x); return { id:'e1', ...x }; } }; const ex=api.sendToTrainingExamples(c.id); assert.equal(ex.item.status, 'needs_review');
  const mem=api.sendToMetaInsightsMemory(c.id); assert.equal(mem.candidate.status, 'needs_confirmation'); assert.equal(mem.writes_to_insight_chamber, false);
}

{
  const ls = storage();
  const intake = [{ id:'i1', status:'approved', title:'Intake', text:'Source text', concepts:['Concept'] }];
  const cur = [{ id:'cu1', status:'approved', title:'Cur', summary:'Curated', sourceItemIds:['i1'], concepts:['Concept'] }];
  const ctx = load('js/ahaKnowledgeMap.js', { localStorage: ls, AHADataIntake:{ loadQueue:()=>JSON.parse(JSON.stringify(intake)) }, AHAKnowledgeCuration:{ loadCurationItems:()=>JSON.parse(JSON.stringify(cur)) }, AHATrainingCorpus:{ loadCorpus:()=>[] }, AHATrainingExamples:{ loadExamples:()=>[] } });
  const before = JSON.stringify({ intake, cur }); const map = ctx.AHAKnowledgeMap.buildKnowledgeMap();
  assert.equal(ls.writes.includes(ctx.AHAKnowledgeMap.STORAGE_KEY), false); assert.equal(JSON.stringify({ intake, cur }), before);
  assertBoundary(map, { local_only:true, derived_graph_only:true, canonical_truth:false, writes_to_insight_chamber:false });
  assert(map.nodes.length); map.nodes.forEach(n=>assertBoundary(n,{local_only:true,derived_graph_node:true,canonical_truth:false,source_trace_required:true})); map.edges.forEach(e=>assertBoundary(e,{local_only:true,derived_graph_edge:true,canonical_truth:false,source_trace_required:true}));
  ls.writes.length = 0; const saved = ctx.AHAKnowledgeMap.refreshKnowledgeMap(); assert.deepEqual([...new Set(ls.writes)], [ctx.AHAKnowledgeMap.STORAGE_KEY]); assert.equal(saved.derived_graph_only, true);
}

{
  const ls = storage();
  const ctx = load('js/ahaKnowledgeGraphIntelligence.js', { localStorage: ls, AHAKnowledgeMap:{ loadKnowledgeMap:()=>({nodes:[],edges:[],stats:{}}), buildKnowledgeMap:()=>({nodes:[],edges:[],stats:{}}), collectMapStats:()=>({}) } });
  const a = ctx.AHAKnowledgeGraphIntelligence.analyzeKnowledgeGraph();
  assertBoundary(a, { local_only:true, suggestion_only:true, manual_review_required:true, auto_apply_enabled:false, canonical_truth:false, backend_enabled:false, echonet_shared:false, sync_enabled:false, writes_to_knowledge_map:false, writes_to_insight_chamber:false });
  assert.deepEqual([...new Set(ls.writes)], [ctx.AHAKnowledgeGraphIntelligence.STORAGE_KEY]);
  assert.equal(ctx.AHAKnowledgeGraphIntelligence.sendInsightToCuration('missing', { insight:{ id:'x', title:'T', summary:'S' } }).planned, true);
}

{
  const html = fs.readFileSync(path.join(__dirname, '..', 'knowledge-workbench.html'), 'utf8');
  assert(html.includes('lokal kontrollflate')); assert(html.includes('ikke automatisk trening')); assert(html.includes('Data Intake lager kandidater'));
}

{
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs/AHA_KNOWLEDGE_PIPELINE_BOUNDARY.md'), 'utf8');
  for (const phrase of ['Data Intake creates local candidates','manual review','Curation approval','derived local graph','Graph Intelligence may suggest','call backend','EchoNet','Sync Hub','History Go','AHAIngest','insight chamber','No automatic training','fine-tune']) assert(doc.includes(phrase), phrase);
}
