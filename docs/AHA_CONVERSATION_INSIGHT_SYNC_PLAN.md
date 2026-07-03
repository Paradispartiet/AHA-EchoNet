
## Compact AHA Sync Overview layout

AHA Sync Overview er nå ytterligere kompaktert for en mer produktklar read-only/local-only flate. Toppen viser en synlig statuslinje med `Lokal forhåndsvisning · read-only · local-only · ingen sync · ingen rå brukerdata`, og hovedraden samler eksisterende counts fra digest/review/coverage uten å legge til nye metrics.

Tunge detaljer som review queue, kildetyper/source types, kilde-kanal-matrise/channel-source matrix, coverage gaps/dekningshull og forklaring/legend kan foldes ut med `<details>`. Overviewet viser fortsatt bare trygge counts, labels og generiske linjer fra `AHA_SYNC_CHANNELS`; ingen rå brukerdata, private URL-er, router reasons eller candidate labels vises.

Det er ikke lagt til backend, ekte sync, approval-modell, approve/reject-actions, sync-knapp, EchoNet-runtime eller ny confirmation gate. Personal AI Loop source approval boundary er fortsatt sikkerhetsmodellen, og Sync er fortsatt **NO-GO**.

# AHA Conversation Insight Sync Plan

## V1/V2/EchoNet boundary

### 1. Ferdig V1: AHA Conversation Insight Snapshot V1 — local understanding layer

AHA Conversation Insight Snapshot V1 is frozen as the local read-only/no-sync understanding layer for one current conversation or analysis. It includes the builder, preview, summary, structured signals, concepts, open questions, perspectives, tensions, conversation links, `nextUnderstandingSteps`, quality summary, safety flags, and the global snapshot safety gate.

This finished V1 is not AHA Sync Overview V1. AHA Sync Overview V1 remains unchanged as a local overview for source-event coverage and patterns. Snapshot V1 does not run sync, write data, add approve/reject-actions, show raw user data, return private URLs or user identifiers, activate EchoNet, or introduce backend storage.

### 2. Mulig senere V2: user-reviewed insight preparation

A possible later V2 can only be described as `user-reviewed insight preparation`. That would mean user-reviewed, editable preparation of safe insight candidates inside the same safety boundary before any future action is considered. V2 is not started, approval actions do not exist, sync does not exist, and EchoNet is not activated.

### 3. Ikke nå: EchoNet/network sync

EchoNet/network sync is explicitly not now. There is no EchoNet runtime, no network sync, no publish/share, no backend contract, and no approval workflow in this plan.

## Consolidated read-only AHA Sync Overview

## AHA Sync Overview legend / forklaring

AHA Sync Overview har nå en kompakt read-only/local-only forklaring med tittelen “Hva betyr dette?”. Legenden forklarer kanaler fra `AHA_SYNC_CHANNELS`, trygge kildetyper/counts (`chat`, `note`, `reflection`, `url_article`, `import`, `source_event`, `unknown`), kilde-kanal-matrise og dekningshull. URL-artikler omtales bare som `url_article`, ikke som rå URL eller artikkeltekst.

Legenden viser ikke rå brukerdata og legger ikke til sync, approval, backend, EchoNet-runtime eller ny confirmation gate. Sync er fortsatt **NO-GO**. `AHA_SYNC_CHANNELS` er fortsatt hovedmodell, og Personal AI Loop source approval boundary er fortsatt sikkerhetsmodell.


## Read-only AHA Sync Coverage Gaps Summary

✅ AHA Sync Coverage Gaps safety: test-locked

AHA Sync Overview har nå coverage gaps / dekningshull som read-only/local-only summary. Coverage gaps viser bare aktive/tomme `AHA_SYNC_CHANNELS` og aktive/manglende source-event-typer som counts/labels-only. URL-artikler vises bare som `url_article`/count.

Coverage gaps viser no raw user data / ingen rå brukerdata: ingen rå tekst, URL-er, metadata, router reasons, candidate labels eller brukeridentifikatorer. Flaten har ingen approve/reject/sync-action, ingen ny confirmation gate og ingen prosjektstyringsfelt. Sync er fortsatt **NO-GO** / no sync, og Personal AI Loop source approval boundary er fortsatt sikkerhetsmodellen.

