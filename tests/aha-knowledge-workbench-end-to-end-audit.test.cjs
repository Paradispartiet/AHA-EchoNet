const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function makeStorage() {
  const data = new Map();
  const writes = [];
  return {
    data,
    writes,
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { writes.push(key); data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    clear() { data.clear(); }
  };
}

function makeContext() {
  const localStorage = makeStorage();
  const context = { console, Date, Math, JSON, Map, Set, Array, Object, String, Number, localStorage, document: null };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  return { context, localStorage };
}

function run(file, context) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { context, localStorage } = makeContext();
[
  'js/ahaDataIntake.js',
  'js/ahaTrainingCorpus.js',
  'js/ahaTrainingExamples.js',
  'js/ahaKnowledgeCuration.js',
  'js/ahaKnowledgeMap.js',
  'js/ahaKnowledgeGraphIntelligence.js',
  'js/ahaKnowledgeWorkbench.js'
].forEach((file) => run(file, context));

// 1. Real material starts as an Intake candidate, not knowledge.
const intake = context.AHADataIntake.addIntakeItem({
  id: 'intake-e2e-workbench',
  source: 'manual',
  sourceType: 'manual_text',
  title: 'Samtykke i AHA-kunnskapsløypa',
  text: 'AHA skal sende materiale videre i kunnskapsløypa først etter eksplisitt manuell vurdering og godkjenning.',
  project: 'AHA-EchoNet',
  concepts: ['samtykke', 'kunnskapsflyt', 'Personal AI'],
  tags: ['workflow', 'approval'],
  status: 'review',
  consent: {
    useForTrainingCorpus: false,
    useForRetrieval: true,
    useForFineTuning: false,
    useForHistoryGo: false
  }
});
assert.equal(intake.local_only, true);
assert.equal(intake.candidate_only, true);
assert.equal(intake.manual_review_required, true);
assert.equal(intake.approval_required, true);
assert.equal(intake.auto_training_enabled, false);
assert.equal(intake.consent.useForTrainingCorpus, false);

// 2. Intake approval is explicit and still does not create Training data by itself.
const approvedIntake = context.AHADataIntake.approveForTrainingCorpus(intake.id);
assert.equal(approvedIntake.status, 'approved');
assert.equal(approvedIntake.consent.useForTrainingCorpus, true);
assert.equal(context.AHATrainingCorpus.collectCorpusStats().total, 0);

// 3. Real Curation is built from Intake and starts in review.
const built = context.AHAKnowledgeCuration.buildCurationItemsFromIntake();
assert.equal(built.ok, true);
assert.ok(built.created >= 1);
const curation = built.items.find((item) => item.sourceItemIds.includes(intake.id)) || built.items[0];
assert.ok(curation, 'a real curation item should be created');
assert.equal(curation.status, 'review');
assert.equal(curation.manual_review_required, true);
assert.equal(curation.auto_training_enabled, false);

// 4. The real Training export is blocked until Curation approval.
const blockedTraining = context.AHAKnowledgeCuration.sendToTrainingCorpus(curation.id);
assert.equal(blockedTraining.ok, false);
assert.equal(blockedTraining.error, 'needs_approval');
assert.equal(context.AHATrainingCorpus.collectCorpusStats().total, 0);

const approvedCuration = context.AHAKnowledgeCuration.approveCurationItem(curation.id);
assert.equal(approvedCuration.status, 'approved');
assert.ok(approvedCuration.approvedAt);

// 5. The real Knowledge Map derives from approved local material; it is never canonical truth.
const map = context.AHAKnowledgeMap.refreshKnowledgeMap();
assert.equal(map.local_only, true);
assert.equal(map.derived_graph_only, true);
assert.equal(map.canonical_truth, false);
assert.ok(map.nodes.length > 0, 'approved pipeline material should produce map nodes');
assert.ok(map.nodes.every((node) => node.local_only === true && node.canonical_truth === false));
assert.ok(map.edges.every((edge) => edge.local_only === true && edge.canonical_truth === false));

// 6. Real Graph Intelligence is suggestion-only and must not rewrite the Knowledge Map.
const mapBeforeGraph = localStorage.getItem(context.AHAKnowledgeMap.STORAGE_KEY);
const graph = context.AHAKnowledgeGraphIntelligence.analyzeKnowledgeGraph();
assert.equal(graph.local_only, true);
assert.equal(graph.suggestion_only, true);
assert.equal(graph.manual_review_required, true);
assert.equal(graph.auto_apply_enabled, false);
assert.equal(graph.canonical_truth, false);
assert.equal(graph.writes_to_knowledge_map, false);
assert.equal(localStorage.getItem(context.AHAKnowledgeMap.STORAGE_KEY), mapBeforeGraph,
  'Graph Intelligence must not mutate the stored Knowledge Map');

// 7. Only after explicit Curation approval may the real item enter Training Corpus.
const training = context.AHAKnowledgeCuration.sendToTrainingCorpus(curation.id);
assert.equal(training.ok, true);
assert.ok(training.item);
assert.equal(training.item.status, 'raw', 'Curation export enters Training as review material, not auto-approved knowledge');
assert.equal(training.item.review_required, true);
assert.equal(training.item.approval_required, true);
assert.equal(training.item.model_training_enabled, false);
assert.equal(training.item.fine_tuning_enabled, false);
assert.equal(training.item.consent.useForFineTuning, false);
assert.equal(context.AHATrainingCorpus.collectCorpusStats().approved, 0,
  'Workbench/Curation must not auto-approve the Training Corpus item');

// Explicit corpus review is a separate user action.
const approvedCorpus = context.AHATrainingCorpus.markCorpusItemStatus(training.item.id, 'approved');
assert.equal(approvedCorpus.status, 'approved');
assert.equal(context.AHATrainingCorpus.collectCorpusStats().approved, 1);

// 8. Workbench status reads the same real stores and presents one next action; it does not invent another pipeline.
const status = context.AHAKnowledgeWorkbench.buildWorkbenchStatus({ save: false, now: '2026-08-11T10:00:00.000Z' });
assert.ok(status.counts.intakeTotal >= 1);
assert.ok(status.counts.curationTotal >= 1);
assert.ok(status.counts.mapNodes > 0);
assert.ok(status.counts.corpusItems >= 1);
assert.equal(status.local_only, true);
assert.equal(status.manual_review_required, true);
assert.equal(status.auto_training_enabled, false);
assert.equal(status.sync_enabled, false);
assert.equal(status.echonet_shared, false);
assert.equal(status.historygo_writeback_enabled, false);
assert.ok(status.nextAction && status.nextAction.id, 'Workbench must still resolve one canonical next action');

// 9. The safe pipeline is a status/read pass. It may save Workbench status, but it must not mutate source knowledge stores.
const protectedKeys = [
  context.AHADataIntake.STORAGE_KEY,
  context.AHAKnowledgeCuration.STORAGE_KEY,
  context.AHAKnowledgeMap.STORAGE_KEY,
  context.AHAKnowledgeGraphIntelligence.STORAGE_KEY,
  context.AHATrainingCorpus.STORAGE_KEY
].filter(Boolean);
const beforeSafePipeline = Object.fromEntries(protectedKeys.map((key) => [key, localStorage.getItem(key)]));
const safePipeline = context.AHAKnowledgeWorkbench.runWorkbenchPipeline({ now: '2026-08-11T10:01:00.000Z' });
assert.equal(safePipeline.ok, true);
assert.equal(safePipeline.local_only, true);
assert.equal(safePipeline.manual_review_required, true);
assert.equal(safePipeline.auto_training_enabled, false);
assert.equal(safePipeline.sync_enabled, false);
assert.equal(safePipeline.echonet_shared, false);
assert.match(safePipeline.summary, /Ingen approval, map refresh, graph analysis, consent, training eller import ble gjort automatisk/);
for (const key of protectedKeys) {
  assert.equal(localStorage.getItem(key), beforeSafePipeline[key], `safe pipeline must not mutate ${key}`);
}

// 10. Lock the user-facing Workbench and its advanced safety controls around this real pipeline.
const html = fs.readFileSync('knowledge-workbench.html', 'utf8');
const dashboard = fs.readFileSync('js/ahaKnowledgeWorkbenchDashboard.js', 'utf8');
assert.ok(html.includes('Hva venter på deg?'));
assert.ok(html.includes('Hva bør du gjøre nå?'));
assert.ok(html.includes('Hvor i løypa er materialet?'));
assert.ok(html.includes('Avansert kontroll og pipeline'));
assert.ok(html.includes('data-workbench-action="safe_pipeline"'));
assert.ok(dashboard.includes('buildWorkbenchExperienceModel'));
assert.equal(/approveCurationItem\s*\(/.test(dashboard), false,
  'the Workbench dashboard must not approve Curation automatically');

console.log('aha-knowledge-workbench-end-to-end-audit.test.cjs passed');
