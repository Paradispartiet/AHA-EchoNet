# AHA Politics Fagverk Term Policy V1

## Status

Politics Term Policy is a review-only scoring policy for the thirteen-chapter Politics corpus. Version **1.1.0** keeps the full 143-term collision classification and adds targeted correction rules derived from the human-reviewed fixture baseline.

It is not loaded by the Python runtime. `activation_allowed` remains `false`.

## Locked source

```text
History Go commit: 9e9644e83998ff715005bf80c96cde6193107c13
Politics corpus SHA-256: 981ab3ad25f972bd13c70a0247f26b8796e43b8cd3cde7282b7d073bfcc79dec
```

## Collision policy

All 143 shared terms remain classified exactly once:

```text
84 non-scoring
55 down-weighted to 0.35
4 context-only phrases
```

The original categories remain:

```text
29 subject-wide or multi-chapter
55 generic language
55 cross-chapter
4 shared phrases
```

Broad words such as `makt`, `institusjoner`, `politikk`, `regler`, `representasjon` and `ressurser` cannot identify one chapter by themselves.

## Correction rules in 1.1.0

The first fixture comparison exposed five errors despite the synthetic matrix passing 34/34. Version 1.1.0 corrects them without lowering the global threshold.

### Global non-scoring terms

The policy now blocks both audited generic language and additional unique noise terms that escaped the collision audit:

```text
norsk
over
saken
tiltak
var
```

These words may be present in explanations but cannot contribute to chapter selection.

### Parliamentary anchor gate

`parlamentarisme` is ineligible unless the source contains at least one explicit parliamentary anchor, including terms such as:

```text
mistillit
parlamentarisme
Stortinget
regjering
representasjon
mandat
politisk ansvar
regjeringsansvar
kontroll
```

This prevents media-history texts containing `debatt`, `offentlighet` and `arena` from being misread as parliamentary analysis.

### Chapter-scoped supplemental evidence

Supplemental evidence is available only to its named chapter. It does not change global vocabulary or thresholds.

For `forvaltning`, the policy adds terms from the two NAV correction fixtures, including:

```text
velferdsforvaltning / velferdsforvaltningen
etatskultur / etatskulturer
ansvarsforhold
styringslinjer
byråkratisk kompleksitet
ett kontaktpunkt
brukermøte / brukermøtet
```

For `rett-lov-rettssikkerhet`, it adds:

```text
hjemmel i lov
legitimt formål
forholdsmessig
individets rettigheter
mindre inngripende tiltak
rettsanvendelsen
```

Each supplemental term has concept weight `3`. The global score threshold remains `6`, at least two scoring terms are required, and the ambiguity gap remains `3`.

## Shared scorer

Both review gates now use:

```text
scripts/lib/politics-fagverk-scoring.mjs
```

The shared scorer applies:

1. base title, concept and support weights
2. collision multipliers
3. global non-scoring terms
4. chapter-scoped supplemental evidence
5. required chapter anchors
6. unchanged grounding and ambiguity thresholds

This prevents the synthetic matrix and real-fixture comparison from drifting into separate implementations.

## Results

Synthetic Politics matrix:

```text
34/34 passed
13/13 chapters covered
0 evidence errors
```

Human-reviewed fixture corrections:

```text
8/8 passed
0 false positives
0 false negatives
```

The two Morgenbladet texts now remain Politics-unsupported. Both NAV texts select `forvaltning`. The legal proportionality text selects `rett-lov-rettssikkerhet`.

## Deterministic commands

```bash
node scripts/build-politics-fagverk-term-policy.mjs
node scripts/evaluate-politics-fagverk-policy.mjs
node scripts/compare-politics-fixture-corrections.mjs
```

The two permanent workflows regenerate the policy and both reports, require byte-for-byte parity and run with read-only repository permissions.

## Runtime boundary

The active Python engine still does not load:

```text
data/integrations/review/history-go-fagverk-politikk.term-policy.v1.json
data/evaluation/aha-politics-fagverk-evaluation-report.v1.json
data/evaluation/aha-politics-fixture-correction-report.v1.json
```

The policy status is:

```text
review_policy_correction_candidate_not_runtime_active
```

Both evaluation reports keep `runtime_activation_allowed: false`.

## Next step

The next step is to expand the human correction corpus with additional real articles and adversarial cross-domain texts. Runtime activation remains separate and requires a larger correction set, source-span evidence and an explicit activation audit.
