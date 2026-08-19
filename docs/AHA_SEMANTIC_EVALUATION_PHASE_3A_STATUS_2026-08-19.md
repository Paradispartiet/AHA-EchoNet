# AHA Semantic Evaluation — Phase 3A Status — 2026-08-19

## Implementert

```text
Phase 1A — Evidence/provenance                  merged
Phase 1B — Entities/Concepts                    merged
Phase 1C — Claims/Relations                     merged
Phase 2A — Semantic Model Contract              merged
Phase 2B — Semantic Model Endpoint              merged
Phase 2C — Semantic Model Shadow Bridge         merged
Phase 3A — Semantic Evaluation + Quality Gate   implemented on current branch
```

Phase 3A består av:

- `js/ahaSemanticInsightQualityGate.js`
- `tests/aha-semantic-insight-quality-gate-v1.test.cjs`
- `docs/AHA_SYNTHESIZED_INSIGHT_QUALITY_GATE_V1.md`

## Kontrakt

Evaluatoren er ren og shadow-only:

```text
authoritative = false
gold_evaluation_required = true
synthesis_allowed = false
canonical_write = false
meta_write = false
persistent_write = false
```

Den revaliderer source/evidence spans mot originaltekst og deterministic anchors, rapporterer evidence fidelity og deterministic↔model agreement, og klassifiserer modellproposisjoner for **synthesis review**.

V1-policy:

```text
source_claim    → evidence only, blocked from synthesis review
interpretation → review-eligible only when high confidence + exact evidence + nonliteral wording
inference       → blocked in V1
```

Review eligibility åpner ikke synthesis permission.

## Målinger

Phase 3A rapporterer:

- evidence binding fidelity
- evidence anchor coverage
- entity agreement
- concept agreement
- source-claim agreement
- interpretation/inference counts
- relation epistemic counts
- synthesis-review eligible/blocked counts

Agreement omtales ikke som precision/recall/correctness uten håndmerket gold-sett.

## Ingen produktendring

Phase 3A:

- endrer ikke Chat-output
- endrer ikke server-endepunkter
- skriver ikke Insight Chamber
- skriver ikke Meta
- lagrer ikke evaluering persistent
- lager ikke synthesized Insight text

## Neste etappe

```text
Phase 3B — Gold Fixtures + Semantic Evaluation Runtime
```

Den skal etablere håndmerkede gold-fixtures og koble `aha:semantic-model-shadow` til evaluator-modulen i runtime-minne. Først da kan vi begynne å måle faktisk precision/recall og senere definere en autoritativ synthesis-port.
