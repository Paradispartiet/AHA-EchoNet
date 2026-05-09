// theoryClustersLoader.js
// Henter theoryClusters.json og injiserer klyngene inn i
// MetaInsightsEngine. Holder lasting og fallback-logikk på ett sted
// så vi ikke må endre kode hvis vi senere vil flytte JSON-filen til
// Supabase eller liknende.

(function (global) {
  "use strict";

  const URL = "/theoryClusters.json";
  let _cache = null;
  let _pending = null;

  async function load() {
    if (_cache) return _cache;
    if (_pending) return _pending;

    _pending = fetch(URL)
      .then((res) => {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then((data) => {
        const clusters = Array.isArray(data?.clusters) ? data.clusters : [];
        _cache = clusters;
        if (global.MetaInsightsEngine?.setTheoryClusters) {
          global.MetaInsightsEngine.setTheoryClusters(clusters);
        }
        try {
          global.dispatchEvent(new CustomEvent("aha:theory-clusters-loaded", {
            detail: { count: clusters.length }
          }));
        } catch {}
        return clusters;
      })
      .catch((err) => {
        console.warn("TheoryClustersLoader: kunne ikke laste", URL, err);
        _cache = [];
        return _cache;
      })
      .finally(() => {
        _pending = null;
      });

    return _pending;
  }

  function getLoaded() {
    return _cache;
  }

  global.TheoryClustersLoader = { load, getLoaded };

  // Last automatisk når script kjøres i nettleseren.
  if (typeof window !== "undefined" && typeof fetch === "function") {
    load();
  }
})(typeof window !== "undefined" ? window : globalThis);
