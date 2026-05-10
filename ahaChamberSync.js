// ahaChamberSync.js
// Holder localStorage-kammeret og Supabase i synk for innloggede brukere.
//
// Flyt:
//   - Lokale endringer publiserer "aha:chamber-saved" via
//     saveChamberToStorage. Dette modulen lytter, og pusher til
//     Supabase via AHARepository.saveChamber() med en kort debounce.
//   - Når brukeren logger inn fyrer ahaAuth "aha:auth-ready". Da
//     henter vi remote chamber. Hvis local er tomt og remote har
//     innhold, erstatter vi local. Hvis remote er tomt og local har
//     innhold, pusher vi local. Hvis begge har innhold sammenligner
//     vi tidsstempler ("last write wins").
//
// Hvis Supabase / repository / auth ikke er tilgjengelig oppfører
// modulen seg som en no-op. localStorage er fortsatt sann kilde.

(function (global) {
  "use strict";

  const CHAMBER_KEY = "aha_insight_chamber_v1";
  const PUSH_DEBOUNCE_MS = 1500;

  let pushTimer = null;
  let pushInflight = false;
  let pushPending = false;
  let lastPulledAt = null;

  function readLocal() {
    try {
      const raw = localStorage.getItem(CHAMBER_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.warn("AHAChamberSync: readLocal feilet", err);
      return null;
    }
  }

  function writeLocal(chamber) {
    try {
      localStorage.setItem(CHAMBER_KEY, JSON.stringify(chamber));
    } catch (err) {
      console.warn("AHAChamberSync: writeLocal feilet", err);
      return false;
    }
    try {
      global.dispatchEvent(new CustomEvent("aha:chamber-replaced", {
        detail: { source: "sync", insight_count: (chamber?.insights || []).length }
      }));
    } catch {}
    return true;
  }

  function insightCount(chamber) {
    return Array.isArray(chamber?.insights) ? chamber.insights.length : 0;
  }

  function isReady() {
    return Boolean(global.AHARepository?.saveChamber && global.AHARepository?.loadChamber);
  }

  function schedulePush() {
    if (!isReady()) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      pushNow();
    }, PUSH_DEBOUNCE_MS);
  }

  async function pushNow() {
    if (!isReady()) return { ok: false, reason: "no_repository" };
    if (pushInflight) {
      // Hvis et annet push allerede kjører, marker at vi vil pushe på nytt
      // når det fullfører — slik at den siste lagringen alltid synkes.
      pushPending = true;
      return { ok: false, reason: "inflight" };
    }
    const chamber = readLocal();
    if (!chamber) return { ok: false, reason: "no_local" };

    pushInflight = true;
    try {
      const result = await global.AHARepository.saveChamber(chamber);
      if (result?.ok) {
        try {
          global.dispatchEvent(new CustomEvent("aha:chamber-pushed", {
            detail: { insight_count: insightCount(chamber), at: result?.data?.updated_at || null }
          }));
        } catch {}
      } else if (result?.error) {
        console.warn("AHAChamberSync: push feilet", result.error);
      }
      return result;
    } finally {
      pushInflight = false;
      if (pushPending) {
        pushPending = false;
        schedulePush();
      }
    }
  }

  async function pull() {
    if (!isReady()) return { ok: false, reason: "no_repository" };

    const remoteResult = await global.AHARepository.loadChamber();
    if (!remoteResult?.ok) {
      if (remoteResult?.error) console.warn("AHAChamberSync: pull feilet", remoteResult.error);
      return remoteResult || { ok: false, reason: "no_data" };
    }

    const remoteRow = remoteResult.data || null;
    const remoteChamber = remoteRow?.chamber || null;
    const remoteUpdatedAt = remoteRow?.updated_at || null;
    const localChamber = readLocal();

    const remoteCount = insightCount(remoteChamber);
    const localCount = insightCount(localChamber);

    // Remote er fraværende eller helt tomt. Dyttbart.
    if (!remoteChamber || remoteCount === 0) {
      if (localCount > 0) schedulePush();
      lastPulledAt = remoteUpdatedAt;
      return { ok: true, action: "kept_local", remoteCount, localCount };
    }

    // Local er tomt — ta remote.
    if (localCount === 0) {
      writeLocal(remoteChamber);
      lastPulledAt = remoteUpdatedAt;
      return { ok: true, action: "replaced_local", remoteCount, localCount };
    }

    // Begge har innhold. Compare _local_updated_at vs remote updated_at.
    const localTs = localChamber._local_updated_at || null;
    const remoteTime = remoteUpdatedAt ? new Date(remoteUpdatedAt).getTime() : 0;
    const localTime = localTs ? new Date(localTs).getTime() : 0;

    if (localTime > remoteTime) {
      schedulePush();
      lastPulledAt = remoteUpdatedAt;
      return { ok: true, action: "pushed_local_newer", remoteCount, localCount };
    }

    writeLocal(remoteChamber);
    lastPulledAt = remoteUpdatedAt;
    return { ok: true, action: "replaced_local_remote_newer", remoteCount, localCount };
  }

  function onChamberSaved() {
    schedulePush();
  }

  function onAuthReady(event) {
    const user = event?.detail?.user;
    if (!user) return;
    pull().catch((err) => console.warn("AHAChamberSync: pull crashed", err));
  }

  global.addEventListener("aha:chamber-saved", onChamberSaved);
  global.addEventListener("aha:auth-ready", onAuthReady);

  global.AHAChamberSync = {
    pull,
    push: pushNow,
    schedulePush,
    isReady
  };
})(window);