## Read-only AHA Sync Source Type Summary

AHA Sync Overview viser nå en liten read-only/local-only source type summary for lokale source events. Summaryen viser bare trygge counts per canonical source-event-type, inkludert chat, note, reflection, url_article, import, source_event og unknown. URL-artikler telles som source actions / `url_article`, ikke som rå URL-tekst.

Summaryen viser ikke raw source text, URL-er, titles, metadata, brukeridentifikatorer eller rå brukerdata (no raw user data). Den skriver ingenting, sender ingenting, kjører ingen sync og lager ingen backend. Sync er fortsatt **NO-GO**. `AHA_SYNC_CHANNELS` er fortsatt hovedmodellen, og Personal AI Loop source approval boundary er fortsatt sikkerhetsmodellen.

AHA Home viser nå én samlet `AHA Sync Overview` i Sync Hub-flaten. Overviewet konsoliderer eksisterende read-only signaler fra digest, review queue, readiness og channel counts i stedet for å presentere dem som mange separate debugpaneler.

Overviewet viser bare trygge counts, booleans, generiske linjer og kanalnavn. Det viser ikke rå brukerdata, full source events, full candidates, private payloads, private metadata eller private URL-er. Ingen approval-action finnes i overviewet, ingen approve/reject-knapper rendres, ingen sync-knapp rendres, ingen localStorage-skriving skjer, ingen backend kalles, og Sync er fortsatt NO-GO.

`AHA_SYNC_CHANNELS` er fortsatt hovedmodellen for conversation insight sync-preview. Personal AI Loop source approval boundary (`personal_ai_loop_source_approval`) er fortsatt sikkerhetsmodellen for kandidater og senere eksplisitt brukerhandling.

## AHA Sync status

Gjeldende AHA Sync-status er read-only/local-only og fortsatt **NO-GO** for ekte sync:

- Channels registry finnes (`AHA_SYNC_CHANNELS`).
- Router finnes (`AHASyncChannelRouter`).
- Candidate builder finnes (`AHASyncCandidateBuilder`).
- Approval summary finnes via eksisterende Personal AI Loop source approval boundary.
- Candidates by channel finnes.
- Signal summary finnes.
- Insight digest finnes.
- Review queue finnes.
- Readiness summary finnes.
- Safety tests finnes.
- Sync er fortsatt **NO-GO**.
- Approval action er fortsatt ikke implementert.
- Alt er read-only/local-only.

Dette er ikke prosjektstyring og legger ikke til phase/priority/roadmap-felter.

## Read-only AHA sync candidate approval summary

AHA Home viser nå en kompakt, redigert og lokal-only approval summary for AHA sync candidates under Sync Hub-previewen. Summaryen gjenbruker den eksisterende Personal AI Loop source approval-boundaryen via `buildPersonalAiLoopSourceApprovalSummary(...)`; det finnes ingen separat sync confirmation gate, ingen ny approvalmodell og ingen dupliserte source approval states.

Alle sync-kandidater starter fortsatt som `approvalState: "suggested"` innenfor `approvalBoundary: "personal_ai_loop_source_approval"`. Ingen kandidat blir automatisk `approved`, ingen kandidat lagres, ingen sync kjøres, og UI-et viser ikke rå brukerdata, raw payload, metadata eller full kandidatliste. AHA Home sender bare kompakte felter som id, state, safe label, type, category, risk, reason og blocker inn i den eksisterende Personal AI Loop-oppsummeringen.

Riktig runtime-grense er fortsatt:

```text
source event
→ AHASyncChannelRouter
→ AHASyncCandidateBuilder
→ existing Personal AI Loop source approval boundary
→ compact/redacted local-only approval summary
→ explicit user action required later
→ først senere kan sync vurderes
```




## Read-only AHA Sync Insight Digest

`js/ahaSyncInsightDigest.js` bygger nå en compact/read-only digest for AHA Home fra eksisterende lokale source events, `AHASyncChannelRouter` og `AHASyncCandidateBuilder`. Digesten viser bare trygge tellere, boolean-signaler og generiske linjer for aktive innsiktskanaler, åpne spørsmål, begrepskoblinger, perspektiver, spenninger og samtalekoblinger.

