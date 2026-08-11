// AHA Insight Availability Bridge
// Makes explicit user rejection compatible with older Lists/Paths availability checks.
// No new store: adds/restores the existing `archived` availability marker on the same canonical insight.
(function (global) {
  "use strict";

  const CHAMBER_KEY = "aha_insight_chamber_v1";
  const MARKER = "user_quality_unavailable";

  function arr(value) { return Array.isArray(value) ? value : []; }

  function loadChamber() {
    try {
      if (typeof global.loadChamberFromStorage === "function") return global.loadChamberFromStorage();
      const raw = global.localStorage?.getItem?.(CHAMBER_KEY);
      const parsed = raw ? JSON.parse(raw) : { insights: [] };
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { insights: [] };
    } catch {
      return { insights: [] };
    }
  }

  function saveChamber(chamber) {
    try {
      chamber._local_updated_at = new Date().toISOString();
      if (typeof global.saveChamberToStorage === "function") global.saveChamberToStorage(chamber);
      else global.localStorage?.setItem?.(CHAMBER_KEY, JSON.stringify(chamber));
      return true;
    } catch {
      return false;
    }
  }

  function reconcile(chamberArg) {
    const chamber = chamberArg || loadChamber();
    let changed = 0;
    arr(chamber?.insights).forEach((insight) => {
      if (!insight || typeof insight !== "object") return;
      const userRejected = String(insight.status || "").toLowerCase() === "rejected" && insight.rejection_reason === "user_not_insight";
      if (userRejected && insight[MARKER] !== true) {
        insight.user_quality_archived_before = insight.archived === true;
        insight.archived = true;
        insight[MARKER] = true;
        changed += 1;
        return;
      }
      if (!userRejected && insight[MARKER] === true) {
        if (insight.user_quality_archived_before === true) insight.archived = true;
        else delete insight.archived;
        delete insight.user_quality_archived_before;
        delete insight[MARKER];
        changed += 1;
      }
    });
    if (changed) saveChamber(chamber);
    return { changed, chamber };
  }

  function init() {
    reconcile();
    global.addEventListener?.("aha:insight-quality-feedback", () => reconcile());
  }

  const api = { CHAMBER_KEY, MARKER, loadChamber, saveChamber, reconcile, init };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AHAInsightAvailabilityBridge = api;
  init();
})(typeof window !== "undefined" ? window : globalThis);