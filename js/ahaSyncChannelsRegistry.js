// ahaSyncChannelsRegistry.js

(function () {
  "use strict";

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
}());
