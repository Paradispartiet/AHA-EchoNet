const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aha-musikk-review-"));
const policyPath = path.join(tmp, "policy.json");
const evaluationPath = path.join(tmp, "evaluation.json");
const fixturesPath = path.join(tmp, "fixtures.json");
execFileSync(process.execPath, ["scripts/review-musikk-fagverk.mjs","--policy-output",policyPath,"--evaluation-output",evaluationPath,"--fixtures-output",fixturesPath], {stdio:"inherit"});

const config=JSON.parse(fs.readFileSync("data/integrations/review/history-go-fagverk-musikk.review-config.v1.json","utf8"));
const audit=JSON.parse(fs.readFileSync("data/integrations/candidates/history-go-fagverk-musikk.candidate-audit.v1.json","utf8"));
const matrix=JSON.parse(fs.readFileSync("data/evaluation/aha-musikk-fagverk-evaluation-matrix.v1.json","utf8"));
const policy=JSON.parse(fs.readFileSync(policyPath,"utf8"));
const evaluation=JSON.parse(fs.readFileSync(evaluationPath,"utf8"));
const fixtures=JSON.parse(fs.readFileSync(fixturesPath,"utf8"));

assert.equal(audit.gate.passed,true);
assert.deepEqual(audit.coverage,{expected:8,registered:8,materialized:8,missing:[],unexpected:[],duplicate_chapter_ids:[]});
assert.deepEqual(audit.term_collision_summary,{total:60,high_risk:24,medium_risk:36,low_risk:0});
assert.equal(Object.keys(config.chapter_rules).length,8);
assert.equal(policy.schema,"aha_musikk_fagverk_term_policy_v1");
assert.equal(policy.status,"review_policy_full_fixture_candidate_not_runtime_active");
assert.equal(policy.approval_required,true);
assert.equal(policy.activation_allowed,false);
assert.equal(policy.runtime_activation_allowed,false);
assert.equal(policy.chapters.length,8);
assert.ok(policy.summary.non_scoring>0);
assert.ok(policy.summary.down_weight>0);
for (const term of ["musikk","kultur","historie","teknologi","lyd","politikk","økonomi","samfunn"]) {
  assert.ok(policy.global_non_scoring_terms.includes(term),`${term} must be globally non-scoring`);
  const rule=policy.terms.find((item)=>item.term===term);
  if (rule) assert.equal(rule.action,"non_scoring");
}
assert.equal(matrix.positive_cases.length,16);
assert.equal(new Set(matrix.positive_cases.map((item)=>item.expected_chapter_id)).size,8);
assert.equal(evaluation.status,"passed_review_gate");
assert.deepEqual(evaluation.summary,{total:24,passed:24,failed:0,positive:16,abstention:8,chapters_covered:8,evidence_errors:0});
assert.equal(fixtures.status,"passed_full_fixture_gate");
assert.equal(fixtures.summary.total,16);
assert.equal(fixtures.summary.passed,16);
assert.equal(fixtures.summary.false_positives,0);
assert.equal(fixtures.summary.evidence_errors,0);
const runtimeCode=fs.readFileSync("backend/aha_engine/app/engine/fagverk_grounding.py","utf8");
assert.equal(runtimeCode.includes("history-go-fagverk-musikk.review-config.v1.json"),false);
assert.equal(runtimeCode.includes("data/integrations/review"),false);
assert.match(runtimeCode,/history-go-fagverk-release\.runtime-active\.json/);
console.log(`Musikk review gate passed: ${evaluation.summary.passed}/${evaluation.summary.total} constructed cases and ${fixtures.summary.passed}/${fixtures.summary.total} human-reviewed fixtures.`);
