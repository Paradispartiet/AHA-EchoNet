#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const DEFAULT_CORPUS = "data/integrations/review/history-go-fagverk-politikk.audit.v1.json";
const DEFAULT_AUDIT = "data/integrations/review/history-go-fagverk-politikk.audit-report.v1.json";
const DEFAULT_OUTPUT = "data/integrations/review/history-go-fagverk-politikk.term-policy.v1.json";

const GENERIC_LANGUAGE_TERMS = new Set([
  "aktivitet", "alene", "alternativ", "alternativer", "analyse", "analysen", "analyseres", "andre",
  "automatisk", "bare", "begge", "både", "case", "derfor", "ett", "faktisk", "felles", "flere",
  "fordi", "forklaring", "forklaringer", "former", "før", "følger", "får", "gjelder", "gjennomføring",
  "gir", "gjør", "hvem", "hvor", "hvorfor", "hvilken", "innenfor", "konkrete", "krever", "ledd",
  "men", "mer", "mens", "mekanisme", "mål", "når", "problemer", "samme", "samtidig", "seg",
  "skille", "skiller", "skill", "tid", "tidsrom", "ulike", "uten", "utfall", "viser", "være"
]);

function parseArgs(argv) {
  const args = { corpus: DEFAULT_CORPUS, audit: DEFAULT_AUDIT, output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--corpus") args.corpus = argv[++index] || args.corpus;
    else if (token === "--audit") args.audit = argv[++index] || args.audit;
    else if (token === "--output") args.output = argv[++index] || args.output;
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

function normalize(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function eligibleUniqueTerm(term) {
  const value = normalize(term);
  if (!value || value.length > 64 || value.split(" ").length > 4) return false;
  if (/^(?:begrep-|em_|met_)/.test(value)) return false;
  if (/[.!?]$/.test(value)) return false;
  return true;
}

function classifyCollision(collision) {
  const term = normalize(collision.term);
  if (GENERIC_LANGUAGE_TERMS.has(term)) {
    return { category: "generic_language", action: "non_scoring", multiplier: 0 };
  }
  if (collision.risk === "high") {
    return { category: "subject_wide_or_multi_chapter", action: "non_scoring", multiplier: 0 };
  }
  if (collision.risk === "medium") {
    return { category: "cross_chapter", action: "down_weight", multiplier: 0.35 };
  }
  return { category: "shared_phrase", action: "context_only", multiplier: 0 };
}

function buildPolicy(corpus, audit) {
  if (corpus.source_ref !== audit.source_ref) throw new Error("Corpus and audit source_ref differ.");
  if (corpus.content_sha256 !== "981ab3ad25f972bd13c70a0247f26b8796e43b8cd3cde7282b7d073bfcc79dec") {
    throw new Error(`Unexpected Politics corpus digest: ${corpus.content_sha256}`);
  }
  const collisions = audit.term_collisions || [];
  const collisionSet = new Set(collisions.map((item) => normalize(item.term)));
  const terms = collisions.map((collision) => ({
    term: normalize(collision.term),
    risk: collision.risk,
    chapter_count: collision.chapter_count,
    chapters: collision.chapters,
    ...classifyCollision(collision)
  })).sort((a, b) => a.term.localeCompare(b.term, "nb"));

  const chapters = corpus.entries.map((entry) => {
    const candidates = [...entry.title_terms, ...entry.concept_terms, ...entry.support_terms]
      .map(normalize)
      .filter((term) => !collisionSet.has(term))
      .filter(eligibleUniqueTerm);
    return {
      chapter_id: entry.chapter_id,
      title: entry.title,
      unique_evidence_terms: [...new Set(candidates)].slice(0, 40)
    };
  });

  const summary = terms.reduce((result, item) => {
    result.total += 1;
    result[item.action] = (result[item.action] || 0) + 1;
    result.categories[item.category] = (result.categories[item.category] || 0) + 1;
    return result;
  }, { total: 0, non_scoring: 0, down_weight: 0, context_only: 0, categories: {} });

  return {
    schema: "aha_politics_fagverk_term_policy_v1",
    version: "1.0.0",
    status: "review_policy_not_runtime_active",
    source_repo: corpus.source_repo,
    source_ref: corpus.source_ref,
    corpus_sha256: corpus.content_sha256,
    subject_id: "politikk",
    activation_allowed: false,
    default_weights: {
      title_term: 5,
      concept_term: 3,
      support_term: 1.5,
      down_weight_multiplier: 0.35
    },
    policy_rules: {
      high_risk: "non_scoring",
      medium_risk: "down_weight_unless_generic_language",
      low_risk_shared_phrase: "context_only",
      generic_language: "non_scoring"
    },
    generic_language_terms: [...GENERIC_LANGUAGE_TERMS].sort((a, b) => a.localeCompare(b, "nb")),
    summary,
    terms,
    chapters
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/build-politics-fagverk-term-policy.mjs [--corpus path] [--audit path] [--output path]");
    return;
  }
  const policy = buildPolicy(readJson(args.corpus), readJson(args.audit));
  writeJson(args.output, policy);
  console.log(`Wrote Politics term policy: ${policy.summary.total} collisions; ${policy.summary.non_scoring} non-scoring; ${policy.summary.down_weight} down-weighted; ${policy.summary.context_only} context-only.`);
}

main();
