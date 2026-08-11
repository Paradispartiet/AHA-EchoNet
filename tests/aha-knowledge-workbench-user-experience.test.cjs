const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const dashboardCode = fs.readFileSync('js/ahaKnowledgeWorkbenchDashboard.js', 'utf8');
const html = fs.readFileSync('knowledge-workbench.html', 'utf8');

function loadDashboard() {
  const context = { console, Array, Object, String, Number, Set, JSON, document: null };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(dashboardCode, context, { filename: 'js/ahaKnowledgeWorkbenchDashboard.js' });
  return context.AHAKnowledgeWorkbenchDashboard;
}

function stageCards() {
  return [
    { id: 'sources', status: 'ready', count: 1 },
    { id: 'intake', status: 'ready', count: 4 },
    { id: 'curation', status: 'blocked', count: 2 },
    { id: 'map', status: 'blocked', count: 0 },
    { id: 'graph_intelligence', status: 'blocked', count: 0 },
    { id: 'training', status: 'blocked', count: 0 },
    { id: 'personal_ai', status: 'blocked', count: 0 },
    { id: 'chat', status: 'ready', count: 0 }
  ];
}

const dashboard = loadDashboard();
assert.ok(dashboard, 'Knowledge Workbench dashboard API should load without a DOM');

const status = {
  counts: {
    intakeTotal: 4,
    intakeReview: 2,
    curationTotal: 2,
    curationReview: 1,
    curationApproved: 1,
    mapNodes: 0,
    mapEdges: 0,
    graphInsights: 3,
    suggestedLinks: 2,
    trainingReady: 2,
    corpusItems: 1,
    examples: 1,
    personalAiScore: 70
  },
  overall: { status: 'ready_to_curate', label: 'Klar for curation', score: 55 },
  workflow: {
    currentStage: 'curation',
    stageCards: stageCards()
  },
  nextAction: {
    id: 'approve_curation',
    label: 'Godkjenn curation',
    description: 'Curation items venter på godkjenning.',
    href: 'curation.html',
    action: 'open'
  }
};

const model = dashboard.buildWorkbenchExperienceModel(status);
assert.deepEqual(JSON.parse(JSON.stringify(model.waiting.map((item) => item.id))), [
  'intake_review',
  'curation_review',
  'graph_review',
  'training_ready'
]);
assert.match(model.waiting[0].title, /2 nye elementer trenger vurdering/);
assert.match(model.waiting[1].title, /1 kuratering trenger godkjenning/);
assert.match(model.waiting[2].title, /3 grafinnsikter å se gjennom/);
assert.match(model.waiting[2].description, /ikke ferdig godkjent kunnskap/);
assert.match(model.waiting[3].title, /2 elementer er klare for Training/);

assert.deepEqual(JSON.parse(JSON.stringify(model.progress.readyStages)), ['Kilder', 'Inntak', 'Bruk i Chat']);
assert.equal(model.progress.currentLabel, 'Kuratering');
assert.deepEqual(JSON.parse(JSON.stringify(model.progress.laterStages)), [
  'Kunnskapskart',
  'Sammenhenger og forslag',
  'Godkjent kunnskapsgrunnlag',
  'Personal AI'
]);
assert.equal(model.next.id, 'approve_curation');
assert.match(model.next.after, /Godkjent kuratering kan brukes til å bygge det lokale kunnskapskartet/);

assert.equal(dashboard.stageLabel('graph_intelligence'), 'Sammenhenger og forslag');
assert.equal(dashboard.stageLabel('training'), 'Godkjent kunnskapsgrunnlag');
assert.equal(dashboard.stageLabel('chat'), 'Bruk i Chat');

const recommendations = dashboard.buildUserRecommendations(status);
assert.ok(recommendations.some((item) => /Vurder nye intake-kandidater/.test(item)));
assert.ok(recommendations.some((item) => /Godkjenn kurateringen manuelt/.test(item)));
assert.ok(recommendations.some((item) => /grafinnsikter som forslag/.test(item)));
assert.ok(recommendations.some((item) => /godkjent materiale videre til Training/.test(item)));
assert.doesNotMatch(recommendations.join(' '), /Sync Hub|backend|safe pipeline|workflow simulation/i);

const empty = dashboard.buildWorkbenchExperienceModel({
  counts: {},
  overall: { label: 'Trenger materiale', score: 10 },
  workflow: { currentStage: 'sources', stageCards: stageCards().map((card) => ({ ...card, status: card.id === 'chat' ? 'ready' : 'blocked' })) },
  nextAction: { id: 'scan_sources', label: 'Skann kilder', description: 'Ingen intake items finnes ennå.', href: 'intake.html', action: 'scan_sources' }
});
assert.equal(empty.waiting.length, 1);
assert.equal(empty.waiting[0].id, 'nothing_waiting');
assert.match(empty.waiting[0].title, /Ingen kunnskapskø ennå/);
assert.match(empty.next.after, /Data Intake som kandidater/);

assert.match(html, /Hva venter på deg i kunnskapsløypa/);
assert.match(html, /Hva venter på deg\?/);
assert.match(html, /Hva bør du gjøre nå\?/);
assert.match(html, /Hvor i løypa er materialet\?/);
assert.match(html, /Ingenting godkjennes eller trenes automatisk/);
assert.match(html, /Knowledge Map er en avledet lokal graf – ikke canonical sannhet/);
assert.match(html, /Avansert kontroll og pipeline/);
assert.match(html, /Workflow board/);
assert.match(html, /data-workbench-action="safe_pipeline"/);

const advancedIndex = html.indexOf('<details id="workbench-advanced"');
for (const technicalAction of ['scan_sources', 'build_curation_queue', 'refresh_knowledge_map', 'analyze_graph', 'workbench_refresh', 'safe_pipeline', 'workflow_audit', 'workflow_simulation']) {
  const actionIndex = html.indexOf(`data-workbench-action="${technicalAction}"`);
  assert.ok(actionIndex > advancedIndex, `${technicalAction} must stay inside the advanced pipeline section`);
}
assert.ok(html.indexOf('Hva bør du gjøre nå?') < advancedIndex, 'primary user journey must appear before technical controls');

assert.equal(/localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(dashboardCode), false,
  'presentation dashboard must not introduce persistence');
assert.equal(/\bfetch\s*\(/.test(dashboardCode), false,
  'presentation dashboard must not fetch');
assert.equal(/approveCurationItem\s*\(/.test(dashboardCode), false,
  'Workbench presentation must not auto-approve curation');

console.log('aha-knowledge-workbench-user-experience.test.cjs passed');
