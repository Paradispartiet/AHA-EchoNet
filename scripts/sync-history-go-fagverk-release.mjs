#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_RELEASE = "data/fagverk/fagverk_release.json";
const DEFAULT_OBSERVED = "data/integrations/history-go-fagverk-release.observed.json";
const DEFAULT_REPORT = "data/integrations/review/history-go-fagverk-release-update.v1.json";
const DEFAULT_MARKDOWN = "artifacts/history-go-fagverk-release-pr.md";
const DEFAULT_STATUS = "artifacts/history-go-fagverk-release-status.json";

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeGitHead(root) {
  const result = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Could not resolve History Go HEAD: ${result.stderr}`);
  return result.stdout.trim();
}

function parseArgs(argv) {
  const args = {
    historyGoRoot: process.env.HISTORY_GO_ROOT || "",
    releasePath: DEFAULT_RELEASE,
    observedPath: DEFAULT_OBSERVED,
    reportPath: DEFAULT_REPORT,
    markdownPath: DEFAULT_MARKDOWN,
    statusPath: DEFAULT_STATUS,
    sourceRef: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--history-go-root") args.historyGoRoot = argv[++index] || "";
    else if (token === "--release") args.releasePath = argv[++index] || args.releasePath;
    else if (token === "--observed") args.observedPath = argv[++index] || args.observedPath;
    else if (token === "--report") args.reportPath = argv[++index] || args.reportPath;
    else if (token === "--markdown") args.markdownPath = argv[++index] || args.markdownPath;
    else if (token === "--status") args.statusPath = argv[++index] || args.statusPath;
    else if (token === "--source-ref") args.sourceRef = argv[++index] || "";
    else if (token === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function verifyRelease(release) {
  if (release.schema !== "history_go_fagverk_release_v1") throw new Error(`Unexpected release schema: ${release.schema}`);
  const { release_sha256: expected, ...payload } = release;
  const actual = sha256(canonicalJson(payload));
  if (actual !== expected) throw new Error(`History Go release digest mismatch: ${actual} != ${expected}`);
  if (release.summary?.missing_file_count !== 0) throw new Error("History Go release contains missing files.");
  if (release.summary?.subject_count !== Object.keys(release.subjects || {}).length) throw new Error("History Go release subject count mismatch.");
}

function compactSubject(subjectId, subject) {
  return {
    subject_id: subjectId,
    title: subject.title || subjectId,
    chapter_count: Number(subject.chapter_count || 0),
    module_file_count: Number(subject.module_file_count || 0),
    referenced_file_count: Number(subject.referenced_file_count || 0),
    structure_sha256: subject.structure_sha256,
    content_sha256: subject.content_sha256
  };
}

export function observedFromRelease(release, sourceRef) {
  verifyRelease(release);
  return {
    schema: "aha_history_go_fagverk_observed_release_v1",
    version: "1.0.0",
    source_repo: release.source.repository,
    source_commit: sourceRef,
    release_sha256: release.release_sha256,
    registry: release.registry,
    summary: release.summary,
    subjects: Object.fromEntries(Object.entries(release.subjects || {}).sort(([a], [b]) => a.localeCompare(b)).map(([id, subject]) => [id, compactSubject(id, subject)])),
    runtime_activation_allowed: false
  };
}

function delta(next, previous, field) {
  return Number(next?.[field] || 0) - Number(previous?.[field] || 0);
}

export function compareObserved(previous, next) {
  const previousSubjects = previous?.subjects || {};
  const nextSubjects = next.subjects || {};
  const subjectIds = [...new Set([...Object.keys(previousSubjects), ...Object.keys(nextSubjects)])].sort();
  const subjects = subjectIds.map((subjectId) => {
    const before = previousSubjects[subjectId] || null;
    const after = nextSubjects[subjectId] || null;
    let status = "unchanged";
    if (!before && after) status = "added";
    else if (before && !after) status = "removed";
    else if (before.structure_sha256 !== after.structure_sha256 || before.content_sha256 !== after.content_sha256) status = "changed";
    return {
      subject_id: subjectId,
      status,
      structure_changed: Boolean(before && after && before.structure_sha256 !== after.structure_sha256),
      content_changed: Boolean(before && after && before.content_sha256 !== after.content_sha256),
      chapter_delta: delta(after, before, "chapter_count"),
      module_delta: delta(after, before, "module_file_count"),
      referenced_file_delta: delta(after, before, "referenced_file_count"),
      before,
      after
    };
  });
  return subjects;
}

function actionForSubject(subjectId) {
  if (subjectId === "politikk") return "rebuild_corpus_term_policy_and_correction_gates";
  return "rebuild_subject_corpus_and_create_review_gates_before_runtime_support";
}

export function buildUpdateReport(previous, next) {
  const subjects = compareObserved(previous, next);
  const changed = subjects.filter((subject) => subject.status !== "unchanged");
  return {
    schema: "aha_history_go_fagverk_release_update_v1",
    version: "1.0.0",
    status: changed.length ? "review_required" : "no_change",
    runtime_activation_allowed: false,
    previous: previous ? {
      source_commit: previous.source_commit,
      release_sha256: previous.release_sha256,
      registry_version: previous.registry?.version || null
    } : null,
    next: {
      source_commit: next.source_commit,
      release_sha256: next.release_sha256,
      registry_version: next.registry?.version || null
    },
    summary: {
      changed_subject_count: changed.length,
      added_subject_count: changed.filter((subject) => subject.status === "added").length,
      removed_subject_count: changed.filter((subject) => subject.status === "removed").length,
      modified_subject_count: changed.filter((subject) => subject.status === "changed").length,
      chapter_delta: changed.reduce((sum, subject) => sum + subject.chapter_delta, 0),
      module_delta: changed.reduce((sum, subject) => sum + subject.module_delta, 0),
      referenced_file_delta: changed.reduce((sum, subject) => sum + subject.referenced_file_delta, 0)
    },
    changed_subjects: changed.map((subject) => subject.subject_id),
    subjects: subjects.map((subject) => ({ ...subject, required_consumer_action: actionForSubject(subject.subject_id) })),
    approval_boundary: "observation_and_candidate_generation_only"
  };
}

export function markdownForReport(report) {
  const lines = [
    "## Automatisk History Go Fagverk-oppdatering",
    "",
    `History Go-kilde: \`${report.next.source_commit}\``,
    `Release-digest: \`${report.next.release_sha256}\``,
    `Registry-versjon: \`${report.next.registry_version || "ukjent"}\``,
    "",
    "### Endringer",
    ""
  ];
  if (!report.changed_subjects.length) lines.push("Ingen faglige endringer.");
  for (const subject of report.subjects.filter((item) => item.status !== "unchanged")) {
    lines.push(`- **${subject.subject_id}**: ${subject.status}; kapitler ${subject.chapter_delta >= 0 ? "+" : ""}${subject.chapter_delta}, moduler ${subject.module_delta >= 0 ? "+" : ""}${subject.module_delta}, kildefiler ${subject.referenced_file_delta >= 0 ? "+" : ""}${subject.referenced_file_delta}`);
    if (subject.structure_changed) lines.push("  - struktur-digest er endret");
    if (subject.content_changed) lines.push("  - innholds-digest er endret");
    lines.push(`  - påkrevd AHA-handling: \`${subject.required_consumer_action}\``);
  }
  lines.push(
    "",
    "### Sikkerhetsgrense",
    "",
    "Denne PR-en oppdaterer bare observert release og review-kandidater. Den endrer ikke godkjent runtime-korpus, modelltrening, EchoNet eller History Go-data.",
    "",
    "`runtime_activation_allowed` forblir `false`."
  );
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/sync-history-go-fagverk-release.mjs --history-go-root dir [--source-ref sha] [--observed path] [--report path]");
    return;
  }
  if (!args.historyGoRoot) throw new Error("--history-go-root is required.");
  const release = readJson(path.resolve(args.historyGoRoot, args.releasePath));
  const sourceRef = args.sourceRef || safeGitHead(args.historyGoRoot);
  const next = observedFromRelease(release, sourceRef);
  const observedPath = path.resolve(args.observedPath);
  const previous = fs.existsSync(observedPath) ? readJson(observedPath) : null;
  const report = buildUpdateReport(previous, next);
  const changed = report.status === "review_required";
  writeJson(path.resolve(args.statusPath), { changed, changed_subjects: report.changed_subjects, source_commit: sourceRef, release_sha256: release.release_sha256 });
  if (!changed) {
    console.log(`No new History Go Fagverk release: ${release.release_sha256}.`);
    return;
  }
  writeJson(observedPath, next);
  writeJson(path.resolve(args.reportPath), report);
  fs.mkdirSync(path.dirname(path.resolve(args.markdownPath)), { recursive: true });
  fs.writeFileSync(path.resolve(args.markdownPath), markdownForReport(report), "utf8");
  console.log(`Observed History Go Fagverk release ${release.release_sha256}; ${report.changed_subjects.length} subjects require review.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) main();
