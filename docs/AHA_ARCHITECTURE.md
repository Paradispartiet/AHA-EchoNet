# AHA Architecture

## Prinsipp

```text
AHA = jeg
History Go = det jeg samler
EchoNet = den kollektive overbygningen
AHA-EchoNet = den overordnede personlige AHA-motoren
```

AHA-EchoNet eier den personlige AHA-flaten. History Go er en separat samlings- og læringsmotor som kan sende data til AHA som valgfri import.

## Eksisterende canonical motor

AHA-EchoNet har allerede en motor. Den skal beholdes.

```text
insightsChamber.js
= selve innsiktsmotoren

metaInsightsEngine.js
= metanivået / mønstre på tvers

ahaChat.js
= eksisterende chatkobling til motoren
```

Ingen nye moduler skal lage egen innsiktsmotor. De skal sende kildemateriale inn via felles source/ingest-lag.

## Source → Ingest → Insight

Ny felles flyt:

```text
source event
→ AHASources
→ AHAIngest
→ InsightsEngine.createSignalFromMessage(...)
→ InsightsEngine.addSignalToChamber(...)
→ aha_insight_chamber_v1
→ MetaInsightsEngine
```

## Nye komponenter

```text
index.html
= AHA Dashboard

chat.html
= AHA Chat

notes.html
= AHA Notes

gallery.html
= AHA Galleri

feed.html
= AHA Feed / Twitter

insta.html
= AHA Insta
```

## LocalStorage-kontrakt

```text
aha_insight_chamber_v1
= eksisterende innsiktskammer

aha_source_events_v1
= rå kildelogg

aha_notes_v1
= personlige notater

aha_gallery_v1
= personlig galleri

aha_feed_posts_v1
= korte tekstposter

aha_insta_posts_v1
= bilde-/videoposter
```

## Ansvarsdeling

AHA-EchoNet skal kunne fungere uten History Go. Primære kilder er brukerens egne chatmeldinger, notater, galleriobjekter, feedposter og Insta-poster.

History Go-import er valgfri og skal merkes tydelig som importert materiale.

## AHA Chat går gjennom AHAIngest

AHA Chat sine bruker-meldinger sendes via `AHAIngest.ingest(...)` på linje
med Notes, Galleri, Feed, Insta og History Go-import. Felles ingest-rør
sørger for at samme source-event-logg, embedding-berikelse og
merge-suggestion-flyt brukes for alle AHA-moduler.

Hvis `AHAIngest` ikke er lastet på siden (f.eks. en eldre cache), faller
chat tilbake til å skrive direkte til `InsightsEngine.addSignalToChamber`
og logge source event manuelt. Standardflyten er ingest.

### AHA-agentens svar er ikke brukerinnsikter

AHA-agentens egne svar vises i chatten og logges i source-loggen, men
skal **ikke** bli ordinære insights — AI-oppsummeringer hører ikke
hjemme i innsiktskammeret. `AHAIngest.ingest(input)` aksepterer derfor
flagget `skip_insight: true`:

```text
input.skip_insight === true
  → AHASources logger source eventet
  → ingest hopper over createSignalFromMessage og addSignalToChamber
  → ingest fyrer aha:source-only i stedet for aha:ingested
  → returnerer { ok: true, signal: null, meta: null, skipped_insight: true }
```

Brukermeldinger fra chat ingestes som vanlig (uten `skip_insight`).
Agent-svaret ingestes med `skip_insight: true`.

## ahaEmneMatcher er et forslagssystem

`ahaEmneMatcher.js` brukes av `AHAIngest` til å foreslå hvilke emner en
rå AHA-tekst sannsynligvis berører. Matcheren skriver ikke bekreftede
emner — den skriver provisoriske forslag på insighten:

```text
emne_suggestions: [
  {
    emne_id,
    subject_id,
    label,
    score,
    confidence,
    source: "ahaEmneMatcher",
    status: "suggested",
    created_at,
    ...
  }
]
```

Forslagene er ikke brukerbekreftet, og `target.emner` /
`target.matched_subjects` røres ikke automatisk. UI kan senere lese
`emne_suggestions` og la brukeren bekrefte eller avvise hvert forslag.

`AHAIngest` fyrer `aha:emne-suggested` når nye forslag legges til.

History Go-importerte signaler skal ikke emnematches på nytt — `AHAIngest`
hopper over `enrichWithEmneMatcher` for alt med `imported: true`,
`source_app: "historygo"` eller `source_type` som starter med
`"historygo"`. AHA stoler på History Go sin egen eksporterte metadata
(concepts, related_emner, categoryId, place_id, person_id).

## Operasjonelle arkitekturdokumenter

Denne filen beskriver hovedarkitekturen. For analyseflyt, kildebinding, cache og feilsøking skal disse dokumentene brukes som arbeidsgrunnlag:

```text
docs/AHA_ANALYSIS_PIPELINE.md
= faktisk runtime-flyt for AHA Chat-analyse, fra sourceText til export bundle.

docs/SOURCE_GROUNDING.md
= kontrakten som skiller kildetekst, minne, chamber og UI/export-state.

docs/CACHE_AND_STATE.md
= localStorage, cache, auto-output, afterwork og state-regler.

docs/MEMORY_AND_CHAMBER.md
= grenser mellom source event, signal, insight, chamber og memory context.

docs/UI_EXPORT_FLOW.md
= Explorer, quality layer og eksportpakke.

docs/DEBUGGING.md
= praktisk feilsøking ved rar analyse eller kildeblanding.

docs/QUALITY_GATES.md
= shape, source binding, topic consistency, memory isolation og score ceilings.

docs/KNOWN_FAILURE_MODES.md
= kjente feilmodi som stale payload, stale afterwork, memory contamination og DOM mismatch.
```

## Kildeanalyse-regel

For alle analyser som presenteres som analyse av en konkret tekst:

```text
sourceText
→ sourceTextHash
→ source-bound analysis
→ source-bound afterwork
→ source-bound export
```

Chamber, personlig minne og meta-profil kan vises som egne lag, men de skal ikke overstyre AHA SER eller etterarbeid for gjeldende kilde.

## Fail-closed-prinsipp

Hvis AHA ikke kan verifisere at et analysefelt hører til gjeldende `sourceTextHash`, skal feltet ikke vises som fasit.

```text
Vis kilden.
Merk analysen som uverifisert.
Regenerer AHA SER / afterwork.
Ikke lagre ugyldig analyse som ny innsikt.
```