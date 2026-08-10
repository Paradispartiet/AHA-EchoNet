#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const DEFAULT_REGISTRY = "data/integrations/review/history-go-fagverk-subject-approval-registry.v1.json";
const DEFAULT_SUBJECT_BASELINE = "data/integrations/review/history-go-fagverk-subject-content-baseline.v1.json";
const DEFAULT_OBSERVED = "data/integrations/history-go-fagverk-release.observed.json";
const DEFAULT_RUNTIME_APPROVED = "data/integrations/history-go-fagverk-release.approved.json";
const DEFAULT_RUNTIME_ACTIVE = "data/integrations/history-go-fagverk-release.runtime-active.json";

function parseArgs(argv) {
  const args = {
    registry: DEFAULT_REGISTRY,
    subjectBaseline: DEFAULT_SUBJECT_BASELINE,
    observed: DEFAULT_OBSERVED,
    runtimeApproved: DEFAULT_RUNTIME_APPROVED,
    runtimeActive: DEFAULT_RUNTIME_ACTIVE,
    subject: "",
    all: false,
    outputRoot: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--registry") args.registry = argv[++index] || args.registry;
    else if (token === "--subject-baseline") args.subjectBaseline = argv[++index] || args.subjectBaseline;
    else if (token === "--observed") args.observed = argv[++index] || args.observed;
    else if (token === "--runtime-approved") args.runtimeApproved = argv[++index] || args.runtimeApproved;
    else if (token === "--runtime-active") args.runtimeActive = argv[++index] || args.runtimeActive;
    else if (token === "--subject") args.subject = argv[++index] || "";
    else if (token === "--all") args.all = true;
    else if (token === "--output-root") args.outputRoot = argv[++index] || "";
    else if (token === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function resolve(relativePath) {
  return path.resolve(repoRoot, relativePath);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(resolve(relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  const outputPath = resolve(relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function get(value, dottedPath) {
  return dottedPath.split(".").reduce((current, key) => current?.[key], value);
}

function outputPathFor(config, outputRoot) {
  return outputRoot ? path.join(outputRoot, path.basename(config.approval_path)) : config.approval_path;
}

function validateRegistry(registry) {
  if (registry.schema !== "aha_history_go_fagverk_subject_approval_registry_v1") throw new Error(`Unexpected approval registry schema: ${registry.schema}`);
  if (!registry.subjects || !Object.keys(registry.subjects).length) throw new Error("Subject approval registry is empty.");
  if (registry.runtime_activation_allowed !== false) throw new Error("Subject approval registry must never allow runtime activation.");
}

function validateSubjectBaseline(baseline, registry) {
  if (baseline.schema !== "aha_history_go_fagverk_subject_content_baseline_v1") throw new Error(`Unexpected subject baseline schema: ${baseline.schema}`);
  if (baseline.runtime_activation_allowed !== false) throw new Error("Subject content baseline must never allow runtime activation.");
  const registrySubjects = Object.keys(registry.subjects).sort((a, b) => a.localeCompare(b, "nb"));
  const baselineSubjects = Object.keys(baseline.subjects || {}).sort((a, b) => a.localeCompare(b, "nb"));
  if (JSON.stringify(registrySubjects) !== JSON.stringify(baselineSubjects)) throw new Error("Subject content baseline must cover exactly the approval registry subjects.");
  for (const subjectId of registrySubjects) {
    const item = baseline.subjects[subjectId];
    for (const field of ["approved_source_ref", "approved_release_sha256", "subject_content_sha256"]) {
      if (!item?.[field]) throw new Error(`${subjectId}: subject content baseline is missing ${field}.`);
    }
  }
}

function validateGate(gate, artifact, expectedSource, expectedDigest) {
  const errors = [];
  const status = get(artifact, gate.status_field);
  if (status !== gate.expected_status) errors.push(`${gate.id}: expected ${gate.status_field}=${JSON.stringify(gate.expected_status)}, got ${JSON.stringify(status)}.`);
  if (gate.source_ref_field && get(artifact, gate.source_ref_field) !== expectedSource) errors.push(`${gate.id}: source ref differs from candidate.`);
  if (gate.digest_field && get(artifact, gate.digest_field) !== expectedDigest) errors.push(`${gate.id}: corpus digest differs from candidate.`);
  if (gate.approval_field && get(artifact, gate.approval_field) !== gate.expected_approval) errors.push(`${gate.id}: approval boundary differs.`);
  if (gate.runtime_field && get(artifact, gate.runtime_field) !== gate.expected_runtime) errors.push(`${gate.id}: runtime boundary differs.`);
  for (const [field, expected] of Object.entries(gate.summary_expectations || {})) {
    if (get(artifact, field) !== expected) errors.push(`${gate.id}: expected ${field}=${JSON.stringify(expected)}, got ${JSON.stringify(get(artifact, field))}.`);
  }
  return {
    id: gate.id,
    path: gate.path,
    status_field: gate.status_field,
    status,
    expected_status: gate.expected_status,
    passed: errors.length === 0,
    errors
  };
}

function buildApproval(subjectId, config, context) {
  if (config.subject_id !== subjectId) throw new Error(`${subjectId}: registry key and subject_id differ.`);
  const candidate = readJson(config.candidate.path);
  const corpus = readJson(config.review_corpus.path);
  const sourceRef = get(candidate, config.candidate.source_ref_field);
  const corpusDigest = get(candidate, config.candidate.digest_field);
  const baseline = context.subjectBaseline.subjects[subjectId];
  const observedSubject = context.observed.subjects?.[subjectId];
  const errors = [];

  if (candidate.subject_filter !== subjectId) errors.push("Candidate subject_filter differs from registry subject.");
  if (candidate.approval_required !== true || candidate.runtime_activation_allowed !== false) errors.push("Candidate is not review-only.");
  if (!baseline) errors.push("Subject content baseline is missing.");
  if (baseline && sourceRef !== baseline.approved_source_ref) errors.push("Candidate source differs from approved subject-content baseline.");
  if (!observedSubject) errors.push("Observed release is missing the approved subject.");
  if (baseline && observedSubject?.content_sha256 !== baseline.subject_content_sha256) errors.push("Observed subject content differs from approved subject-content baseline.");
  if (get(corpus, config.review_corpus.source_ref_field) !== sourceRef) errors.push("Reviewed corpus source differs from candidate.");
  if (get(corpus, config.review_corpus.digest_field) !== corpusDigest) errors.push("Reviewed corpus digest differs from candidate.");

  const gateResults = config.gates.map((gate) => validateGate(gate, readJson(gate.path), sourceRef, corpusDigest));
  errors.push(...gateResults.flatMap((gate) => gate.errors));

  if (context.runtimeApproved.approved_source_commit === sourceRef) errors.push("Approved subject source is already represented as runtime-approved by the legacy runtime contract.");
  if (context.runtimeActive.active_source_commit === sourceRef) errors.push("Approved subject source is already represented as the legacy runtime-active source.");

  const passed = errors.length === 0;
  return {
    schema: "aha_history_go_fagverk_subject_approval_v1",
    version: "1.0.0",
    status: passed ? "subject_review_approved_not_runtime_active" : "subject_review_blocked",
    lifecycle_stage: "subject_approval",
    subject_id: subjectId,
    source_repo: candidate.source_repo,
    source_ref: sourceRef,
    observed_release_sha256: baseline?.approved_release_sha256 || context.observed.release_sha256,
    candidate: {
      path: config.candidate.path,
      corpus_sha256: corpusDigest,
      chapter_count: candidate.entries?.length || 0
    },
    reviewed_corpus: {
      path: config.review_corpus.path,
      corpus_sha256: get(corpus, config.review_corpus.digest_field),
      chapter_count: corpus.entries?.length || 0
    },
    gate_summary: {
      total: gateResults.length,
      passed: gateResults.filter((gate) => gate.passed).length,
      failed: gateResults.filter((gate) => !gate.passed).length
    },
    gates: gateResults,
    errors,
    approval_scope: "subject_review_artifacts_only",
    approval_required_for_runtime: true,
    runtime_activation_allowed: false,
    runtime_approved_pointer_changed: false,
    runtime_active_pointer_changed: false,
    explicit_runtime_activation_pull_request_required: true
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/build-history-go-fagverk-subject-approvals.mjs (--all | --subject id) [--subject-baseline path] [--output-root dir]");
    return;
  }
  if (args.all === Boolean(args.subject)) throw new Error("Choose exactly one of --all or --subject.");
  const registry = readJson(args.registry);
  validateRegistry(registry);
  const subjectBaseline = readJson(args.subjectBaseline);
  validateSubjectBaseline(subjectBaseline, registry);
  const context = {
    subjectBaseline,
    observed: readJson(args.observed),
    runtimeApproved: readJson(args.runtimeApproved),
    runtimeActive: readJson(args.runtimeActive)
  };
  const subjectIds = args.all ? Object.keys(registry.subjects).sort((a, b) => a.localeCompare(b, "nb")) : [args.subject];
  let failed = 0;
  for (const subjectId of subjectIds) {
    const config = registry.subjects[subjectId];
    if (!config) throw new Error(`Subject is not registered for approval: ${subjectId}`);
    const approval = buildApproval(subjectId, config, context);
    writeJson(outputPathFor(config, args.outputRoot), approval);
    console.log(`${subjectId}: ${approval.status}; ${approval.gate_summary.passed}/${approval.gate_summary.total} gates passed.`);
    if (approval.status !== "subject_review_approved_not_runtime_active") failed += 1;
  }
  if (failed) process.exitCode = 1;
}

main();
