#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const DEFAULTS = {
  corpus: "data/integrations/candidates/history-go-fagverk-by.candidate.v1.json",
  audit: "data/integrations/candidates/history-go-fagverk-by.candidate-audit.v1.json",
  config: "data/integrations/review/history-go-fagverk-by.review-config.v1.json",
  output: "data/integrations/review/history-go-fagverk-by.term-policy.v1.json"
};

export function normalize(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function parseArgs(argv) {
  const args = { ...DEFAULTS };
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
  return JSON.parse(fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  const outputPath = path.resolve(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function termsForEntry(entry) {
  return [...(entry.title_terms || []), ...(entry.concept_terms || []), ...(entry.support_terms || [])]
    .map(normalize)
    .filter(Boolean);
}

function loadSubjectOverlap() {
  const dir = path.resolve(repoRoot, "data/integrations/candidates");
  const files = fs.readdirSync(dir).filter((name) => /^history-go-fagverk-.+\.candidate\.v1\.json$/.test(name));
  const subjectsByTerm = new Map();
  for (const file of files) {
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
  if (corpus.subject_filter !== "by") throw new Error(`Unexpected subject_filter: ${corpus.subject_filter}`);
  if (JSON.stringify(audit.subject_filter) !== JSON.stringify(["by"])) throw new Error("Audit is not By-scoped.");
  if (config.subject_id !== "by") throw new Error("Review config is not By-scoped.");
  if (corpus.source_ref !== audit.source_ref) throw new Error("Corpus and audit source_ref differ.");
  if (audit.gate?.passed !== true || (audit.gate?.errors || []).length) throw new Error("By candidate audit gate has not passed.");
  if (audit.coverage?.expected !== 17 || audit.coverage?.registered !== 17 || audit.coverage?.materialized !== 17) {
    throw new Error(`By coverage is not 17/17/17: ${JSON.stringify(audit.coverage)}`);
  }
  if (corpus.entries.length !== 17) throw new Error(`Expected 17 By chapters, got ${corpus.entries.length}.`);
  const configured = new Set(Object.keys(config.chapter_rules || {}));
  const chapters = new Set(corpus.entries.map((entry) => entry.chapter_id));
  if (configured.size !== chapters.size || [...chapters].some((id) => !configured.has(id))) {
    throw new Error("Review config chapter rules do not exactly cover the By candidate.");
  }
  if (config.approval_required !== true || config.activation_allowed !== false || config.runtime_activation_allowed !== false) {
    throw new Error("By review lifecycle guard is invalid.");
  }
}

export function buildByPolicy(corpus, audit, config, subjectsByTerm) {
  validate(corpus, audit, config);
  const generic = new Set((config.generic_language_terms || []).map(normalize));
  const contextOnly = new Set((config.context_only_terms || []).map(normalize));
  const anchors = new Set(Object.values(config.chapter_rules || {}).flatMap((rule) => rule.required_anchor_terms || []).map(normalize));
  const collisionByTerm = new Map((audit.term_collisions || []).map((item) => [normalize(item.term), item]));
  const allTerms = new Set(corpus.entries.flatMap(termsForEntry));
  const policies = [];

  for (const term of [...allTerms].sort((a, b) => a.localeCompare(b, "nb"))) {
    const collision = collisionByTerm.get(term);
    const crossSubjects = [...(subjectsByTerm.get(term) || new Set())].sort();
    const crossCount = crossSubjects.length;
    const anchorExempt = anchors.has(term) && !generic.has(term);
    let category = null;
    let action = null;
    let multiplier = 1;

    if (generic.has(term)) {
      category = "generic_language"; action = "non_scoring"; multiplier = 0;
    } else if (anchorExempt) {
      continue;
    } else if (contextOnly.has(term)) {
      category = "urban_context_only"; action = "context_only"; multiplier = 0;
    } else if (collision?.risk === "high") {
      category = "subject_wide_or_multi_chapter"; action = "non_scoring"; multiplier = 0;
    } else if (collision?.risk === "medium") {
      category = "cross_chapter"; action = "down_weight"; multiplier = config.scoring.down_weight_multiplier;
    } else if (collision?.risk === "low") {
      category = "shared_phrase"; action = "context_only"; multiplier = 0;
    } else if (crossCount >= config.collision_policy.cross_subject_min_subjects) {
      category = "cross_subject"; action = "down_weight"; multiplier = config.scoring.down_weight_multiplier;
    }

    if (action) {
      policies.push({
        term,
        action,
        multiplier,
        category,
        internal_risk: collision?.risk || null,
        chapter_count: collision?.chapter_count || 1,
        chapters: collision?.chapters || [],
        cross_subject_count: crossCount,
        cross_subjects: crossSubjects
      });
    }
  }

  const summary = policies.reduce((acc, item) => {
    acc.total += 1;
    acc[item.action] = (acc[item.action] || 0) + 1;
    acc.categories[item.category] = (acc.categories[item.category] || 0) + 1;
    return acc;
  }, { total: 0, non_scoring: 0, down_weight: 0, context_only: 0, categories: {} });

  return {
    schema: "aha_by_fagverk_term_policy_v1",
    version: "1.0.0",
    status: config.status,
    source_repo: corpus.source_repo,
    source_ref: corpus.source_ref,
    registry_version: corpus.registry_version,
    corpus_sha256: corpus.content_sha256,
    subject_id: "by",
    lifecycle_stage: config.lifecycle_stage,
    approval_required: true,
    activation_allowed: false,
    runtime_activation_allowed: false,
    scoring: config.scoring,
    collision_policy: config.collision_policy,
    abstention_rules: config.abstention_rules,
    generic_language_terms: [...generic].sort((a, b) => a.localeCompare(b, "nb")),
    global_non_scoring_terms: [...generic].sort((a, b) => a.localeCompare(b, "nb")),
    context_only_terms: [...contextOnly].sort((a, b) => a.localeCompare(b, "nb")),
    chapter_rules: config.chapter_rules,
    summary,
    terms: policies,
    chapters: corpus.entries.map((entry) => ({
      chapter_id: entry.chapter_id,
      title: entry.title,
      primary_domain_id: entry.primary_domain_id,
      module_file_count: entry.module_source_paths?.length || 0,
      required_anchor_terms: config.chapter_rules[entry.chapter_id].required_anchor_terms
    }))
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/build-by-fagverk-term-policy.mjs [--corpus path] [--audit path] [--config path] [--output path]");
    return;
  }
  const policy = buildByPolicy(readJson(args.corpus), readJson(args.audit), readJson(args.config), loadSubjectOverlap());
  writeJson(args.output, policy);
  console.log(`Wrote By policy: ${policy.chapters.length} chapters; ${policy.summary.total} classified terms (${policy.summary.non_scoring} non-scoring, ${policy.summary.down_weight} down-weighted, ${policy.summary.context_only} context-only).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
