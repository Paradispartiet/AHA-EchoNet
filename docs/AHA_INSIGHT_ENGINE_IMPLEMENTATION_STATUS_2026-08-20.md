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
Phase 3E — Live-reviewed production gold baseline  materialized in PR #819
Next — Interpretation / Insight Synthesis V2       pending
Canonical Insight synthesis write                  disabled
Meta write from semantic shadow                    disabled
Persistent SemanticDocument storage                disabled
Production gate authority                          disabled
```

## Runtime chain

```text
SourceEvent
→ deterministic SemanticDocument shadow
→ AHASemanticModelShadowBridge (opt-in)
→ POST /api/aha-agent/semantic-document
→ validated model-assisted shadow
→ semantic evaluation runtime/operator
→ live-reviewed gold evaluation
```

The model bridge remains opt-in and the evaluation chain remains non-authoritative.

## Phase 3E — measured live baseline

Six validated outputs from the configured production semantic-model route are now hand-reviewed in `tests/fixtures/semantic-live-reviewed/`.

Aggregate baseline:

```text
entities        precision 0.900000  recall 0.947368  f1 0.923077
concepts        precision 0.960000  recall 0.648649  f1 0.774194
source_claims   precision 1.000000  recall 1.000000  f1 1.000000
relations       precision 0.500000  recall 0.550000  f1 0.523810
interpretations precision 0.166667  recall 0.166667  f1 0.166667
macro_f1        0.677550
```

The result is clear enough to set the next product priority:

- source claims are already strong
- entities are strong
- concepts are precise but incomplete
- relations still overstate causality in important cases
- interpretation/synthesis is the main product bottleneck

One additional museum case failed exact-source/evidence validation in five consecutive attempts. It is retained as rejected capture evidence and excluded from precision/recall/F1 because no valid model shadow existed.

See `docs/AHA_SEMANTIC_LIVE_REVIEWED_GOLD_V1.md` for the corpus, metrics and review rationale.

## Next required work — Interpretation / Insight Synthesis V2

The next large product phase is not more support infrastructure. It is a dedicated synthesis step after `SemanticDocument`:

```text
Source
→ entities / concepts / source claims / relations
→ Interpretation candidates
→ Insight Quality Gate V2
→ Chamber
```

The synthesis step must explicitly seek:

```text
principle
mechanism
pattern
tension
consequence
generalizable understanding
```

A source excerpt or light paraphrase is not a synthesized Insight.

Candidate shape should include at least:

```text
insight
type
abstraction
evidence
why_it_matters
confidence
uncertainty?
```

Quality Gate V2 must reject candidates that merely restate source material, are generic, lack evidence, introduce unsupported causality, add no semantic transformation, or conceal material uncertainty.

Only after this new layer performs well on the live-reviewed gold corpus should canonical Insight-write be opened in a controlled way. Meta comes after that, when the canonical Insight layer provides sufficiently good semantic material.

## Safety invariants

Until the synthesis/gate work is measured and explicitly opened:

```text
canonical_write = false
persistent_write = false
meta_write = false
visible_output_changed = false
synthesis_allowed = false
production_gate_authority = false
```
