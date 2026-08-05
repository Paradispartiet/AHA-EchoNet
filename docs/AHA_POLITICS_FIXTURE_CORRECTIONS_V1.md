# AHA Politics Fixture Corrections V1

## Status

Politics Fixture Corrections V1 compares existing legacy analysis fixtures with the review-only Politics policy and an explicit human expectation.

The first baseline recorded five failures. Policy version **1.1.0** now passes all eight cases while remaining outside runtime.

## Why this layer exists

The legacy fixture suite protects exact output from the hand-authored Python analyzer. That is useful for compatibility, but it does not prove that a new text receives the right Fagverk chapter.

Each Politics correction case instead records:

- fixture path and fixture role
- expected Politics status and chapter
- exact source evidence
- supported concepts
- forbidden chapter choices
- unsupported interpretations
- required uncertainty

The correction layer does not overwrite the old fixtures.

## Pilot set

Expected grounding:

```text
NAV reform → forvaltning
NAV user meeting → forvaltning
legal proportionality text → rett-lov-rettssikkerhet
```

Expected Politics abstention:

```text
pinse
Morgenbladet media history
personal diary
vague low-information text
Morgenbladet public-sphere and culture criticism
```

Six cases are exact legacy baselines. Two are later qualitative targets.

## Initial result

Policy 1.0.0 produced:

```text
3/8 correct
2 false positives
3 false negatives
```

Both Morgenbladet texts were incorrectly selected as `parlamentarisme`. Both NAV texts and the legal text lacked their required Politics chapters.

## Correction strategy

The correction did not lower global thresholds.

### Morgenbladet

`parlamentarisme` now requires an explicit parliamentary anchor. Public-sphere words such as `debatt`, `offentlighet` and `arena` cannot select the chapter alone.

Residual generic unique words such as `over`, `norsk`, `var`, `saken` and `tiltak` are globally non-scoring.

### NAV

Chapter-scoped evidence was added to `forvaltning`, including welfare-administration forms, organizational cultures, responsibility relations, steering lines, user meetings and one-contact-point language.

### Legal text

Chapter-scoped evidence was added to `rett-lov-rettssikkerhet`, including legal basis, legitimate purpose, proportionality, individual rights and less intrusive measures.

## Current result

Policy 1.1.0 records:

```text
8/8 passed
0 false positives
0 false negatives
0 validation errors
```

The report status is:

```text
passed_correction_gate
```

The two Morgenbladet cases now remain `unsupported`. Their `parlamentarisme` ranking is explicitly marked ineligible because the required anchor is missing.

Both NAV cases select `forvaltning` using chapter-scoped supplemental evidence.

The legal case selects `rett-lov-rettssikkerhet` through explicit proportionality and rights phrases.

## Shared implementation

The 34-case matrix and 8-case correction set use the same scorer:

```text
scripts/lib/politics-fagverk-scoring.mjs
```

This prevents one evaluator from passing while another silently uses different matching logic.

## Deterministic files

```text
data/evaluation/aha-politics-fixture-corrections.v1.json
data/evaluation/aha-politics-fixture-correction-report.v1.json
```

Build the report with:

```bash
node scripts/compare-politics-fixture-corrections.mjs
```

The permanent workflow regenerates the report, requires 8/8 and byte-for-byte parity, and runs with read-only repository permissions.

## Runtime boundary

The active Python engine does not load the correction set, correction report or Politics policy. The report retains:

```text
runtime_activation_allowed: false
```

Passing eight fixtures is a correction milestone, not runtime approval.

## Next step

Expand the correction corpus with more real articles, especially:

- public-sphere texts that mention democratic concepts without parliamentary institutions
- administration texts with varied inflection and organizational vocabulary
- legal texts that distinguish proportionality review from policy design
- cross-domain negatives from media, religion, psychology and personal reflection

Runtime activation requires a larger correction corpus, source-span review and a separate activation audit.
