#!/usr/bin/env node

import fs from "node:fs";

const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const baseline = read("data/integrations/history-go-fagverk-corpus.v1.json");
const candidate = read("data/integrations/candidates/history-go-fagverk-subkultur.candidate.v1.json");
const observed = read("data/integrations/history-go-fagverk-release.observed.json");
const subjectBaseline = read("data/integrations/review/history-go-fagverk-subject-content-baseline.v1.json");

if (candidate.subject_filter !== "subkultur" || candidate.entries.length !== 8) {
  throw new Error("Subculture expansion identity failed");
}
const approved = subjectBaseline.subjects?.subkultur;
const observedSubject = observed.subjects?.subkultur;
if (!approved || !observedSubject) throw new Error("Subculture subject compatibility evidence is missing");
if (candidate.source_ref !== approved.approved_source_ref) {
  throw new Error("Subculture candidate differs from the approved subject-content baseline source");
}
if (observedSubject.content_sha256 !== approved.subject_content_sha256) {
  throw new Error("Observed Subculture content changed and requires a new subject review");
}

const before = (baseline.entries || []).filter((entry) => entry.subject_id === "subkultur");
if (before.length !== 0) throw new Error("Legacy corpus unexpectedly contains Subculture");
const ids = candidate.entries.map((entry) => entry.chapter_id).sort();
const modules = candidate.entries.reduce((sum, entry) => sum + (entry.module_source_paths || []).length, 0);
if (modules !== 24 || !candidate.entries.every((entry) => (entry.module_source_paths || []).length === 3)) {
  throw new Error("Subculture module contract failed");
}

const out = {
  schema: "aha_subculture_fagverk_expansion_review_v1",
  version: "1.0.0",
  status: "reviewed_subject_expansion_not_runtime_active",
  lifecycle_stage: "subject_release_review",
  subject_id: "subkultur",
  source_repo: candidate.source_repo,
  baseline: {
    source_ref: baseline.source_ref,
    corpus_path: "data/integrations/history-go-fagverk-corpus.v1.json",
    chapter_count: 0,
    chapter_ids: []
  },
  candidate: {
    source_ref: candidate.source_ref,
    corpus_path: "data/integrations/candidates/history-go-fagverk-subkultur.candidate.v1.json",
    corpus_sha256: candidate.content_sha256,
    chapter_count: 8,
    module_file_count: 24
  },
  delta: {
    retained_chapter_count: 0,
    added_chapter_count: 8,
    removed_chapter_count: 0,
    retained_chapter_ids: [],
    added_chapter_ids: ids,
    removed_chapter_ids: [],
    source_ref_changed: baseline.source_ref !== candidate.source_ref,
    semantic_expansion: true
  },
  materialization_assessment: {
    chapter_contract_sufficient_for_subject_review: true,
    module_files_required_before_subject_review: true,
    module_file_count: 24,
    complete_three_module_structure_per_chapter: true,
    runtime_activation_requires_separate_pull_request: true
  },
  review_finding: "Subculture enters review as a complete 8-chapter, 24-module subject; runtime activation remains a separate decision.",
  approval_required: true,
  runtime_activation_allowed: false,
  explicit_runtime_activation_pull_request_required: true
};

fs.writeFileSync(
  "data/integrations/review/history-go-fagverk-subkultur.expansion-review.v1.json",
  `${JSON.stringify(out, null, 2)}\n`
);
console.log("Subculture expansion built");
