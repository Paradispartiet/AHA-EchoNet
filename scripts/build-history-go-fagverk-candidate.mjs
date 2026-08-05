#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIRECTORY = path.dirname(SCRIPT_PATH);
const DEFAULT_RELEASE = "data/fagverk/fagverk_release.json";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function safeGitHead(root) {
  const result = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown";
}

function parseArgs(argv) {
  const args = {
    historyGoRoot: process.env.HISTORY_GO_ROOT || "",
    releasePath: DEFAULT_RELEASE,
    subject: "",
    output: "",
    auditOutput: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--history-go-root") args.historyGoRoot = argv[++index] || "";
    else if (token === "--release") args.releasePath = argv[++index] || args.releasePath;
    else if (token === "--subject") args.subject = argv[++index] || "";
    else if (token === "--output") args.output = argv[++index] || "";
    else if (token === "--audit-output") args.auditOutput = argv[++index] || "";
    else if (token === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function verifySubject(subjectId, subject) {
  const errors = [];
  if (!subject) errors.push(`${subjectId}: missing from producer release.`);
  if (subject && !["complete", "complete_with_optional_gaps"].includes(subject.package_status)) {
    errors.push(`${subjectId}: package status ${subject.package_status} is not reviewable.`);
  }
  if ((subject?.missing_manifest_fields || []).length) errors.push(`${subjectId}: missing required manifest fields.`);
  if ((subject?.missing_required_files || []).length) errors.push(`${subjectId}: missing required package files.`);
  if ((subject?.missing_chapter_files || []).length) errors.push(`${subjectId}: missing chapter files.`);
  if (subject && !subject.package_content_sha256) errors.push(`${subjectId}: missing package digest.`);
  if (subject && !subject.structure_sha256) errors.push(`${subjectId}: missing structure digest.`);
  if (subject && !subject.content_sha256) errors.push(`${subjectId}: missing combined digest.`);
  return errors;
}

export function applyReviewBoundary(candidate, audit) {
  return {
    candidate: {
      ...candidate,
      lifecycle_stage: candidate.lifecycle_stage || "imported_review_candidate",
      approval_required: true,
      runtime_activation_allowed: false
    },
    audit: {
      ...audit,
      lifecycle_stage: audit.lifecycle_stage || "imported_review_candidate_audit",
      approval_required: true,
      runtime_activation_allowed: false
    }
  };
}

export function buildPackageCandidate({ release, subjectId, sourceRef }) {
  if (release.schema !== "history_go_fagverk_release_v2") throw new Error(`Unexpected producer release schema: ${release.schema}`);
  const subject = release.subjects?.[subjectId];
  const errors = verifySubject(subjectId, subject);
  if (errors.length) throw new Error(errors.join(" "));

  const packageFiles = (subject.package_files || []).map((file) => ({
    path: file.path,
    required: Boolean(file.required),
    fields: [...(file.fields || [])],
    exists: Boolean(file.exists),
    content_sha256: file.content_sha256 || null
  }));
  const existingFiles = packageFiles.filter((file) => file.exists);
  const optionalGaps = [...(subject.missing_optional_files || [])];
  const expectedExistingFiles = Number(subject.package_file_count || 0) - optionalGaps.length;
  const coverageErrors = [];
  if (packageFiles.length !== subject.package_file_count) {
    coverageErrors.push(`Expected ${subject.package_file_count} declared package files, found ${packageFiles.length}.`);
  }
  if (existingFiles.length !== expectedExistingFiles) {
    coverageErrors.push(`Expected ${expectedExistingFiles} existing package files after optional gaps, materialized ${existingFiles.length}.`);
  }
  for (const file of packageFiles.filter((item) => item.required && !item.exists)) {
    coverageErrors.push(`Required package file is missing: ${file.path}.`);
  }

  const candidate = {
    schema: "aha_history_go_fagverk_package_candidate_v1",
    version: "1.0.0",
    candidate_kind: "package_inventory",
    lifecycle_stage: "imported_review_candidate",
    status: "generated_package_review_candidate",
    source_repo: release.source.repository,
    source_ref: sourceRef,
    release_sha256: release.release_sha256,
    subject_id: subjectId,
    title: subject.title || subjectId,
    kind: subject.kind,
    parent_subject_id: subject.parent_subject_id,
    schema_family: subject.schema_family,
    package_status: subject.package_status,
    chapter_status: subject.chapter_status,
    package_file_count: subject.package_file_count,
    existing_package_file_count: existingFiles.length,
    required_package_file_count: subject.required_package_file_count,
    optional_package_file_count: subject.optional_package_file_count,
    referenced_file_count: subject.referenced_file_count,
    package_content_sha256: subject.package_content_sha256,
    structure_sha256: subject.structure_sha256,
    content_sha256: subject.content_sha256,
    package_files: packageFiles,
    optional_gaps: optionalGaps,
    approval_required: true,
    runtime_activation_allowed: false
  };
  const audit = {
    schema: "aha_history_go_fagverk_package_candidate_audit_v1",
    version: "1.0.0",
    candidate_kind: "package_inventory",
    lifecycle_stage: "imported_review_candidate_audit",
    source_repo: release.source.repository,
    source_ref: sourceRef,
    release_sha256: release.release_sha256,
    subject_id: subjectId,
    package_status: subject.package_status,
    chapter_status: subject.chapter_status,
    coverage: {
      declared_package_files: subject.package_file_count,
      expected_existing_package_files: expectedExistingFiles,
      materialized_existing_package_files: existingFiles.length,
      required_package_files: subject.required_package_file_count,
      optional_package_files: subject.optional_package_file_count,
      optional_gaps: optionalGaps,
      missing_required_files: [...(subject.missing_required_files || [])],
      missing_chapter_files: [...(subject.missing_chapter_files || [])]
    },
    digests: {
      package_content_sha256: subject.package_content_sha256,
      structure_sha256: subject.structure_sha256,
      content_sha256: subject.content_sha256
    },
    activation_recommendation: "subject_specific_review_gates_required_before_runtime_activation",
    approval_required: true,
    runtime_activation_allowed: false,
    gate: {
      passed: errors.length === 0 && coverageErrors.length === 0,
      errors: [...errors, ...coverageErrors]
    }
  };
  if (!audit.gate.passed) throw new Error(audit.gate.errors.join(" "));
  return { candidate, audit };
}

function buildChapterCandidate(args, subject) {
  if (subject.chapter_status !== "materialized") throw new Error(`${args.subject}: not a chapter-materialized package.`);
  const command = [
    path.join(SCRIPT_DIRECTORY, "build-history-go-fagverk-corpus.mjs"),
    "--history-go-root", args.historyGoRoot,
    "--subject", args.subject,
    "--expected-count", String(subject.chapter_count),
    "--output", args.output,
    "--audit-output", args.auditOutput
  ];
  const result = spawnSync(process.execPath, command, { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${args.subject}: chapter candidate builder failed with exit code ${result.status}.`);

  const outputPath = path.resolve(args.output);
  const auditOutputPath = path.resolve(args.auditOutput);
  const bounded = applyReviewBoundary(readJson(outputPath), readJson(auditOutputPath));
  writeJson(outputPath, bounded.candidate);
  writeJson(auditOutputPath, bounded.audit);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/build-history-go-fagverk-candidate.mjs --history-go-root dir --subject id --output file --audit-output file");
    return;
  }
  if (!args.historyGoRoot || !args.subject || !args.output || !args.auditOutput) {
    throw new Error("--history-go-root, --subject, --output and --audit-output are required.");
  }
  const historyGoRoot = path.resolve(args.historyGoRoot);
  const release = readJson(path.resolve(historyGoRoot, args.releasePath));
  const subject = release.subjects?.[args.subject];
  const errors = verifySubject(args.subject, subject);
  if (errors.length) throw new Error(errors.join(" "));
  if (subject.chapter_status === "materialized") {
    buildChapterCandidate(args, subject);
    return;
  }
  const sourceRef = safeGitHead(historyGoRoot);
  const { candidate, audit } = buildPackageCandidate({ release, subjectId: args.subject, sourceRef });
  writeJson(path.resolve(args.output), candidate);
  writeJson(path.resolve(args.auditOutput), audit);
  console.log(`Built package inventory candidate for ${args.subject}: ${candidate.existing_package_file_count}/${candidate.package_file_count} files, ${candidate.optional_gaps.length} optional gaps.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) main();
