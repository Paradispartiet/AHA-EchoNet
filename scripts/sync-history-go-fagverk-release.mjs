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
const ALLOWED_PACKAGE_STATUSES = new Set(["complete", "complete_with_optional_gaps"]);

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

export function verifyRelease(release) {
  if (release.schema !== "history_go_fagverk_release_v2") throw new Error(`Unexpected release schema: ${release.schema}`);
  const { release_sha256: expected, ...payload } = release;
  const actual = sha256(canonicalJson(payload));
  if (actual !== expected) throw new Error(`History Go release digest mismatch: ${actual} != ${expected}`);
  if (release.summary?.missing_file_count !== 0) throw new Error("History Go release contains blocking missing files or manifest fields.");
  if (release.summary?.subject_count !== Object.keys(release.subjects || {}).length) throw new Error("History Go release package count mismatch.");
  if (release.summary?.root_subject_count + release.summary?.specialization_count !== release.summary?.subject_count) {
    throw new Error("History Go root subject and specialization counts do not match the package count.");
  }
  const optionalGapCount = Object.values(release.subjects || {}).reduce(
    (sum, subject) => sum + (subject.missing_optional_files || []).length,
    0
  );
  if (optionalGapCount !== release.summary?.optional_gap_count) throw new Error("History Go optional gap count mismatch.");
  for (const [subjectId, subject] of Object.entries(release.subjects || {})) {
    if (!ALLOWED_PACKAGE_STATUSES.has(subject.package_status)) throw new Error(`${subjectId}: incomplete producer package.`);
    if ((subject.missing_manifest_fields || []).length || (subject.missing_required_files || []).length || (subject.missing_chapter_files || []).length) {
      throw new Error(`${subjectId}: unresolved blocking producer references.`);
    }
    if (subject.chapter_count !== (subject.chapters || []).length) throw new Error(`${subjectId}: chapter count mismatch.`);
    if (!subject.package_content_sha256 || !subject.structure_sha256 || !subject.content_sha256) throw new Error(`${subjectId}: missing producer digest.`);
    if (subject.package_status === "complete" && (subject.missing_optional_files || []).length) {
      throw new Error(`${subjectId}: optional gaps are not represented in package status.`);
    }
    if (subject.package_status === "complete_with_optional_gaps" && !(subject.missing_optional_files || []).length) {
      throw new Error(`${subjectId}: optional-gap status has no optional gaps.`);
    }
  }
  return release;
}

function compactSubject(subjectId, subject) {
  return {
    subject_id: subjectId,
    title: subject.title || subjectId,
    kind: subject.kind || "subject",
    parent_subject_id: subject.parent_subject_id || null,
    schema_family: subject.schema_family || null,
    pilot: Boolean(subject.pilot),
    package_status: subject.package_status,
    chapter_status: subject.chapter_status,
    package_file_count: Number(subject.package_file_count || 0),
    required_package_file_count: Number(subject.required_package_file_count || 0),
    optional_package_file_count: Number(subject.optional_package_file_count || 0),
    optional_gap_count: (subject.missing_optional_files || []).length,
    missing_optional_files: [...(subject.missing_optional_files || [])],
    chapter_count: Number(subject.chapter_count || 0),
    module_file_count: Number(subject.module_file_count || 0),
    brief_file_count: Number(subject.brief_file_count || 0),
    claims_file_count: Number(subject.claims_file_count || 0),
    chapter_referenced_file_count: Number(subject.chapter_referenced_file_count || 0),
    referenced_file_count: Number(subject.referenced_file_count || 0),
    package_content_sha256: subject.package_content_sha256,
    chapter_content_sha256: subject.chapter_content_sha256,
    structure_sha256: subject.structure_sha256,
    content_sha256: subject.content_sha256
  };
}

