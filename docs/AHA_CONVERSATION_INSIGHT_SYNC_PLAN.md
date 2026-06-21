# AHA Conversation Insight Sync Plan

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

Første riktige modell kan være statisk/read-only og bestå av:

```js
window.AHA_SYNC_CHANNELS = [
  {
    id: "conversation-insights",
    name: "Samtaleinnsikter",
    purpose: "Fanger opp innsikter som oppstår i samtaler."
  },
  {
    id: "open-questions",
    name: "Åpne spørsmål",
    purpose: "Holder på spørsmål som ikke er ferdig avklart."
  },
  {
    id: "concept-links",
    name: "Begrepskoblinger",
    purpose: "Kobler begreper som går igjen på tvers av kilder."
  },
  {
    id: "perspectives",
    name: "Perspektiver",
    purpose: "Synliggjør ulike ståsteder og tolkninger."
  },
  {
    id: "tensions",
    name: "Uenigheter og spenninger",
    purpose: "Fanger opp fruktbare konflikter og motsetninger."
  }
];
```

## Neste riktige PR etter denne dokumentasjonslåsen

Neste kode-PR skal ikke utvide `AHA_SYNC_HUB_PROJECTS`.

Neste kode-PR bør enten:

1. lage en read-only `AHA_SYNC_CHANNELS` registry, eller
2. endre Sync Hub-panelet slik at det viser innsiktskanaler i stedet for prosjektstyring.

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
