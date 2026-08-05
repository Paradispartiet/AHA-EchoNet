# AHA Politics Fixture Corrections V1

## Status

Politics Fixture Corrections V1 is the first human-reviewed comparison baseline between:

1. the existing legacy analysis fixtures
2. the review-only Politics term policy
3. an explicit human expectation for Politics grounding

The baseline deliberately records current errors. It is not a success claim and does not activate Politics grounding in runtime.

## Why this baseline is needed

The original fixture suite contains sixteen analysis examples. The first eight are used as exact golden parity for the hand-authored Python analyzer. That protects compatibility, but it also rewards reproducing prepared themes, tensions and recommendations rather than improving interpretation of new texts.

The Politics correction baseline asks a different question:

> Given the current source text, should the Politics corpus select a chapter, select no chapter, or remain uncertain?

Each correction case therefore records source evidence, supported concepts, forbidden chapter choices, unsupported interpretations and required uncertainty.

## Pilot cases

Eight existing fixtures are included.

### Expected Politics grounding

- `03-nav-reformen-forvaltning.json` → `forvaltning`
- `10-nav-reformen-brukermoete.json` → `forvaltning`
- `07-juridisk-tekst.json` → `rett-lov-rettssikkerhet`

### Expected Politics abstention

- `01-pinse-religion.json`
- `02-morgenbladet-mediehistorie.json`
- `05-dagbok-refleksjon.json`
- `08-uklar-lav-confidence.json`
- `09-morgenbladet-offentlighet-kulturkritikk.json`

Six cases come from the exact legacy baseline. Two later fixtures are qualitative targets.

## Correction schema

The reviewed correction file is:

```text
data/evaluation/aha-politics-fixture-corrections.v1.json
```

Every case contains:

- fixture path and role
- expected Politics status
- expected Politics chapter, when applicable
- exact source evidence present in the fixture
- supported concepts
- forbidden chapter IDs
- interpretations the system must not make
- uncertainty the system must preserve

The correction set does not overwrite the old fixtures. It places a new human-review layer beside them.

## Comparison report

The deterministic comparison report is:

```text
data/evaluation/aha-politics-fixture-correction-report.v1.json
```

Build it with:

```bash
node scripts/compare-politics-fixture-corrections.mjs
```

The report includes:

- selected fields from the legacy expected analysis
- the human-reviewed Politics expectation
- the term-policy grounding result and ranked chapter evidence
- comparison type
- forbidden-chapter detection
- validation errors

## Baseline result

```text
8 cases total
3 correct
5 incorrect
2 false positives
3 false negatives
0 validation errors
```

The report status is:

```text
correction_required
```

### Correct abstentions

The policy correctly abstains for:

- pinse
- personal diary reflection
- vague low-information text

### False positives

Both Morgenbladet texts are incorrectly grounded to:

```text
parlamentarisme
```

The first false positive is driven mainly by terms such as:

- `debatt`
- `offentlighet`
- `arena`

This demonstrates that public-sphere vocabulary is still too easy to confuse with parliamentary politics. Media history, culture criticism and editorial form must not become parliamentary grounding without evidence such as government responsibility, the Storting, representation, confidence or institutional control.

The ranking also exposes residual generic terms such as `over` that should never contribute strong title evidence.

### False negatives

The current policy fails to ground:

- both NAV texts to `forvaltning`
- the proportionality text to `rett-lov-rettssikkerhet`

The NAV fixtures contain clear human evidence around welfare administration, organizational cultures, steering lines and unclear responsibility. The legal fixture contains legal basis, legitimate purpose, proportionality and individual rights.

These failures show that chapter-specific phrase and concept coverage is still incomplete even after the collision policy passed the synthetic matrix.

## Meaning of the result

The 34-case Politics evaluation matrix is useful but insufficient. It proves internal consistency with curated chapter terms. The fixture correction baseline proves that real existing texts still reveal false positives and false negatives.

A review gate may therefore be green while runtime readiness remains blocked.

The correct response is not to lower thresholds globally. That would likely fix some NAV and legal false negatives while making Morgenbladet false positives worse.

## Runtime boundary

The active Python engine does not load:

```text
aha-politics-fixture-corrections.v1.json
aha-politics-fixture-correction-report.v1.json
```

The report explicitly keeps:

```text
runtime_activation_allowed: false
```

No runtime behavior, sync, EchoNet, model training, external source storage or History Go write-back is introduced.

## Next correction work

The next policy revision should address the five failures with targeted changes:

1. make residual generic terms such as `over` non-scoring
2. require parliamentary institution evidence before `parlamentarisme` can win
3. strengthen NAV/forvaltning phrases and concepts without lowering the global threshold
4. strengthen legal proportionality evidence for `rett-lov-rettssikkerhet`
5. rerun both the 34-case matrix and the 8-case correction baseline

The next acceptable target is:

```text
34/34 synthetic cases remain green
8/8 fixture corrections pass
0 new cross-domain false positives
```

Only after that should more real articles be added to the correction corpus. Runtime activation remains a later, separate decision.
