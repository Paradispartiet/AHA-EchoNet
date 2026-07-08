// ahaSyncChannelsRegistry.js

(function () {
  "use strict";

  window.AHA_SYNC_CHANNELS = [
    {
      id: "conversation-insights",
      name: "Samtaleinnsikter",
      purpose: "Fanger opp innsikter som oppstår i samtaler.",
      inputTypes: ["chat", "notes", "reflection"],
            local_only: true,
      planned_only: true,
      dry_run_only: true,
      sync_enabled: false,
      echonet_enabled: false,
      syncMeaning: "Innsikt kan kobles videre til begreper, spørsmål og andre samtaler."
    },
    {
      id: "open-questions",
      name: "Åpne spørsmål",
      purpose: "Holder på spørsmål som ikke er ferdig avklart.",
      inputTypes: ["chat", "notes", "group"],
            local_only: true,
      planned_only: true,
      dry_run_only: true,
      sync_enabled: false,
      echonet_enabled: false,
      syncMeaning: "Spørsmål kan dukke opp igjen og kobles på tvers av samtaler."
    },
    {
      id: "concept-links",
      name: "Begrepskoblinger",
      purpose: "Kobler begreper som går igjen på tvers av kilder.",
      inputTypes: ["chat", "source_event", "import"],
            local_only: true,
      planned_only: true,
      dry_run_only: true,
      sync_enabled: false,
      echonet_enabled: false,
      syncMeaning: "Begreper kan bli lokale konseptuelle broer mellom samtaler i en senere eksplisitt kontrakt."
    },
    {
      id: "perspectives",
      name: "Perspektiver",
      purpose: "Synliggjør ulike ståsteder og tolkninger.",
      inputTypes: ["chat", "group", "reflection"],
            local_only: true,
      planned_only: true,
      dry_run_only: true,
      sync_enabled: false,
      echonet_enabled: false,
      syncMeaning: "Ulike perspektiver kan sammenlignes uten å gjøres like."
    },
    {
      id: "tensions",
      name: "Uenigheter og spenninger",
      purpose: "Fanger opp fruktbare konflikter og motsetninger.",
      inputTypes: ["chat", "group", "discussion"],
            local_only: true,
      planned_only: true,
      dry_run_only: true,
      sync_enabled: false,
      echonet_enabled: false,
      syncMeaning: "Uenighet kan bli en strukturert innsiktskilde, ikke bare støy."
    },
    {
      id: "conversation-links",
      name: "Samtalekoblinger",
      purpose: "Kobler samtaler som berører samme spørsmål, begrep eller innsikt.",
      inputTypes: ["chat", "source_event"],
            local_only: true,
      planned_only: true,
      dry_run_only: true,
      sync_enabled: false,
      echonet_enabled: false,
      syncMeaning: "Samtaler kan finne hverandre gjennom felles mening."
    }
  ];
}());
