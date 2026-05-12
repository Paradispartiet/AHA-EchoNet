(function (global) {
  "use strict";

  const KEYS = {
    importPayload: "aha_import_payload_v1",
    unlocks: "hg_unlocks_v1",
    visitedPlaces: "visited_places",
    peopleCollected: "people_collected",
    progress: "historygo_progress",
    sourceEvents: "aha_source_events_v1",
    chamber: "aha_insight_chamber_v1"
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
      unlocksCount: countBestEffort(unlocks),
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

  function collectImportedAhaEvents() {
    const events = asArray(safeParse(readRaw(KEYS.sourceEvents), []));
    const importedEvents = events.filter(isHistoryGoImportedEvent);
    const bySourceType = {};
    importedEvents.forEach((event) => {
      const key = String(event?.source_type || "unknown").trim() || "unknown";
      bySourceType[key] = (bySourceType[key] || 0) + 1;
    });

    const chamber = asObject(safeParse(readRaw(KEYS.chamber), {}));
    const insights = asArray(chamber.insights);
    const importedInsightsCount = insights.filter((insight) => {
      const sourceType = String(insight?.source_type || insight?.meta?.source_type || "").trim();
      const sourceApp = String(insight?.source_app || insight?.meta?.source_app || "").trim();
      return insight?.imported === true || insight?.meta?.imported === true || sourceApp === "historygo" || sourceType.startsWith("historygo");
    }).length;

    return {
      totalCount: importedEvents.length,
      recentEvents: importedEvents.slice(0, 10),
      countsBySourceType: bySourceType,
      importedInsightsCount
    };
  }

  function render() {
    const status = collectHistoryGoStatus();
    const payload = collectImportPayloadSummary();
    const imported = collectImportedAhaEvents();

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
  }

  function refresh() {
    render();
  }

  global.AHAHistoryGoStatus = {
    collectHistoryGoStatus,
    collectImportPayloadSummary,
    collectImportedAhaEvents,
    render,
    refresh
  };
})(window);
