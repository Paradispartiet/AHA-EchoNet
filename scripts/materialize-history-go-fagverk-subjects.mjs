#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const subjectsDir = path.join(repoRoot, "data", "subjects");
const DEFAULT_REGISTRY_PATH = "data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json";
const SUPPORTED_BRIDGE_SOURCE = "runtime_active_subject_registry";

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

function policyTerms(policy, chapterId) {
  const rule = policy?.chapter_rules?.[chapterId] || {};
  return uniqueStrings([
    ...(rule.required_anchor_terms || []),
    ...(rule.supplemental_evidence_terms || []).map((item) => item?.term)
  ]);
}

function fallbackTitleTerms(entry, policy) {
  const blocked = new Set((policy.global_non_scoring_terms || []).map(normalize));
  for (const item of policy.terms || []) {
    if (["non_scoring", "context_only"].includes(item?.action)) blocked.add(normalize(item?.term));
  }
  return uniqueStrings([entry?.title, ...(entry?.title_terms || [])]).filter((term) => {
    const key = normalize(term);
    return key && !blocked.has(key) && (key.includes(" ") || key.length >= 5);
  });
}

function validateRuntimeArtifact(subject, bridge, artifact, expected) {
  if (artifact.schema !== expected.schema) {
    throw new Error(`${subject.subject_id}: unexpected ${expected.label} schema ${artifact.schema || "missing"}.`);
  }
  if (artifact.status !== expected.status) {
    throw new Error(`${subject.subject_id}: ${expected.label} is not active (${artifact.status || "missing"}).`);
  }
  if (String(artifact.subject_id || "") !== bridge.fagverk_subject_id) {
    throw new Error(`${subject.subject_id}: ${expected.label} subject mismatch (${artifact.subject_id || "missing"}).`);
  }
}

function loadBridgeContext(subject) {
  const bridge = subject?.history_go_fagverk;
  if (!bridge) return null;
  if (bridge.source !== SUPPORTED_BRIDGE_SOURCE) {
    throw new Error(`${subject.subject_id}: unsupported History Go Fagverk source ${bridge.source || "missing"}.`);
  }

  const registryPath = String(bridge.registry_path || DEFAULT_REGISTRY_PATH).trim();
  const registry = readJson(resolveRepoPath(registryPath));
  if (registry.schema !== "aha_history_go_fagverk_runtime_registry_v1") {
    throw new Error(`${subject.subject_id}: unexpected runtime registry schema ${registry.schema || "missing"}.`);
  }

  const fagverkSubjectId = String(bridge.fagverk_subject_id || subject.subject_id || "").trim();
  const runtimeConfig = registry.active_subjects?.[fagverkSubjectId];
  if (!runtimeConfig || runtimeConfig.subject_id !== fagverkSubjectId) {
    throw new Error(`${subject.subject_id}: ${fagverkSubjectId} is not runtime-active in ${registryPath}.`);
  }

  const resolvedBridge = { ...bridge, fagverk_subject_id: fagverkSubjectId };
  const corpusPath = String(runtimeConfig.runtime_corpus_path || "").trim();
  const policyPath = String(runtimeConfig.runtime_policy_path || "").trim();
  if (!corpusPath || !policyPath) {
    throw new Error(`${subject.subject_id}: runtime registry lacks corpus/policy paths for ${fagverkSubjectId}.`);
  }

  const corpus = readJson(resolveRepoPath(corpusPath));
  const policy = readJson(resolveRepoPath(policyPath));
  validateRuntimeArtifact(subject, resolvedBridge, corpus, {
    label: "runtime corpus",
    schema: "aha_history_go_fagverk_runtime_subject_corpus_v1",
    status: "runtime_subject_corpus_active"
  });
  validateRuntimeArtifact(subject, resolvedBridge, policy, {
    label: "runtime policy",
    schema: "aha_history_go_fagverk_runtime_subject_policy_v1",
    status: "runtime_subject_policy_active"
  });
  if (corpus.source_ref !== policy.source_ref || corpus.corpus_sha256 !== policy.corpus_sha256) {
    throw new Error(`${subject.subject_id}: runtime corpus and policy provenance differ.`);
  }

  return { bridge: resolvedBridge, registry, registryPath, runtimeConfig, corpus, corpusPath, policy, policyPath };
}

