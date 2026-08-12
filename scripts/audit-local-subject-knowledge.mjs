#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const DEFAULT_REGISTRY_PATH = "data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json";
const SUBJECT_INDEX_PATH = "data/subjects/subjects_index.json";
const RETIRED_PATH = "data/subjects/retired_local_subject_knowledge.v1.json";
const DEFAULT_OUTPUT_PATH = "reports/subject-bridge/local-subject-knowledge-audit.v1.json";
const ALLOWED_CLASSIFICATIONS = new Set([
  "aha_specific_addition",
  "aha_cross_subject_lens",
  "awaiting_canonical_activation"
]);
const GENERIC_TERMS = new Set([
  "analyse", "barn", "fellesskap", "historie", "institusjon", "kontroll", "kropp", "kultur",
  "læring", "makt", "miljø", "offentlighet", "samfunn", "sted", "utvikling"
]);

function parseArgs(argv) {
  const args = { check: false, output: DEFAULT_OUTPUT_PATH };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--check") args.check = true;
    else if (token === "--output") args.output = String(argv[++index] || "").trim();
    else if (token === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function resolveRepoPath(relativePath) {
  const absolute = path.resolve(repoRoot, relativePath);
  if (absolute !== repoRoot && !absolute.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error(`Path escapes repository: ${relativePath}`);
  }
  return absolute;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(resolveRepoPath(relativePath), "utf8"));
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values) {
  const result = [];
  const seen = new Set();
  for (const value of values || []) {
    const clean = String(value ?? "").trim();
    const key = normalize(clean);
    if (!clean || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

function semanticTerms(emne) {
  return uniqueStrings([
    emne?.title,
    ...(emne?.core_concepts || []),
    ...(emne?.keywords || []),
    ...(emne?.thinkers || [])
  ]).filter((term) => !GENERIC_TERMS.has(normalize(term)));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function loadSubjects() {
  const index = readJson(SUBJECT_INDEX_PATH);
  const records = [];
  for (const meta of index.subjects || []) {
    const file = String(meta.file || `${meta.subject_id}.json`);
    const subject = readJson(`data/subjects/${file}`);
    if (subject.subject_id !== meta.subject_id) throw new Error(`${file}: subject_id differs from subjects_index.json.`);
    records.push({ meta, file, subject });
  }
  return records;
}

function loadCanonicalRuntime(registry) {
  const canonical = [];
  const snapshots = [];
  for (const subjectId of Object.keys(registry.active_subjects || {}).sort()) {
    const config = registry.active_subjects[subjectId];
    const corpus = readJson(config.runtime_corpus_path);
    const policy = readJson(config.runtime_policy_path);
    if (corpus.status !== "runtime_subject_corpus_active" || policy.status !== "runtime_subject_policy_active") {
      throw new Error(`${subjectId}: corpus and policy must both be runtime-active.`);
    }
    if (corpus.subject_id !== subjectId || policy.subject_id !== subjectId) {
      throw new Error(`${subjectId}: runtime artifact subject mismatch.`);
    }
    if (corpus.source_ref !== policy.source_ref || corpus.corpus_sha256 !== policy.corpus_sha256) {
      throw new Error(`${subjectId}: runtime corpus/policy provenance mismatch.`);
    }

    const blocked = new Set((policy.global_non_scoring_terms || []).map(normalize));
    for (const item of policy.terms || []) {
      if (["non_scoring", "context_only"].includes(item?.action)) blocked.add(normalize(item?.term));
    }
    for (const entry of corpus.entries || []) {
      const rule = policy.chapter_rules?.[entry.chapter_id] || {};
      const terms = uniqueStrings([
        entry.title,
        ...(entry.title_terms || []),
        ...(entry.concept_terms || []),
        ...(rule.required_anchor_terms || []),
        ...(rule.supplemental_evidence_terms || []).map((item) => item?.term)
      ]).filter((term) => !blocked.has(normalize(term)) && !GENERIC_TERMS.has(normalize(term)));
      canonical.push({
        subject_id: subjectId,
        chapter_id: entry.chapter_id,
        title: entry.title,
        source_path: entry.source_path,
        normalized_title: normalize(entry.title),
        terms,
        normalized_terms: new Set(terms.map(normalize))
      });
    }
    snapshots.push({
      subject_id: subjectId,
      source_ref: corpus.source_ref,
      chapter_count: (corpus.entries || []).length,
      corpus_path: config.runtime_corpus_path,
      policy_path: config.runtime_policy_path
    });
  }
  return { canonical, snapshots };
}

function bestCanonicalOverlaps(emne, canonical) {
  const localTerms = semanticTerms(emne);
  const normalizedLocal = localTerms.map(normalize);
  return canonical.map((chapter) => {
    const exactTerms = localTerms.filter((_, index) => chapter.normalized_terms.has(normalizedLocal[index]));
    const titleCollision = normalize(emne.title) === chapter.normalized_title;
    const coverage = localTerms.length ? exactTerms.length / localTerms.length : 0;
    return {
      subject_id: chapter.subject_id,
      chapter_id: chapter.chapter_id,
      title: chapter.title,
      source_path: chapter.source_path,
      title_collision: titleCollision,
      exact_term_count: exactTerms.length,
      local_term_coverage: Number(coverage.toFixed(4)),
      exact_terms: exactTerms,
      rank: (titleCollision ? 1_000_000 : 0) + exactTerms.length * 1_000 + coverage
    };
  }).filter((item) => item.title_collision || item.exact_term_count > 0)
    .sort((a, b) => b.rank - a.rank || a.subject_id.localeCompare(b.subject_id) || a.chapter_id.localeCompare(b.chapter_id))
    .slice(0, 3)
    .map(({ rank: ignored, ...item }) => item);
}

function validateDeclaration(subjectId, emne, activeIds, canonicalBySubject) {
  const declaration = emne.local_knowledge;
  if (!declaration) throw new Error(`${subjectId}/${emne.emne_id}: local emne lacks local_knowledge classification.`);
  if (!ALLOWED_CLASSIFICATIONS.has(declaration.classification)) {
    throw new Error(`${subjectId}/${emne.emne_id}: unsupported local classification ${declaration.classification || "missing"}.`);
  }
  const canonicalIds = uniqueStrings(declaration.canonical_subject_ids || []);
  if (!canonicalIds.length) throw new Error(`${subjectId}/${emne.emne_id}: canonical_subject_ids is required.`);
  if (declaration.revalidate_on_runtime_change !== true) {
    throw new Error(`${subjectId}/${emne.emne_id}: revalidate_on_runtime_change must be true.`);
  }
  if (Number(declaration.minimum_matched_terms) < 2) {
    throw new Error(`${subjectId}/${emne.emne_id}: local additions require at least two matched terms.`);
  }
  if (!String(declaration.scope || "").trim() || !String(declaration.rationale || "").trim()) {
    throw new Error(`${subjectId}/${emne.emne_id}: scope and rationale are required.`);
  }

  if (declaration.classification === "awaiting_canonical_activation") {
    if (canonicalIds.length !== 1) throw new Error(`${subjectId}/${emne.emne_id}: awaiting classification needs exactly one canonical subject.`);
    if (activeIds.has(canonicalIds[0])) {
      throw new Error(`${subjectId}/${emne.emne_id}: canonical ${canonicalIds[0]} is now runtime-active; replace or reclassify the local emne.`);
    }
  } else {
    const inactive = canonicalIds.filter((id) => !activeIds.has(id));
    if (inactive.length) throw new Error(`${subjectId}/${emne.emne_id}: declared canonical subjects are not runtime-active: ${inactive.join(", ")}.`);
    if (declaration.classification === "aha_cross_subject_lens" && canonicalIds.length < 2) {
      throw new Error(`${subjectId}/${emne.emne_id}: cross-subject lens needs at least two canonical subjects.`);
    }
  }

  const related = uniqueStrings(declaration.related_chapter_ids || []);
  if (declaration.classification === "aha_specific_addition" && !related.length) {
    throw new Error(`${subjectId}/${emne.emne_id}: AHA-specific additions must name related canonical chapters.`);
  }
  const knownRelated = new Set(canonicalIds.flatMap((id) => canonicalBySubject.get(id) || []));
  const unknownRelated = related.filter((chapterId) => !knownRelated.has(chapterId));
  if (unknownRelated.length) {
    throw new Error(`${subjectId}/${emne.emne_id}: unknown related canonical chapters: ${unknownRelated.join(", ")}.`);
  }
  return { declaration, canonicalIds, related };
}

function buildReport() {
  const registry = readJson(DEFAULT_REGISTRY_PATH);
  if (registry.schema !== "aha_history_go_fagverk_runtime_registry_v1") throw new Error("Unsupported Fagverk runtime registry schema.");
  const subjects = loadSubjects();
  const { canonical, snapshots } = loadCanonicalRuntime(registry);
  const activeIds = new Set(snapshots.map((item) => item.subject_id));
  const canonicalBySubject = new Map();
  for (const chapter of canonical) {
    if (!canonicalBySubject.has(chapter.subject_id)) canonicalBySubject.set(chapter.subject_id, []);
    canonicalBySubject.get(chapter.subject_id).push(chapter.chapter_id);
  }

  const allEmneKeys = new Set();
  const localRecords = [];
  const localByTitle = new Map();
  const classificationCounts = {};
  for (const record of subjects) {
    for (const emne of record.subject.emner || []) {
      const key = `${record.subject.subject_id}/${emne.emne_id}`;
      if (allEmneKeys.has(key)) throw new Error(`${key}: duplicate emne_id.`);
      allEmneKeys.add(key);
      if (emne.fagverk) continue;
      const { declaration, canonicalIds, related } = validateDeclaration(
        record.subject.subject_id,
        emne,
        activeIds,
        canonicalBySubject
      );
      const overlaps = bestCanonicalOverlaps(emne, canonical);
      const strongest = overlaps[0] || null;
      if (strongest?.title_collision) {
        throw new Error(`${key}: local title duplicates active canonical ${strongest.subject_id}/${strongest.chapter_id}.`);
      }
      if (
        declaration.classification === "aha_specific_addition" &&
        strongest && canonicalIds.includes(strongest.subject_id) &&
        strongest.exact_term_count >= 3 && strongest.local_term_coverage >= 0.4
      ) {
        throw new Error(`${key}: local addition now substantially duplicates ${strongest.subject_id}/${strongest.chapter_id}.`);
      }

      const titleKey = normalize(emne.title);
      if (!localByTitle.has(titleKey)) localByTitle.set(titleKey, []);
      localByTitle.get(titleKey).push({ key, canonical_subject_ids: canonicalIds });
      classificationCounts[declaration.classification] = (classificationCounts[declaration.classification] || 0) + 1;
      localRecords.push({
        aha_subject_id: record.subject.subject_id,
        emne_id: emne.emne_id,
        title: emne.title,
        classification: declaration.classification,
        canonical_subject_ids: canonicalIds,
        related_chapter_ids: related,
        minimum_matched_terms: Number(declaration.minimum_matched_terms),
        scope: declaration.scope,
        rationale: declaration.rationale,
        canonical_overlaps: overlaps
      });
    }
  }

  const localTitleCollisions = [];
  for (const [title, items] of localByTitle.entries()) {
    if (!title || items.length < 2) continue;
    for (let left = 0; left < items.length; left += 1) {
      for (let right = left + 1; right < items.length; right += 1) {
        const shared = items[left].canonical_subject_ids.filter((id) => items[right].canonical_subject_ids.includes(id));
        if (shared.length) throw new Error(`${items[left].key} and ${items[right].key}: duplicate local title within ${shared.join(", ")}.`);
      }
    }
    localTitleCollisions.push({
      normalized_title: title,
      emner: items.map((item) => item.key).sort(),
      disposition: "explicit_distinct_canonical_lenses"
    });
  }

  const retired = readJson(RETIRED_PATH);
  if (retired.schema !== "aha_retired_local_subject_knowledge_v1") throw new Error("Unsupported retired local subject registry schema.");
  const retiredRecords = [];
  for (const item of retired.entries || []) {
    const key = `${item.subject_id}/${item.emne_id}`;
    if (allEmneKeys.has(key)) throw new Error(`${key}: retired local emne was reintroduced.`);
    const replacementKey = `${item.replacement?.subject_id || ""}/${item.replacement?.emne_id || ""}`;
    if (!allEmneKeys.has(replacementKey)) throw new Error(`${key}: replacement ${replacementKey} is missing.`);
    retiredRecords.push({
      subject_id: item.subject_id,
      emne_id: item.emne_id,
      title: item.title,
      classification: item.classification,
      replacement: item.replacement
    });
  }

  const input = {
    registry_version: registry.version,
    runtime_snapshot: snapshots,
    local_declarations: localRecords.map((item) => ({
      aha_subject_id: item.aha_subject_id,
      emne_id: item.emne_id,
      classification: item.classification,
      canonical_subject_ids: item.canonical_subject_ids,
      related_chapter_ids: item.related_chapter_ids,
      minimum_matched_terms: item.minimum_matched_terms,
      scope: item.scope,
      rationale: item.rationale
    })),
    retired: retired.entries || []
  };
  const report = {
    schema: "aha_local_subject_knowledge_audit_v1",
    version: "1.0.0",
    status: "passed",
    audit_basis: {
      subject_index_path: SUBJECT_INDEX_PATH,
      runtime_registry_path: DEFAULT_REGISTRY_PATH,
      retired_registry_path: RETIRED_PATH,
      revalidate_on_every_runtime_change: true,
      input_sha256: sha256(input)
    },
    summary: {
      active_subject_count: snapshots.length,
      active_chapter_count: canonical.length,
      local_emne_count: localRecords.length,
      retired_competing_mirror_count: retiredRecords.length,
      classification_counts: Object.fromEntries(Object.entries(classificationCounts).sort(([a], [b]) => a.localeCompare(b))),
      local_title_collision_count: localTitleCollisions.length,
      errors: 0
    },
    runtime_snapshot: snapshots,
    local_emner: localRecords.sort((a, b) => a.aha_subject_id.localeCompare(b.aha_subject_id) || a.emne_id.localeCompare(b.emne_id)),
    local_title_collisions: localTitleCollisions.sort((a, b) => a.normalized_title.localeCompare(b.normalized_title)),
    retired_local_emner: retiredRecords.sort((a, b) => a.subject_id.localeCompare(b.subject_id) || a.emne_id.localeCompare(b.emne_id)),
    gates: {
      every_local_emne_classified: true,
      active_canonical_subjects_resolved: true,
      pending_subjects_not_yet_active: true,
      no_active_canonical_title_duplicates: true,
      no_unresolved_local_title_duplicates: true,
      retired_mirrors_not_reintroduced: true,
      local_minimum_term_guards_present: true
    }
  };
  return { ...report, artifact_sha256: sha256(report) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/audit-local-subject-knowledge.mjs [--check] [--output path]");
    return;
  }
  const report = buildReport();
  const outputPath = resolveRepoPath(args.output);
  const next = stableJson(report);
  if (args.check) {
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== next) {
      throw new Error(`Stale local subject knowledge audit: ${args.output}. Regenerate and review it.`);
    }
    console.log(`Verified ${report.summary.local_emne_count} classified local emner against ${report.summary.active_subject_count} active subjects and ${report.summary.active_chapter_count} chapters.`);
    return;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, next, "utf8");
  console.log(`Audited ${report.summary.local_emne_count} local emner; retired ${report.summary.retired_competing_mirror_count} competing mirrors.`);
}

main();
