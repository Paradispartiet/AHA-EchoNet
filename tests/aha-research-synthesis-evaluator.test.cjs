const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const corpus = require("./fixtures/aha-real-science-excerpts-v1.json");
const { sourceText, fingerprint, evaluateResearchSynthesis } = require("../scripts/aha-research-synthesis-evaluator.cjs");

const insights = [
  "Green space is associated with low mental distress, while the causal pathway remains uncertain.",
  "These epidemiological studies have descriptive uses, while causal inference remains limited.",
  "Plant diversity is associated with insect abundance, but ecological recovery remains unresolved."
];

function candidate(item, insight) {
  return {
    schema: "aha_insight_synthesis_output_v2",
    candidates: [{
      insight,
      type: "pattern",
      abstraction: "Combines a study-reported association with its stated methodological boundary.",
      evidence: [
        { quote: item.observation, role: "supports" },
        { quote: item.limitation, role: "limits" }
      ],
      why_it_matters: "Avoids mistaking reported observations for a proven causal mechanism.",
      confidence: "medium",
      uncertainty: "The excerpt alone cannot validate the mechanism or its generalizability.",
      causal_status: "not_causal"
    }]
  };
}

async function run() {
  assert.equal(corpus.length, 3);
  assert.equal(new Set(corpus.map((item) => item.id)).size, 3);
  for (const [index, item] of corpus.entries()) {
    assert.match(item.url, /^https:\/\//);
    assert.ok(item.doi && item.topic_terms.length >= 2);
    assert.equal(item.source_scope, "short_noncontiguous_verbatim_excerpts");
    const source = sourceText(item);
    assert.ok(source.includes(item.observation) && source.includes(item.limitation));
    assert.match(fingerprint(source), /^sha256:[a-f0-9]{64}$/);

    const good = await evaluateResearchSynthesis(item, candidate(item, insights[index]));
    assert.equal(good.source_scope, "short_noncontiguous_verbatim_excerpts_not_full_paper");
    assert.equal(good.candidate_count, 1);
    assert.equal(good.contract_valid_count, 1, item.id + ": valid noncausal insight must pass");
    assert.equal(good.grounded_candidate_count, 1);
    assert.equal(good.source_limitation_cited_count, 1);
    assert.equal(good.topic_specific_candidate_count, 1);
    assert.equal(good.exact_evidence_quotes, 2);
    assert.equal(good.quote_integrity_ratio, 1);
    assert.equal(good.causal_overreach_flag_count, 0);
    assert.equal(good.scientific_validity_verified, false);
    assert.equal(good.human_review_required, true);

    const fabricated = candidate(item, insights[index]);
    fabricated.candidates[0].evidence[0].quote = "This quotation was invented.";
    const falseQuote = await evaluateResearchSynthesis(item, fabricated);
    assert.equal(falseQuote.contract_valid_count, 0);
    assert.equal(falseQuote.grounded_candidate_count, 0);
    assert.equal(falseQuote.exact_evidence_quotes, 1);
    assert.equal(falseQuote.candidates[0].validation_errors.includes("candidate:0:evidence:0:quote_not_in_source"), true);

    const overreach = candidate(item, "The intervention caused the reported research outcome.");
    overreach.candidates[0].causal_status = "source_explicit";
    const cause = await evaluateResearchSynthesis(item, overreach);
    assert.equal(cause.contract_valid_count, 0);
    assert.equal(cause.causal_overreach_flag_count, 1);

    const empty = await evaluateResearchSynthesis(item, { schema: "aha_insight_synthesis_output_v2", candidates: [] });
    assert.equal(empty.candidate_count, 0);
    assert.equal(empty.quote_integrity_ratio, null);
    assert.equal(empty.zero_candidates_is_not_a_failure, true);
  }

  const script = path.resolve(__dirname, "../scripts/aha-research-excerpt-live-comparison.cjs");
  for (const invalidAck of ["", "RUN_AHA_FIVE_ARTICLES", "RUN_AHA_THREE_RESEARCH_ARTICLE"]) {
    const run = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      timeout: 10000,
      env: { ...process.env, AHA_RESEARCH_ARTICLES_COST_ACK: invalidAck }
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /Explicit acknowledgement RUN_AHA_THREE_RESEARCH_ARTICLES required/);
    assert.doesNotMatch(run.stdout, /AHA_RESEARCH_LIVE_CASE/);
  }
  console.log("AHA research evaluation: 3 attributed real-source excerpts; candidate metrics, causal boundaries and manual paid-run gate passed. Zero live model calls.");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