Digesten er ikke ekte sync, deling, EchoNet eller prosjektstatus. Den skriver ikke til `localStorage`, sender ikke data, viser ikke rå `sourceEvent.text`, lager ingen backend og bruker fortsatt eksisterende Personal AI Loop source approval boundary: `personal_ai_loop_source_approval`.

## Read-only AHA Sync Candidate Builder

`js/ahaSyncCandidateBuilder.js` bygger nå midlertidige sync-kandidater fra lokale source events ved å bruke `AHASyncChannelRouter.routeSourceEvent(sourceEvent)` mot `AHA_SYNC_CHANNELS`. Kandidatene er bare en lokal conversation insight sync-modell: de har `visibility: "local_only"`, `requiresUserConfirmation: true`, `confidence: "candidate"`, `createdFrom: "read_only_route_candidate"`, `approvalBoundary: "personal_ai_loop_source_approval"` og `approvalState: "suggested"`.

Builderen lagrer ingen kandidater, skriver ikke til `localStorage`, leser ikke `localStorage` direkte, sender ingenting, gjør ingen `fetch`, endrer ikke DOM, kjører ingen ekte sync og aktiverer ikke EchoNet. Preview-labelen er trygg: den kan bruke kort `sourceEvent.title`, men bruker ikke rå `sourceEvent.text`. AHA Home viser bare en kompakt oppsummering av antall kandidater, antall som krever brukerbekreftelse, antall `local_only` og teller per kanal; full kandidatliste, rå brukerinnhold, metadata og brukeridentifikatorer vises ikke.

Dette er fortsatt conversation insight sync for samtaler, refleksjoner, begreper, spørsmål og perspektiver. Det er ikke prosjektstyring, og det legger ikke til eller bygger videre på `phase`, `priority`, `health`, `nextPr`, `repoStatus` eller `AHA_SYNC_HUB_PROJECTS`.

## Read-only AHA Sync Channel Preview

AHA Home viser nå en read-only route preview under `AHA_SYNC_CHANNELS`. Previewen leser eksisterende lokale AHA source events via den etablerte read-funksjonen, sender dem til `AHASyncChannelRouter.summarizeRoutes(sourceEvents)` og viser bare tellere per innsiktskanal samt antall ikke-routede source events.

Previewen viser ikke rå brukerinnhold, private meldinger, notattekst, rå metadata eller brukeridentifikatorer. Den skriver ikke routing-resultater, skriver ikke til `localStorage`, trigget ikke import, kjører ikke ekte sync, lager ingen backend og aktiverer ikke EchoNet. Dette er fortsatt conversation insight sync-preview: `AHA_SYNC_CHANNELS` er hovedmodellen, mens `AHA_SYNC_HUB_PROJECTS` fortsatt bare er legacy fallback / utviklingspreview.

## Read-only AHA Sync Channel Router

`js/ahaSyncChannelRouter.js` er første rene bro mellom AHA source events / samtaleinput og `AHA_SYNC_CHANNELS`. Routeren eksponerer `window.AHASyncChannelRouter`, leser kanalregisteret read-only og lager bare kandidatrouting for samtaleinnsikter, åpne spørsmål, begrepskoblinger, perspektiver, spenninger og samtalekoblinger.

Routeren skriver ikke data, leser ikke eller skriver `localStorage`, gjør ingen `fetch`, endrer ikke DOM og kjører ingen ekte sync. Den aktiverer ikke EchoNet og bygger ikke backend; den gir bare trygg klassifiseringslogikk som senere conversation insight sync kan bygge videre på.

## Approval boundary

AHA Sync skal ikke ha en parallell confirmation gate.

Sync candidates skal behandles som source approval candidates og følge eksisterende Personal AI Loop source approval-regler:

- local-only
- explicit-action only
- compact/redacted only
- no raw private payload
- no write
- no sync
- no publish/share
- fail closed ved missing/unknown state

Allowed/blocked-state-modellen skal gjenbrukes fra:

[`docs/AHA_PERSONAL_AI_LOOP_SOURCE_APPROVAL_SURFACE.md`](./AHA_PERSONAL_AI_LOOP_SOURCE_APPROVAL_SURFACE.md)

Riktig flyt:

