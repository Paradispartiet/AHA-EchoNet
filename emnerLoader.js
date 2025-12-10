// emnerLoader.js
// AHA leser emner direkte fra History GO-mappa

window.Emner = (function () {
  const EMNER_INDEX = {
    historie:       "/historygo/emner/emner_historie.json",
    by:             "/historygo/emner/emner_by.json",
    kunst:          "/historygo/emner/emner_kunst.json",
    musikk:         "/historygo/emner/emner_musikk.json",
    natur:          "/historygo/emner/emner_natur.json",
    vitenskap:      "/historygo/emner/emner_vitenskap.json",
    litteratur:     "/historygo/emner/emner_litteratur.json",
    populaerkultur: "/historygo/emner/emner_populaerkultur.json",
    naeringsliv:    "/historygo/emner/emner_naeringsliv.json"
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
