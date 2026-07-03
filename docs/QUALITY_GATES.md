# AHA Quality Gates

Dette dokumentet definerer kvalitetsporter for AHA-analyser.

## Hvorfor quality gates trengs

AHA kan ha korrekt schema, korrekt UI og korrekt eksportformat, men likevel analysere feil tekst. Derfor må kvalitet sjekkes på mer enn shape.

## Current status

Quality gates er nå aktivert som baselinevern for topic/source/geopolitics-sporet:

- `topicConsistency`: implemented.
- `sourceBinding`: implemented/tested.
- `geopolitics consistency`: implemented/tested.
- Stale/irrelevant output: fail-closed.
- `forbiddenTerms` mismatch: fail-closed.
- `requiredTerms` mismatch: invalid/quality issue.

Gjenstående arbeid i dette dokumentets opprinnelige quality-gate-liste er fortsatt:

- semantic overlap
- memoryIsolation
- score ceiling


## AHA Quality Status Surface V1 global safety gate

AHA Quality Status Surface V1 is frozen as the local read-only surface for presenting existing quality-gate results. It presents the existing source-binding, topic-consistency, stale-data, analysis-isolation, and relevant geopolitics-consistency gate outcomes without changing gate logic or weakening requirements.

AHA Quality Status Surface V1 builder: implemented. AHA Quality Status Surface V1 preview: implemented. The global safety gate is test-locked for the full Quality Status layer.

The gate keeps Quality Status read-only, local-only, and no-sync. It verifies that builder and preview use only safe quality/status fields and do not return or show raw user text, transcript, source excerpts, URL-er/private URL-er, metadata, raw payloads, raw invalid fields, raw source events, userId/email, or other user identifiers. It also verifies no approval actions, no EchoNet runtime, no backend, no fetch/network behavior, and no storage writes. AHA Sync Overview V1 is unchanged, and Conversation Insight Snapshot V1 contract is unchanged.

## Eksisterende validering

Repoet har allerede fixture-validering via:

```text
npm run validate:aha-fixtures
```

Scriptet leser `docs/fixtures/aha-analysis` og validerer at fixtures har:

```text
id
title
inputText
expectedCanonicalAnalysis
```

og at canonical analysis har riktig shape:

```text
contentType
domain
theme
mainTension
keyInsight
fieldConnections
historyGoLinks
suggestedActions
confidence
warnings
```

Dette er nødvendig, men ikke tilstrekkelig.

## Gate 1: Shape

Sjekker at objektet har riktig form.

```text
Pass: felt finnes og har riktig type.
Fail: manglende felt, feil array/object/string/number.
```

Status i dag: delvis implementert.

## Gate 2: Source binding

Sjekker at kildebaserte felt tilhører samme `sourceTextHash`.

```text
Pass: field.sourceTextHash === currentSourceTextHash
Fail: feil hash, manglende hash uten same-run-bevis, eller selectedAfterwork fra annen kilde
```

Status i dag: implemented/tested.

## Gate 3: Topic consistency

Sjekker at output faktisk handler om input.

```text
Pass: output-termer overlapper kildetermer.
Fail: output domineres av temaer som ikke finnes i kilden.
```

Minimum:

```text
sourceTerms = extractTopTerms(sourceText)
outputTerms = extractTopTerms(ahaSer + canonicalAnalysis + afterwork)
intersectionRatio >= threshold
```

I tillegg:

```text
forbiddenTerms må ikke finnes i output.
```

## Gate 4: Memory isolation

Sjekker at personlig/chamber-minne ikke overtar kildeanalyse.

```text
Pass: memory vises bare i eget felt når det brukes.
Fail: AHA SER eller afterwork beskriver tidligere minne i stedet for kilden.
```

## Gate 5: Export consistency

Sjekker at eksportpakken ikke blander lag.

```text
Pass: ahaSer, canonicalAnalysis, afterwork og rawAutoPayload har samme source binding.
Fail: sourceText er ny, men afterwork/payload er gammel.
```

## Gate 6: Score ceiling

Svar-evaluering må ha maks-score ved alvorlige feil.

```text
Hvis source mismatch:
  source_grounding <= 20
  total_score <= 30

Hvis forbidden terms finnes:
  total_score <= 20
  status = invalid_source_mismatch
```

## Fixture-utvidelse

Utvid fixture-formatet:

```json
{
  "id": "nmt_conceptual_articles",
  "title": "NMT konseptuelle artikler",
  "inputText": "...",
  "expectedCanonicalAnalysis": { },
  "requiredTerms": ["konseptuelle artikler", "begreper", "offentlighet"],
  "forbiddenTerms": ["old_domain_term_1", "old_domain_term_2"],
  "expectedSourceHashBinding": true
}
```

## Testlogikk

Pseudo:

```text
runAnalysis(inputText)
assert shape ok
assert sourceTextHash exists
assert all source-grounded fields match sourceTextHash
assert requiredTerms appear in output
assert forbiddenTerms do not appear in output
assert answer score respects mismatch ceilings
```

## Golden mismatch test

Bygg en test der chamberet fylles med irrelevant tidligere materiale før ny analyse.

```text
Seed chamber: gammelt domene A
Input text: tydelig domene B
Expected: AHA SER handler om B
Forbidden: ord fra A
```

Denne testen er viktigere enn ren happy path.


## Geopolitics consistency gate

Geopolitics-eksport er koblet til `quality.topicConsistency`. Når kildeteksten handler om USA/Kina og global makt, må eksporten beholde de normaliserte requiredTerms `usa` og `kina` i output-laget. Stale eller irrelevant geopolitics-output skal fail-close dersom det trekker inn gamle institusjonelle temaer som ikke finnes i kilden.

Dette er en quality gate, ikke en ny feature:

```text
Pass: geopolitics-output matcher requiredTerms og har ingen forbiddenTerms.
Fail: stale/irrelevant output har forbiddenTerms eller mangler requiredTerms.
```

Ved fail skal:

```text
quality.status != valid
quality.failClosed = true
quality.sourceBinding.invalidFields inkluderer topicConsistency
markdown/full teknisk eksport viser topicConsistency-status og term-problemet
```

RequiredTerms/forbiddenTerms gjelder også geopolitics exports, og termene normaliseres før sammenligning slik at gate-logikken ikke avhenger av casing eller enkel tegnsetting.

## UI quality gate

Explorer skal ikke få uvalidert analyse.

```text
if analysis.quality.status !== "valid":
  render source text
  render warning
  hide AHA SER / afterwork action buttons
```

## Export quality gate

Eksport skal alltid inkludere:

```text
quality.status
quality.sourceBinding
quality.topicConsistency
quality.memoryIsolation
invalidFields
```

## Minimum statusverdier

```text
valid
warning_unverified_binding
invalid_source_mismatch
invalid_stale_afterwork
invalid_stale_payload
invalid_memory_contamination
invalid_shape
```

## Praktisk prioritet

Første implementering bør være enkel:

```text
1. sourceTextHash-match
2. forbiddenTerms
3. requiredTerms
4. score ceiling
```

Deretter kan semantic overlap/embeddings, memoryIsolation og score ceiling strammes videre.
