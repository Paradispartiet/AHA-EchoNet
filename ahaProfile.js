(function (global) {
  "use strict";

  const KEYS = {
    insights: "aha_insight_chamber_v1",
    sourceEvents: "aha_source_events_v1",
    notes: "aha_notes_v1",
    gallery: "aha_gallery_v1",
    feed: "aha_feed_posts_v1",
    insta: "aha_insta_posts_v1",
    lists: "aha_lists_v1",
    paths: "aha_paths_v1",
    articles: "aha_articles_v1",
    groups: "aha_groups_v1",
    afterwork: "aha_afterwork_v1",
    privacy: "aha_privacy_settings_v1",
    importPayload: "aha_import_payload_v1",
    unlocks: "hg_unlocks_v1",
    visitedPlaces: "visited_places",
    peopleCollected: "people_collected",
    historyProgress: "historygo_progress"
  };

  const PRIVACY_DEFAULTS = {
    localOnly: true,
    allowCollectiveLearning: false,
    allowPublicPublishing: false,
    allowSocialSharing: false,
    allowHistoryGoImport: true,
    allowAnalytics: false
  };

  function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
  function safeParse(raw, fallback) { try { const parsed = JSON.parse(raw); return parsed ?? fallback; } catch { return fallback; } }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function asText(value, fallback) { const s = String(value ?? "").trim(); return s || fallback; }
  function isDeleted(item) { return Boolean(item?.deleted_at || item?.deletedAt); }
  function ts(item) {
    const raw = item?.updatedAt || item?.updated_at || item?.last_updated || item?.lastUpdated || item?.createdAt || item?.created_at || item?.first_seen || item?.firstSeen || "";
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : 0;
  }
  function loadArray(key) { return asArray(safeParse(localStorage.getItem(key) || "[]", [])); }

  function collectProfileStatus() {
    const chamber = asObject(safeParse(localStorage.getItem(KEYS.insights) || "{}", {}));
    const sourceEvents = loadArray(KEYS.sourceEvents).filter((x) => !isDeleted(x));
    const notes = loadArray(KEYS.notes).filter((x) => !isDeleted(x));
    const gallery = loadArray(KEYS.gallery).filter((x) => !isDeleted(x));
    const feed = loadArray(KEYS.feed).filter((x) => !isDeleted(x));
    const insta = loadArray(KEYS.insta).filter((x) => !isDeleted(x));
    const lists = loadArray(KEYS.lists).filter((x) => !isDeleted(x));
    const paths = loadArray(KEYS.paths).filter((x) => !isDeleted(x));
    const articles = loadArray(KEYS.articles).filter((x) => !isDeleted(x));
    const groups = loadArray(KEYS.groups).filter((x) => !isDeleted(x));
    const afterwork = loadArray(KEYS.afterwork).filter((x) => !isDeleted(x));
    const insights = asArray(chamber.insights).filter((x) => !isDeleted(x));

    const groupMembersCount = groups.reduce((sum, group) => sum + asArray(group?.members).length, 0);
    const groupReferencesCount = groups.reduce((sum, group) => sum + asArray(group?.references).length, 0);
    const all = insights.concat(sourceEvents, notes, gallery, feed, insta, lists, paths, articles, groups, afterwork);
    const latestTs = all.reduce((max, item) => Math.max(max, ts(item)), 0);

    return {
      insightsCount: insights.length,
      sourceEventsCount: sourceEvents.length,
      notesCount: notes.length,
      galleryCount: gallery.length,
      feedCount: feed.length,
      instaCount: insta.length,
      listsCount: lists.length,
      pathsCount: paths.length,
      articlesCount: articles.length,
      groupsCount: groups.length,
      afterworkCount: afterwork.length,
      groupMembersCount,
      groupReferencesCount,
      readyArticlesCount: articles.filter((a) => String(a?.status || "").toLowerCase() === "ready").length,
      lastActivityAt: latestTs ? new Date(latestTs).toISOString() : ""
    };
  }

  function collectRecentActivity() {
    const sources = [
      [KEYS.sourceEvents, "source_event", "aha_source_events", "insights.html"],
      [KEYS.notes, "note", "aha_notes", "notes.html"],
      [KEYS.gallery, "gallery_item", "aha_gallery", "gallery.html"],
      [KEYS.feed, "feed_post", "aha_feed", "feed.html"],
      [KEYS.insta, "insta_post", "aha_insta", "insta.html"],
      [KEYS.lists, "list", "aha_lists", "lists.html"],
      [KEYS.paths, "path", "aha_paths", "paths.html"],
      [KEYS.articles, "article", "aha_avisa", "avisa.html"],
      [KEYS.groups, "group", "aha_groups", "groups.html"]
    ];

    const out = [];
    sources.forEach(([key, type, source, href]) => {
      loadArray(key).filter((item) => !isDeleted(item)).forEach((item, index) => {
        const title = asText(item?.title || item?.heading || item?.label || item?.name || item?.text || item?.summary || `${type} ${index + 1}`, "Uten tittel");
        out.push({
          id: asText(item?.id || item?.event_id || item?.source_event_id, `${source}_${index}`),
          title,
          type: asText(item?.type || item?.source_type, type),
          source,
          createdAt: item?.createdAt || item?.created_at || item?.first_seen || item?.firstSeen || "",
          updatedAt: item?.updatedAt || item?.updated_at || item?.last_updated || item?.lastUpdated || item?.createdAt || item?.created_at || item?.first_seen || item?.firstSeen || "",
          href
        });
      });
    });
    loadArray(KEYS.afterwork).filter((item) => !isDeleted(item)).forEach((item, index) => {
      const title = asText(item?.reflection || item?.sourceTextPreview || item?.textType || "AHA etterarbeid", "AHA etterarbeid");
      out.push({
        id: asText(item?.id, `aha_afterwork_${index}`),
        title,
        type: "aha_afterwork",
        source: "aha_afterwork",
        createdAt: item?.createdAt || "",
        updatedAt: item?.updatedAt || item?.createdAt || "",
        href: "chat.html"
      });
    });
    return out.sort((a, b) => ts(b) - ts(a)).slice(0, 10);
  }

  function collectAfterworkArchive(limit = 5) {
    const maxItems = Number.isFinite(Number(limit)) ? Math.max(0, Number(limit)) : 5;
    return loadArray(KEYS.afterwork)
      .filter((item) => !isDeleted(item))
      .sort((a, b) => ts(b) - ts(a))
      .slice(0, maxItems)
      .map((item, index) => {
        const reflection = asText(item?.reflection, "");
        const preview = asText(item?.sourceTextPreview, "");
        const fallbackTitle = "AHA etterarbeid";
        const title = reflection || preview || fallbackTitle;
        const concepts = asArray(item?.concepts).map((concept) => asText(concept?.label || concept?.name || concept, "")).filter(Boolean).slice(0, 5);
        return {
          id: asText(item?.id, `aha_afterwork_${index}`),
          title,
          preview,
          textType: asText(item?.textType, ""),
          createdAt: item?.createdAt || "",
          concepts,
          insightsCount: asArray(item?.insights).length,
          learningPathCount: asArray(item?.learningPath || item?.learningPaths).length
        };
      });
  }

  function collectHistoryGoStatus() {
    const payloadRaw = localStorage.getItem(KEYS.importPayload);
    const payload = safeParse(payloadRaw || "{}", {});
    const unlocks = safeParse(localStorage.getItem(KEYS.unlocks) || "[]", []);
    const visitedPlaces = safeParse(localStorage.getItem(KEYS.visitedPlaces) || "[]", []);
    const people = safeParse(localStorage.getItem(KEYS.peopleCollected) || "[]", []);
    const progressRaw = localStorage.getItem(KEYS.historyProgress);
    return {
      hasImportPayload: Boolean(String(payloadRaw || "").trim()),
      visitedPlacesCount: Array.isArray(visitedPlaces) ? visitedPlaces.length : Object.keys(asObject(visitedPlaces)).length,
      peopleCollectedCount: Array.isArray(people) ? people.length : Object.keys(asObject(people)).length,
      unlocksCount: Array.isArray(unlocks) ? unlocks.length : Object.keys(asObject(unlocks)).length,
      progressExists: Boolean(String(progressRaw || "").trim()),
      lastImportAt: asText(payload?.exported_at || payload?.updatedAt || payload?.updated_at || payload?.createdAt || payload?.created_at, "")
    };
  }

  function collectPrivacyStatus() {
    const raw = asObject(safeParse(localStorage.getItem(KEYS.privacy) || "{}", {}));
    return {
      localOnly: typeof raw.localOnly === "boolean" ? raw.localOnly : PRIVACY_DEFAULTS.localOnly,
      allowCollectiveLearning: typeof raw.allowCollectiveLearning === "boolean" ? raw.allowCollectiveLearning : PRIVACY_DEFAULTS.allowCollectiveLearning,
      allowPublicPublishing: typeof raw.allowPublicPublishing === "boolean" ? raw.allowPublicPublishing : PRIVACY_DEFAULTS.allowPublicPublishing,
      allowSocialSharing: typeof raw.allowSocialSharing === "boolean" ? raw.allowSocialSharing : PRIVACY_DEFAULTS.allowSocialSharing,
      allowHistoryGoImport: typeof raw.allowHistoryGoImport === "boolean" ? raw.allowHistoryGoImport : PRIVACY_DEFAULTS.allowHistoryGoImport,
      allowAnalytics: typeof raw.allowAnalytics === "boolean" ? raw.allowAnalytics : PRIVACY_DEFAULTS.allowAnalytics
    };
  }

  function render() {
    const status = collectProfileStatus();
    const recent = collectRecentActivity();
    const hg = collectHistoryGoStatus();
    const privacy = collectPrivacyStatus();

    const statusEl = document.getElementById("aha-profile-status-grid");
    if (statusEl) {
      const cards = [
        ["Innsikter", status.insightsCount], ["Source events", status.sourceEventsCount], ["Notater", status.notesCount], ["Galleri", status.galleryCount],
        ["Feed", status.feedCount], ["Insta", status.instaCount], ["Lister", status.listsCount], ["Stier", status.pathsCount],
        ["Artikler", status.articlesCount], ["Ready-artikler", status.readyArticlesCount], ["Grupper", status.groupsCount],
        ["Gruppemedlemmer", status.groupMembersCount], ["Gruppereferanser", status.groupReferencesCount], ["Etterarbeid", status.afterworkCount]
      ];
      statusEl.innerHTML = cards.map(([l, v]) => `<article class="aha-status-card"><strong>${escapeHtml(String(v))}</strong><span>${escapeHtml(l)}</span></article>`).join("");
    }

    const activityEl = document.getElementById("aha-recent-activity");
    if (activityEl) {
      activityEl.innerHTML = recent.length ? recent.map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a><small>${escapeHtml(item.type)} · ${escapeHtml(item.source)} · ${escapeHtml(item.updatedAt || item.createdAt || "Ukjent")}</small></li>`).join("") : "<li>Ingen aktivitet ennå.</li>";
    }

    const hgEl = document.getElementById("aha-historygo-status");
    if (hgEl) hgEl.innerHTML = `<div class="aha-status-stack"><span>Importpayload: ${hg.hasImportPayload ? "Funnet" : "Ikke funnet"}</span><span>Besøkte steder: ${hg.visitedPlacesCount}</span><span>Personer samlet: ${hg.peopleCollectedCount}</span><span>Unlocks: ${hg.unlocksCount}</span><span>Progresjon: ${hg.progressExists ? "Funnet" : "Ikke funnet"}</span><span>Sist import: ${escapeHtml(hg.lastImportAt || "Ukjent")}</span></div>`;

    const privacyEl = document.getElementById("aha-privacy-status");
    if (privacyEl) privacyEl.innerHTML = `<div class="aha-status-stack"><span>Lokal modus: ${privacy.localOnly ? "På" : "Av"}</span><span>Kollektiv læring: ${privacy.allowCollectiveLearning ? "På" : "Av"}</span><span>Publisering: ${privacy.allowPublicPublishing ? "På" : "Av"}</span><span>Sosial deling: ${privacy.allowSocialSharing ? "På" : "Av"}</span><span>History Go-import: ${privacy.allowHistoryGoImport ? "På" : "Av"}</span><span>Analytics: ${privacy.allowAnalytics ? "På" : "Av"}</span></div>`;

    const nameEl = document.getElementById("aha-home-profile-name");
    if (nameEl) nameEl.textContent = localStorage.getItem("aha_profile_name") || "Lokal AHA-bruker";
    const modeEl = document.getElementById("aha-home-profile-mode");
    if (modeEl) modeEl.textContent = privacy.localOnly ? "Lokal modus" : "Tilkoblet modus";
    const lastEl = document.getElementById("aha-home-last-activity");
    if (lastEl) lastEl.textContent = status.lastActivityAt || "Ingen aktivitet registrert";

    const afterworkArchiveEl = document.getElementById("aha-afterwork-archive");
    if (afterworkArchiveEl) {
      const archiveItems = collectAfterworkArchive(5);
      if (!archiveItems.length) {
        afterworkArchiveEl.innerHTML = "<p class=\"aha-afterwork-empty\">Ingen lagrede etterarbeid ennå. Start i AHA Chat.</p>";
      } else {
        afterworkArchiveEl.innerHTML = `<div class="aha-afterwork-list">${archiveItems.map((item) => {
          const conceptsMarkup = item.concepts.length
            ? `<div class="aha-afterwork-chips">${item.concepts.map((concept) => `<span>${escapeHtml(concept)}</span>`).join("")}</div>`
            : "";
          const dateText = escapeHtml(item.createdAt || "Ukjent dato");
          return `<article class="aha-afterwork-card">
            <small class="aha-afterwork-meta">${dateText}</small>
            <p>${escapeHtml(item.title)}</p>
            ${conceptsMarkup}
            <small class="aha-afterwork-meta">Innsikter: ${escapeHtml(String(item.insightsCount))} · Sti: ${escapeHtml(String(item.learningPathCount))}</small>
            <a class="aha-tile-btn aha-tile-btn-secondary" href="chat.html">Åpne i chat</a>
          </article>`;
        }).join("")}</div>`;
      }
    }
  }

  function refresh() { render(); }

  global.AHAProfile = { collectProfileStatus, collectRecentActivity, collectHistoryGoStatus, collectPrivacyStatus, collectAfterworkArchive, render, refresh };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})(window);
