#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaults = {
  corpus: "data/integrations/candidates/history-go-fagverk-naeringsliv.candidate.v1.json",
  audit: "data/integrations/candidates/history-go-fagverk-naeringsliv.candidate-audit.v1.json",
  config: "data/integrations/review/history-go-fagverk-naeringsliv.policy-config.v1.json",
  output: "data/integrations/review/history-go-fagverk-naeringsliv.term-policy.v1.json"
};

function parseArgs(argv) {
  const result = { ...defaults };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--corpus") result.corpus = argv[++i] || result.corpus;
    else if (token === "--audit") result.audit = argv[++i] || result.audit;
    else if (token === "--config") result.config = argv[++i] || result.config;
    else if (token === "--output") result.output = argv[++i] || result.output;
    else if (token === "--help") result.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return result;
}

function read(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, relativePath), "utf8"));
}

function write(relativePath, value) {
  const target = path.resolve(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildPolicy(corpus, audit, config, auditPath) {
  if (corpus.subject_filter !== "naeringsliv" || config.subject_id !== "naeringsliv" || audit.subject_filter?.[0] !== "naeringsliv") throw new Error("Business subject identity mismatch.");
  if (corpus.source_ref !== audit.source_ref || corpus.source_ref !== config.source_ref) throw new Error("Business source refs differ.");
  if (corpus.content_sha256 !== config.corpus_sha256) throw new Error("Business corpus digest differs from policy config.");
  if (corpus.entries.length !== 12 || audit.coverage?.materialized !== 12 || audit.coverage?.missing?.length) throw new Error("Business chapter coverage is incomplete.");
  const moduleFileCount = corpus.entries.reduce((sum, entry) => sum + (entry.module_source_paths || []).length, 0);
  if (moduleFileCount !== 36 || !corpus.entries.every((entry) => (entry.module_source_paths || []).length === 3)) throw new Error(`Business module contract must be 12 x 3, got ${moduleFileCount}.`);
  const expectedIds = Object.keys(config.chapter_rules).sort((a, b) => a.localeCompare(b, "nb"));
  const actualIds = corpus.entries.map((entry) => entry.chapter_id).sort((a, b) => a.localeCompare(b, "nb"));
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) throw new Error("Policy config does not exactly cover the Business corpus.");
  const collision = audit.term_collision_summary || {};
  if (collision.total !== 140 || collision.high_risk !== 65 || collision.medium_risk !== 51 || collision.low_risk !== 24) throw new Error("Business collision audit changed.");
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
      candidate_title_concept_support_terms: "non_decisive_review_context_only",
      collision_inventory: "documented_in_source_audit_not_runtime_scoring_input",
      generic_language: "non_scoring",
      business_domain_anchor: "required_for_every_business_selection",
      chapter_anchor: "required_for_every_chapter",
      supplemental_evidence: "at_least_two_chapter_scoped_terms_required"
    },
    summary: {
      total: collision.total,
      risks: { high: collision.high_risk, medium: collision.medium_risk, low: collision.low_risk },
      chapter_count: corpus.entries.length,
      module_file_count: moduleFileCount
    },
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
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/build-business-fagverk-term-policy.mjs [--corpus path] [--audit path] [--config path] [--output path]");
    return;
  }
  const policy = buildPolicy(read(options.corpus), read(options.audit), read(options.config), options.audit);
  write(options.output, policy);
  console.log(`Business term policy: ${policy.summary.total} collisions, ${policy.summary.chapter_count} chapters, runtime inactive.`);
}

main();
