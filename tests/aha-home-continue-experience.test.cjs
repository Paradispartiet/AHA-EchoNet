const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('js/ahaHomeContinueExperience.js', 'utf8');
const globalNavCode = fs.readFileSync('js/ahaGlobalNav.js', 'utf8');

const context = {
  console,
  Date,
  Array,
  Object,
  String,
  Number,
  JSON,
  document: null,
  addEventListener() {}
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(code, context, { filename: 'js/ahaHomeContinueExperience.js' });

const api = context.AHAHomeContinueExperience;
assert.ok(api, 'Home continue experience should export its API');
assert.equal(typeof api.buildExperience, 'function');

function build(input) {
  return api.buildExperience(input);
}

const review = build({
  home: { counts: { intakeReview: 2, curationReview: 1 } },
  loop: { nextBestAction: { id: 'run_workflow_audit', label: 'Kjør Workflow Audit', href: 'knowledge-workbench.html' } }
});
assert.equal(review.mode, 'review_work');
assert.equal(review.primaryAction.href, 'knowledge-workbench.html');
assert.equal(review.primaryAction.label, 'Fortsett i Workbench');
assert.match(review.description, /3 ting venter/);
assert.doesNotMatch(`${review.title} ${review.description} ${review.primaryAction.label}`, /Workflow Audit|Data Intake|Curation/i, 'Home primary copy should describe user work, not internal stages');

const knowledge = build({
  home: { counts: { graphInsights: 4, trainingReady: 2 } },
  loop: { nextBestAction: { id: 'run_graph_intelligence', label: 'Kjør Graph Intelligence' } }
});
assert.equal(knowledge.mode, 'knowledge_step');
assert.equal(knowledge.primaryAction.href, 'knowledge-workbench.html');
assert.equal(knowledge.primaryAction.label, 'Åpne Workbench');
assert.doesNotMatch(knowledge.title, /Graph|Training/i);

const insight = build({
  home: { counts: {} },
  latestInsight: {
    mode: 'chat_provenance',
    text: 'Makt og ansvar henger sammen i prosjektet',
    createdCount: 2,
    reinforcedCount: 1
  }
});
assert.equal(insight.mode, 'continue_insight');
assert.equal(insight.primaryAction.href, 'chat.html');
assert.equal(insight.secondaryAction.href, 'insights.html');
assert.match(insight.description, /Makt og ansvar/);
assert.deepEqual(Array.from(insight.context), ['2 nye', '1 forsterket']);

const project = build({
  home: { counts: {}, activeProjects: [{ title: 'Fjellprosjekt Nordlys', count: 7 }] }
});
assert.equal(project.mode, 'continue_project');
assert.match(project.title, /Fjellprosjekt Nordlys/);
assert.equal(project.primaryAction.href, 'chat.html');
assert.equal(project.secondaryAction.href, 'search.html');

const previousActivity = build({
  home: { counts: { chatMessages: 12, corpusItems: 5 } }
});
assert.equal(previousActivity.mode, 'continue_chat');
assert.equal(previousActivity.primaryAction.href, 'chat.html');
assert.equal(previousActivity.secondaryAction.href, 'search.html');

const emptyWithTechnicalLoop = build({
  home: { counts: {} },
  loop: { nextBestAction: { id: 'run_workflow_audit', label: 'Kjør Workflow Audit' } }
});
assert.equal(emptyWithTechnicalLoop.mode, 'start_chat');
assert.equal(emptyWithTechnicalLoop.primaryAction.href, 'chat.html');
assert.equal(emptyWithTechnicalLoop.technicalPrimarySuppressed, true, 'technical loop action should be explicitly suppressed as Home primary action');
assert.doesNotMatch(`${emptyWithTechnicalLoop.title} ${emptyWithTechnicalLoop.description}`, /Audit|Workflow|Graph|Training/i);

assert.match(globalNavCode, /js\/ahaHomeContinueExperience\.js/, 'global product shell should load the Home continue adapter on Home');
assert.match(globalNavCode, /if \(activeFile === "index\.html"\)[\s\S]*loadHomeContinueExperience\(\)/, 'Home loader should be scoped to index.html');
assert.equal(/localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(code), false, 'Home continue adapter must not write localStorage');
assert.equal(/\bfetch\s*\(/.test(code), false, 'Home continue adapter must not call backend/fetch');
assert.equal(/AHAIngest|EchoNet|sync_enabled|setArticleStatus/.test(code), false, 'Home continue adapter must not mutate downstream systems');

console.log('aha-home-continue-experience.test.cjs passed');
