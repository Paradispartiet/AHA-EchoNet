import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { buildUpdateReport, compareObserved, markdownForReport, observedFromRelease } from "../scripts/sync-history-go-fagverk-release.mjs";

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

function subject({
  title,
  chapterCount = 0,
  moduleCount = 0,
  packageFileCount = 4,
  optionalGaps = [],
  content = "b".repeat(64),
  structure = "c".repeat(64),
  packageContent = "d".repeat(64),
  chapterContent = "e".repeat(64),
  kind = "subject",
  parent = null,
  schemaFamily = "standard_canonical"
}) {
  return {
    title,
    kind,
    parent_subject_id: parent,
    schema_family: schemaFamily,
    pilot: false,
    package_status: optionalGaps.length ? "complete_with_optional_gaps" : "complete",
    chapter_status: chapterCount ? "materialized" : "not_materialized",
    required_manifest_fields: ["pensum", "emner", "fagkart", "methods"],
    optional_manifest_fields: [],
    present_manifest_fields: ["pensum", "emner", "fagkart", "methods"],
    missing_manifest_fields: [],
    package_file_count: packageFileCount,
    required_package_file_count: 4,
    optional_package_file_count: Math.max(0, packageFileCount - 4),
    package_files: Array.from({ length: packageFileCount }, (_, index) => ({
      path: `data/fag/test/file-${index}.json`,
      required: index < 4,
      fields: [index < 4 ? "required" : "optional"],
      key_paths: [],
      exists: true,
      content_sha256: String(index).padStart(64, "0")
    })),
    package_content_sha256: packageContent,
    chapter_count: chapterCount,
    module_file_count: moduleCount,
    brief_file_count: chapterCount,
    claims_file_count: chapterCount,
    chapter_referenced_file_count: chapterCount + moduleCount,
    chapter_content_sha256: chapterContent,
    referenced_file_count: packageFileCount + chapterCount + moduleCount,
    missing_required_files: [],
    missing_optional_files: optionalGaps,
    missing_chapter_files: [],
    missing_files: optionalGaps,
    structure_sha256: structure,
    content_sha256: content,
    chapters: Array.from({ length: chapterCount }, (_, index) => ({ chapter_id: `chapter-${index}`, file: `chapter-${index}.json`, module_file_count: 0 }))
  };
}

function release(subjects) {
  const rootSubjectCount = Object.values(subjects).filter((item) => item.kind !== "specialization").length;
  const specializationCount = Object.values(subjects).filter((item) => item.kind === "specialization").length;
  const payload = {
    schema: "history_go_fagverk_release_v2",
    version: "2.0.0",
    source: { repository: "Paradispartiet/History-Go", branch: "main", source_ref_mode: "consumer_observed_head" },
    registry: { path: "data/fagverk/fagverk_registry.json", schema: "history_go_fagverk_registry_v1", version: "2.0.0", updated_at: "2026-08-05", content_sha256: "a".repeat(64) },
    subject_inventory: { path: "data/fagverk/subject_inventory.json", schema: "history_go_fagverk_subject_inventory_v1", version: "1.0.0", updated_at: "2026-08-05", content_sha256: "f".repeat(64), root_subject_count: rootSubjectCount, specialization_count: specializationCount },
    fag_manifest: { path: "data/fag/fag_manifest.json", schema: null, version: null, updated_at: null, content_sha256: "9".repeat(64) },
    summary: {
      subject_count: Object.keys(subjects).length,
      root_subject_count: rootSubjectCount,
      specialization_count: specializationCount,
      chapter_subject_count: Object.values(subjects).filter((item) => item.chapter_count).length,
      chapter_count: Object.values(subjects).reduce((sum, item) => sum + item.chapter_count, 0),
      module_file_count: Object.values(subjects).reduce((sum, item) => sum + item.module_file_count, 0),
      package_file_count: Object.values(subjects).reduce((sum, item) => sum + item.package_file_count, 0),
      chapter_referenced_file_count: Object.values(subjects).reduce((sum, item) => sum + item.chapter_referenced_file_count, 0),
      referenced_file_count: Object.values(subjects).reduce((sum, item) => sum + item.referenced_file_count, 0),
      missing_file_count: 0,
      optional_gap_count: Object.values(subjects).reduce((sum, item) => sum + item.missing_optional_files.length, 0)
    },
    subjects
  };
  return {
    ...payload,
    release_sha256: crypto.createHash("sha256").update(JSON.stringify(stableValue(payload))).digest("hex")
  };
}

