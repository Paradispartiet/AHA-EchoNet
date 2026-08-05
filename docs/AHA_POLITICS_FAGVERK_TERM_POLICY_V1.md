# AHA Politics Fagverk Term Policy V1

## Status

Politics Term Policy is a review-only scoring policy for the thirteen-chapter Politics corpus. Version **1.2.0** keeps the full 143-term collision classification and adds chapter-anchor rules derived from all sixteen current analysis fixtures.

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

Broad terms such as `makt`, `institusjoner`, `politikk`, `regler`, `representasjon` and `ressurser` cannot identify one chapter by themselves.

The additional global non-scoring terms remain:

```text
norsk
over
saken
tiltak
var
```

## Chapter anchors

### Parlamentarisme

`parlamentarisme` requires an explicit parliamentary anchor such as:

```text
mistillit
Stortinget
regjering
representasjon
mandat
politisk ansvar
kontroll
```

This prevents media-history and public-sphere texts from being interpreted as parliamentary analysis on `debatt`, `offentlighet` and `arena` alone.

### Konflikt, makt og sivilsamfunn

Version 1.2.0 adds a second anchor gate. `konflikt-makt-sivilsamfunn` requires evidence of political or collective conflict, for example:

```text
protest
sivilsamfunn
handlingsrepertoar
dagsordenmakt
motoffentlighet
kollektiv handling
sosial bevegelse
demonstrasjon
streik
mobilisering
organisering
```

This prevents literary, psychological and interpersonal conflict from selecting a political conflict chapter merely because the source contains words such as `konflikt` and `språk`.

## Chapter-scoped supplemental evidence

`forvaltning` retains NAV-specific evidence such as welfare administration, organizational cultures, responsibility relations, steering lines, user meetings and one-contact-point language.

`rett-lov-rettssikkerhet` retains phrases for legal basis, legitimate purpose, proportionality, individual rights and less intrusive measures.

Supplemental evidence is available only to its named chapter. The global score threshold remains `6`, at least two scoring terms are required, and the ambiguity gap remains `3`.

## Shared scorer

Both review gates use:

```text
scripts/lib/politics-fagverk-scoring.mjs
```

The shared scorer applies collision multipliers, global non-scoring terms, chapter-scoped evidence, required chapter anchors and unchanged grounding thresholds.

## Results

Synthetic Politics matrix:

```text
34/34 passed
13/13 chapters covered
0 evidence errors
```

All current analysis fixtures:

```text
16/16 passed
8 exact legacy baselines
8 qualitative targets
0 false positives
0 false negatives
```

Correct Politics grounding:

- both NAV texts → `forvaltning`
- legal proportionality text → `rett-lov-rettssikkerhet`

Correct abstention includes:

- both Morgenbladet texts
- pinse
- literary attachment analysis
- diary and learning reflections
- technical project note
- urban attention reflection
- Eidsvoll/1814 history
- Bislett/sport
- fragmentary low-quality text
- AI, learning and collective knowledge

## Deterministic commands

```bash
node scripts/build-politics-fagverk-term-policy.mjs
node scripts/evaluate-politics-fagverk-policy.mjs
node scripts/compare-politics-fixture-corrections.mjs
```

The permanent workflows regenerate the policy and both reports, require byte-for-byte parity and use read-only repository permissions.

## Runtime boundary

The active Python engine still does not load the Politics policy, review corpus or evaluation reports. The policy status remains:

```text
review_policy_full_fixture_candidate_not_runtime_active
```

All reports keep `runtime_activation_allowed: false`.

## Next step

The fixture collection is now fully covered. The next evidence layer must use additional real articles and adversarial cross-domain texts with reviewed source spans. Runtime activation remains a separate decision requiring a larger correction corpus and an explicit activation audit.
