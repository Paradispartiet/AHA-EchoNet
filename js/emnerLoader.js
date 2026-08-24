// emnerLoader.js
// Compatibility API. Canonical emner eies av History-Go Fagverk og lastes
// gjennom AHASubjectEngine. Denne filen skal ikke vedlikeholde en egen fagliste.

window.Emner = (function () {
  async function loadForSubject(subjectId) {
    const id = String(subjectId || "").trim();
    if (!id) return [];
    if (!window.AHASubjectEngine?.loadSubject) {
      console.warn("Emner: AHASubjectEngine is unavailable; canonical Fagverk fails closed.");
      return [];
    }
    try {
      const subject = await window.AHASubjectEngine.loadSubject(id);
      return Array.isArray(subject?.emner) ? subject.emner : [];
    } catch (err) {
      console.warn("Emner: could not load canonical History-Go subject", id, err);
      return [];
    }
  }

  async function listSubjects() {
    if (!window.AHASubjectEngine?.listSubjects) return [];
    try {
      return await window.AHASubjectEngine.listSubjects();
    } catch (err) {
      console.warn("Emner: canonical History-Go subject inventory unavailable", err);
      return [];
    }
  }

  return { loadForSubject, listSubjects };
})();
