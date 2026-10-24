const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { renderReview } = require("../scripts/aha-research-review-report.cjs");

const base = {
  schema: "aha_research_excerpt_live_evaluation_v1",
  corpus_case_count: 3,
  model_requests_reserved: 2,
  model_attempts_accounted: 2,
  outcomes: [
    { id: "paper-1", article_url: "https://example.org/paper", doi: "10.0000/test",
      status: "source_evaluated_needs_human_review",
      evaluation: {
        provided_observation: "Plant cover was associated with insect counts",
        provided_limitation: "causality cannot be established",
        contract_valid_count: 1,
        causal_overreach_flag_count: 0,
        candidates: [{
          insight: "Some plant diversity and insects may share an observed pattern",
          abstraction: "Connects the association to its causal limit",
          why_it_matters: "Could guide future comparative sampling",
          uncertainty_text: "No demonstrated causal link",
          confidence: "medium", causal_status: "not_causal",
          contract_valid: true,
          evidence_review_material: [
            { quote: "Plant cover was associated with insect counts", role: "supports", exact_in_supplied_excerpt: true },
            { quote: "invented <quote>", role: "limits", exact_in_supplied_excerpt: false }
          ],
          validation_errors: []
        }]
      }
    },
    { id: "paper-2", article_url: "https://example.org/second", status: "source_evaluated_needs_human_review",
      evaluation: { provided_observation: "observed", provided_limitation: "limited", contract_valid_count: 0,
        candidates: [] }
    },
    { id: "paper-3", article_url: "javascript:alert(1)", status: "transport_failed_closed" }
  ]
};
const view = renderReview(base);
assert.match(view, /paper-1/);
assert.match(view, /Plant cover was associated with insect counts/);
assert.match(view, /IKKE verifisert i utdraget/);
assert.match(view, /invented &lt;quote&gt;/);
assert.match(view, /Avventende/);
assert.match(view, /mer enn en omskriving/);
assert.match(view, /Modellen avstod/);
assert.match(view, /Ingen evaluerbare kandidater/);
assert.match(view, /Ingen sikker kildelenke/);
assert.doesNotMatch(view, /javascript:alert/);
assert.doesNotMatch(view, /Vitenskapelig vurdert:\*\* Ja/);
assert.ok(view.includes("Kontraktgodkjente:"));
assert.match(renderReview(null), /Ingen evaluerbar live-rapport/);
assert.match(renderReview({ schema: "other", outcomes: [] }), /Ingen evaluerbar live-rapport/);
assert.match(renderReview({ ...base, outcomes: [] }), /ikke en bestått test/);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aha-research-review-"));
try {
  const input = path.join(temp, "input.json");
  const output = path.join(temp, "review.md");
  const summary = path.join(temp, "github-summary.md");
  fs.writeFileSync(input, JSON.stringify(base));
  const run = spawnSync(process.execPath, [path.resolve("scripts/aha-research-review-report.cjs"), input, output],
    { cwd: path.resolve("."), env: { ...process.env, GITHUB_STEP_SUMMARY: summary }, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fs.readFileSync(output, "utf8"), view);
  assert.ok(fs.readFileSync(summary, "utf8").includes("Faglig vurdering"));
  const noReport = spawnSync(process.execPath,
    [path.resolve("scripts/aha-research-review-report.cjs"), path.join(temp, "missing.json"), output],
    { cwd: path.resolve("."), env: { ...process.env, GITHUB_STEP_SUMMARY: summary }, encoding: "utf8" });
  assert.equal(noReport.status, 0);
  assert.match(fs.readFileSync(output, "utf8"), /Ingen evaluerbar live-rapport/);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
console.log("AHA research excerpt manual review worksheet: offline, safe and ungraded.");
