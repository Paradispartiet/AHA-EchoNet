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
Phase 4A — Interpretation / Insight Synthesis V2    merged in PR #820
Phase 4B — Insight Quality Gate V2                  merged in PR #820
Phase 4C — first live V2 round                      completed
Phase 4D — causal calibration #1                    merged in PR #822 and production-deployed
Phase 4E — causal language calibration #2           implemented in PR #823
Next — merge/deploy #823 and rerun six live-gold cases
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
→ server-side synthesis validation
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

The baseline established that extraction is not the main bottleneck. The product gap is higher-order interpretation/synthesis plus epistemic discipline.

See `docs/AHA_SEMANTIC_LIVE_REVIEWED_GOLD_V1.md` for the baseline.

## Phase 4A — Interpretation / Insight Synthesis V2

V2 is a separate model step after validated semantic extraction. It does **not** receive old V1 interpretations/inferences as input.

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

No parallel backend or API base exists.

## Phase 4B — Insight Quality Gate V2

Browser gate:

```text
js/ahaInsightQualityGateV2.js
```

It hard-rejects candidates for:

- literal/source-near output
- fewer than two distinct source sentences as evidence
- generic/weak abstraction
- semantic disconnect from evidence
- causal language inconsistent with `causal_status`
- source-explicit causality without explicit causal candidate-evidence
- interpretive causality without uncertainty
- overconfident interpretive causality
- causal synthesis contradicted by an explicit source disclaimer

A numeric quality score cannot override hard evidence/causality gates.

## Browser shadow runtime

```text
js/ahaInsightSynthesisRuntimeV2.js
js/ahaInsightSynthesisBootstrapV2.js
```

The runtime verifies source event identity/hash, builds sanitized semantic context, calls V2, maps returned evidence to deterministic source anchors, runs Quality Gate V2, and retains only the latest shadow result in memory.

It performs no Chamber, canonical, Meta or persistent writes.

V2 remains operator-only through `semantic-evaluation-shadow.html`; normal `chat.html` does not incur the synthesis call.

## Phase 4C — first live V2 round

Two independent production runs against the six live-reviewed sources showed:

```text
valid V2 output: 6 / 6
candidate count: 6
quality scores: roughly 0.57–0.74
gate eligible: 0 / 6
```

Candidate content showed a substantial abstraction lift: constraints→form/technique, retrieval difficulty↔later memory, delegation→boundary coordination, modularity→interface complexity, and standardization↔flexibility.

The failure was epistemic labeling: composite mechanisms were too often marked `source_explicit/high` or `interpretive/high`.

## Phase 4D — causal calibration #1, merged/deployed

PR #822 tightened the model and gate so that:

```text
interpretive causal synthesis
→ confidence medium/low
→ uncertainty required

source_explicit
→ must be supported by the candidate's own evidence

source explicitly rejects a simple cause
→ causal mechanism blocked
```

Production deployment was directly verified in the next live run: retrieval first returned `502 semantic_model_validation_failed` with the new validation codes for `interpretive + high` and missing uncertainty, then succeeded on retry.

The first post-deploy measurement produced:

```text
valid production outputs: 6 / 6
gate eligible:             3 / 6
strict historical gold F1: 0.000000
evidence-granularity proxy: 0.222222
```

Two of the three eligible cases were false positives in the gate:

- retrieval was marked `not_causal` but the prose said `førte ... til`
- mixed-use was marked `not_causal` but the prose said `skapes`, despite an explicit source disclaimer about cause

This established that metadata fields alone are insufficient; actual grammatical causality must also be gated.

## Phase 4E — causal language calibration #2

PR #823 moves that rule into both layers.

The browser gate now recognizes grammatical causal variants including:

```text
fører ... til
førte ... til
skaper / skapes
gir
øker
reduserer
muliggjør
bidrar til
```

The server contract now also fails closed on:

```text
not_causal + causal wording
source_explicit without explicit causal candidate evidence
causal wording/status contradicted by an explicit source causal disclaimer
```

The synthesis instruction explicitly tells `not_causal` candidates to use non-causal language such as `samtidig som`, `opptrer sammen med` or `er forbundet med`, and to preserve source causal limitations in the insight/uncertainty.

A pre-merge local-gate verification against the deployed #822 server then gave:

```text
valid production outputs: 6 / 6
gate eligible:             2 / 6
strict historical gold F1: 0.000000
evidence-granularity proxy: 0.250000
```

Retrieval with causal `førte ... til` was now rejected. Mixed-use passed only in a new model sample whose wording was actually non-causal (`korresponderer`) and which preserved the source's causal limitation. Constraints/creativity remained correctly eligible due explicit source wording that limitations `kan flytte` creativity toward form/technique.

This `2 / 6` is not the final post-calibration result because the #823 server prompt/validator was not production-deployed during that verification.

See `docs/AHA_INSIGHT_SYNTHESIS_V2_LIVE_CALIBRATION_2026-08-20.md` for the measurement chronology and interpretation.

## Evaluation note

The historical V1 gold evaluator intentionally remains unchanged. Its interpretation matcher requires exact hand-labeled evidence quote strings. V2 often returns a longer exact-source sentence that contains the shorter gold quote, which creates evidence-granularity false negatives.

For that reason current calibration reports show the historical metric and a separate evidence-granularity proxy. If human review confirms systematic semantic false negatives, a dedicated V2 gold evaluator must be specified and then applied consistently to both V1 and V2 outputs; the old baseline must not be rewritten retroactively.

## Next required work

After PR #823 is green and merged:

1. verify production has the #823 server validation behavior
2. rerun the same six live-reviewed sources
3. measure server validation/retry rate
4. run Quality Gate V2 on every valid candidate
5. report strict historical P/R/F1 plus the separate V2 review metric
6. inspect remaining false positives/false negatives
7. keep write authority closed until the post-deploy result is stable and materially better

Canonical Chamber-write remains closed regardless of individual good-looking examples.

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
