import assert from "node:assert/strict";
import {
  buildSubjectConfigs,
  checkSubjectFreshness,
  summarizeFreshness
} from "../scripts/check-history-go-fagverk-upstream-freshness.mjs";

const registry = {
  schema: "aha_history_go_fagverk_runtime_registry_v1",
  active_subjects: {
    politikk: {
      subject_id: "politikk",
      candidate_corpus_path: "candidate-politikk.json"
    },
    by: {
      subject_id: "by",
      candidate_corpus_path: "candidate-by.json",
      upstream_fagverk_path: "data/fagverk/by"
    }
  }
};

const candidates = {
  "candidate-politikk.json": {
    source_repo: "Paradispartiet/History-Go",
    source_ref: "pin-politikk"
  },
  "candidate-by.json": {
    source_repo: "Paradispartiet/History-Go",
    source_ref: "pin-by"
  }
};

const subjects = buildSubjectConfigs(registry, (candidatePath) => candidates[candidatePath]);
assert.deepEqual(subjects.map((item) => item.subjectId), ["by", "politikk"]);
assert.equal(subjects[0].upstreamPath, "data/fagverk/by");
assert.equal(subjects[1].upstreamPath, "data/fagverk/politikk");

{
  const subject = subjects.find((item) => item.subjectId === "politikk");
  const urls = [];
  const request = async (url) => {
    urls.push(url);
    if (url.includes("/commits?")) return [{ sha: "latest-politikk" }];
    if (url.includes("/compare/")) return { status: "ahead", ahead_by: 4, behind_by: 0 };
    throw new Error(`Unexpected URL: ${url}`);
  };
  const result = await checkSubjectFreshness(subject, request, {
    upstreamRepo: "Paradispartiet/History-Go",
    upstreamRef: "main",
    apiBase: "https://api.github.test"
  });
  assert.equal(result.status, "current");
  assert.equal(result.upstream_review_required, false);
  assert.equal(result.auto_activation_allowed, false);
  assert.equal(result.comparison_status, "ahead");
  assert.ok(urls[0].includes("path=data%2Ffagverk%2Fpolitikk"));
  assert.ok(urls[1].includes("latest-politikk...pin-politikk"));
}

{
  const subject = { ...subjects[0], pinnedSourceRef: "same-sha" };
  let requestCount = 0;
  const result = await checkSubjectFreshness(subject, async (url) => {
    requestCount += 1;
    assert.ok(url.includes("/commits?"));
    return [{ sha: "same-sha" }];
  }, {
    upstreamRepo: "Paradispartiet/History-Go",
    upstreamRef: "main",
    apiBase: "https://api.github.test"
  });
  assert.equal(result.status, "current");
  assert.equal(result.comparison_status, "identical");
  assert.equal(requestCount, 1, "exact pin must not spend an unnecessary compare request");
}

{
  const subject = subjects[0];
  const request = async (url) => {
    if (url.includes("/commits?")) return [{ sha: "newer-by" }];
    if (url.includes("/compare/")) return { status: "behind", ahead_by: 0, behind_by: 3 };
    throw new Error(`Unexpected URL: ${url}`);
  };
  const result = await checkSubjectFreshness(subject, request, {
    upstreamRepo: "Paradispartiet/History-Go",
    upstreamRef: "main",
    apiBase: "https://api.github.test"
  });
  assert.equal(result.status, "upstream_review_required");
  assert.equal(result.upstream_review_required, true);
  assert.equal(result.auto_activation_allowed, false);
  assert.equal(result.action, "review_rebuild_approve_and_materialize_subject_before_activation");
}

{
  const current = {
    subject_id: "politikk",
    status: "current",
    upstream_review_required: false,
    auto_activation_allowed: false
  };
  const stale = {
    subject_id: "by",
    status: "upstream_review_required",
    upstream_review_required: true,
    auto_activation_allowed: false
  };
  const report = summarizeFreshness([current, stale], {
    checkedAt: "2026-08-12T18:00:00.000Z",
    upstreamRepo: "Paradispartiet/History-Go",
    upstreamRef: "main"
  });
  assert.equal(report.status, "upstream_review_required");
  assert.equal(report.active_subject_count, 2);
  assert.equal(report.review_required_count, 1);
  assert.deepEqual(report.review_required_subject_ids, ["by"]);
  assert.equal(report.contract.detection_only, true);
  assert.equal(report.contract.auto_sync, false);
  assert.equal(report.contract.auto_activation, false);
  assert.equal(report.contract.runtime_remains_pinned_until_review_approval_and_materialization, true);
}

{
  const divergentSubject = subjects[0];
  const result = await checkSubjectFreshness(divergentSubject, async (url) => {
    if (url.includes("/commits?")) return [{ sha: "diverged-upstream" }];
    return { status: "diverged", ahead_by: 2, behind_by: 2 };
  }, {
    upstreamRepo: "Paradispartiet/History-Go",
    upstreamRef: "main",
    apiBase: "https://api.github.test"
  });
  assert.equal(result.upstream_review_required, true, "diverged provenance must fail closed to review");
}

console.log("aha-history-go-fagverk-upstream-freshness.test.mjs passed");
