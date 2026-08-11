const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const dashboardCode = fs.readFileSync('js/ahaPersonalAiDashboard.js', 'utf8');
const html = fs.readFileSync('personal-ai.html', 'utf8');

const context = {
  console,
  Date,
  Math,
  JSON,
  Map,
  Set,
  Array,
  Object,
  String,
  Number
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(dashboardCode, context, { filename: 'js/ahaPersonalAiDashboard.js' });

const api = context.AHAPersonalAiDashboard;
assert.ok(api, 'Personal AI dashboard API should load without a DOM');
assert.equal(typeof api.buildExperienceModel, 'function');
assert.equal(typeof api.buildUserRecommendations, 'function');

const richStatus = {
  overall: { label: 'Fungerer', score: 82, level: '4_answer_ready' },
  modules: {
    metaInsightsMemory: { counts: { confirmedClaims: 2, importantClaims: 1 } },
    trainingCorpus: { counts: { approved: 5 } },
    trainingExamples: { counts: { approved: 4 } },
    personalRetrieval: { counts: { indexedItems: 12 } },
    semanticRetrieval: { counts: { indexedItems: 8 } },
    chatPersonalContext: { status: 'working' },
    personalAnswerComposer: { available: true, status: 'working' },
    personalAnswerEvaluation: { counts: { total: 7, averageScore: 84 } },
    personalModelReadiness: { counts: { score: 76, level: 'klar for RAG' } },
    personalAiLoopAudit: { status: 'working', score: 91 }
  }
};

const model = api.buildExperienceModel(richStatus);
assert.equal(model.knowledge.selfInsights, 3);
assert.equal(model.knowledge.approvedCorpus, 5);
assert.equal(model.knowledge.approvedExamples, 4);
assert.match(model.knowledge.summary, /3 bekreftede\/viktige selvinnsikter/);
assert.equal(model.answering.retrievalLabel, 'Hybrid personlig søk er aktivt');
assert.equal(model.answering.answerReady, true);
assert.match(model.answering.summary, /AHA kan bygge personlig svargrunnlag før et Chat-svar/);
assert.equal(model.quality.evaluationCount, 7);
assert.match(model.quality.summary, /7 svar er evaluert/);
assert.match(model.quality.summary, /gjennomsnitt 84\/100/);
assert.match(model.quality.summary, /Svarsløyfen er auditert \(91\/100\)/);
assert.equal(api.levelLabel('4_answer_ready'), 'Personlig svargrunnlag klart');
assert.equal(api.levelLabel('5_evaluated_loop'), 'Evaluert svarsløyfe');

const richRecommendations = Array.from(api.buildUserRecommendations(richStatus));
assert.ok(richRecommendations.some((item) => /Personlig grunnlag/.test(item)),
  'experienced users should be pointed to grounding under actual Chat answers');
assert.doesNotMatch(richRecommendations.join(' '), /Sync Hub|backend|EchoNet|full kontrolltest/i,
  'top-level recommendations should stay user-facing');

const emptyStatus = {
  overall: { label: 'Trenger data', score: 0, level: '0_data_needed' },
  modules: {
    metaInsightsMemory: { counts: { confirmedClaims: 0, importantClaims: 0 } },
    trainingCorpus: { counts: { approved: 0 } },
    trainingExamples: { counts: { approved: 0 } },
    personalRetrieval: { counts: { indexedItems: 0 } },
    semanticRetrieval: { counts: { indexedItems: 0 } },
    chatPersonalContext: { status: 'empty' },
    personalAnswerComposer: { available: true, status: 'building' },
    personalAnswerEvaluation: { counts: { total: 0, averageScore: 0 } },
    personalModelReadiness: { counts: { score: 0, level: '' } },
    personalAiLoopAudit: { status: 'empty', score: 0 }
  }
};
const emptyModel = api.buildExperienceModel(emptyStatus);
assert.match(emptyModel.knowledge.summary, /Ingen godkjent personlig kunnskap/);
assert.equal(emptyModel.answering.retrievalLabel, 'Personlig søk er ikke bygget ennå');
assert.equal(emptyModel.answering.answerReady, false);
const emptyRecommendations = Array.from(api.buildUserRecommendations(emptyStatus));
assert.ok(emptyRecommendations.some((item) => /Bekreft noen selvinnsikter/.test(item)));
assert.ok(emptyRecommendations.some((item) => /Godkjenn materiale/.test(item)));
assert.ok(emptyRecommendations.some((item) => /Bygg personlig søk/.test(item)));
assert.ok(emptyRecommendations.some((item) => /Still et spørsmål.*Chat/.test(item)));

assert.match(html, /<p class="eyebrow">Min Personal AI<\/p>/);
assert.match(html, /<h1>Hva AHA kan bruke når den svarer deg<\/h1>/);
assert.match(html, /id="personal-ai-experience"/);
assert.match(html, /Hva bør du gjøre nå\?/);
assert.match(html, /For å gjøre AHA mer personlig/);
assert.match(html, /href="chat\.html">Spør AHA<\/a>/);
assert.doesNotMatch(html.slice(0, html.indexOf('id="personal-ai-advanced"')), /Control Panel|Kjør full kontrolltest|Test Answer Composer|Test Answer Evaluation/,
  'technical control language must not dominate the primary Personal AI surface');

const advancedIndex = html.indexOf('id="personal-ai-advanced"');
assert.ok(advancedIndex >= 0, 'advanced control section must remain available');
[
  'data-personal-ai-action="build_retrieval_index"',
  'data-personal-ai-action="build_semantic_index"',
  'data-personal-ai-action="run_ai_loop_audit"',
  'data-personal-ai-action="test_answer_composer"',
  'data-personal-ai-action="test_answer_evaluation"',
  'data-personal-ai-action="full_control_test"',
  'id="personal-ai-modules"',
  'id="personal-ai-result"'
].forEach((needle) => {
  assert.ok(html.indexOf(needle) > advancedIndex, `${needle} should stay inside the advanced section`);
});

assert.match(html, /trener ikke en personlig modell/i);
assert.match(html, /de deles ikke, synkes ikke og skrives ikke til History Go/i);
assert.equal(/\bfetch\s*\(/.test(dashboardCode), false, 'dashboard presentation must not fetch');
assert.equal(/localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(dashboardCode), false,
  'dashboard presentation must not add its own persistence');

console.log('aha-personal-ai-user-experience.test.cjs passed');
