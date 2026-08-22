const assert = require("assert");
const fs = require("fs");

const audit = JSON.parse(fs.readFileSync("ops/evaluation/aha-projection-product-agent-quality-review-v2.json", "utf8"));
const humanReview = JSON.parse(fs.readFileSync("ops/evaluation/aha-projection-product-human-review-v2.json", "utf8"));

assert.equal(audit.schema, "aha_projection_product_agent_quality_review_v2");
assert.equal(audit.scope.cases, 27);
assert.equal(audit.scope.expected_visible, 24);
assert.equal(audit.scope.expected_suppressed, 3);
assert.equal(audit.scope.independent_human_review_completed, false);
assert.equal(audit.browser_evaluation.cases, 27);
assert.equal(audit.browser_evaluation.independent_human_review_completed, false);
assert.equal(audit.browser_evaluation.ipad_webkit_gate, true);
assert.equal(audit.observation_probe.pull_request, 882);
assert.equal(audit.observation_probe.disposition, "closed_without_merge");
assert.equal(audit.remediation.pull_request, 884);
assert.equal(audit.remediation.strategy, "read_only_source_bound_usefulness_refinement");
assert.ok(audit.observed_defects.some((entry) => entry.id === "generic_path_copy" && entry.severity === "high"));
assert.ok(audit.observed_defects.some((entry) => entry.id === "low_information_display_anchor" && entry.severity === "high"));
assert.deepEqual(audit.evaluation_limitations.semantic_document_observed_arrays_empty, ["concepts", "claims", "relations", "tensions", "candidate_insights"]);
assert.equal(audit.evaluation_limitations.semantic_document_quality_status, "shadow_claims_relations_pending");
assert.equal(audit.release_boundary.independent_human_review_required, true);
assert.equal(audit.release_boundary.human_usefulness_gate, "open");
assert.equal(audit.release_boundary.automatic_persistence_allowed, false);
assert.equal(audit.release_boundary.projection_store_write_open, false);
assert.equal(audit.release_boundary.normal_chat_automatic_persistence_open, false);
assert.equal(audit.release_boundary.remote_write_open, false);

assert.equal(humanReview.status, "agent_pre_review_complete_independent_human_review_open");
assert.equal(humanReview.release_rule.independent_human_review_required, true);
assert.equal(humanReview.release_rule.minimum_acceptable_share, 0.8);
assert.equal(humanReview.release_rule.critical_provenance_errors_allowed, 0);
assert.equal(humanReview.release_rule.automatic_persistence_allowed, false);
assert.equal(humanReview.release_rule.reviewer_attestation_required, true);
assert.equal(humanReview.rubric.acceptable_score_minimum, 4);
assert.ok(humanReview.case_reviews.every((entry) => entry.review_status === "open"));

console.log("aha-projection-product-agent-quality-review-v2.test.cjs: OK (agent remediation recorded; independent human gate remains open)");
