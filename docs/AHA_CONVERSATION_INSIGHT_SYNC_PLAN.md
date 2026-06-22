# AHA Conversation Insight Sync Plan


## Read-only AHA Sync Candidate Builder

`js/ahaSyncCandidateBuilder.js` bygger nå midlertidige sync-kandidater fra lokale source events ved å bruke `AHASyncChannelRouter.routeSourceEvent(sourceEvent)` mot `AHA_SYNC_CHANNELS`. Kandidatene er bare en lokal conversation insight sync-modell: de har `visibility: "local_only"`, `requiresUserConfirmation: true`, `confidence: "candidate"` og `createdFrom: "read_only_route_candidate"`.

Builderen lagrer ingen kandidater, skriver ikke til `localStorage`, leser ikke `localStorage` direkte, sender ingenting, gjør ingen `fetch`, endrer ikke DOM, kjører ingen ekte sync og aktiverer ikke EchoNet. Preview-labelen er trygg: den kan bruke kort `sourceEvent.title`, men bruker ikke rå `sourceEvent.text`. AHA Home viser bare en kompakt oppsummering av antall kandidater, antall som krever brukerbekreftelse, antall `local_only` og teller per kanal; full kandidatliste, rå brukerinnhold, metadata og brukeridentifikatorer vises ikke.

Dette er fortsatt conversation insight sync for samtaler, refleksjoner, begreper, spørsmål og perspektiver. Det er ikke prosjektstyring, og det legger ikke til eller bygger videre på `phase`, `priority`, `health`, `nextPr`, `repoStatus` eller `AHA_SYNC_HUB_PROJECTS`.

## Read-only AHA Sync Channel Preview

AHA Home viser nå en read-only route preview under `AHA_SYNC_CHANNELS`. Previewen leser eksisterende lokale AHA source events via den etablerte read-funksjonen, sender dem til `AHASyncChannelRouter.summarizeRoutes(sourceEvents)` og viser bare tellere per innsiktskanal samt antall ikke-routede source events.

Previewen viser ikke rå brukerinnhold, private meldinger, notattekst, rå metadata eller brukeridentifikatorer. Den skriver ikke routing-resultater, skriver ikke til `localStorage`, trigget ikke import, kjører ikke ekte sync, lager ingen backend og aktiverer ikke EchoNet. Dette er fortsatt conversation insight sync-preview: `AHA_SYNC_CHANNELS` er hovedmodellen, mens `AHA_SYNC_HUB_PROJECTS` fortsatt bare er legacy fallback / utviklingspreview.

## Read-only AHA Sync Channel Router

`js/ahaSyncChannelRouter.js` er første rene bro mellom AHA source events / samtaleinput og `AHA_SYNC_CHANNELS`. Routeren eksponerer `window.AHASyncChannelRouter`, leser kanalregisteret read-only og lager bare kandidatrouting for samtaleinnsikter, åpne spørsmål, begrepskoblinger, perspektiver, spenninger og samtalekoblinger.

Routeren skriver ikke data, leser ikke eller skriver `localStorage`, gjør ingen `fetch`, endrer ikke DOM og kjører ingen ekte sync. Den aktiverer ikke EchoNet og bygger ikke backend; den gir bare trygg klassifiseringslogikk som senere conversation insight sync kan bygge videre på.

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
