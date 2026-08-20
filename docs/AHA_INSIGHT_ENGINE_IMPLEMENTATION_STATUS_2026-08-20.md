# AHA Insight Engine Implementation Status — 2026-08-20

This file supersedes `AHA_INSIGHT_ENGINE_IMPLEMENTATION_STATUS_2026-08-19.md` for the current rebuild state.

## Current state

```text
Phase 1A — SemanticDocument evidence/provenance     merged
Phase 1B — Entities + Concepts V1                  merged
Phase 1C — Claims + Relations V1                   merged
Phase 2A — Dedicated Semantic Model Contract V1    merged
Phase 2B — Semantic Model Endpoint V1              merged
Phase 2C — Semantic Model Shadow Bridge V1         merged
Phase 3A — Synthesized Insight Quality Gate V1     merged
Phase 3B — Gold Evaluation + Evaluation Runtime    merged
Phase 3C — Semantic Evaluation Shadow Operator     merged
Phase 3D — Gold Suite + negative semantic cases    merged
Phase 3E — Live-reviewed production gold baseline  merged in PR #819
Phase 4A — Interpretation / Insight Synthesis V2    implemented in shadow on this branch
Phase 4B — Insight Quality Gate V2                  implemented in shadow on this branch
Next — deploy shadow V2 and measure six live-gold cases
Canonical Insight synthesis write                  disabled
Chamber write from V2                              disabled
Meta write from semantic shadow                    disabled
Persistent SemanticDocument storage                disabled
Production gate authority                          disabled
```

## Runtime chain

```text
SourceEvent
→ deterministic SemanticDocument shadow
→ AHASemanticModelShadowBridge (opt-in)
→ POST /api/aha-agent/semantic-document [aha_semantic_model_output_v1]
→ validated model-assisted shadow
→ Interpretation / Insight Synthesis V2 [separate model step]
→ Insight Quality Gate V2
→ shadow review only
```

The model and synthesis layers remain opt-in and non-authoritative.

## Measured live baseline before V2

Six validated outputs from the configured production semantic-model route are hand-reviewed in `tests/fixtures/semantic-live-reviewed/`.

```text
entities        precision 0.900000  recall 0.947368  f1 0.923077
concepts        precision 0.960000  recall 0.648649  f1 0.774194
source_claims   precision 1.000000  recall 1.000000  f1 1.000000
relations       precision 0.500000  recall 0.550000  f1 0.523810
interpretations precision 0.166667  recall 0.166667  f1 0.166667
macro_f1        0.677550
```

The baseline established the product priority:

- source claims are already strong
- entities are strong
- concepts are precise but incomplete
- relations still overstate causality in important cases
- interpretation/synthesis is the main product bottleneck

One additional museum case failed exact-source/evidence validation in five consecutive attempts. It remains rejected reliability evidence and is excluded from precision/recall/F1 because no valid model shadow existed.

See `docs/AHA_SEMANTIC_LIVE_REVIEWED_GOLD_V1.md` for the baseline.

## Phase 4A — Interpretation / Insight Synthesis V2

V2 is a new model step after validated semantic extraction. It does **not** receive the old V1 interpretations as input.

Its semantic context contains only:

```text
entities
concepts
source claims
source-explicit relations
```

`SOURCE_TEXT` remains the only evidence authority.

The synthesis model explicitly seeks:

```text
principle
mechanism
pattern
tension
consequence
generalization
```

and is instructed that source excerpts, one-sentence summaries and light paraphrases are not synthesized Insights.

Candidate contract:

```text
insight
type
abstraction
evidence
why_it_matters
confidence
uncertainty
causal_status
```

Each candidate requires 2–3 distinct exact-source evidence quotes.

Server implementation:

```text
server/ahaInsightSynthesisContractV2.js
server/ahaInsightSynthesisEndpointV2.js
```

The existing deployed `/api/aha-agent/semantic-document` route dispatches to V2 only when:

```text
format = aha_insight_synthesis_output_v2
```

No parallel backend or API base is introduced.

## Phase 4B — Insight Quality Gate V2

Browser gate:

```text
js/ahaInsightQualityGateV2.js
```

It hard-rejects candidates for:

- literal source output
- source-near paraphrase
- fewer than two distinct source sentences as evidence
- generic claims
- weak abstraction
- semantic disconnect from evidence
- unsupported causal language
- source-explicit causality without explicit causal source wording
- interpretive causality without uncertainty
- overconfident interpretive causality

It also records a quality score, but hard evidence/causality gates cannot be bypassed by a high score.

## Browser shadow runtime

```text
js/ahaInsightSynthesisRuntimeV2.js
js/ahaInsightSynthesisBootstrapV2.js
```

The runtime:

1. listens to `aha:semantic-model-shadow`
2. revalidates source event id + source hash across deterministic/model layers
3. builds sanitized semantic context without V1 interpretations/inferences
4. makes the separate V2 synthesis call
5. maps every returned evidence quote back to deterministic source anchors
6. evaluates candidates through Quality Gate V2
7. stores only the latest synthesis/gate result in runtime memory
8. emits metadata-only QA events

It performs no Chamber, canonical, Meta or persistent writes.

## Operator-only wiring

V2 is loaded only in:

```text
semantic-evaluation-shadow.html
```

with explicit flags:

```text
?ahaSemanticModelShadow=1&ahaInsightSynthesisV2=1
```

Normal `chat.html` does not load the V2 gate/runtime/bootstrap, so normal product traffic does not incur a second model call.

See `docs/AHA_INTERPRETATION_INSIGHT_SYNTHESIS_V2.md` for the normative contract.

## Next required work — live V2 measurement

After this shadow implementation is green and merged:

1. verify production deploy exposes `aha_insight_synthesis_output_v2`
2. run the same six live-reviewed sources through V2
3. retain only server-valid synthesis outputs
4. run Quality Gate V2 on all candidates
5. score approved synthesis output against the existing gold interpretations
6. iterate prompt/gate until interpretation quality is clearly better than the `0.166667` baseline

Do not open canonical Chamber-write merely because one or two examples look good.

## Safety invariants

Until the live V2 evaluation is complete and an explicit production decision is made:

```text
canonical_write = false
chamber_write = false
persistent_write = false
meta_write = false
visible_output_changed = false
synthesis_allowed = false
production_gate_authority = false
```
