# AHA Politics Fagverk Term Policy V1

## Status

Politics Fagverk Term Policy V1 is the collision-review and evaluation layer for the thirteen-chapter Politics review corpus.

It classifies every term shared by multiple Politics chapters, defines which terms may contribute to chapter scoring, and evaluates the resulting review policy against positive, confusing and deliberately ambiguous texts.

The policy is **not active in the AHA runtime**. It is checked in for review and regression testing only.

## Source boundary

History Go source:

```text
Paradispartiet/History-Go
9e9644e83998ff715005bf80c96cde6193107c13
```

Politics review corpus digest:

```text
981ab3ad25f972bd13c70a0247f26b8796e43b8cd3cde7282b7d073bfcc79dec
```

Inputs:

```text
data/integrations/review/history-go-fagverk-politikk.audit.v1.json
data/integrations/review/history-go-fagverk-politikk.audit-report.v1.json
```

Outputs:

```text
data/integrations/review/history-go-fagverk-politikk.term-policy.v1.json
data/evaluation/aha-politics-fagverk-evaluation-report.v1.json
```

Evaluation definition:

```text
data/evaluation/aha-politics-fagverk-evaluation-matrix.v1.json
```

## Why a term policy is necessary

The module-aware Politics audit found 143 terms shared by two or more chapters. Shared words cannot all be treated alike.

Some are ordinary explanatory language:

- `derfor`
- `men`
- `hvem`
- `analyse`
- `utfall`

Some are real political concepts but too broad to identify one chapter:

- `makt`
- `institusjoner`
- `politikk`
- `regler`
- `representasjon`
- `ressurser`

Some are narrower cross-chapter terms that may contribute weak contextual evidence, but must not dominate a chapter decision.

Without a term policy, these collisions would reproduce the original problem: AHA could choose a familiar academic template based on general vocabulary rather than source-specific evidence.

## Classification result

All 143 audited collisions are classified exactly once:

```text
84 non-scoring
55 down-weighted
4 context-only
```

Category breakdown:

```text
29 subject-wide or multi-chapter terms
55 generic-language terms
55 cross-chapter terms
4 shared phrases
```

### Non-scoring

Multiplier:

```text
0
```

All high-risk terms are non-scoring. Generic language is also non-scoring even when it appears in only two chapters.

A non-scoring term may still be shown as context in a future explanation surface, but it cannot increase a chapter score.

### Down-weighted

Multiplier:

```text
0.35
```

Medium-risk single-token terms may contribute weak supporting evidence when they are not classified as generic language. They cannot by themselves satisfy the grounding threshold.

### Context-only phrases

Multiplier:

```text
0
```

The four multi-token phrases shared by multiple chapters are retained for explanation and ambiguity analysis, but do not score in V1.

## Base scoring used by the review evaluator

```text
title term   5.0
concept term 3.0
support term 1.5
```

Policy multipliers are applied after the base weight.

The review evaluator requires:

- score of at least `6`
- at least two scoring evidence terms
- a lead of at least `3` over another qualifying chapter

When the best and second-best qualifying chapters are closer than three points, the result is `ambiguous` rather than a forced chapter choice.

This evaluator is a review instrument. It is not wired into `/api/aha/analyze`.

## Evaluation matrix

The matrix contains 34 reviewed cases:

```text
13 positive cases
13 confusion cases
8 ambiguity or insufficient-evidence cases
```

### Positive cases

Every canonical Politics chapter has one direct positive case built from chapter-specific evidence.

Examples include:

- `delegasjon`, `instruksjonsrett`, `forvaltningsskjønn` → Offentlig forvaltning
- `sperregrense`, `utjevningsmandat`, `strategisk stemmegivning` → Valg, partier og velgeratferd
- `sikkerhetsdilemma`, `avskrekking`, `småstat` → Internasjonal politikk
- `operasjonalisering`, `intern validitet`, `kontrafaktisk` → Statsvitenskapelig metode
- `forholdsmessighet`, `kontradiksjon`, `effektivt rettsmiddel` → Rett og rettssikkerhet

### Confusion cases

Each chapter is tested against a nearby alternative. Broad background words may mention the competing chapter, while chapter-specific evidence must still determine the result.

Examples:

- policy process versus public administration
- parliamentary responsibility versus regime comparison
- elections versus parliamentary representation
- EØS implementation versus international politics
- welfare distribution versus political economy
- law and proportionality versus administrative procedure
- norms and identity versus conflict and civil society

### Ambiguity cases

These texts contain only broad or non-scoring vocabulary, for example:

```text
Makt, institusjoner og regler former politiske utfall.
```

Such texts must remain `unsupported` or `ambiguous`. The evaluator must not select a chapter simply because several broad Politics words occur together.

## Evaluation result

The checked-in report records:

```text
34/34 passed
13/13 chapters covered
0 evidence errors
0 failed cases
```

The report status is:

```text
passed_review_gate
```

This means the policy is internally consistent with the current reviewed matrix. It does **not** mean that runtime activation is approved.

Both files explicitly retain:

```text
activation_allowed: false
runtime_activation_allowed: false
```

## Deterministic build and parity

Build the policy:

```bash
node scripts/build-politics-fagverk-term-policy.mjs
```

Run the evaluation:

```bash
node scripts/evaluate-politics-fagverk-policy.mjs
```

The dedicated CI workflow:

1. preserves the checked-in policy and report
2. rebuilds both files from the reviewed corpus, audit and matrix
3. requires the exact 143-term and 34-case summaries
4. checks that every collision is classified exactly once
5. requires byte-for-byte parity with the checked-in files
6. runs with read-only repository permissions

## Runtime boundary

The active Python grounding code does not load:

```text
history-go-fagverk-politikk.term-policy.v1.json
aha-politics-fagverk-evaluation-report.v1.json
data/integrations/review/
```

It continues to use the separate seed corpus:

```text
data/integrations/history-go-fagverk-corpus.v1.json
```

This PR therefore does not change live chapter selection.

## Remaining work before activation

The deterministic matrix is necessary but not sufficient. Before Politics can be activated, we still need a human correction set based on real texts that AHA has previously misread.

Each correction case should record:

- permitted source text or source representation
- expected content type
- expected Politics chapter or explicit `unsupported`
- supported concepts and their source spans
- forbidden or unsupported interpretations
- required uncertainty
- old analyzer output
- policy-grounded output
- human-reviewed expected output
- reviewer and revision metadata

The next production step is therefore a **Politics article correction and comparison corpus**, not runtime activation and not fine-tuning.