function materializeProjection(subject, context, projection) {
  const { bridge, corpus, corpusPath, policy, policyPath } = context;
  const chapterId = String(projection?.chapter_id || "").trim();
  const emneId = String(projection?.emne_id || `fagverk_${chapterId}`).trim();
  if (!chapterId || !emneId) throw new Error(`${subject.subject_id}: projection must define chapter_id/emne_id.`);

  const entry = (corpus.entries || []).find((candidate) => candidate?.chapter_id === chapterId);
  if (!entry) throw new Error(`${subject.subject_id}: canonical chapter ${chapterId} is missing from ${corpusPath}.`);

  const reviewedTerms = policyTerms(policy, chapterId);
  const requestedTerms = uniqueStrings(projection.concept_terms || []);
  const requiredAnchors = uniqueStrings(policy?.chapter_rules?.[chapterId]?.required_anchor_terms || []);
  const supplementalTerms = uniqueStrings(
    (policy?.chapter_rules?.[chapterId]?.supplemental_evidence_terms || []).map((item) => item?.term)
  );
  const minimumTerms = Math.max(
    1,
    Number(policy?.thresholds?.minimum_terms || 1),
    Number(policy?.thresholds?.minimum_reviewed_evidence_terms || 1)
  );
  let termSource = "explicit_runtime_terms_v1";
  let selectedTerms = requestedTerms;
  if (!selectedTerms.length && requiredAnchors.length) {
    selectedTerms = requiredAnchors;
    termSource = "runtime_policy_required_anchors_v1";
  } else if (!selectedTerms.length && supplementalTerms.length >= minimumTerms) {
    selectedTerms = supplementalTerms;
    termSource = "runtime_policy_supplemental_evidence_v1";
  } else if (!selectedTerms.length) {
    selectedTerms = fallbackTitleTerms(entry, policy);
    termSource = "canonical_chapter_title_terms_v1";
  }
  if (!selectedTerms.length) {
    throw new Error(`${subject.subject_id}:${chapterId}: projection needs explicit terms or reviewed policy anchors.`);
  }

  const available = new Map(
    uniqueStrings([...corpusTerms(entry), ...reviewedTerms]).map((term) => [normalize(term), term])
  );
  const nonScoring = new Set((policy.global_non_scoring_terms || []).map(normalize));
  const canonicalTerms = selectedTerms.map((requested) => {
    const key = normalize(requested);
    const canonical = available.get(key);
    if (!canonical) {
      throw new Error(`${subject.subject_id}:${chapterId}: ${requested} is absent from the active corpus and policy.`);
    }
    if (nonScoring.has(key)) {
      throw new Error(`${subject.subject_id}:${chapterId}: ${requested} is non-scoring in the active runtime policy.`);
    }
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
    description: "Materialisert fra godkjent, runtime-aktiv History Go Fagverk-corpus og tilhørende fagpolicy.",
    fagverk: {
      source_repo: String(corpus.source_repo || "Paradispartiet/History-Go"),
      source_ref: String(corpus.source_ref || ""),
      canonical_subject_id: bridge.fagverk_subject_id,
      registry_path: context.registryPath,
      corpus_path: corpusPath,
      policy_path: policyPath,
      chapter_id: chapterId,
      source_path: String(entry.source_path || ""),
      minimum_matched_terms: minimumTerms,
      ambiguity_margin: Number(policy?.thresholds?.ambiguity_margin || 0),
      term_source: termSource,
      generation_mode: "canonical_runtime_subject_projection_v2"
    }
  };
}

function materializeSubject(subject, context) {
  let projections = Array.isArray(context.bridge.projections) ? context.bridge.projections : [];
  if (context.bridge.projection_mode === "all_runtime_chapters") {
    const overrides = context.bridge.projection_overrides || {};
    projections = (context.corpus.entries || []).map((entry) => ({
      chapter_id: entry.chapter_id,
      emne_id: `fagverk_${context.bridge.fagverk_subject_id}_${entry.chapter_id}`,
      ...(overrides[entry.chapter_id] || {})
    }));
  } else if (context.bridge.projection_mode) {
    throw new Error(`${subject.subject_id}: unsupported projection_mode ${context.bridge.projection_mode}.`);
  }
  if (!projections.length) throw new Error(`${subject.subject_id}: history_go_fagverk.projections is empty.`);
  const generated = projections.map((projection) => materializeProjection(subject, context, projection));
  const generatedIds = generated.map((emne) => emne.emne_id);
  if (new Set(generatedIds).size !== generatedIds.length) {
    throw new Error(`${subject.subject_id}: duplicate generated emne_id in Fagverk projections.`);
  }

  const existing = (Array.isArray(subject.emner) ? subject.emner : []).filter((emne) => {
    const mode = String(emne?.fagverk?.generation_mode || "");
    return !mode.startsWith("canonical_runtime_subject_projection_");
  });
  return { ...subject, emner: [...existing, ...generated] };
}

function subjectRecords() {
  const index = readJson(path.join(subjectsDir, "subjects_index.json"));
  const entries = Array.isArray(index.subjects) ? index.subjects : [];
  return entries.map((entry) => {
    const file = entry.file || `${entry.subject_id}.json`;
    const filePath = path.join(subjectsDir, file);
    return { subject_id: entry.subject_id, file, filePath, subject: readJson(filePath) };
  });
}

function validateCompleteBridgeCoverage(records) {
  const registry = readJson(resolveRepoPath(DEFAULT_REGISTRY_PATH));
  const activeIds = Object.keys(registry.active_subjects || {}).sort();
  const mapped = new Map();
  for (const record of records.filter((item) => item.subject?.history_go_fagverk)) {
    const fagverkSubjectId = String(record.subject.history_go_fagverk.fagverk_subject_id || record.subject.subject_id || "").trim();
    if (mapped.has(fagverkSubjectId)) {
      throw new Error(`${fagverkSubjectId}: mapped by both ${mapped.get(fagverkSubjectId)} and ${record.subject.subject_id}.`);
    }
    mapped.set(fagverkSubjectId, record.subject.subject_id);
  }
  const mappedIds = [...mapped.keys()].sort();
  const missing = activeIds.filter((subjectId) => !mapped.has(subjectId));
  const inactive = mappedIds.filter((subjectId) => !registry.active_subjects?.[subjectId]);
  if (missing.length || inactive.length) {
    throw new Error(`Incomplete runtime-active Subject Bridge coverage (missing: ${missing.join(", ") || "none"}; inactive: ${inactive.join(", ") || "none"}).`);
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/materialize-history-go-fagverk-subjects.mjs [--subject aha-or-fagverk-id] [--check]");
    return;
  }

  const records = subjectRecords();
  if (!args.subject) validateCompleteBridgeCoverage(records);
  const selected = records.filter((record) => {
    const bridge = record.subject?.history_go_fagverk;
    if (!bridge) return false;
    if (!args.subject) return true;
    return record.subject.subject_id === args.subject || bridge.fagverk_subject_id === args.subject;
  });
  if (args.subject && !selected.length) throw new Error(`Unknown or unconfigured AHA/Fagverk subject: ${args.subject}`);
  if (!selected.length) throw new Error("No History Go Fagverk subject projections configured.");

  const stale = [];
  for (const record of selected) {
    const context = loadBridgeContext(record.subject);
    const materialized = materializeSubject(record.subject, context);
    const next = stableJson(materialized);
    const before = fs.readFileSync(record.filePath, "utf8");
    if (before === next) continue;
    if (args.check) stale.push(path.relative(repoRoot, record.filePath));
    else fs.writeFileSync(record.filePath, next, "utf8");
  }

  if (stale.length) {
    throw new Error(`Stale History Go Fagverk subject projection: ${stale.join(", ")}. Run materialization and commit the subject files.`);
  }
  console.log(`${args.check ? "Verified" : "Materialized"} ${selected.length} runtime-active History Go Fagverk subject bridge${selected.length === 1 ? "" : "s"}.`);
}

main();
