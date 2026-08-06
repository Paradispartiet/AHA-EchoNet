#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { normalize } from "./lib/business-fagverk-scoring.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const defaults = {
  corpus: "data/integrations/candidates/history-go-fagverk-naeringsliv.candidate.v1.json",
  audit: "data/integrations/candidates/history-go-fagverk-naeringsliv.candidate-audit.v1.json",
  config: "data/integrations/review/history-go-fagverk-naeringsliv.policy-config.v1.json",
  output: "data/integrations/review/history-go-fagverk-naeringsliv.term-policy.v1.json"
};

function parseArgs(argv) {
  const args = { ...defaults };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--corpus") args.corpus = argv[++i] || args.corpus;
    else if (token === "--audit") args.audit = argv[++i] || args.audit;
    else if (token === "--config") args.config = argv[++i] || args.config;
    else if (token === "--output") args.output = argv[++i] || args.output;
    else if (token === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  const target = path.resolve(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function collisionRows(audit) {
  return [...(audit.high_risk_terms || []), ...(audit.medium_risk_terms || []), ...(audit.low_risk_terms || [])];
}

function buildPolicy(corpus, audit, config, auditPath) {
  if (corpus.subject_filter !== "naeringsliv" || config.subject_id !== "naeringsliv") throw new Error("Business subject identity mismatch.");
  if (audit.subject_filter?.[0] !== "naeringsliv") throw new Error("Audit is not Business-scoped.");
  if (corpus.source_ref !== audit.source_ref || corpus.source_ref !== config.source_ref) throw new Error("Business source refs differ.");
  if (corpus.content_sha256 !== config.corpus_sha256) throw new Error("Business corpus digest differs from policy config.");
  if (corpus.entries.length !== 12 || audit.coverage?.materialized !== 12 || audit.coverage?.missing?.length) throw new Error("Business chapter coverage is incomplete.");
  const moduleFileCount = corpus.entries.reduce((sum, entry) => sum + (entry.module_source_paths || []).length, 0);
  if (moduleFileCount !== 36 || !corpus.entries.every((entry) => (entry.module_source_paths || []).length === 3)) {
    throw new Error(`Business module contract must be 12 x 3, got ${moduleFileCount}.`);
  }
  const expectedIds = Object.keys(config.chapter_rules).sort((a, b) => a.localeCompare(b, "nb"));
  const actualIds = corpus.entries.map((entry) => entry.chapter_id).sort((a, b) => a.localeCompare(b, "nb"));
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) throw new Error("Policy config does not exactly cover the Business corpus.");

  const reviewed = new Set();
  for (const rule of Object.values(config.chapter_rules)) {
    for (const term of rule.required_anchor_terms || []) reviewed.add(normalize(term));
    for (const item of rule.supplemental_evidence_terms || []) reviewed.add(normalize(item.term));
  }
  const generic = new Set((config.global_non_scoring_terms || []).map(normalize));
  const terms = collisionRows(audit).map((item) => {
    const term = normalize(item.term);
    if (reviewed.has(term)) return { term, risk: item.risk, chapter_count: item.chapter_count, category: "reviewed_chapter_scoped_evidence", action: "chapter_scoped", multiplier: 1 };
    if (generic.has(term) || item.risk === "high") return { term, risk: item.risk, chapter_count: item.chapter_count, category: generic.has(term) ? "generic_language" : "high_risk_collision", action: "non_scoring", multiplier: 0 };
    if (item.risk === "medium") return { term, risk: item.risk, chapter_count: item.chapter_count, category: "medium_risk_collision", action: "down_weight", multiplier: Number(config.default_weights.down_weight_multiplier) };
    return { term, risk: item.risk, chapter_count: item.chapter_count, category: "low_risk_shared_phrase", action: "context_only", multiplier: 0 };
  }).sort((a, b) => a.term.localeCompare(b.term, "nb"));
  const expectedSummary = audit.term_collision_summary || {};
  if (terms.length !== expectedSummary.total) throw new Error(`Collision inventory mismatch: ${terms.length} != ${expectedSummary.total}.`);

  const domainTerms = [...new Set(Object.values(config.chapter_rules).flatMap((rule) => rule.required_anchor_terms || []))];
  return {
    schema: "aha_business_fagverk_term_policy_v1",
    version: "1.0.0",
    status: "review_policy_full_fixture_candidate_not_runtime_active",
    subject_id: "naeringsliv",
    source_repo: corpus.source_repo,
    source_ref: corpus.source_ref,
    corpus_sha256: corpus.content_sha256,
    source_audit_path: auditPath,
    thresholds: config.thresholds,
    default_weights: config.default_weights,
    policy_rules: {
      high_risk: "non_scoring",
      medium_risk: "down_weight_unless_reviewed_chapter_evidence",
      low_risk_shared_phrase: "context_only",
      generic_language: "non_scoring",
      business_domain_anchor: "required_for_every_business_selection",
      chapter_anchor: "required_for_every_chapter",
      supplemental_evidence: "at_least_two_chapter_scoped_terms_required"
    },
    summary: {
      total: expectedSummary.total,
      risks: { high: expectedSummary.high_risk, medium: expectedSummary.medium_risk, low: expectedSummary.low_risk },
      chapter_count: corpus.entries.length,
      module_file_count: moduleFileCount
    },
    terms,
    global_non_scoring_terms: config.global_non_scoring_terms,
    domain_gate: { required: true, terms: domainTerms },
    chapter_rules: config.chapter_rules,
    chapters: corpus.entries.map((entry) => ({
      chapter_id: entry.chapter_id,
      title: entry.title,
      required_anchor_terms: config.chapter_rules[entry.chapter_id].required_anchor_terms,
      supplemental_evidence_terms: config.chapter_rules[entry.chapter_id].supplemental_evidence_terms,
      module_file_count: entry.module_source_paths.length
    })),
    approval_required: true,
    runtime_activation_allowed: false,
    explicit_runtime_activation_pull_request_required: true
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/build-business-fagverk-term-policy.mjs [--corpus path] [--audit path] [--config path] [--output path]");
    return;
  }
  const policy = buildPolicy(readJson(args.corpus), readJson(args.audit), readJson(args.config), args.audit);
  writeJson(args.output, policy);
  console.log(`Business term policy: ${policy.summary.total} collisions, ${policy.summary.chapter_count} chapters, runtime inactive.`);
}

main();
