const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const fixtureDir = path.resolve("tests/fixtures/semantic-live-reviewed-v2/post-stability-two-round-v1");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"));
}

function sha256(name) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(path.join(fixtureDir, name))).digest("hex")}`;
}

const provenance = readJson("provenance.json");
const summary = readJson("summary.json");
const rounds = [readJson("round-1.json"), readJson("round-2.json")];
const expectedFixtureIds = [
  "constraints_creativity_live_v1",
  "delegation_bottleneck_live_v1",
  "mixed_use_street_live_v1",
  "modularity_interfaces_live_v1",
  "retrieval_learning_live_v1",
  "standardization_flexibility_live_v1"
].sort();

assert.equal(provenance.schema, "aha_insight_synthesis_v2_two_round_provenance_v1");
assert.equal(provenance.workflow_run_id, 32366046900);
assert.equal(provenance.artifact_id, 9405381366);
assert.equal(provenance.artifact_digest, "sha256:0284594f709bf224076f2a93e9d7cdb9c200d91c8bbc8aec92f7fc040337dbac");
assert.equal(provenance.source_head, "e59fc69b45e64f602f8cd57dc86bea1d76e7178e");
assert.equal(provenance.production_main, "02521a405c46294f40e7a9361564cde120e656a0");
Object.entries(provenance.files).forEach(([name, digest]) => assert.equal(sha256(name), digest));

assert.equal(summary.schema, "aha_insight_synthesis_v2_delegation_postfix_live_gold_v1");
assert.equal(summary.round_count, 2);
assert.equal(summary.stable_all_six_match, true);
assert.equal(summary.all_rounds_six_valid, true);
assert.deepEqual(summary.rounds.map((round) => round.valid_output_count), [6, 6]);
assert.deepEqual(summary.rounds.map((round) => round.total_attempt_count), [7, 6]);
assert.deepEqual(summary.rounds.map((round) => round.v1_review.f1), [0.166667, 0.166667]);
assert.deepEqual(summary.rounds.map((round) => round.v2_review.f1), [1, 1]);
assert.equal(summary.rounds[0].validation_code_counts["candidate:0:source_limitation_wording_not_preserved:peker_ikke_ut"], 1);
assert.deepEqual(summary.rounds[1].validation_code_counts, {});

rounds.forEach((round, index) => {
  assert.equal(round.round, index + 1);
  assert.equal(round.valid_output_count, 6);
  assert.equal(round.review.valid, true);
  assert.equal(round.review.v2.metrics.true_positive, 6);
  assert.equal(round.review.v2.metrics.false_positive, 0);
  assert.equal(round.review.v2.metrics.false_negative, 0);
  assert.equal(round.review.v2.metrics.f1, 1);
  assert.deepEqual(round.snapshot.cases.map((item) => item.fixture_id).sort(), expectedFixtureIds);
  round.snapshot.cases.forEach((item) => {
    assert.equal(item.valid_live_output, true);
    assert.equal(item.model, provenance.model);
    assert.ok(item.response_id.startsWith("resp_"));
    assert.ok(item.candidates.length >= 1);
    assert.ok(item.gate_decisions.every((decision) => decision.eligible_for_insight_review === true));
    const reviewCase = round.review.v2.cases.find((candidate) => candidate.fixture_id === item.fixture_id);
    assert.ok(reviewCase);
    assert.equal(reviewCase.metrics.true_positive, 1);
    assert.equal(reviewCase.metrics.false_positive, 0);
    assert.equal(reviewCase.metrics.false_negative, 0);
    assert.ok(reviewCase.decisions.some((decision) => decision.matched === true && decision.reasons.length === 0));
  });
});

[
  "production_gate_authority",
  "synthesis_allowed",
  "canonical_write",
  "chamber_write",
  "meta_write",
  "persistent_write"
].forEach((field) => {
  assert.equal(summary[field], false);
  rounds.forEach((round) => assert.equal(round[field], false));
});

console.log("aha-insight-synthesis-v2-stability-live-gold passed: two rounds 6/6, V2 F1 1.0, stable");