```text
source event
→ AHASyncChannelRouter
→ AHASyncCandidateBuilder
→ existing Personal AI Loop source approval boundary
→ explicit user action required later
→ først senere kan sync vurderes
```

## Formål

AHA Sync skal koble innsikter på tvers av samtaler, kilder og senere brukere.

Dette dokumentet erstatter videre arbeid på prosjektstatus-sporet.

## Ikke dette

AHA Sync skal ikke være:

* prosjektstyring
* repo-status
* phase/priority-dashboard
* intern todo-liste
* utviklerens notatblokk
* EchoNet-aktivering

## Dette

AHA Sync skal etter hvert håndtere:

* conversation insights
* source events
* open questions
* recurring concepts
* perspectives
* tensions / disagreements
* links between conversations
* user-confirmed insight links
* group-level insight surfaces

## Første read-only modell

Første riktige modell finnes nå som `js/ahaSyncChannelsRegistry.js` og eksponerer `window.AHA_SYNC_CHANNELS` som plain browser global. Dette er en read-only modell for conversation insight sync; den lager ingen backend, kjører ingen ekte sync og skriver ikke til `localStorage`.

Modellen består av:

```js
window.AHA_SYNC_CHANNELS = [
  {
    id: "conversation-insights",
    name: "Samtaleinnsikter",
    purpose: "Fanger opp innsikter som oppstår i samtaler.",
    inputTypes: ["chat", "notes", "reflection"],
    syncMeaning: "Innsikt kan kobles videre til begreper, spørsmål og andre samtaler."
  },
  {
    id: "open-questions",
    name: "Åpne spørsmål",
    purpose: "Holder på spørsmål som ikke er ferdig avklart.",
    inputTypes: ["chat", "notes", "group"],
    syncMeaning: "Spørsmål kan dukke opp igjen og kobles på tvers av samtaler."
  },
  {
    id: "concept-links",
    name: "Begrepskoblinger",
    purpose: "Kobler begreper som går igjen på tvers av kilder.",
    inputTypes: ["chat", "source_event", "import"],
    syncMeaning: "Begreper kan bli broer mellom samtaler og brukere."
  },
  {
    id: "perspectives",
    name: "Perspektiver",
    purpose: "Synliggjør ulike ståsteder og tolkninger.",
    inputTypes: ["chat", "group", "reflection"],
    syncMeaning: "Ulike perspektiver kan sammenlignes uten å gjøres like."
  },
  {
    id: "tensions",
    name: "Uenigheter og spenninger",
    purpose: "Fanger opp fruktbare konflikter og motsetninger.",
    inputTypes: ["chat", "group", "discussion"],
    syncMeaning: "Uenighet kan bli en strukturert innsiktskilde, ikke bare støy."
  },
  {
    id: "conversation-links",
    name: "Samtalekoblinger",
    purpose: "Kobler samtaler som berører samme spørsmål, begrep eller innsikt.",
    inputTypes: ["chat", "source_event"],
    syncMeaning: "Samtaler kan finne hverandre gjennom felles mening."
  }
];
```

## Videre arbeid etter første read-only registry

Videre kode skal ikke utvide `AHA_SYNC_HUB_PROJECTS`.

AHA Home skal bruke `AHA_SYNC_CHANNELS` som hovedmodell når registeret finnes. `AHA_SYNC_HUB_PROJECTS` er kun legacy utviklingspreview/fallback hvis kanalregisteret mangler eller er tomt.

## Stop-regel

Ikke legg til disse feltene i AHA Sync Hub som produktmodell:

* phase
* priority
* health
* nextPr
* repoStatus
* buildStage
* projectRoadmap

Slike felter hører hjemme i intern prosjektledelse, ikke i AHA.


### Read-only channel-source matrix

AHA Sync Overview viser nå hvilke trygge source-event-typer som teller mot `AHA_SYNC_CHANNELS` gjennom en counts-only channel-source matrix. URL-artikler representeres bare som `url_article`/count, aldri som rå URL eller artikkeltekst. Matrisen eksponerer ikke raw source text, metadata eller brukeridentifikatorer, og den kjører ingen sync. Sync er fortsatt NO-GO, `AHA_SYNC_CHANNELS` er hovedmodellen, og Personal AI Loop source approval boundary er sikkerhetsmodellen.
