#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const subjectsDir = path.join(repoRoot, "data", "subjects");

function parseArgs(argv) {
  const args = { check: false, subject: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--check") args.check = true;
    else if (token === "--subject") args.subject = String(argv[++index] || "").trim();
    else if (token === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values || []) {
    const clean = String(value ?? "").trim();
    const key = normalize(clean);
    if (!clean || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

function expandNorwegianIngVariant(term) {
  const clean = String(term ?? "").trim();
  if (!clean || /\s/u.test(clean) || !/ing$/iu.test(clean)) return [clean];
  return [clean, `${clean}en`, `${clean}er`, `${clean}ene`];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveRepoPath(relativePath) {
  const absolute = path.resolve(repoRoot, relativePath);
  if (absolute !== repoRoot && !absolute.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`Path escapes repository: ${relativePath}`);
  }
  return absolute;
}

function corpusTerms(entry) {
  return uniqueStrings([
    entry?.title,
    ...(entry?.title_terms || []),
    ...(entry?.concept_terms || []),
    ...(entry?.support_terms || [])
  ]);
}

function materializeProjection(subject, bridge, corpus, projection) {
  const chapterId = String(projection?.chapter_id || "").trim();
  const emneId = String(projection?.emne_id || `fagverk_${chapterId}`).trim();
  if (!chapterId || !emneId) throw new Error(`${subject.subject_id}: projection must define chapter_id/emne_id.`);

  const entry = (corpus.entries || []).find((candidate) => candidate?.chapter_id === chapterId);
  if (!entry) throw new Error(`${subject.subject_id}: canonical chapter ${chapterId} is missing from ${bridge.corpus_path}.`);

  const available = new Map(corpusTerms(entry).map((term) => [normalize(term), term]));
  const selected = uniqueStrings(projection.concept_terms || []);
  if (!selected.length) throw new Error(`${subject.subject_id}:${chapterId}: concept_terms must select canonical Fagverk terms.`);

  const canonicalTerms = selected.map((requested) => {
    const canonical = available.get(normalize(requested));
    if (!canonical) throw new Error(`${subject.subject_id}:${chapterId}: ${requested} is not present in the canonical runtime corpus.`);
    return canonical;
  });

  const coreConcepts = uniqueStrings(canonicalTerms.flatMap(expandNorwegianIngVariant));
  return {
    emne_id: emneId,
    title: String(entry.title || chapterId),
    core_concepts: coreConcepts,
    keywords: [],
    thinkers: [],
    learning_goals: [],
    checkpoints: [],
    summary: `Canonical History Go Fagverk-kapittel: ${String(entry.title || chapterId)}.`,
    description: "Materialisert fra godkjent, runtime-aktiv History Go Fagverk-corpus.",
    fagverk: {
      source_repo: String(corpus.source_repo || "Paradispartiet/History-Go"),
      source_ref: String(corpus.source_ref || ""),
      corpus_path: String(bridge.corpus_path),
      chapter_id: chapterId,
      source_path: String(entry.source_path || ""),
      generation_mode: "canonical_runtime_subject_projection_v1"
    }
  };
}

function materializeSubject(subject) {
  const bridge = subject?.history_go_fagverk;
  if (!bridge || bridge.source !== "runtime_active_subject_corpus") return subject;
  const corpusPath = String(bridge.corpus_path || "").trim();
  if (!corpusPath) throw new Error(`${subject.subject_id}: history_go_fagverk.corpus_path is required.`);

  const corpus = readJson(resolveRepoPath(corpusPath));
  if (corpus.schema !== "aha_history_go_fagverk_runtime_subject_corpus_v1") {
    throw new Error(`${subject.subject_id}: unexpected runtime corpus schema ${corpus.schema || "missing"}.`);
  }
  if (String(corpus.subject_id || "") !== String(subject.subject_id || "")) {
    throw new Error(`${subject.subject_id}: runtime corpus subject mismatch (${corpus.subject_id || "missing"}).`);
  }
  if (corpus.status !== "runtime_subject_corpus_active") {
    throw new Error(`${subject.subject_id}: runtime corpus is not active (${corpus.status || "missing"}).`);
  }

  const projections = Array.isArray(bridge.projections) ? bridge.projections : [];
  if (!projections.length) throw new Error(`${subject.subject_id}: history_go_fagverk.projections is empty.`);
  const generated = projections.map((projection) => materializeProjection(subject, bridge, corpus, projection));
  const generatedIds = new Set(generated.map((emne) => emne.emne_id));
  const existing = (Array.isArray(subject.emner) ? subject.emner : []).filter((emne) => !generatedIds.has(emne?.emne_id));

  return { ...subject, emner: [...existing, ...generated] };
}

function subjectFiles(subjectFilter) {
  const index = readJson(path.join(subjectsDir, "subjects_index.json"));
  const entries = Array.isArray(index.subjects) ? index.subjects : [];
  return entries
    .filter((entry) => !subjectFilter || entry.subject_id === subjectFilter)
    .map((entry) => ({ subject_id: entry.subject_id, file: entry.file || `${entry.subject_id}.json` }));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/materialize-history-go-fagverk-subjects.mjs [--subject politikk] [--check]");
    return;
  }

  const files = subjectFiles(args.subject);
  if (args.subject && !files.length) throw new Error(`Unknown AHA subject: ${args.subject}`);
  let configured = 0;
  const stale = [];

  for (const meta of files) {
    const filePath = path.join(subjectsDir, meta.file);
    const current = readJson(filePath);
    if (!current?.history_go_fagverk) continue;
    configured += 1;
    const materialized = materializeSubject(current);
    const next = stableJson(materialized);
    const before = fs.readFileSync(filePath, "utf8");
    if (before === next) continue;
    if (args.check) stale.push(path.relative(repoRoot, filePath));
    else fs.writeFileSync(filePath, next, "utf8");
  }

  if (!configured) throw new Error(args.subject ? `${args.subject}: no History Go Fagverk projection configured.` : "No History Go Fagverk subject projections configured.");
  if (stale.length) throw new Error(`Stale History Go Fagverk subject projection: ${stale.join(", ")}. Run materialization and commit the subject file.`);
  console.log(`${args.check ? "Verified" : "Materialized"} ${configured} History Go Fagverk subject projection${configured === 1 ? "" : "s"}.`);
}

main();
