// emnerLoader.js
// Felles, enkel loader for emne-filer (History Go / AHA)

window.Emner = (function () {
  const EMNER_INDEX = {
    historie:       "/emner/emner_historie.json",
    by:             "/emner/emner_by.json",
    kunst:          "/emner/emner_kunst.json",
    musikk:         "/emner/emner_musikk.json",
    natur:          "/emner/emner_natur.json",
    vitenskap:      "/emner/emner_vitenskap.json",
    litteratur:     "/emner/emner_litteratur.json",
    populaerkultur: "/emner/emner_populaerkultur.json",
    naeringsliv:    "/emner/emner_naeringsliv.json",

    // de som manglet før:
    sport:          "/emner/emner_sport.json",
    politikk:       "/emner/emner_politikk.json",
    subkultur:      "/emner/emner_subkultur.json",
    psykologi:      "/emner/emner_psykologi.json"   // NY
  };

  async function loadForSubject(subjectId) {
    const url = EMNER_INDEX[subjectId];
    if (!url) return [];
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("Kunne ikke laste emner for", subjectId, res.status);
      return [];
    }
    return res.json();
  }

  return { loadForSubject };
})();
