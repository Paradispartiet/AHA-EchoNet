const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
function load(extra = {}) {
  const store = new Map();
  const window = { localStorage: { getItem:k=>store.get(k)||null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k) }, ...extra };
  const context = { console, window, globalThis: window };
  vm.createContext(context);
  vm.runInContext(read('js/ahaLocalInsightHome.js'), context);
  return { api: context.window.AHALocalInsightHome, window, store };
}

let { api } = load();
const empty = api.buildHomeInsightPayload({ generatedAt: '2026-01-01T00:00:00.000Z' });
assert.equal(empty.version, 'aha_local_insight_home_v1');
assert.ok(['empty','starting','active','needs_review','strong'].includes(empty.status));
assert.ok(empty.headline.includes('AHA'));
assert.ok(empty.nextActions.length === 1);
assert.equal(empty.nextActions[0].id, 'run-workflow-audit');
assert.ok(empty.moduleTiles.find(t => t.id === 'chat'));

({ api } = load({
  AHAKnowledgeWorkflowAudit: { loadAudit: () => ({ status: 'active', score: 70 }) },
  AHADataIntake: { buildIntakeSummary: () => ({ total: 7, reviewCount: 2, approvedCount: 3, latestItems: [{ title: 'Intake', createdAt: '' }] }) },
  AHAKnowledgeCuration: { buildCurationSummary: () => ({ reviewCount: 1, highPriority: 1, trainingReady: 2, topThemes: ['x'] }) },
  AHAKnowledgeMap: { buildKnowledgeMapSummary: () => ({ nodes: 9, edges: 4, projects: 2, concepts: 3, topProjects: [{ title: 'Prosjekt A', count: 5 }] }) },
  AHAKnowledgeGraphIntelligence: { buildGraphIntelligenceSummary: () => ({ insightCount: 4, topInsights: [{ title: 'Svak lenke', summary: 'Et gap finnes.', severity: 'warning' }] }) },
  AHATrainingCorpus: { buildCorpusSummary: () => ({ total: 6, approved: 5, latestItems: [{ title: 'Corpus' }] }) },
  AHATrainingExamples: { buildExamplesSummary: () => ({ total: 8, approved: 7 }) },
  AHAPersonalAiControl: { buildControlStatus: () => ({ overall: { score: 55 }, modules: { personalRetrieval: { status: 'ready' }, semanticRetrieval: { status: 'starting' } } }) },
  MetaInsightsMemory: { buildMemoryPack: () => ({ confirmedClaims: 3, importantClaims: 1, needsReview: 2 }) },
  AHAChatPersistence: { collectChatStats: () => ({ messages: 12, sessions: [{ title: 'Chat' }] }) },
  AHAPersonalAnswerEvaluation: { loadEvaluations: () => [{ summary: 'Nyttig svar', score: 81 }] }
}));
const payload = api.buildHomeInsightPayload();
const counts = api.collectHomeCounts();
assert.equal(counts.chatMessages, 12);
assert.equal(counts.intakeReview, 2);
assert.equal(counts.curationReview, 1);
assert.equal(counts.mapNodes, 9);
assert.equal(counts.graphInsights, 4);
assert.equal(counts.trainingReady, 2);
assert.equal(counts.corpusItems, 6);
assert.equal(api.buildHomeHeadline({ counts: { intakeReview: 2, curationReview: 1 } }), 'Det ligger 3 ting til vurdering.');
assert.equal(api.buildPrimaryAction(payload).id, 'review-intake');
assert.ok(api.buildHighlights(payload).some(h => h.source === 'Graph Intelligence'));
assert.ok(api.buildHighlights(payload).some(h => h.source === 'Knowledge Curation'));
assert.ok(api.buildPendingWork(payload).some(w => w.id === 'training' && w.count === 2));
assert.ok(api.buildRecentActivity(payload).length >= 1);
assert.ok(api.buildModuleTiles(payload).find(t => t.id === 'map').metrics.some(m => m.includes('9 noder')));
const before = JSON.stringify(payload.sources.intake);
const refreshed = api.refreshHome({ save: false });
assert.equal(JSON.stringify(refreshed.sources.intake), before);

const index = read('index.html');
assert.match(index, /js\/ahaLocalInsightHome\.js/);
assert.match(index, /js\/ahaLocalInsightHomeDashboard\.js/);
for (const id of ['aha-local-home-hero','aha-local-home-next-action','aha-local-home-highlights','aha-local-home-active-work','aha-local-home-projects','aha-local-home-recent','aha-local-home-module-tiles']) assert.match(index, new RegExp(id));
assert.doesNotMatch(index, /scanAllSources\(|approveIntake\(|approveCuration\(|sendToTraining\(/);

assert.match(read('js/ahaProductIntegration.js'), /localInsightHome/);
assert.match(read('js/ahaPersonalAiControl.js'), /localInsightHome/);
assert.match(read('js/metaInsightsAgent.js'), /localInsightHomePack/);
