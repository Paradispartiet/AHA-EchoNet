#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const DEFAULTS = {
  corpus: "data/integrations/candidates/history-go-fagverk-kunst.candidate.v1.json",
  audit: "data/integrations/candidates/history-go-fagverk-kunst.candidate-audit.v1.json",
  config: "data/integrations/review/history-go-fagverk-kunst.review-config.v1.json",
  matrix: "data/evaluation/aha-kunst-fagverk-evaluation-matrix.v1.json",
  fixtures: "data/evaluation/aha-politics-fixture-corrections.v1.json",
  policyOutput: "/tmp/aha-kunst-policy.json",
  evaluationOutput: "/tmp/aha-kunst-evaluation.json",
  fixturesOutput: "/tmp/aha-kunst-fixtures.json"
};

export const normalize = (value) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const readJson = (p) => JSON.parse(fs.readFileSync(path.resolve(repoRoot, p), "utf8"));
const writeJson = (p, value) => {
  const out = path.isAbsolute(p) ? p : path.resolve(repoRoot, p);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const tokenSet = (value) => new Set(normalize(value).match(/[a-zæøå0-9]+/gi) || []);
const termPresent = (text, tokens, term) => {
  const value = normalize(term);
  if (!value) return false;
  return /\s|-/.test(value) ? text.includes(value) : tokens.has(value);
};
const termsForEntry = (entry) => [...(entry.title_terms || []), ...(entry.concept_terms || []), ...(entry.support_terms || [])].map(normalize).filter(Boolean);

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--corpus") args.corpus = argv[++i] || args.corpus;
    else if (token === "--audit") args.audit = argv[++i] || args.audit;
    else if (token === "--config") args.config = argv[++i] || args.config;
    else if (token === "--matrix") args.matrix = argv[++i] || args.matrix;
    else if (token === "--fixtures") args.fixtures = argv[++i] || args.fixtures;
    else if (token === "--policy-output") args.policyOutput = argv[++i] || args.policyOutput;
    else if (token === "--evaluation-output") args.evaluationOutput = argv[++i] || args.evaluationOutput;
    else if (token === "--fixtures-output") args.fixturesOutput = argv[++i] || args.fixturesOutput;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function loadSubjectOverlap() {
  const dir = path.resolve(repoRoot, "data/integrations/candidates");
  const subjectsByTerm = new Map();
  for (const file of fs.readdirSync(dir).filter((name) => /^history-go-fagverk-.+\.candidate\.v1\.json$/.test(name))) {
    const corpus = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    if (!Array.isArray(corpus.entries) || typeof corpus.subject_filter !== "string") continue;
    const subject = normalize(corpus.subject_filter);
    const seen = new Set(corpus.entries.flatMap(termsForEntry));
    for (const term of seen) {
      if (!subjectsByTerm.has(term)) subjectsByTerm.set(term, new Set());
      subjectsByTerm.get(term).add(subject);
    }
  }
  return subjectsByTerm;
}

function validate(corpus, audit, config) {
  if (corpus.subject_filter !== "kunst") throw new Error("Candidate is not Kunst-scoped.");
  if (JSON.stringify(audit.subject_filter) !== JSON.stringify(["kunst"])) throw new Error("Audit is not Kunst-scoped.");
  if (config.subject_id !== "kunst") throw new Error("Config is not Kunst-scoped.");
  if (corpus.source_ref !== audit.source_ref || corpus.source_ref !== config.source_ref) throw new Error("Kunst source_ref mismatch.");
  if (corpus.content_sha256 !== config.corpus_sha256) throw new Error("Kunst corpus digest mismatch.");
  if (audit.gate?.passed !== true || (audit.gate?.errors || []).length) throw new Error("Kunst candidate audit gate failed.");
  if (audit.coverage?.expected !== 6 || audit.coverage?.registered !== 6 || audit.coverage?.materialized !== 6) throw new Error("Kunst coverage is not 6/6/6.");
  if (corpus.entries.length !== 6 || corpus.entries.some((entry) => (entry.module_source_paths || []).length !== 3)) throw new Error("Kunst 6-chapter/18-module contract failed.");
  const configured = new Set(Object.keys(config.chapter_rules || {}));
  const chapters = new Set(corpus.entries.map((entry) => entry.chapter_id));
  if (configured.size !== chapters.size || [...chapters].some((id) => !configured.has(id))) throw new Error("Kunst chapter rules do not exactly cover candidate.");
  if (config.approval_required !== true || config.activation_allowed !== false || config.runtime_activation_allowed !== false) throw new Error("Kunst review lifecycle guard invalid.");
}

export function buildKunstPolicy(corpus, audit, config, subjectsByTerm = loadSubjectOverlap()) {
  validate(corpus, audit, config);
  const generic = new Set((config.global_non_scoring_terms || config.generic_language_terms || []).map(normalize));
  const contextOnly = new Set((config.context_only_terms || []).map(normalize));
  const anchors = new Set(Object.values(config.chapter_rules || {}).flatMap((rule) => rule.required_anchor_terms || []).map(normalize));
  const collisions = new Map((audit.term_collisions || []).map((item) => [normalize(item.term), item]));
  const policies = [];
  for (const term of [...new Set(corpus.entries.flatMap(termsForEntry))].sort((a,b)=>a.localeCompare(b,"nb"))) {
    const collision = collisions.get(term);
    const crossSubjects = [...(subjectsByTerm.get(term) || new Set())].sort();
    const anchorExempt = anchors.has(term) && !generic.has(term);
    let action = null, category = null, multiplier = 1;
    if (generic.has(term)) { action = "non_scoring"; category = "generic_language"; multiplier = 0; }
    else if (anchorExempt) continue;
    else if (contextOnly.has(term)) { action = "context_only"; category = "art_context_only"; multiplier = 0; }
    else if (collision?.risk === "high") { action = "non_scoring"; category = "subject_wide_or_multi_chapter"; multiplier = 0; }
    else if (collision?.risk === "medium") { action = "down_weight"; category = "cross_chapter"; multiplier = config.scoring.down_weight_multiplier; }
    else if (collision?.risk === "low") { action = "context_only"; category = "shared_phrase"; multiplier = 0; }
    else if (crossSubjects.length >= config.collision_policy.cross_subject_min_subjects) { action = "down_weight"; category = "cross_subject"; multiplier = config.scoring.down_weight_multiplier; }
    if (action) policies.push({term,action,multiplier,category,internal_risk:collision?.risk||null,chapter_count:collision?.chapter_count||1,chapters:collision?.chapters||[],cross_subject_count:crossSubjects.length,cross_subjects:crossSubjects});
  }
  const summary = policies.reduce((acc,item)=>{acc.total++;acc[item.action]++;acc.categories[item.category]=(acc.categories[item.category]||0)+1;return acc;},{total:0,non_scoring:0,down_weight:0,context_only:0,categories:{}});
  return {
    schema:"aha_kunst_fagverk_term_policy_v1", version:"1.0.0", status:config.status,
    source_repo:corpus.source_repo, source_ref:corpus.source_ref, registry_version:corpus.registry_version,
    corpus_sha256:corpus.content_sha256, subject_id:"kunst", lifecycle_stage:config.lifecycle_stage,
    approval_required:true, activation_allowed:false, runtime_activation_allowed:false,
    scoring:config.scoring, collision_policy:config.collision_policy, abstention_rules:config.abstention_rules,
    generic_language_terms:[...generic].sort((a,b)=>a.localeCompare(b,"nb")),
    global_non_scoring_terms:[...generic].sort((a,b)=>a.localeCompare(b,"nb")),
    context_only_terms:[...contextOnly].sort((a,b)=>a.localeCompare(b,"nb")),
    chapter_rules:config.chapter_rules, summary, terms:policies,
    chapters:corpus.entries.map((entry)=>({chapter_id:entry.chapter_id,title:entry.title,primary_domain_id:entry.primary_domain_id,module_file_count:entry.module_source_paths?.length||0,required_anchor_terms:config.chapter_rules[entry.chapter_id].required_anchor_terms}))
  };
}

function chapterTerms(entry, rule) {
  const terms = new Map();
  for (const [group,weight] of [["title_terms",5],["concept_terms",3],["support_terms",1.5]]) {
    for (const raw of entry[group] || []) {
      const term = normalize(raw); if (!term) continue;
      const current = terms.get(term);
      if (!current || weight > current.base_weight) terms.set(term,{term,group,base_weight:weight});
    }
  }
  for (const supplemental of rule?.supplemental_evidence_terms || []) {
    const term = normalize(supplemental.term), weight = Number(supplemental.weight || 0);
    if (!term || weight <= 0) continue;
    const current = terms.get(term);
    if (!current || weight > current.base_weight) terms.set(term,{term,group:"supplemental_evidence_terms",base_weight:weight});
  }
  return [...terms.values()];
}

export function scoreKunst(textValue, corpus, policy) {
  const text = normalize(textValue), tokens = tokenSet(text);
  const policyByTerm = new Map((policy.terms || []).map((item)=>[normalize(item.term),item]));
  const nonScoring = new Set((policy.global_non_scoring_terms || []).map(normalize));
  const scores = corpus.entries.map((entry)=>{
    const rule = policy.chapter_rules?.[entry.chapter_id] || {};
    const matched = []; let score = 0;
    for (const candidate of chapterTerms(entry, rule)) {
      if (!termPresent(text,tokens,candidate.term)) continue;
      const termPolicy = policyByTerm.get(candidate.term);
      const multiplier = nonScoring.has(candidate.term) ? 0 : termPolicy ? Number(termPolicy.multiplier || 0) : 1;
      const contribution = candidate.base_weight * multiplier;
      if (contribution <= 0) continue;
      matched.push({term:candidate.term,group:candidate.group,base_weight:candidate.base_weight,multiplier,contribution:Number(contribution.toFixed(3))});
      score += contribution;
    }
    const required = (rule.required_anchor_terms || []).map(normalize).filter(Boolean);
    const matchedAnchors = required.filter((term)=>termPresent(text,tokens,term));
    const eligible = required.length > 0 && matchedAnchors.length > 0;
    matched.sort((a,b)=>b.contribution-a.contribution || a.term.localeCompare(b.term,"nb"));
    return {chapter_id:entry.chapter_id,title:entry.title,score:Number(score.toFixed(3)),eligible,eligibility_reason:eligible?"eligible":"missing_required_anchor",matched_anchor_terms:matchedAnchors,matched_terms:matched};
  });
  const eligible = scores.filter((item)=>item.eligible).sort((a,b)=>b.score-a.score || a.chapter_id.localeCompare(b.chapter_id,"nb"));
  const top=eligible[0], second=eligible[1], cfg=policy.scoring || {};
  const minScore=Number(cfg.grounded_min_score||6), minTerms=Number(cfg.grounded_min_terms||2), margin=Number(cfg.ambiguity_margin||3);
  let status="unsupported";
  if (top && top.score>=minScore && top.matched_terms.length>=minTerms) status = second && second.score>=minScore && (top.score-second.score)<margin ? "ambiguous" : "grounded";
  return {status,selected_chapter_id:status==="grounded"?top.chapter_id:null,top_score:top?.score||0,second_score:second?.score||0,ranking:scores.sort((a,b)=>b.score-a.score || Number(b.eligible)-Number(a.eligible) || a.chapter_id.localeCompare(b.chapter_id,"nb")).slice(0,5)};
}

function evaluate(corpus, policy, matrix) {
  const evidenceErrors=[], cases=[];
  for (const testCase of matrix.positive_cases || []) {
    const entry=corpus.entries.find((item)=>item.chapter_id===testCase.expected_chapter_id);
    const rule=policy.chapter_rules?.[testCase.expected_chapter_id]||{};
    const allowed=new Set([...(entry?.title_terms||[]),...(entry?.concept_terms||[]),...(entry?.support_terms||[]),...(rule.supplemental_evidence_terms||[]).map((item)=>item.term)].map(normalize));
    for (const evidence of testCase.required_evidence || []) if (!allowed.has(normalize(evidence))) evidenceErrors.push(`${testCase.id}: unregistered evidence ${evidence}`);
    const result=scoreKunst(testCase.text,corpus,policy), errors=[];
    if (result.status!=="grounded") errors.push(`Expected grounded, got ${result.status}.`);
    if (result.selected_chapter_id!==testCase.expected_chapter_id) errors.push(`Expected ${testCase.expected_chapter_id}, got ${result.selected_chapter_id||"none"}.`);
    const selected=result.ranking.find((item)=>item.chapter_id===testCase.expected_chapter_id);
    if (!selected?.matched_anchor_terms?.length) errors.push("Expected mandatory anchor match.");
    cases.push({id:testCase.id,kind:"positive",passed:errors.length===0,errors,result});
  }
  for (const testCase of matrix.abstention_cases || []) {
    const result=scoreKunst(testCase.text,corpus,policy);
    const errors=result.status==="unsupported"?[]:[`Expected unsupported, got ${result.status}.`];
    cases.push({id:testCase.id,kind:"abstention",passed:errors.length===0,errors,result});
  }
  const failed=cases.filter((item)=>!item.passed), covered=[...new Set((matrix.positive_cases||[]).map((item)=>item.expected_chapter_id))].sort();
  return {schema:"aha_kunst_fagverk_evaluation_report_v1",version:"1.0.0",source_ref:corpus.source_ref,corpus_sha256:corpus.content_sha256,policy_version:policy.version,matrix_version:matrix.version,status:failed.length||evidenceErrors.length?"failed":"passed_review_gate",runtime_activation_allowed:false,summary:{total:cases.length,passed:cases.length-failed.length,failed:failed.length,positive:(matrix.positive_cases||[]).length,abstention:(matrix.abstention_cases||[]).length,chapters_covered:covered.length,evidence_errors:evidenceErrors.length},chapter_coverage:covered,evidence_errors:evidenceErrors,failures:failed,cases};
}

function compareFixtures(corpus, policy, baseline) {
  const results=[];
  for (const reviewCase of baseline.cases || []) {
    const fixture=readJson(reviewCase.fixture_path), text=String(fixture.inputText||""), result=scoreKunst(text,corpus,policy);
    const evidence=(reviewCase.source_evidence||[]).map((item)=>({text:item,found:normalize(text).includes(normalize(item))}));
    const errors=[]; if (!text) errors.push("Fixture has no inputText.");
    if (evidence.some((item)=>!item.found)) errors.push("Human-reviewed source evidence missing from inputText.");
    if (result.status!=="unsupported") errors.push(`Kunst must abstain; got ${result.status}${result.selected_chapter_id?` (${result.selected_chapter_id})`:""}.`);
    results.push({id:reviewCase.id,fixture_path:reviewCase.fixture_path,expected_kunst_status:"unsupported",source_evidence:evidence,result,passed:errors.length===0,errors});
  }
  const failed=results.filter((item)=>!item.passed), evidenceErrors=results.reduce((sum,item)=>sum+item.source_evidence.filter((e)=>!e.found).length,0);
  return {schema:"aha_kunst_full_fixture_report_v1",version:"1.0.0",status:failed.length?"failed":"passed_full_fixture_gate",source_ref:corpus.source_ref,corpus_sha256:corpus.content_sha256,policy_version:policy.version,baseline_schema:baseline.schema,baseline_version:baseline.version,runtime_activation_allowed:false,summary:{total:results.length,passed:results.length-failed.length,failed:failed.length,unsupported:results.filter((item)=>item.result.status==="unsupported").length,false_positives:results.filter((item)=>item.result.status!=="unsupported").length,evidence_errors:evidenceErrors},failures:failed,cases:results};
}

function main() {
  const args=parseArgs(process.argv.slice(2));
  const corpus=readJson(args.corpus), audit=readJson(args.audit), config=readJson(args.config), matrix=readJson(args.matrix), baseline=readJson(args.fixtures);
  const policy=buildKunstPolicy(corpus,audit,config), evaluation=evaluate(corpus,policy,matrix), fixtures=compareFixtures(corpus,policy,baseline);
  writeJson(args.policyOutput,policy); writeJson(args.evaluationOutput,evaluation); writeJson(args.fixturesOutput,fixtures);
  console.log(`Kunst review: ${policy.chapters.length} chapters; ${policy.summary.total} classified terms; evaluation ${evaluation.summary.passed}/${evaluation.summary.total}; fixtures ${fixtures.summary.passed}/${fixtures.summary.total}.`);
  if (evaluation.status!=="passed_review_gate" || fixtures.status!=="passed_full_fixture_gate") {
    evaluation.evidence_errors.forEach((error)=>console.error(error));
    evaluation.failures.forEach((failure)=>console.error(`${failure.id}: ${failure.errors.join(" ")}`));
    fixtures.failures.forEach((failure)=>console.error(`${failure.id}: ${failure.errors.join(" ")}`));
    process.exit(1);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
