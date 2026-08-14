// Keeps superseded, contested and otherwise inactive insights out of active memory retrieval.
(function (global) {
  "use strict";

  const VERSION = "aha_memory_retrieval_guard_v1";
  const INACTIVE_STATES = new Set(["superseded", "contested", "stale", "irrelevant"]);
  const asText = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();

  function isActiveMemoryInsight(insight) {
    if (!insight || insight.archived || insight.deleted || insight.deleted_at || insight.deletedAt || insight.rejected || insight.merged_into) return false;
    if (asText(insight.status).toLowerCase() === "rejected") return false;
    return !INACTIVE_STATES.has(asText(insight.memory_status || insight.memoryStatus).toLowerCase());
  }

  function activeChamber(chamber) {
    if (!chamber || typeof chamber !== "object" || !Array.isArray(chamber.insights)) return chamber;
    const activeInsights = chamber.insights.filter(isActiveMemoryInsight);
    if (activeInsights.length === chamber.insights.length) return chamber;
    return {
      ...chamber,
      insights: activeInsights,
      memory_retrieval_guard: {
        version: VERSION,
        active_count: activeInsights.length,
        audit_count: chamber.insights.length,
        filtered_count: chamber.insights.length - activeInsights.length,
        local_only: true
      }
    };
  }

  function insightIndex(chamber) {
    const map = new Map();
    (Array.isArray(chamber?.insights) ? chamber.insights : []).forEach((insight) => {
      const id = asText(insight?.id);
      if (id) map.set(id, insight);
    });
    return map;
  }

  function filterActiveMatches(matches, chamber, options = {}) {
    if (!Array.isArray(matches) || !matches.length) return matches || [];
    if (!chamber || !Array.isArray(chamber.insights)) return matches;
    const byId = insightIndex(chamber);
    const allowUnknown = options.allowUnknown === true;
    return matches.filter((match) => {
      const id = asText(match?.id || match?.insight_id || match?.insightId);
      if (!id) return false;
      const insight = byId.get(id);
      return insight ? isActiveMemoryInsight(insight) : allowUnknown;
    });
  }

  function filterResult(result, chamber, limit) {
    if (!result || typeof result !== "object" || !Array.isArray(result.matches)) return result;
    const matches = filterActiveMatches(result.matches, chamber);
    const safeLimit = Number.isFinite(Number(limit)) ? Math.max(0, Number(limit)) : null;
    return {
      ...result,
      matches: safeLimit == null ? matches : matches.slice(0, safeLimit),
      memoryGuard: {
        version: VERSION,
        returned: safeLimit == null ? matches.length : Math.min(matches.length, safeLimit),
        filtered: result.matches.length - matches.length,
        local_only: true
      }
    };
  }

  function inactiveResult(reason, insight) {
    return {
      ok: false,
      reason,
      insight_id: asText(insight?.id),
      memory_status: asText(insight?.memory_status || insight?.memoryStatus || "inactive"),
      memoryGuard: { version: VERSION, local_only: true }
    };
  }

  function guardInsightsEngine(engineArg) {
    const engine = engineArg || global.InsightsEngine;
    if (!engine || typeof engine.getActiveInsights !== "function") return { ok: false, reason: "insights_engine_unavailable" };
    if (engine.__ahaMemoryRetrievalGuard === VERSION) return { ok: true, alreadyInstalled: true, engine };
    const original = engine.getActiveInsights.bind(engine);
    engine.getActiveInsights = function guardedGetActiveInsights(chamber, ...args) {
      const result = original(chamber, ...args);
      return Array.isArray(result) ? result.filter(isActiveMemoryInsight) : result;
    };
    Object.defineProperty(engine, "__ahaMemoryRetrievalGuard", { value: VERSION, enumerable: false, configurable: false });
    return { ok: true, engine, original };
  }

  function install(apiArg) {
    const api = apiArg || global.AHAEmbeddings;
    if (!api || typeof api !== "object") return { ok: false, reason: "embeddings_unavailable" };
    if (api.__ahaMemoryRetrievalGuard === VERSION) return { ok: true, alreadyInstalled: true, api };

    const originals = {};
    [
      "embedAndStore", "embedAllPending", "findSimilarToText", "findSimilarToInsight",
      "findMergeCandidate", "calibrateMergeThresholdsForChamber"
    ].forEach((name) => {
      if (typeof api[name] === "function") originals[name] = api[name].bind(api);
    });

    if (originals.embedAndStore) {
      api.embedAndStore = async function guardedEmbedAndStore(insight, ...args) {
        if (!isActiveMemoryInsight(insight)) return inactiveResult("inactive_memory", insight);
        return originals.embedAndStore(insight, ...args);
      };
    }

    if (originals.embedAllPending) {
      api.embedAllPending = async function guardedEmbedAllPending(chamber, options) {
        return originals.embedAllPending(activeChamber(chamber), options);
      };
    }

    if (originals.findSimilarToText) {
      api.findSimilarToText = async function guardedFindSimilarToText(query, options) {
        const opts = options && typeof options === "object" ? { ...options } : {};
        const originalChamber = opts.chamber;
        if (originalChamber) opts.chamber = activeChamber(originalChamber);
        const result = await originals.findSimilarToText(query, opts);
        return filterResult(result, originalChamber, opts.limit);
      };
    }

    if (originals.findSimilarToInsight) {
      api.findSimilarToInsight = async function guardedFindSimilarToInsight(insightId, options) {
        const opts = options && typeof options === "object" ? { ...options } : {};
        const originalChamber = opts.chamber;
        if (originalChamber) {
          const source = insightIndex(originalChamber).get(asText(insightId));
          if (source && !isActiveMemoryInsight(source)) return inactiveResult("inactive_source_memory", source);
          opts.chamber = activeChamber(originalChamber);
        }
        const result = await originals.findSimilarToInsight(insightId, opts);
        return filterResult(result, originalChamber, opts.limit);
      };
    }

    if (originals.findMergeCandidate) {
      api.findMergeCandidate = async function guardedFindMergeCandidate(insight, chamber, options) {
        if (!isActiveMemoryInsight(insight)) return inactiveResult("inactive_source_memory", insight);
        const result = await originals.findMergeCandidate(insight, activeChamber(chamber), options);
        if (result?.ok && !isActiveMemoryInsight(result.candidate)) {
          return { ok: false, reason: "inactive_candidate", threshold: result.threshold, memoryGuard: { version: VERSION, local_only: true } };
        }
        return result;
      };
    }

    if (originals.calibrateMergeThresholdsForChamber) {
      api.calibrateMergeThresholdsForChamber = async function guardedCalibration(chamber, options) {
        return originals.calibrateMergeThresholdsForChamber(activeChamber(chamber), options);
      };
    }

    Object.defineProperties(api, {
      isActiveMemoryInsight: { value: isActiveMemoryInsight, enumerable: true, configurable: true },
      activeChamber: { value: activeChamber, enumerable: true, configurable: true },
      filterActiveMatches: { value: filterActiveMatches, enumerable: true, configurable: true },
      __ahaMemoryRetrievalGuard: { value: VERSION, enumerable: false, configurable: false }
    });

    return { ok: true, api, originals: Object.freeze(originals) };
  }

  const publicApi = Object.freeze({ VERSION, isActiveMemoryInsight, activeChamber, filterActiveMatches, filterResult, guardInsightsEngine, install });
  global.AHAMemoryRetrievalGuard = publicApi;
  global.AHAModuleApi?.register?.("memory.retrievalGuard", publicApi, {
    version: 1,
    legacyGlobal: "AHAMemoryRetrievalGuard",
    exports: Object.keys(publicApi)
  });
  guardInsightsEngine();
  install();
})(typeof window !== "undefined" ? window : globalThis);