test("separates whole-architecture observation from runtime approval", () => {
  const initial = observedFromRelease(release({
    politikk: subject({ title: "Politikk", chapterCount: 13, moduleCount: 39 })
  }), "1".repeat(40));
  assert.equal(initial.schema, "aha_history_go_fagverk_observed_release_v2");
  assert.equal(initial.lifecycle_stage, "observed_upstream_release");
  assert.equal(initial.runtime_activation_allowed, false);
  assert.equal(initial.subjects.politikk.chapter_status, "materialized");
  assert.equal(initial.source_commit, "1".repeat(40));

  const next = observedFromRelease(release({
    natur: subject({ title: "Natur", packageFileCount: 7, content: "1".repeat(64), structure: "2".repeat(64) }),
    politikk: subject({ title: "Politikk", chapterCount: 14, moduleCount: 43, packageFileCount: 9, content: "3".repeat(64), structure: "4".repeat(64) }),
    sport: subject({ title: "Sport", packageFileCount: 10, optionalGaps: ["README/KNOWLEDGE_MEMORY_CHAMBER.md"], content: "5".repeat(64), structure: "6".repeat(64) })
  }), "2".repeat(40));
  const compared = compareObserved(initial, next);
  assert.equal(compared.find((item) => item.subject_id === "natur").status, "added");
  assert.equal(compared.find((item) => item.subject_id === "sport").optional_gap_delta, 1);
  const politics = compared.find((item) => item.subject_id === "politikk");
  assert.equal(politics.status, "changed");
  assert.equal(politics.chapter_delta, 1);
  assert.equal(politics.module_delta, 4);
  assert.equal(politics.package_file_delta, 5);
  assert.equal(politics.structure_changed, true);
  assert.equal(politics.content_changed, true);

  const report = buildUpdateReport(initial, next);
  assert.equal(report.schema, "aha_history_go_fagverk_release_update_v2");
  assert.equal(report.status, "review_required");
  assert.equal(report.runtime_activation_allowed, false);
  assert.deepEqual(report.changed_subjects, ["natur", "politikk", "sport"]);
  assert.equal(report.summary.changed_subject_count, 3);
  assert.equal(report.summary.optional_gap_delta, 1);
  assert.equal(report.subjects.find((item) => item.subject_id === "politikk").required_consumer_action, "rebuild_chapter_corpus_term_policy_and_correction_gates");
  assert.equal(report.subjects.find((item) => item.subject_id === "natur").required_consumer_action, "rebuild_package_inventory_candidate_and_define_subject_review_gates");
  assert.equal(report.subjects.find((item) => item.subject_id === "sport").optional_gap_review_required, true);
  assert.match(markdownForReport(report), /runtime_activation_allowed/);
  assert.match(markdownForReport(report), /KNOWLEDGE_MEMORY_CHAMBER/);
});

test("reports no change for an already observed v2 release", () => {
  const current = observedFromRelease(release({
    politikk: subject({ title: "Politikk", chapterCount: 13, moduleCount: 39 })
  }), "1".repeat(40));
  const report = buildUpdateReport(current, current);
  assert.equal(report.status, "no_change");
  assert.equal(report.summary.changed_subject_count, 0);
  assert.deepEqual(report.changed_subjects, []);
});
