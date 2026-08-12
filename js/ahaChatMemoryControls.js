// ahaChatMemoryControls.js
// Lokal policy, lagring og ekskluderingsregister for AHA-minne.
// Lastes før ahaChatRunContext.js og ahaChat.js.

(function (global) {
  "use strict";

  function create(dependencies = {}) {
    const controlsKey = dependencies.controlsKey || "aha_memory_controls_v1";
    const exclusionsKey = dependencies.exclusionsKey || "aha_memory_exclusions_v1";
    const normalizeText = typeof dependencies.normalizeText === "function" ? dependencies.normalizeText : (value) => String(value || "").toLowerCase();
    const loadChamber = dependencies.loadChamber;
    const renderControls = dependencies.renderControls;
    const updateStatus = dependencies.updateStatus;

    function notifyUi(controls) {
      try { renderControls?.(controls); } catch {}
      try { void updateStatus?.(); } catch {}
    }

    function normalizeAhaMemoryExclusionList(items) {
      const seen = new Set();
      return (Array.isArray(items) ? items : [])
        .map((item) => String(item || "").trim())
        .filter((item) => {
          if (!item || seen.has(item)) return false;
          seen.add(item);
          return true;
        });
    }

    function defaultAhaMemoryExclusions() {
      return {
        excludedInsightIds: [],
        excludedKeys: [],
        lastUpdated: new Date().toISOString()
      };
    }

    function normalizeAhaMemoryExclusions(value) {
      const defaults = defaultAhaMemoryExclusions();
      const exclusions = value && typeof value === "object" ? value : {};
      return {
        excludedInsightIds: normalizeAhaMemoryExclusionList(exclusions.excludedInsightIds),
        excludedKeys: normalizeAhaMemoryExclusionList(exclusions.excludedKeys),
        lastUpdated: String(exclusions.lastUpdated || defaults.lastUpdated)
      };
    }

    function loadAhaMemoryExclusions() {
      try {
        const raw = global.localStorage?.getItem(exclusionsKey);
        if (!raw) return defaultAhaMemoryExclusions();
        return normalizeAhaMemoryExclusions(JSON.parse(raw));
      } catch {
        return defaultAhaMemoryExclusions();
      }
    }

    function saveAhaMemoryExclusions(exclusions) {
      const next = normalizeAhaMemoryExclusions(exclusions);
      next.lastUpdated = new Date().toISOString();
      try { global.localStorage?.setItem(exclusionsKey, JSON.stringify(next)); } catch {}
      notifyUi();
      return next;
    }

    function normalizeAhaMemoryInsightKeyPart(value) {
      return normalizeText(value).replace(/\s+/g, " ").trim().slice(0, 180);
    }

    function getAhaMemoryInsightId(insight) {
      if (typeof insight === "string" || typeof insight === "number") return String(insight).trim();
      return String(insight?.id || "").trim();
    }

    function getAhaMemoryInsightStableKey(insight) {
      if (!insight || typeof insight !== "object") return "";
      const title = normalizeAhaMemoryInsightKeyPart(insight.title || insight.candidate_title || "");
      const summary = normalizeAhaMemoryInsightKeyPart(insight.summary || insight.candidate_summary || "");
      if (!title && !summary) return "";
      return `title:${title}|summary:${summary}`;
    }

    function getAhaMemoryInsightKey(insight) {
      return getAhaMemoryInsightId(insight) || getAhaMemoryInsightStableKey(insight);
    }

    function isAhaMemoryInsightExcluded(insight) {
      const exclusions = loadAhaMemoryExclusions();
      const id = getAhaMemoryInsightId(insight);
      if (id && exclusions.excludedInsightIds.includes(id)) return true;
      const stableKey = getAhaMemoryInsightStableKey(insight);
      return Boolean(stableKey && exclusions.excludedKeys.includes(stableKey));
    }

    function excludeAhaMemoryInsight(insightOrId, reason) {
      const current = loadAhaMemoryExclusions();
      const id = getAhaMemoryInsightId(insightOrId);
      const stableKey = getAhaMemoryInsightStableKey(insightOrId);
      if (id && !current.excludedInsightIds.includes(id)) current.excludedInsightIds.push(id);
      if (stableKey && !current.excludedKeys.includes(stableKey)) current.excludedKeys.push(stableKey);
      const next = saveAhaMemoryExclusions(current);
      try {
        global.dispatchEvent?.(new CustomEvent("aha:memory-exclusion-updated", { detail: { action: "exclude", id: id || null, key: stableKey || null, reason: reason || null } }));
      } catch {}
      return next;
    }

    function includeAhaMemoryInsight(insightOrId) {
      const current = loadAhaMemoryExclusions();
      let target = insightOrId;
      let id = getAhaMemoryInsightId(target);
      if (id && (typeof target === "string" || typeof target === "number")) {
        try {
          const chamber = loadChamber?.();
          const match = (Array.isArray(chamber?.insights) ? chamber.insights : [])
            .find((insight) => getAhaMemoryInsightId(insight) === id);
          if (match) target = match;
        } catch {}
      }
      id = getAhaMemoryInsightId(target) || id;
      const stableKey = getAhaMemoryInsightStableKey(target);
      current.excludedInsightIds = current.excludedInsightIds.filter((item) => item !== id);
      current.excludedKeys = current.excludedKeys.filter((item) => item !== stableKey && item !== id);
      const next = saveAhaMemoryExclusions(current);
      try {
        global.dispatchEvent?.(new CustomEvent("aha:memory-exclusion-updated", { detail: { action: "include", id: id || null, key: stableKey || null } }));
      } catch {}
      return next;
    }

    function resetAhaMemoryExclusions() {
      try { global.localStorage?.removeItem(exclusionsKey); } catch {}
      const next = saveAhaMemoryExclusions(defaultAhaMemoryExclusions());
      try { global.dispatchEvent?.(new CustomEvent("aha:memory-exclusion-updated", { detail: { action: "reset" } })); } catch {}
      return next;
    }

    function formatAhaExcludedMemoryFallback(value) {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      if (text.length <= 120) return text;
      return `${text.slice(0, 117)}…`;
    }

    function getAhaExcludedMemoryItems(exclusionsInput = loadAhaMemoryExclusions()) {
      const exclusions = normalizeAhaMemoryExclusions(exclusionsInput);
      let insights = [];
      try {
        const chamber = loadChamber?.();
        insights = Array.isArray(chamber?.insights) ? chamber.insights : [];
      } catch {
        insights = [];
      }

      const byId = new Map();
      const byKey = new Map();
      insights.forEach((insight) => {
        const id = getAhaMemoryInsightId(insight);
        const key = getAhaMemoryInsightStableKey(insight);
        if (id && !byId.has(id)) byId.set(id, insight);
        if (key && !byKey.has(key)) byKey.set(key, insight);
      });

      const items = [];
      const seenInsightIds = new Set();
      const pushFound = (type, value, insight) => {
        const insightId = getAhaMemoryInsightId(insight);
        if (insightId && seenInsightIds.has(insightId)) return;
        if (insightId) seenInsightIds.add(insightId);
        items.push({
          type,
          value,
          title: String(insight?.title || insight?.candidate_title || "Innsikt").replace(/\s+/g, " ").trim() || "Innsikt",
          summary: String(insight?.summary || insight?.candidate_summary || "").replace(/\s+/g, " ").trim(),
          foundInChamber: true
        });
      };
      const pushFallback = (type, value) => {
        items.push({
          type,
          value,
          title: "Ekskludert minnenøkkel",
          summary: formatAhaExcludedMemoryFallback(value),
          foundInChamber: false
        });
      };

      exclusions.excludedInsightIds.forEach((id) => {
        const insight = byId.get(id);
        if (insight) pushFound("id", id, insight);
        else pushFallback("id", id);
      });
      exclusions.excludedKeys.forEach((key) => {
        const insight = byKey.get(key);
        if (insight) pushFound("key", key, insight);
        else pushFallback("key", key);
      });
      return items;
    }

    function getAhaMemoryExclusionCount(exclusions = loadAhaMemoryExclusions()) {
      return getAhaExcludedMemoryItems(exclusions).length;
    }

    function defaultAhaMemoryControls() {
      return {
        saveNewInsights: true,
        useExistingMemory: true,
        lastUpdated: new Date().toISOString()
      };
    }

    function normalizeAhaMemoryControls(value) {
      const defaults = defaultAhaMemoryControls();
      const controls = value && typeof value === "object" ? value : {};
      return {
        saveNewInsights: typeof controls.saveNewInsights === "boolean" ? controls.saveNewInsights : defaults.saveNewInsights,
        useExistingMemory: typeof controls.useExistingMemory === "boolean" ? controls.useExistingMemory : defaults.useExistingMemory,
        lastUpdated: String(controls.lastUpdated || defaults.lastUpdated)
      };
    }

    function loadAhaMemoryControls() {
      try {
        const raw = global.localStorage?.getItem(controlsKey);
        if (!raw) return defaultAhaMemoryControls();
        return normalizeAhaMemoryControls(JSON.parse(raw));
      } catch {
        return defaultAhaMemoryControls();
      }
    }

    function saveAhaMemoryControls(controls) {
      const next = normalizeAhaMemoryControls(controls);
      next.lastUpdated = new Date().toISOString();
      try { global.localStorage?.setItem(controlsKey, JSON.stringify(next)); } catch {}
      notifyUi(next);
      return next;
    }

    function setAhaMemoryControl(key, value) {
      if (!["saveNewInsights", "useExistingMemory"].includes(String(key))) return loadAhaMemoryControls();
      const current = loadAhaMemoryControls();
      current[key] = Boolean(value);
      return saveAhaMemoryControls(current);
    }

    function resetAhaMemoryControls() {
      try { global.localStorage?.removeItem(controlsKey); } catch {}
      return saveAhaMemoryControls(defaultAhaMemoryControls());
    }

    function isAhaSavingEnabled() {
      return loadAhaMemoryControls().saveNewInsights !== false;
    }

    function isAhaMemoryUseEnabled() {
      return loadAhaMemoryControls().useExistingMemory !== false;
    }

    function buildAhaMemoryOffContext(reason = "Bruk av eksisterende minne er slått av av brukeren.") {
      return {
        used: false,
        reason,
        confidence: 0,
        mode: "off",
        localMatches: [],
        semanticMatches: [],
        selectedInsights: [],
        summaryForAgent: ""
      };
    }

    return Object.freeze({
      defaultAhaMemoryExclusions,
      normalizeAhaMemoryExclusions,
      loadAhaMemoryExclusions,
      saveAhaMemoryExclusions,
      getAhaMemoryInsightStableKey,
      getAhaMemoryInsightKey,
      getAhaMemoryExclusionCount,
      isAhaMemoryInsightExcluded,
      excludeAhaMemoryInsight,
      includeAhaMemoryInsight,
      resetAhaMemoryExclusions,
      getAhaExcludedMemoryItems,
      defaultAhaMemoryControls,
      normalizeAhaMemoryControls,
      loadAhaMemoryControls,
      saveAhaMemoryControls,
      setAhaMemoryControl,
      resetAhaMemoryControls,
      isAhaSavingEnabled,
      isAhaMemoryUseEnabled,
      buildAhaMemoryOffContext
    });
  }

  global.AHAChatMemoryControls = Object.freeze({ create });
})(window);