export function observedFromRelease(release, sourceRef) {
  verifyRelease(release);
  return {
    schema: "aha_history_go_fagverk_observed_release_v2",
    version: "2.0.0",
    lifecycle_stage: "observed_upstream_release",
    source_repo: release.source.repository,
    source_commit: sourceRef,
    producer_release_schema: release.schema,
    producer_release_version: release.version,
    release_sha256: release.release_sha256,
    registry: release.registry,
    subject_inventory: release.subject_inventory,
    fag_manifest: release.fag_manifest,
    summary: release.summary,
    subjects: Object.fromEntries(
      Object.entries(release.subjects || {})
        .sort(([a], [b]) => a.localeCompare(b, "nb"))
        .map(([id, subject]) => [id, compactSubject(id, subject)])
    ),
    candidate_import_required: true,
    approval_required: true,
    runtime_activation_allowed: false
  };
}

function delta(next, previous, field) {
  return Number(next?.[field] || 0) - Number(previous?.[field] || 0);
}

function subjectChanged(before, after) {
  if (!before || !after) return true;
  return [
    "kind",
    "parent_subject_id",
    "schema_family",
    "package_status",
    "chapter_status",
    "package_content_sha256",
    "chapter_content_sha256",
    "structure_sha256",
    "content_sha256"
  ].some((field) => before[field] !== after[field]);
}

export function compareObserved(previous, next) {
  const previousSubjects = previous?.subjects || {};
  const nextSubjects = next.subjects || {};
  const subjectIds = [...new Set([...Object.keys(previousSubjects), ...Object.keys(nextSubjects)])].sort((a, b) => a.localeCompare(b, "nb"));
  return subjectIds.map((subjectId) => {
    const before = previousSubjects[subjectId] || null;
    const after = nextSubjects[subjectId] || null;
    let status = "unchanged";
    if (!before && after) status = "added";
    else if (before && !after) status = "removed";
    else if (subjectChanged(before, after)) status = "changed";
    return {
      subject_id: subjectId,
      status,
      structure_changed: Boolean(before && after && before.structure_sha256 !== after.structure_sha256),
      package_content_changed: Boolean(before && after && before.package_content_sha256 !== after.package_content_sha256),
      chapter_content_changed: Boolean(before && after && before.chapter_content_sha256 !== after.chapter_content_sha256),
      content_changed: Boolean(before && after && before.content_sha256 !== after.content_sha256),
      package_status_changed: Boolean(before && after && before.package_status !== after.package_status),
      chapter_status_changed: Boolean(before && after && before.chapter_status !== after.chapter_status),
      package_file_delta: delta(after, before, "package_file_count"),
      optional_gap_delta: delta(after, before, "optional_gap_count"),
      chapter_delta: delta(after, before, "chapter_count"),
      module_delta: delta(after, before, "module_file_count"),
      referenced_file_delta: delta(after, before, "referenced_file_count"),
      before,
      after
    };
  });
}

function actionForSubject(subject) {
  if (subject.status === "removed") return "remove_candidate_and_review_retirement";
  if (subject.subject_id === "politikk" && subject.after?.chapter_status === "materialized") {
    return "rebuild_chapter_corpus_term_policy_and_correction_gates";
  }
  if (subject.after?.chapter_status === "materialized") return "rebuild_chapter_corpus_and_review_gates";
  return "rebuild_package_inventory_candidate_and_define_subject_review_gates";
}

