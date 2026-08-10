const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aha-kunst-review-"));
const policyPath = path.join(tmp, "policy.json");
const evaluationPath = path.join(tmp, "evaluation.json");
const fixturesPath = path.join(tmp, "fixtures.json");
execFileSync(process.execPath, ["scripts/review-kunst-fagverk.mjs","--policy-output",policyPath,"--evaluation-output",evaluationPath,"--fixtures-output",fixturesPath], {stdio:"inherit"});

const config=JSON.parse(fs.readFileSync("data/integrations/review/history-go-fagverk-kunst.review-config.v1.json","utf8"));
const audit=JSON.parse(fs.readFileSync("data/integrations/candidates/history-go-fagverk-kunst.candidate-audit.v1.json","utf8"));
const matrix=JSON.parse(fs.readFileSync("data/evaluation/aha-kunst-fagverk-evaluation-matrix.v1.json","utf8"));
const policy=JSON.parse(fs.readFileSync(policyPath,"utf8"));
const evaluation=JSON.parse(fs.readFileSync(evaluationPath,"utf8"));
const fixtures=JSON.parse(fs.readFileSync(fixturesPath,"utf8"));
const runtime=JSON.parse(fs.readFileSync("data/integrations/history-go-fagverk-release.runtime-active.json","utf8"));
const runtimeCorpus=JSON.parse(fs.readFileSync("data/integrations/runtime/history-go-fagverk-kunst.corpus.v1.json","utf8"));
const runtimePolicy=JSON.parse(fs.readFileSync("data/integrations/runtime/history-go-fagverk-kunst.policy.v1.json","utf8"));

assert.equal(audit.gate.passed,true);
assert.deepEqual(audit.coverage,{expected:6,registered:6,materialized:6,missing:[],unexpected:[],duplicate_chapter_ids:[]});
assert.deepEqual(audit.term_collision_summary,{total:66,high_risk:27,medium_risk:39,low_risk:0});
assert.equal(Object.keys(config.chapter_rules).length,6);
assert.equal(policy.schema,"aha_kunst_fagverk_term_policy_v1");
assert.equal(policy.status,"review_policy_full_fixture_candidate_not_runtime_active");
assert.equal(policy.approval_required,true);
assert.equal(policy.activation_allowed,false);
assert.equal(policy.runtime_activation_allowed,false);
assert.equal(policy.chapters.length,6);
assert.ok(policy.summary.non_scoring>0);
assert.ok(policy.summary.down_weight>0);
for (const term of ["kunst","verk","form","historie","offentlighet","institusjon","praksis","tid"]) {
  assert.ok(policy.global_non_scoring_terms.includes(term),`${term} must be globally non-scoring`);
  const rule=policy.terms.find((item)=>item.term===term);
  if (rule) assert.equal(rule.action,"non_scoring");
}
assert.equal(matrix.positive_cases.length,12);
assert.equal(new Set(matrix.positive_cases.map((item)=>item.expected_chapter_id)).size,6);
assert.equal(evaluation.status,"passed_review_gate");
assert.deepEqual(evaluation.summary,{total:20,passed:20,failed:0,positive:12,abstention:8,chapters_covered:6,evidence_errors:0});
assert.equal(fixtures.status,"passed_full_fixture_gate");
assert.equal(fixtures.summary.total,16);
assert.equal(fixtures.summary.passed,16);
assert.equal(fixtures.summary.false_positives,0);
assert.equal(fixtures.summary.evidence_errors,0);

const activeKunst=runtime.active_subjects?.kunst;
assert.equal(activeKunst.subject_id,"kunst");
assert.equal(activeKunst.source_commit,config.source_ref);
assert.equal(activeKunst.chapter_count,6);
assert.equal(activeKunst.activation_status,"runtime_subject_active");
assert.equal(activeKunst.corpus_path,"data/integrations/runtime/history-go-fagverk-kunst.corpus.v1.json");
assert.equal(activeKunst.policy_path,"data/integrations/runtime/history-go-fagverk-kunst.policy.v1.json");
assert.equal(runtimeCorpus.projection_mode,"reviewed_anchor_projection_v1");
assert.equal(runtimeCorpus.chapter_count,6);
assert.equal(runtimePolicy.runtime_corpus_projection,"reviewed_anchor_projection_v1");
assert.equal(runtimePolicy.domain_gate.required,true);
assert.equal(Object.keys(runtimePolicy.chapter_rules).length,6);

const runtimeCode=fs.readFileSync("backend/aha_engine/app/engine/fagverk_grounding.py","utf8");
assert.equal(runtimeCode.includes("history-go-fagverk-kunst.review-config.v1.json"),false);
assert.equal(runtimeCode.includes("data/integrations/review"),false);
assert.match(runtimeCode,/history-go-fagverk-release\.runtime-active\.json/);
console.log(`Kunst review/runtime gate passed: ${evaluation.summary.passed}/${evaluation.summary.total} constructed cases, ${fixtures.summary.passed}/${fixtures.summary.total} fixtures, 6 runtime chapters.`);
