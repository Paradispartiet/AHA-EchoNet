# AHA 1.0 – evaluation against attributed research excerpts

## Scope and evidence boundaries

This evaluation is intentionally **not** an evaluation of whole research articles. The three sources are published papers, but the corpus contains two short, verbatim, noncontiguous excerpts per paper. These were checked against the respective publication on 2026-10-24 and share one fixture in `tests/fixtures/aha-real-science-excerpts-v1.json`.

- Norwegian public health: https://pmc.ncbi.nlm.nih.gov/articles/PMC11007904/
- Cross-sectional study methodology: https://pubmed.ncbi.nlm.nih.gov/41487096/
- Plant diversity and insect restoration: https://pmc.ncbi.nlm.nih.gov/articles/PMC9905558/

The short excerpts are enough to probe quote binding and some kinds of causal overclaiming. They **cannot** demonstrate that AHA interprets an unknown full-length research article correctly, identifies its full methodology, or discovers a genuinely useful new scientific insight.

## Normal tests (no network, no model API)

`node tests/aha-research-synthesis-evaluator.test.cjs`

The deterministic test checks positive non-causal summaries, fabricated evidence rejection, causal overreach detection, preservation of abstention, and the exact-cost-ack boundary. It must pass as part of the standard Node suite.

## Explicitly manual live comparison

GitHub repository → **Actions** → **AHA research excerpt live evaluation** → **Run workflow**. Enter exactly:

`RUN_AHA_THREE_RESEARCH_ARTICLES`

This is an intentional authorization to invoke the existing AHA production synthesis endpoint for at most three source-excerpt cases, requesting at most one model attempt per case. It can incur model costs on the configured AHA backend. Never schedule on push or pull request. There are no automatic retries. The runner stops if the server cannot prove its single-attempt cost control. HTTP requests, model attempts, and response errors are written to an audit artifact even after a failed run.

A local operator may use `AHA_RESEARCH_ARTICLES_COST_ACK=RUN_AHA_THREE_RESEARCH_ARTICLES node scripts/aha-research-excerpt-live-comparison.cjs` under the same explicit conditions.

The manual workflow does not approve any AI output, write to canonical knowledge, write user memory, or promote a candidate to an AHA insight. It simply saves a review report.

## Scorecard dimensions

Each model response is revalidated by AHA's own synthesis contract, then measured for:

1. **Exact source grounding**: every evidence quote must occur in the supplied input.
2. **Limitation coverage**: does the candidate cite the provided limitation as such?
3. **Article specificity**: do the candidate's claims and rationale include relevant topic terms? This is only a lexical indicator, never a scientific validity judgment.
4. **Causal overreach**: would the existing validator flag unsupported cause/effect wording?
5. **Uncertainty**: is it disclosed?
6. **Abstention**: zero candidates remain acceptable; no minimum candidate count or artificially inflated quality score.

All results are tagged `human_review_required: true` and `scientific_validity_verified: false`.

### Reviewer-visible evidence (before any paid run)

The JSON artifact preserves, for **each** generated candidate, the insight, abstraction, why-it-matters rationale, uncertainty wording, confidence, claim type, evidence quotes and their roles, plus the two supplied source fragments. A quote-integrity marker states only whether a quotation occurs **in those fragments**, not whether the wider paper supports the claim. These review fields are capped in length and are not automatically promoted to knowledge.

Every candidate has a `human_quality_review` record with `status: "pending"` and null judgments. This is deliberately **not** a model-generated or lexical novelty score. A reviewer should judge:
- `scientific_accuracy`: supported / unsupported / indeterminate, using the full publication where accessible.
- `nontrivial_knowledge_gain`: yes / no / indeterminate, comparing the interpretation to what the supplied excerpts explicitly say.
- `non_paraphrase`: yes / no / indeterminate; a correct restatement alone does not qualify as a new insight.
- `useful_followup_question`: yes / no / indeterminate, examining whether a proposed next research question follows from the actual finding and limitation.
- `reviewer_notes`: source-specific explanation and missing context.

These fields are unfilled review placeholders in the read-only artifact, **not** scientific approvals. Do not turn any pending value into a passing score. Because each case supplies only two short, noncontiguous fragments, indeterminate is expected for some judgments and should not be converted into failure or success.

A specialist reviewing a case should evaluate factual accuracy, whether the relation adds substantive understanding beyond the source wording, whether important method/context is missing, and whether the proposed interpretation overstates a causal link. The automatic metrics cannot resolve these questions.

## What comes next

Only after this bounded comparison produces actual model results should we tune prompts or source-selection algorithms. A future **whole-article** benchmark must separately collect permissibly licensed, full-context texts; source provenance; expert-reviewed gold judgments; correct access/attribution; and a source-length strategy that preserves methods, results, discussion and limitations. Do not label this three-excerpt comparison a full-paper benchmark.
