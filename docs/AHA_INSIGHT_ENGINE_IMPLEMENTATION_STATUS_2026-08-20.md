# AHA Insight Engine Implementation Status — 2026-08-20

This file supersedes `AHA_INSIGHT_ENGINE_IMPLEMENTATION_STATUS_2026-08-19.md` for the current rebuild state.

## Current state

```text
Phase 1A — SemanticDocument evidence/provenance      merged
Phase 1B — Entities + Concepts V1                   merged
Phase 1C — Claims + Relations V1                    merged
Phase 2A — Dedicated Semantic Model Contract V1     merged
Phase 2B — Semantic Model Endpoint V1               merged
Phase 2C — Semantic Model Shadow Bridge V1          merged
Phase 3A — Synthesized Insight Quality Gate V1      merged
Phase 3B — Gold Evaluation + Evaluation Runtime     merged
Phase 3C — Semantic Evaluation Shadow Operator      merged
Phase 3D — Gold Suite + negative semantic cases     merged
Phase 3E — Live-reviewed production gold baseline   merged in PR #819
Phase 4A — Interpretation / Insight Synthesis V2     merged in PR #820
Phase 4B — Insight Quality Gate V2                   merged in PR #820
Phase 4C — first live V2 round                       completed
Phase 4D — causal calibration #1                     merged/deployed in PR #822
Phase 4E — causal language calibration #2            merged/deployed in PR #823
Phase 4F — Semantic Insight Review Evaluator V2      merged in PR #824
Phase 4G — delegation responsibility boundaries      merged in PR #825
Phase 4H — fail-closed stochastic stability layer    merged in PR #827
Phase 4I — targeted stability corrections            merged in PRs #829–#832
Phase 4J — authoritative two-round live stability    6/6 + F1 1.0 in both rounds
Phase 5A — controlled local review/Chamber boundary  implemented
Measured historical semantic-review F1               V1 0.166667 → V2 0.833333
Final live semantic-review F1                        V2 1.000000 / 1.000000
Automatic Canonical Insight synthesis write         disabled
Operator-approved local Chamber write from V2       enabled, one candidate at a time
Dedicated local V2 review queue                     enabled, explicit approval required
Meta write from semantic shadow                     disabled
Persistent SemanticDocument storage                 disabled
Backend Chamber sync for local V2 records           fail-closed/disabled
Endpoint and shadow-gate production authority       disabled
```

## Runtime chain

```text
SourceEvent
→ deterministic SemanticDocument shadow
→ AHASemanticModelShadowBridge (opt-in)
→ POST /api/aha-agent/semantic-document [aha_semantic_model_output_v1]
→ validated model-assisted shadow
→ Interpretation / Insight Synthesis V2
→ server-side synthesis validation
→ Insight Quality Gate V2
→ Semantic Insight Review Evaluator V2 [QA only]
→ permanent two-round production proof
→ operator-only review queue [explicit approval]
→ bounded local Chamber write [second explicit approval]
```

The model and synthesis layers remain opt-in and non-authoritative. The separate
activation controller can promote one eligible candidate only after validating
the exact permanent production proof and two distinct, expiring approval
challenges.

## Measured baseline before V2

Six validated production outputs are hand-reviewed in `tests/fixtures/semantic-live-reviewed/`.

```text
entities        precision 0.900000  recall 0.947368  f1 0.923077
concepts        precision 0.960000  recall 0.648649  f1 0.774194
source_claims   precision 1.000000  recall 1.000000  f1 1.000000
relations       precision 0.500000  recall 0.550000  f1 0.523810
interpretations precision 0.166667  recall 0.166667  f1 0.166667
macro_f1        0.677550
```

The product bottleneck was higher-order interpretation/synthesis plus epistemic discipline, not source-claim extraction.

## Interpretation / Insight Synthesis V2

V2 is a separate model step after validated semantic extraction. It does **not** receive V1 interpretations or inferences as input.

Semantic context contains only:

```text
entities
concepts
source claims
source-explicit relations
```

`SOURCE_TEXT` remains the only evidence authority.

The model seeks:

```text
principle
mechanism
pattern
tension
consequence
generalization
```

Each candidate requires:

```text
insight
type
abstraction
2–3 exact-source evidence quotes
why_it_matters
confidence
uncertainty
causal_status
```

Server implementation:

```text
server/ahaInsightSynthesisContractV2.js
server/ahaInsightSynthesisEndpointV2.js
```

The existing `/api/aha-agent/semantic-document` route dispatches to V2 only when `format = aha_insight_synthesis_output_v2`. No parallel backend is introduced.

## Insight Quality Gate V2

Browser gate:

```text
js/ahaInsightQualityGateV2.js
```

It hard-rejects candidates for:

