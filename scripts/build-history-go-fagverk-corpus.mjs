#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

function parseArgs(argv) {
  const args = { historyGoRoot: process.env.HISTORY_GO_ROOT || "", output: "data/integrations/history-go-fagverk-corpus.v1.json" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--history-go-root") args.historyGoRoot = argv[++index] || "";
    else if (token === "--output") args.output = argv[++index] || args.output;
    else if (token === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function normalize(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

const STOPWORDS = new Set([
  "og", "i", "på", "av", "for", "til", "med", "som", "er", "en", "et", "den", "det", "de",
  "fra", "eller", "om", "kan", "skal", "må", "ved", "etter", "mellom", "gjennom", "ikke", "også",
  "blir", "ble", "har", "hadde", "sin", "sine", "dette", "disse", "hvordan", "hva", "hvilke"
]);

function tokens(value) {
  return normalize(value)
    .match(/[a-zæøå0-9]+/gi)?.map(normalize)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token)) || [];
}

function unique(values) {
  return [...new Set(values.map(normalize).filter(Boolean))].sort((a, b) => a.localeCompare(b, "nb"));
}

function stringsFrom(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsFrom);
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(stringsFrom);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function safeGitHead(root) {
  const result = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function extractChapterEntry(subjectId, registryChapter, chapter, sourcePath) {
  const title = chapter.title || registryChapter.title || registryChapter.id;
  const subtitle = chapter.subtitle || registryChapter.subtitle || "";
  const titleTerms = unique([title, subtitle, ...tokens(title), ...tokens(subtitle)]);

  const concepts = Array.isArray(chapter.concepts) ? chapter.concepts : [];
  const conceptTerms = unique([
    ...concepts.flatMap((concept) => [concept?.term, concept?.title, concept?.id, concept?.definition]),
    ...(chapter.learningObjectives || []),
    ...(chapter.emne_ids || registryChapter.emne_ids || []).map((id) => String(id).replace(/^em_[^_]+_/, "").replaceAll("_", " ")),
    ...stringsFrom(chapter.diagnosticQuestions || []),
    ...stringsFrom(chapter.commonMisconceptions || [])
  ]).filter((term) => term.length <= 120);

  const supportText = [
    chapter.lead,
    ...stringsFrom(chapter.sections || []),
    ...stringsFrom(chapter.workedExamples || []),
    ...stringsFrom(chapter.applicationTasks || []),
    ...stringsFrom(chapter.selfCheck || [])
  ].filter(Boolean).join(" ");

  const frequencies = new Map();
  for (const token of tokens(supportText)) frequencies.set(token, (frequencies.get(token) || 0) + 1);
  const supportTerms = [...frequencies.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "nb"))
    .slice(0, 48)
    .map(([token]) => token);

  return {
    subject_id: subjectId,
    chapter_id: chapter.chapter_id || chapter.id || registryChapter.id,
    primary_domain_id: chapter.primary_domain_id || registryChapter.primary_domain_id || chapter.id || registryChapter.id,
    title,
    source_path: sourcePath.replaceAll(path.sep, "/"),
    title_terms: titleTerms,
    concept_terms: conceptTerms.slice(0, 96),
    support_terms: supportTerms,
    provenance: {
      chapter_schema: chapter.schema || "unknown",
      review_status: chapter.editorialStatus || chapter.status || "unknown",
      source_kind: "canonical_fagverk_chapter"
    }
  };
}

function buildCorpus(historyGoRoot) {
  const registryPath = path.join(historyGoRoot, "data", "fagverk", "fagverk_registry.json");
  if (!fs.existsSync(registryPath)) throw new Error(`Missing Fagverk registry: ${registryPath}`);
  const registry = readJson(registryPath);
  const entries = [];

  for (const [subjectId, subject] of Object.entries(registry.subjects || {})) {
    for (const registryChapter of subject.chapters || []) {
      if (!registryChapter.file) continue;
      const absolutePath = path.join(historyGoRoot, registryChapter.file);
      if (!fs.existsSync(absolutePath)) throw new Error(`Missing registered chapter: ${registryChapter.file}`);
      const chapter = readJson(absolutePath);
      entries.push(extractChapterEntry(subjectId, registryChapter, chapter, registryChapter.file));
    }
  }

  entries.sort((a, b) => a.subject_id.localeCompare(b.subject_id, "nb") || a.chapter_id.localeCompare(b.chapter_id, "nb"));
  const sourceRef = safeGitHead(historyGoRoot);
  const digest = crypto.createHash("sha256").update(JSON.stringify(entries)).digest("hex");
  return {
    schema: "aha_history_go_fagverk_corpus_v1",
    version: "1.0.0",
    status: "generated_grounding_corpus",
    source_repo: "Paradispartiet/History-Go",
    source_ref: sourceRef,
    content_sha256: digest,
    generation_mode: "deterministic_registry_build",
    entries
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/build-history-go-fagverk-corpus.mjs --history-go-root ../History-Go [--output data/integrations/history-go-fagverk-corpus.v1.json]");
    return;
  }
  if (!args.historyGoRoot) throw new Error("Provide --history-go-root or HISTORY_GO_ROOT.");
  const historyGoRoot = path.resolve(args.historyGoRoot);
  const outputPath = path.resolve(repoRoot, args.output);
  const corpus = buildCorpus(historyGoRoot);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(corpus, null, 2)}\n`, "utf8");
  console.log(`Wrote ${corpus.entries.length} Fagverk chapters to ${path.relative(repoRoot, outputPath)} (${corpus.content_sha256}).`);
}

main();
