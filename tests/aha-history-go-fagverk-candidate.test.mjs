import assert from "node:assert/strict";
import test from "node:test";

import { applyReviewBoundary, buildPackageCandidate } from "../scripts/build-history-go-fagverk-candidate.mjs";

function producerSubject({ optionalGap = false } = {}) {
  const files = [
    { path: "data/fag/sport/pensum.json", required: true, fields: ["pensum"], exists: true, content_sha256: "1".repeat(64) },
    { path: "data/fag/sport/emner.json", required: true, fields: ["emner"], exists: true, content_sha256: "2".repeat(64) },
    { path: "data/fag/sport/fagkart.json", required: true, fields: ["fagkart"], exists: true, content_sha256: "3".repeat(64) },
    { path: "data/fag/sport/methods.json", required: true, fields: ["methods"], exists: true, content_sha256: "4".repeat(64) },
    { path: "README/KNOWLEDGE_MEMORY_CHAMBER.md", required: false, fields: ["knowledgeArchitecture"], exists: !optionalGap, content_sha256: optionalGap ? null : "5".repeat(64) }
  ];
  return {
    title: "Sport",
    kind: "subject",
    parent_subject_id: null,
    schema_family: "standard_canonical",
    package_status: optionalGap ? "complete_with_optional_gaps" : "complete",
    chapter_status: "not_materialized",
    missing_manifest_fields: [],
    package_file_count: files.length,
    required_package_file_count: 4,
    optional_package_file_count: 1,
    package_files: files,
    package_content_sha256: "6".repeat(64),
    chapter_count: 0,
    module_file_count: 0,
    chapter_referenced_file_count: 0,
    chapter_content_sha256: "7".repeat(64),
    referenced_file_count: files.length,
    missing_required_files: [],
    missing_optional_files: optionalGap ? ["README/KNOWLEDGE_MEMORY_CHAMBER.md"] : [],
    missing_chapter_files: [],
    structure_sha256: "8".repeat(64),
    content_sha256: "9".repeat(64),
    chapters: []
  };
}

function release(subject) {
  return {
    schema: "history_go_fagverk_release_v2",
    version: "2.0.0",
    source: { repository: "Paradispartiet/History-Go" },
    release_sha256: "a".repeat(64),
    subjects: { sport: subject }
  };
}

test("applies the explicit review boundary to chapter candidates and audits", () => {
  const originalCandidate = {
    schema: "aha_history_go_fagverk_corpus_v1",
    status: "generated_subject_audit_corpus"
  };
  const originalAudit = {
    schema: "aha_fagverk_corpus_audit_v1",
    gate: { passed: true, errors: [] }
  };
  const { candidate, audit } = applyReviewBoundary(originalCandidate, originalAudit);

  assert.equal(candidate.lifecycle_stage, "imported_review_candidate");
  assert.equal(candidate.approval_required, true);
  assert.equal(candidate.runtime_activation_allowed, false);
  assert.equal(candidate.status, originalCandidate.status);
  assert.equal(audit.lifecycle_stage, "imported_review_candidate_audit");
  assert.equal(audit.approval_required, true);
  assert.equal(audit.runtime_activation_allowed, false);
  assert.equal(audit.gate.passed, true);
  assert.equal(originalCandidate.runtime_activation_allowed, undefined);
  assert.equal(originalAudit.runtime_activation_allowed, undefined);
});

test("builds a package inventory candidate without inventing chapters", () => {
  const { candidate, audit } = buildPackageCandidate({
    release: release(producerSubject()),
    subjectId: "sport",
    sourceRef: "b".repeat(40)
  });
  assert.equal(candidate.schema, "aha_history_go_fagverk_package_candidate_v1");
  assert.equal(candidate.candidate_kind, "package_inventory");
  assert.equal(candidate.chapter_status, "not_materialized");
  assert.equal(candidate.package_file_count, 5);
  assert.equal(candidate.existing_package_file_count, 5);
  assert.deepEqual(candidate.optional_gaps, []);
  assert.equal(candidate.runtime_activation_allowed, false);
  assert.equal(audit.gate.passed, true);
  assert.equal(audit.coverage.declared_package_files, 5);
  assert.equal(audit.coverage.materialized_existing_package_files, 5);
});

test("preserves optional gaps as review debt without failing the required package gate", () => {
  const { candidate, audit } = buildPackageCandidate({
    release: release(producerSubject({ optionalGap: true })),
    subjectId: "sport",
    sourceRef: "c".repeat(40)
  });
  assert.equal(candidate.package_status, "complete_with_optional_gaps");
  assert.equal(candidate.package_file_count, 5);
  assert.equal(candidate.existing_package_file_count, 4);
  assert.deepEqual(candidate.optional_gaps, ["README/KNOWLEDGE_MEMORY_CHAMBER.md"]);
  assert.equal(candidate.package_files.find((file) => !file.exists).required, false);
  assert.equal(audit.gate.passed, true);
  assert.equal(audit.coverage.expected_existing_package_files, 4);
  assert.equal(audit.coverage.materialized_existing_package_files, 4);
  assert.deepEqual(audit.coverage.missing_required_files, []);
  assert.equal(audit.runtime_activation_allowed, false);
});

test("rejects a missing required package file", () => {
  const subject = producerSubject();
  subject.package_files[0].exists = false;
  subject.package_files[0].content_sha256 = null;
  subject.missing_required_files = [subject.package_files[0].path];
  assert.throws(
    () => buildPackageCandidate({ release: release(subject), subjectId: "sport", sourceRef: "d".repeat(40) }),
    /missing required package files/
  );
});