- literal/source-near output
- fewer than two source sentences as evidence
- generic or weak abstraction
- semantic disconnect from evidence
- causal language inconsistent with `causal_status`
- source-explicit causality without explicit causal candidate-evidence
- interpretive causality without uncertainty
- overconfident interpretive causality
- causal synthesis contradicted by an explicit source limitation

A numeric quality score cannot override a hard evidence/causality failure.

## Causal calibration chronology

### PR #822

Calibration #1 required medium/low confidence + uncertainty for interpretive causality and scoped `source_explicit` to candidate evidence. Production deployment was verified by new server validation failures before retry.

The first post-#822 production run yielded 6/6 valid outputs but exposed two gate false positives: `not_causal` metadata paired with causal prose.

### PR #823

Calibration #2 therefore added grammatical causal-language validation to both server and browser layers. The server now fails closed on:

```text
not_causal + causal wording
source_explicit without explicit causal candidate evidence
causal wording/status contradicted by a source causal disclaimer
```

The prompt instructs non-causal candidates to use genuine association/pattern language and preserve causal limitations.

## Authoritative post-#823 live result

The same six live-reviewed sources were rerun after #823 deployment.

Permanent provenance snapshot:

```text
tests/fixtures/semantic-live-reviewed-v2/post-causal-language-v1.json
```

Measured production behavior:

```text
valid outputs:                  6 / 6
total model attempts:           11
candidates:                     6
gate eligible:                  6 / 6
server causal validation hits:  6
strict historical F1:           0.166667
evidence-granularity proxy F1:  0.333333
```

The retry behavior directly proves the #823 server validator is deployed: invalid `source_explicit` causal attempts were rejected before valid reformulations were returned.

## Semantic Insight Review Evaluator V2

The historical V1 interpretation evaluator remains unchanged for compatibility. It is too string-exact to measure V2 semantic equivalence alone, so a separate symmetric review evaluator is introduced:

```text
js/ahaSemanticInsightReviewEvaluatorV2.js
tests/fixtures/semantic-insight-review-gold-v2.json
tests/aha-semantic-insight-review-evaluator-v2.test.cjs
```

The evaluator applies the **same contract to V1 and V2**. Core meaning must be present in `insight`, `abstraction` or `uncertainty`; source evidence and `why_it_matters` cannot fill in missing meaning. Evidence is used only for grounding/cross-claim requirements, and aliases are explicit in review-gold.

CI locks:

```text
V1 semantic-review: TP 1/6, precision 0.166667, recall 0.166667, F1 0.166667
V2 semantic-review: TP 5/6, precision 0.833333, recall 0.833333, F1 0.833333
```

This is the first deterministic like-for-like measurement showing a large interpretation/synthesis improvement.

## Post-review stability work

PR #825 fixed the only deterministic review miss by preserving delegation responsibility boundaries. A two-round probe then showed that the broader production output was still stochastic even though delegation matched 2/2.

PR #827 introduced the permanent stability layer: temperature `0.2`, stronger source/canonical-term preservation, explicit causal-limit preservation, and at most four internal fail-closed regenerations. PRs #829 and #830 eliminated causal retry lock and constrained non-causal rewrites. PRs #831 and #832 added strict evidence coverage for the two remaining stochastic omissions: modularity coordination-delay and retrieval method/outcome.

Gold, evaluator, attempt ceiling, and write policy were not weakened.

## Authoritative final live result

The unchanged six-case review gold was run twice against production after #832.

```text
workflow run:    32366046900
artifact id:     9405381366
artifact digest: sha256:0284594f709bf224076f2a93e9d7cdb9c200d91c8bbc8aec92f7fc040337dbac
production main: 02521a405c46294f40e7a9361564cde120e656a0

round 1: 6/6 valid, V2 F1 1.000000, 7 attempts
round 2: 6/6 valid, V2 F1 1.000000, 6 attempts
stable_all_six_match: true
all_rounds_six_valid: true
```

Round 1 exercised one internal fail-closed retry for preservation of the explicit mixed-use causal limitation. Round 2 required no retry. Both returned six review matches.

Permanent artifact snapshots and provenance:

```text
tests/fixtures/semantic-live-reviewed-v2/post-stability-two-round-v1/
tests/aha-insight-synthesis-v2-stability-live-gold.test.cjs
```

The shadow quality/stability proof is complete. It now authorizes only the
separate controlled local activation boundary documented in
`AHA_INSIGHT_SYNTHESIS_V2_CONTROLLED_ACTIVATION_2026-08-20.md`. Automatic writes,
backend persistence, Meta and broad production authority remain separate gates.

## Safety invariants

```text
endpoint canonical_write = false
shadow chamber_write = false
automatic canonical_write = false
operator review queue write = explicit approval only
bounded local Chamber write = second explicit approval only
backend persistent/sync write = false while a local V2 record exists
meta_write = false
normal chat activation = false
```
