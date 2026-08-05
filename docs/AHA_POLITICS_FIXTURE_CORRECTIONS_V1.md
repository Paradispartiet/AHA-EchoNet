# AHA Politics Fixture Corrections V1

## Status

Politics Fixture Corrections V1 now covers **all sixteen current analysis fixtures**. It compares the legacy fixture, the review-only Politics policy and an explicit human expectation for Politics grounding.

Policy **1.2.0** passes all sixteen cases while remaining outside runtime.

## Correction contract

Every case records:

- fixture path and role
- expected Politics status and chapter
- exact source evidence
- supported concepts
- forbidden chapter choices
- unsupported interpretations
- required uncertainty

The correction layer does not overwrite the legacy expected analysis.

## Full fixture set

Correct Politics grounding:

```text
03 NAV reform → forvaltning
07 legal proportionality → rett-lov-rettssikkerhet
10 NAV user meeting → forvaltning
```

Correct Politics abstention:

```text
01 pinse/religion
02 Morgenbladet media history
04 literary attachment theory
05 personal diary
06 technical project plan
08 vague low-information text
09 Morgenbladet public sphere
11 learning reflection
12 urban attention reflection
13 Eidsvoll/1814 history
14 Bislett/sport/byrom
15 fragmentary low-quality text
16 AI, learning and collective knowledge
```

Eight cases are exact legacy baselines and eight are qualitative targets.

## Development history

The original eight-case baseline produced:

```text
3/8 correct
2 false positives
3 false negatives
```

Policy 1.1.0 corrected the two Morgenbladet false positives and the NAV/legal false negatives, reaching 8/8.

Expanding to all sixteen fixtures then exposed one additional false positive:

```text
literary attachment analysis → conflict, power and civil society
```

The literary text contained `conflict` and `language`, but no political protest, civil-society or collective-action evidence.

Policy 1.2.0 therefore added a political-conflict anchor requirement. The word conflict remains available in other contexts; only the political chapter requires political or collective anchors.

## Current result

```text
16/16 passed
0 false positives
0 false negatives
0 validation errors
```

The report status is:

```text
passed_correction_gate
```

The literary case now remains unsupported because `konflikt-makt-sivilsamfunn` is ineligible without a political-conflict anchor.

Eidsvoll/1814 also remains Politics-unsupported. The canonical History chapter is more precise than forcing the text into modern parliamentary, legal or multilevel-governance categories. Politics may later appear as a secondary link when multiple subject corpora can be compared.

## Shared implementation

The 34-case Politics matrix and the 16-case fixture correction set use the same scorer:

```text
scripts/lib/politics-fagverk-scoring.mjs
```

This prevents evaluator drift.

## Deterministic files

```text
data/evaluation/aha-politics-fixture-corrections.v1.json
data/evaluation/aha-politics-fixture-correction-report.v1.json
```

Build the report with:

```bash
node scripts/compare-politics-fixture-corrections.mjs
```

The permanent workflow regenerates the report, requires 16/16 and byte-for-byte parity, and runs with read-only repository permissions.

## Runtime boundary

The active Python engine does not load the correction set, correction report or Politics policy. The report retains:

```text
runtime_activation_allowed: false
```

Full fixture coverage is a stronger review milestone, but not runtime approval.

## Next step

The repository fixture set is now exhausted. The next correction corpus must use additional real articles and adversarial texts, with reviewed source spans and explicit cross-domain alternatives. Runtime activation remains a separate audit and decision.
