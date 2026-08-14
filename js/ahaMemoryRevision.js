// Reconciles explicit corrections and conflicts in the local AHA insight chamber.
// Older insights remain available for audit, but are no longer active memory.
(function (global) {
  "use strict";

  const VERSION = "aha_memory_revision_v1";
  const STORAGE_KEY = "aha_insight_chamber_v1";
  const INACTIVE_STATES = new Set(["superseded", "contested", "stale", "irrelevant"]);
  const CORRECTION_PATTERNS = [
    /\b(korrigerer|rettelse|erstatter|supersederer)\b/i,
    /\b(?:det|dette|opplysningen|påstanden)\s+(?:er|var)\s+(?:feil|ikke riktig)\b/i,
    /\b(?:ny|nyere|oppdatert)\s+(?:informasjon|kilde|dokumentasjon)\s+(?:viser|fastslår|bekrefter)\b/i,
    /\bdet riktige er\b/i,
    /\b(?:is incorrect|was incorrect|correction|replaces|supersedes)\b/i
  ];
  const CONFLICT_PATTERNS = [
    /\b(motsier|strider mot|i motsetning til|konflikt med|motstridende)\b/i,
    /\b(contradicts|conflicts with|in contrast to)\b/i
  ];
  const GENERIC_TOKENS = new Set([
    "aha", "analyse", "innsikt", "innsikter", "tema", "tolkning", "tekst", "dette", "denne",
    "det", "er", "var", "som", "med", "for", "til", "fra", "og", "eller", "ikke", "ny", "nyere"
  ]);
  const list = (value) => Array.isArray(value) ? value : [];
  const text = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();

  function normalize(value) {
    return text(value).toLowerCase().normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }

  function tokenSet(value) {
    return new Set(normalize(value).split(" ").filter((token) => token.length >= 3 && !GENERIC_TOKENS.has(token)));
  }

  function jaccard(left, right) {
    const a = tokenSet(left);
    const b = tokenSet(right);
    if (!a.size || !b.size) return 0;
    let shared = 0;
    a.forEach((token) => { if (b.has(token)) shared += 1; });
    return shared / new Set([...a, ...b]).size;
  }

  function label(item) {
    if (item == null) return "";
    if (typeof item === "string" || typeof item === "number") return text(item);
    return text(item.label || item.key || item.term || item.name || item.title);
  }

  function concepts(insight) {
    return [...list(insight?.concepts), ...list(insight?.emner), ...list(insight?.tags)].map(label).filter(Boolean);
  }

  function insightText(insight) {
    return [insight?.title, insight?.summary, insight?.text, concepts(insight).join(" ")].map(text).filter(Boolean).join(" ");
  }

  function insightTime(insight, fallbackIndex = 0) {
    const values = [insight?.last_updated, insight?.updated_at, insight?.updatedAt, insight?.created_at, insight?.createdAt, insight?.first_seen];
    for (const value of values) {
      const stamp = Date.parse(value);
      if (Number.isFinite(stamp)) return stamp;
    }
    return fallbackIndex;
  }

  function targetIds(values) {
    return values.map((item) => text(typeof item === "object" ? item.id : item)).filter(Boolean);
  }

  function correctionTargets(insight) {
    return targetIds([
      insight?.corrects_insight_id, insight?.corrected_insight_id, insight?.replaces_insight_id, insight?.supersedes_insight_id,
      ...list(insight?.corrects), ...list(insight?.replaces), ...list(insight?.supersedes),
      ...list(insight?.corrected_insight_ids), ...list(insight?.replaces_insight_ids), ...list(insight?.supersedes_insight_ids)
    ]);
  }

  function conflictTargets(insight) {
    return targetIds([
      insight?.contests_insight_id, insight?.conflicts_with_insight_id,
      ...list(insight?.contests), ...list(insight?.conflicts_with),
      ...list(insight?.contested_insight_ids), ...list(insight?.conflicts_with_insight_ids)
    ]);
  }

  function relationSignal(insight) {
    const body = insightText(insight);
    if (correctionTargets(insight).length || CORRECTION_PATTERNS.some((pattern) => pattern.test(body))) return "correction";
    if (conflictTargets(insight).length || CONFLICT_PATTERNS.some((pattern) => pattern.test(body))) return "conflict";
    return "";
  }

  function topicScore(older, newer) {
    if (!older || !newer) return 0;
    const sameSubject = text(older.subject_id) && text(older.subject_id) === text(newer.subject_id);
    const sameTheme = text(older.theme_id) && text(older.theme_id) === text(newer.theme_id);
    if (sameSubject && sameTheme) return 1;
    if (sameSubject || sameTheme) return 0.8;
    const sameDomain = text(older.domain || older.contentType)
      && normalize(older.domain || older.contentType) === normalize(newer.domain || newer.contentType);
    const conceptScore = jaccard(concepts(older).join(" "), concepts(newer).join(" "));
    const textScore = jaccard(insightText(older), insightText(newer));
    return Number(Math.min(1, Math.max(conceptScore, textScore, sameDomain ? textScore + 0.12 : 0)).toFixed(3));
  }

  function isMemoryActive(insight) {
    if (!insight || insight.archived || insight.deleted || insight.deleted_at || insight.deletedAt || insight.rejected || insight.merged_into) return false;
    if (text(insight.status).toLowerCase() === "rejected") return false;
    return !INACTIVE_STATES.has(text(insight.memory_status || insight.memoryStatus).toLowerCase());
  }

  function appendUnique(values, value) {
    const output = list(values).map(text).filter(Boolean);
    if (value && !output.includes(value)) output.push(value);
    return output;
  }

  function markRelation(older, newer, signal, options = {}) {
    const olderId = text(older?.id);
    const newerId = text(newer?.id);
    if (!olderId || !newerId) return { older, newer, changed: false };
    const status = signal === "correction" ? "superseded" : "contested";
    const relationField = signal === "correction" ? "corrects" : "contests";
    if (text(older.memory_status) === status
      && text(older.memory_revision?.by) === newerId
      && list(newer[relationField]).map(text).includes(olderId)) {
      return { older, newer, changed: false };
    }
    const at = text(options.now || newer.updated_at || newer.updatedAt || newer.created_at || newer.createdAt || new Date().toISOString());
    return {
      changed: true,
      older: {
        ...older,
        archived: true,
        archived_reason: signal === "correction" ? "superseded_by_newer_insight" : "contested_by_newer_insight",
        memory_status: status,
        ...(signal === "correction" ? { superseded_by: newerId, superseded_at: at } : { contested_by: newerId, contested_at: at }),
        memory_revision: { version: VERSION, status, by: newerId, at, reason: signal, explicit: true, local_only: true }
      },
      newer: {
        ...newer,
        memory_status: text(newer.memory_status) || "active",
        [relationField]: appendUnique(newer[relationField], olderId),
        memory_revision: {
          ...(newer.memory_revision && typeof newer.memory_revision === "object" ? newer.memory_revision : {}),
          version: VERSION, status: "active", at, relation: signal, local_only: true
        }
      }
    };
  }

  function reconcileChamber(chamber, options = {}) {
    const safe = chamber && typeof chamber === "object" ? chamber : {};
    const insights = list(safe.insights).map((insight) => ({ ...(insight || {}) }));
    const ordered = insights.map((insight, index) => ({ index, time: insightTime(insight, index) }))
      .sort((left, right) => left.time - right.time || left.index - right.index);
    let changed = false;
    let newRelations = 0;

    ordered.forEach((entry, orderIndex) => {
      const newer = insights[entry.index];
      const signal = relationSignal(newer);
      if (!signal) return;
      const targets = new Set(signal === "conflict" ? conflictTargets(newer) : correctionTargets(newer));
      const candidates = ordered.slice(0, orderIndex)
        .map((candidate) => ({ ...candidate, score: topicScore(insights[candidate.index], newer) }))
        .filter((candidate) => {
          const older = insights[candidate.index];
          if (!text(older?.id) || !isMemoryActive(older)) return false;
          if (targets.size) return targets.has(text(older.id));
          return candidate.score >= Number(options.minimumTopicScore ?? 0.34);
        })
        .sort((left, right) => right.score - left.score || right.time - left.time);
      if (!candidates[0]) return;
      const relation = markRelation(insights[candidates[0].index], newer, signal, options);
      if (!relation.changed) return;
      insights[candidates[0].index] = relation.older;
      insights[entry.index] = relation.newer;
      changed = true;
      newRelations += 1;
    });

    const relations = insights.filter((insight) => ["superseded", "contested"].includes(text(insight.memory_status).toLowerCase())
      && insight?.memory_revision?.version === VERSION).length;
    return {
      chamber: {
        ...safe,
        insights,
        memory_revision: {
          version: VERSION,
          relations,
          active_count: insights.filter(isMemoryActive).length,
          audit_count: insights.length,
          local_only: true
        }
      },
      changed,
      relations,
      newRelations,
      activeInsights: insights.filter(isMemoryActive)
    };
  }

  function replaceObject(target, source) {
    if (!target || typeof target !== "object" || Array.isArray(target)) return source;
    Object.keys(target).forEach((key) => { delete target[key]; });
    Object.assign(target, source);
    return target;
  }

  function patchChamberStore(storeArg) {
    const storeApi = storeArg || global.AHAChatChamberStore;
    if (!storeApi || typeof storeApi.create !== "function") return { ok: false, reason: "chamber_store_unavailable" };
    if (storeApi.__ahaMemoryRevision === VERSION) return { ok: true, alreadyInstalled: true, storeApi };
    const originalCreate = storeApi.create.bind(storeApi);
    storeApi.create = function createRevisionAwareStore(deps = {}) {
      const base = originalCreate(deps);
      const localStorage = deps.storage || global.localStorage;
      const storageKey = deps.storageKey || storeApi.STORAGE_KEY || STORAGE_KEY;
      const now = typeof deps.now === "function" ? deps.now : () => new Date().toISOString();
      const load = function loadRevisionAwareChamber() {
        const chamber = base.load();
        if (!chamber || typeof chamber !== "object" || Array.isArray(chamber) || !Array.isArray(chamber.insights)) return chamber;
        const revision = reconcileChamber(chamber);
        if (revision.changed) {
          try { localStorage?.setItem?.(storageKey, JSON.stringify(revision.chamber)); } catch {}
        }
        return revision.chamber;
      };
      const save = function saveRevisionAwareChamber(chamber) {
        if (chamber && typeof chamber === "object" && !Array.isArray(chamber) && Array.isArray(chamber.insights)) {
          replaceObject(chamber, reconcileChamber(chamber, { now: now() }).chamber);
        }
        return base.save(chamber);
      };
      return Object.freeze({ load, save, clear: (...args) => base.clear(...args) });
    };
    Object.defineProperty(storeApi, "__ahaMemoryRevision", { value: VERSION, enumerable: false, configurable: false });
    return { ok: true, storeApi, originalCreate };
  }

  function reconcileStoredChamber(options = {}) {
    const localStorage = options.storage || (() => { try { return global.localStorage; } catch { return null; } })();
    const key = options.storageKey || STORAGE_KEY;
    try {
      const raw = localStorage?.getItem?.(key);
      if (!raw) return { ok: true, changed: false, reason: "empty" };
      const chamber = JSON.parse(raw);
      if (!chamber || typeof chamber !== "object" || Array.isArray(chamber) || !Array.isArray(chamber.insights)) {
        return { ok: true, changed: false, reason: "legacy_shape" };
      }
      const revision = reconcileChamber(chamber, options);
      if (revision.changed) localStorage.setItem(key, JSON.stringify(revision.chamber));
      return { ok: true, ...revision };
    } catch (error) {
      return { ok: false, reason: "storage_error", error };
    }
  }

  function installSavedListener() {
    if (!global.addEventListener || global.__ahaMemoryRevisionSavedListener) return false;
    global.addEventListener("aha:chamber-saved", () => { reconcileStoredChamber(); });
    global.__ahaMemoryRevisionSavedListener = true;
    return true;
  }

  const api = Object.freeze({
    VERSION,
    correctionTargets,
    conflictTargets,
    relationSignal,
    topicScore,
    isMemoryActive,
    reconcileChamber,
    patchChamberStore,
    reconcileStoredChamber,
    installSavedListener
  });
  global.AHAMemoryRevision = api;
  global.AHAModuleApi?.register?.("memory.revision", api, {
    version: 1,
    legacyGlobal: "AHAMemoryRevision",
    exports: Object.keys(api)
  });
  patchChamberStore();
  reconcileStoredChamber();
  installSavedListener();
})(typeof window !== "undefined" ? window : globalThis);