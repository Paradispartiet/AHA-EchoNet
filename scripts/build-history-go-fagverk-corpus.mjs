#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer.`);
  return parsed;
}

function parseArgs(argv) {
  const args = {
    historyGoRoot: process.env.HISTORY_GO_ROOT || "",
    output: "data/integrations/history-go-fagverk-corpus.v1.json",
    auditOutput: "",
    subject: "",
    expectedCount: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--history-go-root") args.historyGoRoot = argv[++index] || "";
    else if (token === "--output") args.output = argv[++index] || args.output;
    else if (token === "--audit-output") args.auditOutput = argv[++index] || "";
    else if (token === "--subject") args.subject = normalize(argv[++index] || "");
    else if (token === "--expected-count") args.expectedCount = parsePositiveInteger(argv[++index], token);
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

function termLocations(entry) {
  const locations = new Map();
  for (const [group, terms] of [
    ["title_terms", entry.title_terms],
    ["concept_terms", entry.concept_terms],
    ["support_terms", entry.support_terms]
  ]) {
    for (const term of terms || []) {
      if (!locations.has(term)) locations.set(term, []);
      locations.get(term).push(group);
    }
  }
  return locations;
}

function buildTermCollisions(entries) {
  const byTerm = new Map();
  for (const entry of entries) {
    for (const [term, groups] of termLocations(entry)) {
      if (!byTerm.has(term)) byTerm.set(term, []);
      byTerm.get(term).push({ chapter_id: entry.chapter_id, groups });
    }
  }
  return [...byTerm.entries()]
    .filter(([, chapters]) => chapters.length > 1)
    .map(([term, chapters]) => ({
      term,
      token_count: tokens(term).length,
      chapter_count: chapters.length,
      chapters: chapters.sort((a, b) => a.chapter_id.localeCompare(b.chapter_id, "nb")),
      risk: tokens(term).length === 1 && chapters.length >= 3 ? "high" : tokens(term).length === 1 ? "medium" : "low"
    }))
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.risk] - rank[b.risk] || b.chapter_count - a.chapter_count || a.term.localeCompare(b.term, "nb");
    });
}

function duplicateValues(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value).sort((a, b) => a.localeCompare(b, "nb"));
}

function buildAudit({ registry, entries, selectedSubjects, expectedCount, sourceRef }) {
  const registered = selectedSubjects.flatMap(([subjectId, subject]) =>
    (subject.chapters || []).filter((chapter) => chapter.file).map((chapter) => ({ subject_id: subjectId, chapter_id: chapter.id, source_path: chapter.file }))
  );
  const registeredIds = registered.map((chapter) => `${chapter.subject_id}:${chapter.chapter_id}`);
  const corpusIds = entries.map((entry) => `${entry.subject_id}:${entry.chapter_id}`);
  const registeredSet = new Set(registeredIds);
  const corpusSet = new Set(corpusIds);
  const missing = registeredIds.filter((id) => !corpusSet.has(id));
  const unexpected = corpusIds.filter((id) => !registeredSet.has(id));
  const duplicateChapterIds = duplicateValues(corpusIds);
  const termCollisions = buildTermCollisions(entries);
  const highRisk = termCollisions.filter((collision) => collision.risk === "high");
  const requestedExpectedCount = expectedCount == null ? registered.length : expectedCount;
  const gateErrors = [];
  if (entries.length !== requestedExpectedCount) gateErrors.push(`Expected ${requestedExpectedCount} chapters, materialized ${entries.length}.`);
  if (registered.length !== requestedExpectedCount) gateErrors.push(`Registry contains ${registered.length} chapters, expected ${requestedExpectedCount}.`);
  if (missing.length) gateErrors.push(`Missing registered chapters: ${missing.join(", ")}.`);
  if (unexpected.length) gateErrors.push(`Unexpected corpus chapters: ${unexpected.join(", ")}.`);
  if (duplicateChapterIds.length) gateErrors.push(`Duplicate chapter ids: ${duplicateChapterIds.join(", ")}.`);

  return {
    schema: "aha_fagverk_corpus_audit_v1",
    version: "1.0.0",
    source_repo: "Paradispartiet/History-Go",
    source_ref: sourceRef,
    registry_version: registry.version || "unknown",
    registry_updated_at: registry.updatedAt || null,
    subject_filter: selectedSubjects.map(([subjectId]) => subjectId),
    coverage: {
      expected: requestedExpectedCount,
      registered: registered.length,
      materialized: entries.length,
      missing,
      unexpected,
      duplicate_chapter_ids: duplicateChapterIds
    },
    chapters: entries.map((entry) => ({
      subject_id: entry.subject_id,
      chapter_id: entry.chapter_id,
      title: entry.title,
      source_path: entry.source_path,
      title_term_count: entry.title_terms.length,
      concept_term_count: entry.concept_terms.length,
      support_term_count: entry.support_terms.length
    })),
    term_collision_summary: {
      total: termCollisions.length,
      high_risk: highRisk.length,
      medium_risk: termCollisions.filter((collision) => collision.risk === "medium").length,
      low_risk: termCollisions.filter((collision) => collision.risk === "low").length
    },
    high_risk_terms: highRisk,
    term_collisions: termCollisions,
    activation_recommendation: highRisk.length
      ? "review_required_before_runtime_activation"
      : "coverage_gate_passed_review_still_required",
    gate: {
      passed: gateErrors.length === 0,
      errors: gateErrors
    }
  };
}

