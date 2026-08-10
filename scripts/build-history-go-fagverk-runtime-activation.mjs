#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const DEFAULT_REGISTRY = "data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json";
const DEFAULT_APPROVED = "data/integrations/history-go-fagverk-release.approved.json";
const DEFAULT_ACTIVE = "data/integrations/history-go-fagverk-release.runtime-active.json";

function parseArgs(argv) {
  const args = { registry: DEFAULT_REGISTRY, approved: DEFAULT_APPROVED, active: DEFAULT_ACTIVE, outputRoot: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--registry") args.registry = argv[++index] || args.registry;
    else if (token === "--approved") args.approved = argv[++index] || args.approved;
    else if (token === "--active") args.active = argv[++index] || args.active;
    else if (token === "--output-root") args.outputRoot = argv[++index] || "";
    else if (token === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function resolve(relativePath) { return path.resolve(repoRoot, relativePath); }
function readJson(relativePath) { return JSON.parse(fs.readFileSync(resolve(relativePath), "utf8")); }
function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}
function sha256(value) { return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex"); }
function withDigest(value) { return { ...value, artifact_sha256: sha256(value) }; }
function outputPath(targetPath, outputRoot) { return outputRoot ? path.join(outputRoot, path.basename(targetPath)) : targetPath; }
function writeJson(targetPath, value, outputRoot) {
  const relativePath = outputPath(targetPath, outputRoot);
  const absolutePath = resolve(relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return relativePath;
}

function validateApproval(config, approval) {
  if (approval.schema !== "aha_history_go_fagverk_subject_approval_v1") throw new Error(`${config.subject_id}: unsupported approval schema.`);
  if (approval.status !== "subject_review_approved_not_runtime_active") throw new Error(`${config.subject_id}: subject review is not approved.`);
  if (approval.subject_id !== config.subject_id) throw new Error(`${config.subject_id}: approval subject mismatch.`);
  if (approval.gate_summary?.failed !== 0 || approval.gate_summary?.passed !== approval.gate_summary?.total) throw new Error(`${config.subject_id}: one or more subject approval gates failed.`);
  if (approval.runtime_activation_allowed !== false || approval.explicit_runtime_activation_pull_request_required !== true) throw new Error(`${config.subject_id}: approval does not require this explicit activation boundary.`);
}

function validateReviewAttestation(config, candidate) {
  if (!config.review_attestation_path) return null;
  const attestation = readJson(config.review_attestation_path);
  if (attestation.status !== "review_artifacts_attested_passed") throw new Error(`${config.subject_id}: review attestation has not passed.`);
  if (attestation.subject_id !== config.subject_id) throw new Error(`${config.subject_id}: review attestation subject mismatch.`);
  if (attestation.source_ref !== candidate.source_ref || attestation.corpus_sha256 !== candidate.content_sha256) throw new Error(`${config.subject_id}: review attestation source or corpus mismatch.`);
  if (attestation.approval_required !== true || attestation.runtime_activation_allowed !== false) throw new Error(`${config.subject_id}: review attestation lifecycle boundary is invalid.`);
  const evaluation = attestation.outputs?.evaluation?.summary || {};
  const fixtures = attestation.outputs?.fixtures?.summary || {};
  if (evaluation.failed !== 0 || evaluation.evidence_errors !== 0 || evaluation.chapters_covered !== candidate.entries?.length) throw new Error(`${config.subject_id}: review evaluation attestation is incomplete.`);
  if (fixtures.failed !== 0 || fixtures.false_positives !== 0 || fixtures.evidence_errors !== 0) throw new Error(`${config.subject_id}: fixture attestation did not pass.`);
  return attestation;
}

function synthesizeReviewPolicy(config, candidate, attestation) {
  if (!config.review_policy_config_path) throw new Error(`${config.subject_id}: review policy path or config path is required.`);
  const policyConfig = readJson(config.review_policy_config_path);
  if (policyConfig.status !== "review_policy_full_fixture_candidate_not_runtime_active") throw new Error(`${config.subject_id}: policy config has unexpected status.`);
  return {
    schema: `${config.subject_id}_runtime_materialization_source_v1`,
    version: policyConfig.version,
    status: policyConfig.status,
    subject_id: config.subject_id,
    source_repo: candidate.source_repo,
    source_ref: candidate.source_ref,
    corpus_sha256: candidate.content_sha256,
    approval_required: true,
    runtime_activation_allowed: false,
    default_weights: policyConfig.default_weights,
    policy_rules: policyConfig.policy_rules || {},
    global_non_scoring_terms: policyConfig.global_non_scoring_terms || policyConfig.generic_language_terms || [],
    chapter_rules: policyConfig.chapter_rules,
    terms: [],
    review_attestation: attestation
  };
}

function hydrateReviewPolicy(config, reviewPolicy, candidate) {
  const configPath = config.review_policy_config_path;
  if (!configPath) return reviewPolicy;
  const policyConfig = readJson(configPath);
  if (policyConfig.subject_id !== config.subject_id) throw new Error(`${config.subject_id}: policy config subject mismatch.`);
  if (policyConfig.source_ref !== reviewPolicy.source_ref || policyConfig.source_ref !== candidate.source_ref) throw new Error(`${config.subject_id}: policy config source mismatch.`);
  if (policyConfig.corpus_sha256 !== reviewPolicy.corpus_sha256 || policyConfig.corpus_sha256 !== candidate.content_sha256) throw new Error(`${config.subject_id}: policy config corpus digest mismatch.`);
  const configThresholds = policyConfig.thresholds || {};
  for (const key of ["minimum_score", "minimum_terms", "ambiguity_margin"]) {
    if (Number(configThresholds[key]) !== Number(config[key])) throw new Error(`${config.subject_id}: ${key} differs between runtime registry and policy config.`);
  }
  if (config.minimum_reviewed_evidence_terms != null && Number(configThresholds.minimum_reviewed_evidence_terms) !== Number(config.minimum_reviewed_evidence_terms)) throw new Error(`${config.subject_id}: minimum_reviewed_evidence_terms differs between runtime registry and policy config.`);
  const chapterRules = policyConfig.chapter_rules || {};
  const candidateChapterIds = new Set((candidate.entries || []).map((entry) => entry.chapter_id));
  const configuredChapterIds = new Set(Object.keys(chapterRules));
  if (candidateChapterIds.size !== configuredChapterIds.size || [...candidateChapterIds].some((chapterId) => !configuredChapterIds.has(chapterId))) throw new Error(`${config.subject_id}: policy config chapter rules do not match candidate chapters.`);
  const domainTerms = [...new Set(Object.values(chapterRules).flatMap((rule) => rule.required_anchor_terms || []))].sort();
  if (!domainTerms.length) throw new Error(`${config.subject_id}: policy config produced an empty domain gate.`);
  return {
    ...reviewPolicy,
    thresholds: policyConfig.thresholds,
    default_weights: policyConfig.default_weights,
    global_non_scoring_terms: policyConfig.global_non_scoring_terms || policyConfig.generic_language_terms || [],
    domain_gate: { required: true, terms: domainTerms },
    chapter_rules: chapterRules,
    policy_config_path: configPath,
    policy_config_version: policyConfig.version,
    policy_config_sha256: sha256(policyConfig)
  };
}

function buildRuntimeCorpus(config, approval, candidate, reviewPolicy) {
  if (candidate.schema !== "aha_history_go_fagverk_corpus_v1") throw new Error(`${config.subject_id}: unsupported candidate schema.`);
  if (candidate.subject_filter !== config.subject_id) throw new Error(`${config.subject_id}: candidate subject mismatch.`);
  if (candidate.source_ref !== approval.source_ref) throw new Error(`${config.subject_id}: candidate and approval source differ.`);
  if (candidate.content_sha256 !== approval.candidate?.corpus_sha256) throw new Error(`${config.subject_id}: candidate digest is not approved.`);
  if (candidate.entries?.length !== approval.candidate?.chapter_count) throw new Error(`${config.subject_id}: candidate chapter count is not approved.`);

  let entries = candidate.entries;
  if (config.runtime_corpus_projection === "reviewed_anchor_projection_v1") {
    entries = candidate.entries.map((entry) => {
      const requiredAnchors = reviewPolicy.chapter_rules?.[entry.chapter_id]?.required_anchor_terms || [];
      if (requiredAnchors.length < Number(config.minimum_terms || 2)) throw new Error(`${config.subject_id}/${entry.chapter_id}: anchor projection has too few reviewed anchors.`);
      return {
        subject_id: entry.subject_id,
        chapter_id: entry.chapter_id,
        primary_domain_id: entry.primary_domain_id,
        title: entry.title,
        source_path: entry.source_path,
        title_terms: requiredAnchors,
        concept_terms: [],
        support_terms: [],
        provenance: {
          chapter_schema: entry.provenance?.chapter_schema,
          review_status: entry.provenance?.review_status,
          source_kind: entry.provenance?.source_kind,
          module_file_count: entry.provenance?.module_file_count,
          runtime_projection: "reviewed_anchor_projection_v1"
        }
      };
    });
  }
  return withDigest({
    schema: "aha_history_go_fagverk_runtime_subject_corpus_v1",
    version: "1.0.0",
    status: "runtime_subject_corpus_active",
    subject_id: config.subject_id,
    source_repo: candidate.source_repo,
    source_ref: candidate.source_ref,
    registry_version: candidate.registry_version,
    corpus_sha256: candidate.content_sha256,
    chapter_count: candidate.entries.length,
    scoring_mode: config.scoring_mode,
    projection_mode: config.runtime_corpus_projection || "candidate_entries_v1",
    approval_path: config.approval_path,
    entries,
    runtime_activation_allowed: true
  });
}

function buildRuntimePolicy(config, approval, candidate, reviewPolicy, attestation) {
  if (reviewPolicy.subject_id !== config.subject_id) throw new Error(`${config.subject_id}: review policy subject mismatch.`);
  if (reviewPolicy.source_ref !== approval.source_ref) throw new Error(`${config.subject_id}: review policy source is not approved.`);
  if (reviewPolicy.corpus_sha256 !== candidate.content_sha256) throw new Error(`${config.subject_id}: review policy corpus digest mismatch.`);
  if (reviewPolicy.status !== "review_policy_full_fixture_candidate_not_runtime_active") throw new Error(`${config.subject_id}: review policy has unexpected status.`);
  const reviewRuntimeAllowed = reviewPolicy.runtime_activation_allowed ?? reviewPolicy.activation_allowed;
  if (reviewRuntimeAllowed !== false) throw new Error(`${config.subject_id}: review policy must remain non-runtime before materialization.`);
  const sourcePolicyPayload = { ...reviewPolicy };
  return withDigest({
    schema: "aha_history_go_fagverk_runtime_subject_policy_v1",
    version: "1.0.0",
    status: "runtime_subject_policy_active",
    subject_id: config.subject_id,
    source_repo: reviewPolicy.source_repo,
    source_ref: reviewPolicy.source_ref,
    corpus_sha256: reviewPolicy.corpus_sha256,
    source_policy_version: reviewPolicy.version,
    source_policy_sha256: sha256(sourcePolicyPayload),
    ...(reviewPolicy.policy_config_path ? {
      source_policy_config_path: reviewPolicy.policy_config_path,
      source_policy_config_version: reviewPolicy.policy_config_version,
      source_policy_config_sha256: reviewPolicy.policy_config_sha256
    } : {}),
    ...(attestation ? {
      source_review_attestation_path: config.review_attestation_path,
      source_review_artifact_sha256: attestation.artifact_sha256,
      source_review_head_sha: attestation.review_head_sha
    } : {}),
    runtime_corpus_projection: config.runtime_corpus_projection || "candidate_entries_v1",
    scoring_mode: config.scoring_mode,
    thresholds: {
      minimum_score: Number(config.minimum_score),
      minimum_terms: Number(config.minimum_terms),
      ...(config.minimum_reviewed_evidence_terms != null ? { minimum_reviewed_evidence_terms: Number(config.minimum_reviewed_evidence_terms) } : {}),
      ambiguity_margin: Number(config.ambiguity_margin)
    },
    default_weights: reviewPolicy.default_weights,
    policy_rules: reviewPolicy.policy_rules || {},
    global_non_scoring_terms: reviewPolicy.global_non_scoring_terms || [],
    ...(reviewPolicy.temporal_gate ? { temporal_gate: reviewPolicy.temporal_gate } : {}),
    ...(reviewPolicy.domain_gate ? { domain_gate: reviewPolicy.domain_gate } : {}),
    chapter_rules: reviewPolicy.chapter_rules,
    terms: reviewPolicy.terms || [],
    approval_path: config.approval_path,
    runtime_activation_allowed: true
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log("Usage: node scripts/build-history-go-fagverk-runtime-activation.mjs [--output-root path]"); return; }
  const registry = readJson(args.registry);
  if (registry.schema !== "aha_history_go_fagverk_runtime_registry_v1") throw new Error("Unsupported runtime registry schema.");
  const legacyCorpus = readJson(registry.legacy_seed.corpus_path);
  const legacySubjectIds = [...new Set((legacyCorpus.entries || []).map((entry) => entry.subject_id))].sort();
  const activatedSubjectIds = Object.keys(registry.active_subjects || {}).sort();
  const activeSubjects = {};
  const approvedSubjects = {};

  for (const subjectId of activatedSubjectIds) {
    const config = registry.active_subjects[subjectId];
    if (config.subject_id !== subjectId) throw new Error(`${subjectId}: registry key and subject_id differ.`);
    const approval = readJson(config.approval_path);
    const candidate = readJson(config.candidate_corpus_path);
    validateApproval(config, approval);
    const attestation = validateReviewAttestation(config, candidate);
    const sourceReviewPolicy = config.review_policy_path ? readJson(config.review_policy_path) : synthesizeReviewPolicy(config, candidate, attestation);
    const reviewPolicy = hydrateReviewPolicy(config, sourceReviewPolicy, candidate);
    const runtimeCorpus = buildRuntimeCorpus(config, approval, candidate, reviewPolicy);
    const runtimePolicy = buildRuntimePolicy(config, approval, candidate, reviewPolicy, attestation);
    writeJson(config.runtime_corpus_path, runtimeCorpus, args.outputRoot);
    writeJson(config.runtime_policy_path, runtimePolicy, args.outputRoot);
    const common = {
      subject_id: subjectId,
      source_commit: approval.source_ref,
      subject_approval_path: config.approval_path,
      corpus_path: config.runtime_corpus_path,
      corpus_sha256: candidate.content_sha256,
      corpus_artifact_sha256: runtimeCorpus.artifact_sha256,
      policy_path: config.runtime_policy_path,
      policy_artifact_sha256: runtimePolicy.artifact_sha256,
      chapter_count: candidate.entries.length,
      scoring_mode: config.scoring_mode
    };
    approvedSubjects[subjectId] = { ...common, approval_status: "runtime_subject_approved" };
    activeSubjects[subjectId] = { ...common, activation_status: "runtime_subject_active" };
  }

  const legacySeed = {
    source_commit: legacyCorpus.source_ref,
    corpus_path: registry.legacy_seed.corpus_path,
    entry_count: legacyCorpus.entries.length,
    subject_ids: legacySubjectIds,
    overridden_subject_ids: activatedSubjectIds
  };
  const approved = withDigest({
    schema: "aha_history_go_fagverk_approved_runtime_v2", version: "2.0.0", status: "partial_subject_runtime_approved",
    source_repo: legacyCorpus.source_repo, approved_source_commit: legacyCorpus.source_ref, legacy_seed: legacySeed,
    approved_subjects: approvedSubjects, full_release_approved: false,
    activation_rules: { subject_review_approval_required: true, runtime_artifacts_must_be_materialized: true, subject_policy_required_when_registered: true, approval_does_not_activate_unregistered_subjects: true, explicit_activation_pull_request_required: true }
  });
  const active = withDigest({
    schema: "aha_history_go_fagverk_runtime_active_v2", version: "2.0.0", status: "partial_subject_runtime_active",
    source_repo: legacyCorpus.source_repo, active_source_commit: legacyCorpus.source_ref, legacy_seed: legacySeed,
    active_subjects: activeSubjects,
    effective_entry_count: legacyCorpus.entries.filter((entry) => !activatedSubjectIds.includes(entry.subject_id)).length + Object.values(activeSubjects).reduce((sum, item) => sum + item.chapter_count, 0),
    full_release_active: false,
    activation_rules: { active_subjects_override_legacy_subject_entries: true, unregistered_candidates_are_not_runtime: true, subject_policy_is_runtime_input_only_after_materialization: true, no_runtime_network_fetch: true, no_history_go_writeback: true }
  });
  writeJson(args.approved, approved, args.outputRoot);
  writeJson(args.active, active, args.outputRoot);
  console.log(`Materialized ${activatedSubjectIds.length} active Fagverk subject(s); effective runtime corpus has ${active.effective_entry_count} entries.`);
}

main();
