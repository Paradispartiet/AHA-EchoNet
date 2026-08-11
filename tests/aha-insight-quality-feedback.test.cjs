const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('js/ahaInsightQualityFeedback.js', 'utf8');
const navCode = fs.readFileSync('js/ahaGlobalNav.js', 'utf8');
const engineCode = fs.readFileSync('js/insightsChamber.js', 'utf8');

const context = {
  console,
  Date,
  Array,
  Object,
  String,
  Number,
  Set,
  Map,
  JSON,
  document: null,
  addEventListener() {}
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(code, context, { filename: 'js/ahaInsightQualityFeedback.js' });

const api = context.AHAInsightQualityFeedback;
assert.ok(api, 'Insight quality API should exist');
assert.equal(typeof api.applyFeedback, 'function');
assert.equal(typeof api.buildQualityAudit, 'function');

const chamber = {
  insights: [
    {
      id: 'ins_a',
      title: 'Makt og ansvar henger sammen i institusjoner',
      summary: 'Makt og ansvar henger sammen i institusjoner og praksis.',
      status: 'suggested',
      strength: { evidence_count: 2, total_score: 44 },
      depth_score: 3,
      concepts: [{ key: 'makt', label: 'makt' }]
    },
    {
      id: 'ins_b',
      title: 'Makt og ansvar henger sammen i institusjoner',
      summary: 'Makt og ansvar henger sammen i institusjoner og praksis',
      status: 'suggested',
      strength: { evidence_count: 2, total_score: 42 },
      depth_score: 3,
      concepts: [{ key: 'ansvar', label: 'ansvar' }]
    },
    {
      id: 'ins_weak',
      title: 'Noe skjedde',
      summary: 'Dette kan være noe.',
      status: 'suggested',
      strength: { evidence_count: 1, total_score: 10 },
      depth_score: 0,
      concepts: [],
      claims: [],
      patterns: []
    }
  ]
};

let result = api.applyFeedback('ins_a', 'important', { chamber, now: '2026-08-12T00:10:00.000Z', save: false });
assert.equal(result.ok, true);
assert.equal(chamber.insights[0].status, 'suggested', 'marking important must not reject or archive the insight');
assert.equal(chamber.insights[0].user_priority, 'important');
assert.equal(chamber.insights[0].user_quality_status, 'important');
assert.equal(chamber.insights[0].user_quality_feedback.length, 1);
assert.equal(chamber.insights[0].user_quality_feedback[0].response, 'important');

result = api.applyFeedback('ins_a', 'important', { chamber, now: '2026-08-12T00:11:00.000Z', save: false });
assert.equal(result.ok, true);
assert.equal(result.noChange, true, 'same quality choice should be idempotent');
assert.equal(chamber.insights[0].user_quality_feedback.length, 1, 'idempotent choice must not spam history');

result = api.applyFeedback('ins_a', 'not_insight', { chamber, now: '2026-08-12T00:12:00.000Z', save: false });
assert.equal(result.ok, true);
assert.equal(chamber.insights[0].status, 'rejected');
assert.equal(chamber.insights[0].rejection_reason, 'user_not_insight');
assert.equal(chamber.insights[0].user_quality_status, 'rejected');
assert.equal(chamber.insights[0].user_priority, undefined, 'rejected insight should not remain prioritized');
assert.equal(api.activeInsight(chamber.insights[0]), false, 'user-rejected insight must be inactive');
assert.equal(chamber.insights[0].user_quality_feedback.length, 2, 'history must preserve important then rejection');

result = api.applyFeedback('ins_a', 'undo', { chamber, now: '2026-08-12T00:13:00.000Z', save: false });
assert.equal(result.ok, true);
assert.equal(result.restored, true);
assert.equal(chamber.insights[0].status, 'suggested', 'undo must restore prior canonical status');
assert.equal(chamber.insights[0].user_priority, 'important', 'undo rejection must restore prior important state');
assert.equal(chamber.insights[0].rejection_reason, undefined);
assert.equal(api.activeInsight(chamber.insights[0]), true);
assert.ok(chamber.insights[0].user_quality_feedback.some((item) => item.response === 'not_insight' && item.undone_at), 'rejected history must remain auditable after undo');
assert.equal(chamber.insights[0].user_quality_feedback.at(-1).response, 'undo');

const nothing = api.applyFeedback('ins_b', 'undo', { chamber, now: '2026-08-12T00:14:00.000Z', save: false });
assert.equal(nothing.ok, false);
assert.equal(nothing.reason, 'nothing_to_undo');

const audit = api.buildQualityAudit(chamber);
assert.equal(audit.advisoryOnly, true);
assert.equal(audit.total, 3);
assert.equal(audit.active, 3);
assert.equal(audit.important, 1);
assert.equal(audit.userRejected, 0);
assert.equal(audit.weakCandidates, 1, 'short unsupported insight should be a review signal');
assert.equal(audit.duplicatePairs, 1, 'near-identical active insights should be flagged as a review pair');
assert.ok(audit.reviewCount >= 1);

api.applyFeedback('ins_b', 'not_insight', { chamber, now: '2026-08-12T00:15:00.000Z', save: false });
const afterReject = api.buildQualityAudit(chamber);
assert.equal(afterReject.active, 2, 'user-rejected insight must be excluded from active audit');
assert.equal(afterReject.userRejected, 1);
assert.equal(afterReject.duplicatePairs, 0, 'rejected insight must not participate in duplicate review');

assert.match(engineCode, /status !== "archived" && status !== "rejected" && status !== "merged"/, 'canonical InsightsEngine must already exclude rejected insights');
assert.match(navCode, /activeFile === "chat\.html" \|\| activeFile === "insights\.html"/, 'quality controls should load only on Chat and Insights surfaces');
assert.match(navCode, /js\/ahaInsightQualityFeedback\.js/);

const storageKeys = [...code.matchAll(/["'](aha_[a-z0-9_]+_v\d+)["']/g)].map((match) => match[1]);
assert.deepEqual([...new Set(storageKeys)], ['aha_insight_chamber_v1'], 'quality feedback must not create a parallel storage key');
assert.equal(/\bfetch\s*\(/.test(code), false, 'quality feedback must remain local');
assert.equal(/EchoNet|sync_enabled|AHAIngest\.ingest/.test(code), false, 'quality feedback must not trigger sync, EchoNet, or new ingest');
assert.match(code, /advisoryOnly:\s*true/, 'automatic weak/duplicate detection must be advisory only');

console.log('aha-insight-quality-feedback.test.cjs passed');