function selectSubjects(registry, subjectFilter) {
  const subjects = Object.entries(registry.subjects || {});
  if (!subjectFilter) return subjects;
  const selected = subjects.filter(([subjectId]) => normalize(subjectId) === subjectFilter);
  if (!selected.length) throw new Error(`Unknown Fagverk subject: ${subjectFilter}`);
  return selected;
}

function buildCorpus(historyGoRoot, { subject = "", expectedCount = null } = {}) {
  const registryPath = path.join(historyGoRoot, "data", "fagverk", "fagverk_registry.json");
  if (!fs.existsSync(registryPath)) throw new Error(`Missing Fagverk registry: ${registryPath}`);
  const registry = readJson(registryPath);
  const selectedSubjects = selectSubjects(registry, subject);
  const entries = [];

  for (const [subjectId, subjectData] of selectedSubjects) {
    for (const registryChapter of subjectData.chapters || []) {
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
  const corpus = {
    schema: "aha_history_go_fagverk_corpus_v1",
    version: "1.1.0",
    status: subject ? "generated_subject_audit_corpus" : "generated_grounding_corpus",
    source_repo: "Paradispartiet/History-Go",
    source_ref: sourceRef,
    registry_version: registry.version || "unknown",
    subject_filter: subject || null,
    content_sha256: digest,
    generation_mode: "deterministic_registry_build",
    entries
  };
  const audit = buildAudit({ registry, entries, selectedSubjects, expectedCount, sourceRef });
  if (!audit.gate.passed) throw new Error(audit.gate.errors.join(" "));
  return { corpus, audit };
}

function writeJson(outputPath, value) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/build-history-go-fagverk-corpus.mjs --history-go-root ../History-Go [--subject politikk] [--expected-count 13] [--output data/integrations/history-go-fagverk-corpus.v1.json] [--audit-output artifacts/fagverk-audit.json]");
    return;
  }
  if (!args.historyGoRoot) throw new Error("Provide --history-go-root or HISTORY_GO_ROOT.");
  const historyGoRoot = path.resolve(args.historyGoRoot);
  const outputPath = path.resolve(repoRoot, args.output);
  const { corpus, audit } = buildCorpus(historyGoRoot, args);
  writeJson(outputPath, corpus);
  if (args.auditOutput) writeJson(path.resolve(repoRoot, args.auditOutput), audit);
  console.log(`Wrote ${corpus.entries.length} Fagverk chapters to ${path.relative(repoRoot, outputPath)} (${corpus.content_sha256}).`);
  console.log(`Coverage gate passed: ${audit.coverage.materialized}/${audit.coverage.expected}; ${audit.term_collision_summary.high_risk} high-risk shared terms require review.`);
}

main();
