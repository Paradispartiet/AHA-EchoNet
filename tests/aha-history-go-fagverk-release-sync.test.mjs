import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { buildUpdateReport, compareObserved, markdownForReport, observedFromRelease } from "../scripts/sync-history-go-fagverk-release.mjs";

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

function release(subjects) {
  const payload = {
    schema: "history_go_fagverk_release_v1",
    version: "1.0.0",
    source: { repository: "Paradispartiet/History-Go", branch: "main", source_ref_mode: "consumer_observed_head" },
    registry: { path: "data/fagverk/fagverk_registry.json", schema: "history_go_fagverk_registry_v1", version: "2.0.0", updated_at: "2026-08-05", content_sha256: "a".repeat(64) },
    summary: {
      subject_count: Object.keys(subjects).length,
      chapter_count: Object.values(subjects).reduce((sum, subject) => sum + subject.chapter_count, 0),
      module_file_count: Object.values(subjects).reduce((sum, subject) => sum + subject.module_file_count, 0),
      referenced_file_count: Object.values(subjects).reduce((sum, subject) => sum + subject.referenced_file_count, 0),
      missing_file_count: 0
    },
    subjects
  };
  return {
    ...payload,
    release_sha256: crypto.createHash("sha256").update(JSON.stringify(stableValue(payload))).digest("hex")
  };
}

function subject(title, chapterCount, moduleCount, content, structure) {
  return {
    title,
    chapter_count: chapterCount,
    module_file_count: moduleCount,
    brief_file_count: 0,
    claims_file_count: 0,
    referenced_file_count: chapterCount + moduleCount,
    missing_files: [],
    structure_sha256: structure,
    content_sha256: content,
    chapters: []
  };
}

test("separates observed releases from runtime approval", () => {
  const initial = observedFromRelease(release({
    politikk: subject("Politikk", 13, 39, "b".repeat(64), "c".repeat(64))
  }), "1".repeat(40));
  assert.equal(initial.runtime_activation_allowed, false);
  assert.equal(initial.subjects.politikk.chapter_count, 13);
  assert.equal(initial.source_commit, "1".repeat(40));

  const next = observedFromRelease(release({
    natur: subject("Natur", 12, 36, "d".repeat(64), "e".repeat(64)),
    politikk: subject("Politikk", 14, 43, "f".repeat(64), "0".repeat(64))
  }), "2".repeat(40));
  const compared = compareObserved(initial, next);
  assert.equal(compared.find((item) => item.subject_id === "natur").status, "added");
  const politics = compared.find((item) => item.subject_id === "politikk");
  assert.equal(politics.status, "changed");
  assert.equal(politics.chapter_delta, 1);
  assert.equal(politics.module_delta, 4);
  assert.equal(politics.structure_changed, true);
  assert.equal(politics.content_changed, true);

  const report = buildUpdateReport(initial, next);
  assert.equal(report.status, "review_required");
  assert.equal(report.runtime_activation_allowed, false);
  assert.deepEqual(report.changed_subjects, ["natur", "politikk"]);
  assert.equal(report.summary.changed_subject_count, 2);
  assert.equal(report.summary.chapter_delta, 13);
  assert.equal(report.summary.module_delta, 40);
  assert.equal(report.subjects.find((item) => item.subject_id === "politikk").required_consumer_action, "rebuild_corpus_term_policy_and_correction_gates");
  assert.match(markdownForReport(report), /runtime_activation_allowed/);
});

test("reports no change for an already observed release", () => {
  const current = observedFromRelease(release({
    politikk: subject("Politikk", 13, 39, "b".repeat(64), "c".repeat(64))
  }), "1".repeat(40));
  const report = buildUpdateReport(current, current);
  assert.equal(report.status, "no_change");
  assert.equal(report.summary.changed_subject_count, 0);
  assert.deepEqual(report.changed_subjects, []);
});
