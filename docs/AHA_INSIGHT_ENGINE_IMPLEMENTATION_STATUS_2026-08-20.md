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
Phase 4F — Semantic Insight Review Evaluator V2      implemented in PR #824
Measured semantic-review F1                          V1 0.166667 → V2 0.833333
Remaining reviewed synthesis miss                    delegation → responsibility boundaries
Canonical Insight synthesis write                   disabled
Chamber write from V2                               disabled
Meta write from semantic shadow                     disabled
Persistent SemanticDocument storage                 disabled
Production gate authority                           disabled
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
→ shadow review only
```

The model and synthesis layers remain opt-in and non-authoritative.

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

## Remaining reviewed miss

The only V2 review miss is `delegation_bottleneck_live_v1`.

The candidate correctly says that decision structure changes the placement of disagreement, but does not explicitly preserve the higher-order mechanism that disagreement/coordination moves to the **boundaries between responsibility areas**. Review-gold therefore keeps the case false-negative.

Evidence contains the boundary wording, but evidence is not allowed to substitute for missing candidate meaning.

## Next required work

After #824 merges:

1. tighten the delegation synthesis so the responsibility-boundary mechanism is explicit without forcing unsupported causality
2. rerun the six live-reviewed cases against the same review-gold
3. verify the server causal fail-closed rules remain active
4. require a stable post-fix review result before considering controlled Chamber/canonical review
5. keep Meta after canonical Insight quality is proven

Do **not** open canonical write solely because one run reached 5/6.

## Safety invariants

```text
canonical_write = false
chamber_write = false
persistent_write = false
meta_write = false
visible_output_changed = false
synthesis_allowed = false
production_gate_authority = false
```
