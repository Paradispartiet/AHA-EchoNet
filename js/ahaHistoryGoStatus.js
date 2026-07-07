(function (global) {
  "use strict";

  const KEYS = {
    importPayload: "aha_import_payload_v1",
    unlocks: "hg_unlocks_v1",
    visitedPlaces: "visited_places",
    peopleCollected: "people_collected",
    progress: "historygo_progress",
    sourceEvents: "aha_source_events_v1",
    chamber: "aha_insight_chamber_v1",
    importLog: "aha_historygo_imports_v1"
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  const UNLOCK_META_KEYS = new Set(["byQuiz", "index"]);

  function countBestEffort(value) {
    if (Array.isArray(value)) return value.length;
    if (!value || typeof value !== "object") return 0;
    const obj = asObject(value);
    let count = 0;
    Object.values(obj).forEach((child) => {
      if (Array.isArray(child)) count += child.length;
      else if (child && typeof child === "object") count += countBestEffort(child);
      else count += 1;
    });
    return count;
  }

  function countHistoryGoUnlocks(unlocks) {
    if (Array.isArray(unlocks)) return unlocks.length;
    const data = asObject(unlocks);
    if (!Object.keys(data).length) return 0;
    if (data.byQuiz && typeof data.byQuiz === "object" && !Array.isArray(data.byQuiz)) {
      return Object.keys(data.byQuiz).length;
    }
    return Object.keys(data).filter((key) => !UNLOCK_META_KEYS.has(key)).length;
  }

  function readRaw(key) {
    return localStorage.getItem(key);
  }

  function collectHistoryGoStatus() {
    const payloadRaw = readRaw(KEYS.importPayload);
    const payload = asObject(safeParse(payloadRaw, {}));
    const unlocks = safeParse(readRaw(KEYS.unlocks), []);
    const visitedPlaces = safeParse(readRaw(KEYS.visitedPlaces), []);
    const people = safeParse(readRaw(KEYS.peopleCollected), []);
    const progressRaw = readRaw(KEYS.progress);

    return {
      hasImportPayload: Boolean(String(payloadRaw || "").trim()),
      visitedPlacesCount: countBestEffort(visitedPlaces),
      peopleCollectedCount: countBestEffort(people),
      unlocksCount: countHistoryGoUnlocks(unlocks),
      progressExists: Boolean(String(progressRaw || "").trim()),
      lastImportAt: String(payload.exported_at || payload.exportedAt || payload.updated_at || payload.updatedAt || "").trim()
    };
  }

  function collectImportPayloadSummary() {
    const payload = asObject(safeParse(readRaw(KEYS.importPayload), {}));
    return {
      nextupLearningSignalExists: Boolean(payload.nextup_learning_signal && typeof payload.nextup_learning_signal === "object"),
      learningLogCount: countBestEffort(payload.hg_learning_log_v1),
      insightEventsCount: countBestEffort(payload.hg_insights_events_v1),
      knowledgeUniverseCount: countBestEffort(payload.knowledge_universe),
      notesCount: countBestEffort(payload.notes),
      dialogsCount: countBestEffort(payload.dialogs),
      payloadKeys: Object.keys(payload),
      exportedAt: String(payload.exported_at || payload.exportedAt || payload.updated_at || payload.updatedAt || "").trim()
    };
  }

  function isHistoryGoImportedEvent(event) {
    const sourceType = String(event?.source_type || "").trim();
    return event?.imported === true || event?.source_app === "historygo" || sourceType.startsWith("historygo");
  }

  function isHistoryGoImportedInsight(insight, sourceEventsById) {
    if (!insight || typeof insight !== "object") return false;
    if (insight.import_source === "historygo") return true;
    const sourceIds = Array.isArray(insight.source_event_ids) ? insight.source_event_ids : [];
    for (let i = 0; i < sourceIds.length; i += 1) {
      const event = sourceEventsById[String(sourceIds[i])];
      if (isHistoryGoImportedEvent(event)) return true;
    }
    return false;
  }

  function collectImportLogSummary() {
    const entries = asArray(safeParse(readRaw(KEYS.importLog), []));
    const last = entries.length ? asObject(entries[entries.length - 1]) : {};
    const storageResult = asObject(last.historygo_storage_apply_result);
    return {
      totalCount: entries.length,
      lastImportedAt: String(last.imported_at || "").trim(),
      lastImportId: String(last.id || "").trim(),
      storageApplySkipped: storageResult.skipped === true,
      storageApplyReason: String(storageResult.reason || "").trim(),
      historygoStorageApplyEnabled: last.historygo_storage_apply_enabled === true,
      databasePersistEnabled: last.database_persist_enabled === true
    };
  }

  function collectImportedAhaEvents() {
    const events = asArray(safeParse(readRaw(KEYS.sourceEvents), []));
    const importedEvents = events.filter(isHistoryGoImportedEvent);
    const bySourceType = {};
    importedEvents.forEach((event) => {
      const key = String(event?.source_type || "unknown").trim() || "unknown";
      bySourceType[key] = (bySourceType[key] || 0) + 1;
    });

    const sourceEventsById = {};
    events.forEach((event) => {
      const eventId = String(event?.id || "").trim();
      if (eventId) sourceEventsById[eventId] = event;
    });

    const chamber = asObject(safeParse(readRaw(KEYS.chamber), {}));
    const insights = asArray(chamber.insights);
    const importedInsightsCount = insights.filter((insight) => isHistoryGoImportedInsight(insight, sourceEventsById)).length;

    return {
      totalCount: importedEvents.length,
      recentEvents: importedEvents.slice(0, 10),
      countsBySourceType: bySourceType,
      importedInsightsCount
    };
  }

  function renderMusicDiscovery() {
    const auditEl = document.getElementById("hg-music-audit");
    const nearbyEl = document.getElementById("hg-nearby-music");
    const previewEl = document.getElementById("hg-place-music-preview");
    if (!auditEl && !nearbyEl && !previewEl) return;
    if (!global.AHAMusicHistoryGoDiscovery) {
      if (auditEl) auditEl.innerHTML = "<p>AHA Music Discovery-loader mangler.</p>";
      return;
    }
    global.AHAMusicHistoryGoDiscovery.loadBridgeData().then((data) => {
      const indexed = global.AHAMusicHistoryGoDiscovery.buildMusicByPlace(data);
      const audit = global.AHAMusicHistoryGoDiscovery.auditBridgeData(data);
      const places = Object.keys(indexed.musicByPlace);
      if (auditEl) {
        auditEl.innerHTML = `<div class="aha-profile-status-grid">
          <article class="aha-status-card"><strong>${escapeHtml(String(audit.artistRelationsRead))}</strong><span>artist-place-relasjoner lest</span></article>
          <article class="aha-status-card"><strong>${escapeHtml(String(audit.trackRelationsRead))}</strong><span>track-place-relasjoner lest</span></article>
          <article class="aha-status-card"><strong>${escapeHtml(String(audit.uniquePlaceIdsWithMusic))}</strong><span>unike placeId-er med musikk</span></article>
          <article class="aha-status-card"><strong>${escapeHtml(String(audit.relationsMissingPlaceId))}</strong><span>relasjoner med manglende placeId</span></article>
          <article class="aha-status-card"><strong>${escapeHtml(String(audit.relationsWithUnknownPlaceId))}</strong><span>placeId ikke funnet i History Go-data</span></article>
        </div>
        <p><strong>Topp steder etter sanger:</strong> ${escapeHtml(audit.topPlacesByTracks.map((item) => `${item.placeId} (${item.count})`).join(", ") || "Ingen")}</p>
        <p><strong>Topp steder etter artister:</strong> ${escapeHtml(audit.topPlacesByArtists.map((item) => `${item.placeId} (${item.count})`).join(", ") || "Ingen")}</p>`;
      }
      if (nearbyEl) nearbyEl.innerHTML = global.AHAMusicHistoryGoDiscovery.renderNearbyMusicPlaces(indexed.musicByPlace);
      if (previewEl) {
        const placeId = places[0];
        previewEl.innerHTML = placeId ? global.AHAMusicHistoryGoDiscovery.renderPlaceMusic(placeId, indexed.musicByPlace[placeId]) : "<p>Ingen sikre musikkrelasjoner med History Go-placeId ennå.</p>";
      }
    }).catch((error) => {
      if (auditEl) auditEl.innerHTML = `<p>Kunne ikke lese AHA Music-data: ${escapeHtml(error && error.message ? error.message : "ukjent feil")}</p>`;
    });
  }

  function render() {
    const status = collectHistoryGoStatus();
    const payload = collectImportPayloadSummary();
    const imported = collectImportedAhaEvents();
    const importLog = collectImportLogSummary();

    const statusEl = document.getElementById("hg-status-cards");
    if (statusEl) {
      const cards = [
        ["Importpayload", status.hasImportPayload ? "Funnet" : "Ikke funnet"],
        ["Besøkte steder", status.visitedPlacesCount],
        ["Personer samlet", status.peopleCollectedCount],
        ["Unlocks", status.unlocksCount],
        ["Progresjon", status.progressExists ? "Funnet" : "Ikke funnet"],
        ["Siste eksport/import", status.lastImportAt || payload.exportedAt || "Ukjent"]
      ];
      statusEl.innerHTML = cards.map(([label, value]) => `<article class="aha-status-card"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></article>`).join("");
    }

    const payloadEl = document.getElementById("hg-payload-summary");
    if (payloadEl) {
      payloadEl.innerHTML = `
        <li>NextUp learning signal: <strong>${payload.nextupLearningSignalExists ? "Funnet" : "Ikke funnet"}</strong></li>
        <li>Learning log count: <strong>${escapeHtml(String(payload.learningLogCount))}</strong></li>
        <li>Insight events count: <strong>${escapeHtml(String(payload.insightEventsCount))}</strong></li>
        <li>Knowledge universe count: <strong>${escapeHtml(String(payload.knowledgeUniverseCount))}</strong></li>
        <li>Notes count: <strong>${escapeHtml(String(payload.notesCount))}</strong></li>
        <li>Dialogs count: <strong>${escapeHtml(String(payload.dialogsCount))}</strong></li>
        <li>Payload keys: <code>${escapeHtml(payload.payloadKeys.join(", ") || "(ingen)")}</code></li>
        <li>Payload tidspunkt: <strong>${escapeHtml(payload.exportedAt || "Ukjent")}</strong></li>
      `;
    }

    const boundaryEl = document.getElementById("hg-import-boundary");
    if (boundaryEl) {
      boundaryEl.innerHTML = `
        <li>AHA reads <code>aha_import_payload_v1</code>.</li>
        <li>Manual import only: ingen auto-import ved page load.</li>
        <li>Writes AHA source events/insights via eksisterende AHAIngest.</li>
        <li>Does not write back to History Go storage by default.</li>
        <li>Database persist disabled by default.</li>
        <li>EchoNet/sync disabled; ingen backend-import.</li>
      `;
    }

    const importLogEl = document.getElementById("hg-import-log-summary");
    if (importLogEl) {
      importLogEl.innerHTML = `
        <li>Importlogg entries: <strong>${escapeHtml(String(importLog.totalCount))}</strong></li>
        <li>Siste importtidspunkt: <strong>${escapeHtml(importLog.lastImportedAt || "Ukjent")}</strong></li>
        <li>Siste import_id: <code>${escapeHtml(importLog.lastImportId || "Ingen")}</code></li>
        <li>Storage apply: <strong>${importLog.historygoStorageApplyEnabled ? "enabled" : "disabled/skipped"}</strong>${importLog.storageApplyReason ? ` (${escapeHtml(importLog.storageApplyReason)})` : ""}</li>
        <li>Database persist: <strong>${importLog.databasePersistEnabled ? "enabled" : "disabled"}</strong></li>
      `;
    }

    const countsEl = document.getElementById("hg-imported-source-type-counts");
    if (countsEl) {
      const entries = Object.entries(imported.countsBySourceType);
      countsEl.innerHTML = entries.length
        ? entries.map(([type, count]) => `<li><code>${escapeHtml(type)}</code>: ${escapeHtml(String(count))}</li>`).join("")
        : "<li>Ingen importerte source events ennå.</li>";
    }

    const eventsEl = document.getElementById("hg-imported-events-list");
    if (eventsEl) {
      eventsEl.innerHTML = imported.recentEvents.length
        ? imported.recentEvents.map((event) => {
          const title = String(event?.title || event?.source_type || "Uten tittel");
          const preview = String(event?.text || "").slice(0, 140);
          return `<li><strong>${escapeHtml(title)}</strong><small>${escapeHtml(String(event?.source_type || "unknown"))} · ${escapeHtml(String(event?.created_at || "Ukjent"))}</small><p>${escapeHtml(preview || "(ingen tekst)")}</p></li>`;
        }).join("")
        : "<li>Ingen importerte source events ennå.</li>";
    }

    const totalEl = document.getElementById("hg-imported-events-total");
    if (totalEl) totalEl.textContent = String(imported.totalCount);

    const insightCountEl = document.getElementById("hg-imported-insights-count");
    if (insightCountEl) insightCountEl.textContent = String(imported.importedInsightsCount);

    renderMusicDiscovery();
  }

  function refresh() {
    render();
  }

  global.AHAHistoryGoStatus = {
    collectHistoryGoStatus,
    collectImportPayloadSummary,
    collectImportedAhaEvents,
    collectImportLogSummary,
    renderMusicDiscovery,
    render,
    refresh
  };
})(window);
