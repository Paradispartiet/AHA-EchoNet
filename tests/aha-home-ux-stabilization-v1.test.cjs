const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
function load(extra = {}) {
  const store = new Map();
  const window = { localStorage: { getItem:k=>store.get(k)||null, setItem:(k,v)=>store.set(k,String(v)) }, ...extra };
  const context = { console, window, globalThis: window };
  vm.createContext(context);
  vm.runInContext(read('js/ahaLocalInsightHome.js'), context);
  return context.window.AHALocalInsightHome;
}
const index = read('index.html');
const dashboard = read('js/ahaLocalInsightHomeDashboard.js');
const css = read('css/aha-dashboard.css');
assert.match(index, /js\/ahaLocalInsightHome\.js/);
assert.match(index, /js\/ahaLocalInsightHomeDashboard\.js/);
for (const id of ['aha-local-home-hero','aha-local-home-priority-strip','aha-local-home-next-action','aha-local-home-highlights','aha-local-home-active-work','aha-local-home-projects','aha-local-home-recent','aha-local-home-module-tiles','aha-local-home-technical-details']) assert.match(index, new RegExp(id));
assert.match(dashboard, /renderHero/);
assert.match(dashboard, /Åpne Chat/);
assert.match(dashboard, /Åpne Workbench/);
assert.match(dashboard, /slice\(0, 5\)/);
assert.match(dashboard, /aha-home-work-chip/);
assert.match(dashboard, /aha-home-tag/);
assert.match(dashboard, /aha-home-module-compact-tile/);
assert.match(dashboard, /Home lagrer kun lokal status-snapshot/);
assert.doesNotMatch(dashboard, /localInsightHome payload available|workflowAudit status strong|graphIntelligence opportunities|\[object Object\]|localStorage key/);
assert.match(css, /\.aha-home-main-grid/);
assert.match(css, /@media \(max-width: 760px\)[\s\S]*grid-template-columns: 1fr/);
assert.match(css, /overflow-x: hidden/);
const api = load({
  AHAKnowledgeWorkflowAudit: { loadAudit: () => ({ status: 'active', score: 88 }) },
  AHADataIntake: { buildIntakeSummary: () => ({ total: 3, reviewCount: 1 }) },
  AHAKnowledgeCuration: { buildCurationSummary: () => ({ reviewCount: 2, highPriority: 2, trainingReady: 1 }) },
  AHAKnowledgeMap: { buildKnowledgeMapSummary: () => ({ nodes: 10, edges: 6, projects: 2, concepts: 5, topProjects: [{ title: 'AHA Personal AI', count: 14 }, { title: 'History Go', count: 6 }, { title: 'Extra', count: 1 }, { title: 'Hidden', count: 1 }] }) },
  AHAKnowledgeGraphIntelligence: { buildGraphIntelligenceSummary: () => ({ insightCount: 7, topInsights: Array.from({length: 7}, (_, i) => ({ title: `Signal ${i}`, summary: 'Kort signal', severity: i ? 'info' : 'warning' })) }) },
  AHATrainingCorpus: { buildCorpusSummary: () => ({ total: 4 }) },
  AHAChatPersistence: { collectChatStats: () => ({ messages: 9, sessions: [{}] }) }
});
const payload = api.buildHomeInsightPayload();
assert.ok(payload.headline);
assert.equal(payload.nextActions.length, 1);
assert.ok(payload.nextActions[0].href);
assert.ok(payload.highlights.length <= 5);
assert.equal(payload.pendingWork.length, 5);
assert.equal(payload.activeProjects.length <= 5, true);
assert.equal(payload.recentActivity.length <= 5, true);
assert.equal(payload.moduleTiles[0].id, 'chat');
assert.equal(payload.moduleTiles[1].id, 'workbench');
assert.ok(payload.moduleTiles.every(t => t.metrics.length >= 1));
const empty = load().buildHomeInsightPayload();
assert.match(empty.summary, /Home er klart/);
assert.match(empty.summary, /Start i Chat|Workflow Audit/);
assert.doesNotMatch(index, /scanAllSources\(|approveIntake\(|approveCuration\(|sendToTraining\(|buildIndex\(|exportData\(/);
assert.match(read('js/ahaProductIntegration.js'), /localInsightHome/);
assert.match(read('js/ahaPersonalAiControl.js'), /localInsightHome/);
assert.match(read('js/metaInsightsAgent.js'), /localInsightHomePack/);
console.log('aha-home-ux-stabilization-v1.test.cjs passed');
