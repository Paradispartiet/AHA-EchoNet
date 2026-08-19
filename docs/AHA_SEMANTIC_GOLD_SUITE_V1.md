# AHA Semantic Gold Suite V1

## Status

Phase 3D utvider Semantic Evaluation fra to enkelt-fixtures til et lite, eksplisitt regressjonssett med både positive og negative cases.

```text
suite: AHASemanticGoldSuite
schema: aha_semantic_gold_suite_v1
fixture count: 6
production gate authority: false
synthesis allowed: false
```

## Hvorfor denne fasen

Det er ikke nok at én modellrespons ser god ut. Før AHA kan vurdere en autoritativ synthesis-port må evalueringssystemet bevise at det oppdager typiske semantiske feil.

Negative cases dekker nå blant annet:

- spørsmål feilklassifisert som source claim
- kausal overtolkning av ren samvariasjon
- entity/concept-forveksling
- interpretation med feil evidence

## Aggregate gold metrics

`AHASemanticGoldSuite` summerer true positives, predictions og gold expectations på tvers av fixtures og beregner micro:

```text
precision
recall
f1
```

for:

```text
entities
concepts
source_claims
relations
interpretations
```

Deretter beregnes macro F1 over dimensjonenes F1.

Dette er ekte gold-metrikk, ikke deterministic↔model agreement.

## Nåværende fixture-regresjon

Det håndmerkede seks-fixture-settet er bevisst ikke «pent». De negative kandidatene gjør at aggregate-regresjonen forventer svakere resultater særlig for relations og interpretations.

Det viktige i denne fasen er at evaluatorens metrikker reagerer korrekt på:

- false positives
- false negatives
- manglende labels
- feil relasjonstype/epistemisk status
- feil interpretation-evidence

Tallene er regresjonsforventninger for de syntetiske testkandidatene, ikke påstander om den levende OpenAI-modellens kvalitet.

## Authority policy

Både per-fixture og aggregate evaluator holder:

```text
production_gate_authority = false
synthesis_allowed = false
```

Ingen kombinasjon av gode fixture-tall i V1 kan åpne canonical Insight-write.

## Neste etappe

Neste nødvendige arbeid er å samle faktiske model-shadow-resultater fra operatorflaten mot flere representative tekster og håndmerke dem inn i gold-settet.

Først når et bredere corpus finnes kan vi definere faglig forsvarlige terskler for:

- entity precision/recall
- concept precision/recall
- source-claim fidelity
- relation precision
- interpretation review quality

Inntil da er quality gate fortsatt:

```text
authoritative = false
gold_evaluation_required = true
synthesis_allowed = false
```