export function buildUpdateReport(previous, next) {
  const subjects = compareObserved(previous, next);
  const changed = subjects.filter((subject) => subject.status !== "unchanged");
  return {
    schema: "aha_history_go_fagverk_release_update_v2",
    version: "2.0.0",
    status: changed.length ? "review_required" : "no_change",
    lifecycle_stage: "candidate_import_review",
    runtime_activation_allowed: false,
    previous: previous ? {
      observed_schema: previous.schema,
      source_commit: previous.source_commit,
      release_sha256: previous.release_sha256,
      registry_version: previous.registry?.version || null,
      package_count: previous.summary?.subject_count || Object.keys(previous.subjects || {}).length
    } : null,
    next: {
      observed_schema: next.schema,
      source_commit: next.source_commit,
      release_sha256: next.release_sha256,
      registry_version: next.registry?.version || null,
      package_count: next.summary?.subject_count || Object.keys(next.subjects || {}).length
    },
    summary: {
      changed_subject_count: changed.length,
      added_subject_count: changed.filter((subject) => subject.status === "added").length,
      removed_subject_count: changed.filter((subject) => subject.status === "removed").length,
      modified_subject_count: changed.filter((subject) => subject.status === "changed").length,
      package_file_delta: changed.reduce((sum, subject) => sum + subject.package_file_delta, 0),
      optional_gap_delta: changed.reduce((sum, subject) => sum + subject.optional_gap_delta, 0),
      chapter_delta: changed.reduce((sum, subject) => sum + subject.chapter_delta, 0),
      module_delta: changed.reduce((sum, subject) => sum + subject.module_delta, 0),
      referenced_file_delta: changed.reduce((sum, subject) => sum + subject.referenced_file_delta, 0)
    },
    changed_subjects: changed.map((subject) => subject.subject_id),
    subjects: subjects.map((subject) => ({
      ...subject,
      required_consumer_action: actionForSubject(subject),
      optional_gap_review_required: Boolean(subject.after?.optional_gap_count)
    })),
    approval_boundary: "observation_and_candidate_generation_only",
    activation_boundary: {
      observed_release_is_not_approved: true,
      imported_candidates_are_not_approved: true,
      approved_release_is_not_runtime_active_without_explicit_pointer_update: true,
      explicit_activation_pull_request_required: true
    }
  };
}

export function markdownForReport(report) {
  const lines = [
    "## Automatisk History Go Fagverk-oppdatering",
    "",
    `History Go-kilde: \`${report.next.source_commit}\``,
    `Release-digest: \`${report.next.release_sha256}\``,
    `Registry-versjon: \`${report.next.registry_version || "ukjent"}\``,
    `Observerte fagpakker: **${report.next.package_count}**`,
    "",
    "### Endringer",
    ""
  ];
  if (!report.changed_subjects.length) lines.push("Ingen faglige endringer.");
  for (const subject of report.subjects.filter((item) => item.status !== "unchanged")) {
    const after = subject.after;
    lines.push(
      `- **${subject.subject_id}**: ${subject.status}; pakkefiler ${subject.package_file_delta >= 0 ? "+" : ""}${subject.package_file_delta}, ` +
      `kapitler ${subject.chapter_delta >= 0 ? "+" : ""}${subject.chapter_delta}, moduler ${subject.module_delta >= 0 ? "+" : ""}${subject.module_delta}, ` +
      `referanser ${subject.referenced_file_delta >= 0 ? "+" : ""}${subject.referenced_file_delta}`
    );
    if (after) lines.push(`  - modell: \`${after.chapter_status}\` / \`${after.schema_family || "ukjent"}\``);
    if (subject.structure_changed) lines.push("  - struktur-digest er endret");
    if (subject.package_content_changed) lines.push("  - fagpakkens innholds-digest er endret");
    if (subject.chapter_content_changed) lines.push("  - kapittelinnholdets digest er endret");
    if (after?.optional_gap_count) lines.push(`  - valgfrie hull til gjennomgang: ${after.missing_optional_files.map((file) => `\`${file}\``).join(", ")}`);
    lines.push(`  - påkrevd AHA-handling: \`${subject.required_consumer_action}\``);
  }
  lines.push(
    "",
    "### Sikkerhetsgrense",
    "",
    "Denne PR-en oppdaterer bare observert upstream-release og importerte review-kandidater. Den endrer ikke godkjent release, runtime-aktiv peker, modelltrening, EchoNet eller History Go-data.",
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
  writeJson(path.resolve(args.statusPath), {
    changed,
    changed_subjects: report.changed_subjects,
    source_commit: sourceRef,
    release_sha256: release.release_sha256,
    producer_release_schema: release.schema
  });
  if (!changed) {
    console.log(`No new History Go Fagverk release: ${release.release_sha256}.`);
    return;
  }
  writeJson(observedPath, next);
  writeJson(path.resolve(args.reportPath), report);
  fs.mkdirSync(path.dirname(path.resolve(args.markdownPath)), { recursive: true });
  fs.writeFileSync(path.resolve(args.markdownPath), markdownForReport(report), "utf8");
  console.log(`Observed History Go Fagverk release ${release.release_sha256}; ${report.changed_subjects.length} packages require review.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) main();
