// ahaSyncHubRegistry.js

(function () {
  "use strict";

  window.AHA_SYNC_HUB_PROJECTS = [
    {
      id: "history-go",
      name: "History Go",
      status: "read/import boundary",
      role: "Separat arena / mulig senere lesekilde",
      source: "History Go eksport/import-grense",
      note: "Sync Hub kan bare dokumentere en framtidig read/import boundary. Ingen sync, backend, datadeling eller write-back til History Go er aktivert.",
      next: "Behold History Go som separat arena; eventuell lesing/import krever eksplisitt kontrakt og skal ikke skrive tilbake."
    },
    {
      id: "civication",
      name: "Civication",
      status: "på vent",
      role: "Samfunnsstruktur / læringssystem",
      source: "Civication-prosjektet",
      note: "På vent og ikke koblet til AHA-runtime, Sync Hub, backend eller dataflyt.",
      next: "Lage ren strukturkartlegging før videre kode; ikke koble til AHA runtime."
    },
    {
      id: "hg-film-producer",
      name: "HG Film Producer",
      status: "prototype",
      role: "Filmstudio-simulator / filmhistorie",
      source: "HG Film Producer-prosjektet",
      note: "Idé / prototype uten Sync Hub-dataflyt.",
      next: "Definere første scenariomodell for filmproduksjon uten backend- eller sync-kobling."
    },
    {
      id: "paradispartiet",
      name: "Paradispartiet",
      status: "grunnlag",
      role: "Innholdsgrunnlag / idébank",
      source: "Paradispartiet-nettsiden",
      note: "Innholdsgrunnlag; ingen aktiv Sync Hub-rute eller ekstern deling.",
      next: "Bruke som innholdsgrunnlag og kildebank uten automatisk sync."
    },
    {
      id: "aha-home",
      name: "AHA Home",
      status: "local-only statusflate",
      role: "Kontrollrom / lokal oversikt",
      source: "AHA Home",
      note: "Viser lokale planlagte/no-op statuser; ingen backend, auto-sync eller datadeling.",
      next: "Holde Sync Hub som local-only dry-run/review-overflate."
    },
    {
      id: "echonet",
      name: "EchoNet",
      status: "senere",
      role: "Kollektivt lag senere",
      source: "Planlagt senere fase",
      note: "Ikke aktivert. Ingen data deles, ingen sync kjører og ingen backend er koblet til EchoNet.",
      next: "Avvente eksplisitt produkt-, backend-, personvern-, samtykke- og delingskontrakt før aktivering."
    }
  ];
}());
