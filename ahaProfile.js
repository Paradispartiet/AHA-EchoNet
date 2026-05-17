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
    historyProgress: "historygo_progress",
    pendingChatPrompt: "aha_pending_chat_prompt_v1"
  };
  let latestMetaProfile = null;

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


  const NOISE_LABELS = new Set(["logo", "annonse", "annonsørinnhold", "annonsorinnhold"]);

  function normalizeLabel(label) {
    const cleaned = String(label ?? "").trim().replace(/\s+/g, " ");
    if (!cleaned) return "";
    const lower = cleaned.toLowerCase();
    if (cleaned.length < 3 || NOISE_LABELS.has(lower)) return "";
    return cleaned;
  }

  function addCount(map, label, amount = 1) {
    const normalized = normalizeLabel(label);
    if (!normalized) return;
    map.set(normalized, (map.get(normalized) || 0) + (Number(amount) || 1));
  }

  function topCounted(map, limit = 5) {
    return Array.from(map.entries())
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], "no"))
      .slice(0, limit)
      .map(([label, count]) => ({ label, count }));
  }

  function collectAhaMetaProfile() {
    const chamber = asObject(safeParse(localStorage.getItem(KEYS.insights) || "{}", {}));
    const afterwork = loadArray(KEYS.afterwork).filter((x) => !isDeleted(x));
    const insights = asArray(chamber.insights).filter((x) => !isDeleted(x));

    const themesMap = new Map();
    const conceptsMap = new Map();
    const subjectMap = new Map();

    insights.forEach((insight) => {
      addCount(themesMap, insight?.theme || insight?.topic || insight?.title || insight?.summary);
      asArray(insight?.concepts).forEach((concept) => addCount(conceptsMap, concept?.label || concept?.name || concept, concept?.count || 1));
      asArray(insight?.keywords).forEach((keyword) => addCount(conceptsMap, keyword?.label || keyword?.name || keyword));
    });

    afterwork.forEach((entry) => {
      asArray(entry?.concepts).forEach((concept) => {
        addCount(conceptsMap, concept?.label || concept?.name || concept, concept?.count || 1);
        addCount(themesMap, concept?.label || concept?.name || concept, concept?.count || 1);
      });
      asArray(entry?.keywords).forEach((keyword) => {
        addCount(conceptsMap, keyword?.label || keyword?.name || keyword);
        addCount(themesMap, keyword?.label || keyword?.name || keyword);
      });
      asArray(entry?.subjectLinks).forEach((link) => {
        const label = link?.title || link?.name || link?.label || link;
        const normalized = normalizeLabel(label);
        if (!normalized) return;
        const current = subjectMap.get(normalized) || { label: normalized, count: 0, categoryId: link?.categoryId || link?.category_id || "" };
        current.count += 1;
        if (!current.categoryId) current.categoryId = link?.categoryId || link?.category_id || "";
        subjectMap.set(normalized, current);
      });
    });

    const topThemes = topCounted(themesMap, 5);
    const topConcepts = topCounted(conceptsMap, 5);

    const tensionCandidates = [];
    const metaGlobal = global.AHAMetaInsights || global.MetaInsightsEngine;
    if (global.AHAMetaInsights?.tensions) tensionCandidates.push(global.AHAMetaInsights.tensions);
    if (chamber?.metaProfile?.tensions) tensionCandidates.push(chamber.metaProfile.tensions);
    if (chamber?.meta_profile?.tensions) tensionCandidates.push(chamber.meta_profile.tensions);
    if (metaGlobal && chamber?.subject_id && typeof metaGlobal.buildUserMetaProfile === "function") {
      try {
        const computed = metaGlobal.buildUserMetaProfile(chamber, chamber.subject_id);
        if (computed?.tensions) tensionCandidates.push(computed.tensions);
      } catch {}
    }

    const rawTensions = tensionCandidates.flatMap((t) => [
      ...asArray(t?.concept_pair_tensions),
      ...asArray(t?.tensions),
      ...asArray(t?.paradox_pairs),
      ...asArray(t?.concept_tensions)
    ]);
    const topTensions = rawTensions.map((item) => ({
      source: normalizeLabel(item?.source || item?.a || item?.left || item?.concept_a || item?.from || item?.theme_a || item?.themeA),
      target: normalizeLabel(item?.target || item?.b || item?.right || item?.concept_b || item?.to || item?.theme_b || item?.themeB),
      strength: Number(item?.strength || item?.weight || item?.score || item?.shared_concepts?.length || item?.count || 0) || 0
    })).filter((item) => item.source && item.target).sort((a, b) => b.strength - a.strength).slice(0, 5);

    const topSubjectLinks = Array.from(subjectMap.values())
      .sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label, "no"))
      .slice(0, 5);

    const recentAfterwork = typeof collectAfterworkArchive === "function"
      ? collectAfterworkArchive(3)
      : afterwork.sort((a, b) => ts(b) - ts(a)).slice(0, 3).map((item, index) => ({
        id: asText(item?.id, `aha_afterwork_${index}`),
        title: asText(item?.reflection || item?.sourceTextPreview || "AHA etterarbeid", "AHA etterarbeid"),
        preview: asText(item?.sourceTextPreview, ""),
        createdAt: item?.createdAt || ""
      }));

    return { topThemes, topConcepts, topTensions, topSubjectLinks, recentAfterwork, sourceCounts: { insights: insights.length, afterwork: afterwork.length } };
  }

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

  function savePendingChatPrompt(prompt) {
    if (typeof prompt !== "string") return false;
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return false;
    const payload = {
      type: "meta_profile_prompt",
      source: "aha_home",
      createdAt: new Date().toISOString(),
      prompt: trimmedPrompt
    };
    try {
      localStorage.setItem(KEYS.pendingChatPrompt, JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  function buildMetaTensionPrompt(item) {
    const source = asText(item?.source, "Ukjent");
    const target = asText(item?.target, "Ukjent");
    const strength = Number(item?.strength || 0) || 0;
    return `Bygg videre på denne AHA-spenningen:

${source} ↔ ${target}
Styrke: ${strength}

Forklar hva spenningen betyr i materialet mitt, hvilke tekster/ideer den henger sammen med, og foreslå ett konkret neste steg.`;
  }

  function buildMetaConceptPrompt(item, kind) {
    const noun = kind === "theme" ? "AHA-hovedtema" : "AHA-begrep";
    const label = asText(item?.label, "Ukjent");
    const count = Number(item?.count || 0) || 0;
    return `Bygg videre på dette ${noun}:

${label} ×${count}

Forklar hvordan dette begrepet går igjen i materialet mitt, hvilke mulige retninger det peker mot, og foreslå ett konkret neste steg.`;
  }

  function buildMetaSubjectPrompt(item) {
    const label = asText(item?.label, "Ukjent");
    return `Bygg videre på denne AHA-fagkoblingen:

${label}

Forklar hvordan materialet mitt kan kobles til dette fagområdet, og foreslå en konkret vei videre.`;
  }

  function handleMetaProfileAction(event) {
    const button = event?.target?.closest?.("button[data-action]");
    if (!button || !latestMetaProfile) return;
    const action = button.getAttribute("data-action") || "";
    const index = Number.parseInt(button.getAttribute("data-index") || "", 10);
    if (!Number.isInteger(index) || index < 0) return;

    let prompt = "";
    if (action === "meta-build-theme") prompt = buildMetaConceptPrompt(asArray(latestMetaProfile.topThemes)[index], "theme");
    if (action === "meta-build-concept") prompt = buildMetaConceptPrompt(asArray(latestMetaProfile.topConcepts)[index], "concept");
    if (action === "meta-build-tension") prompt = buildMetaTensionPrompt(asArray(latestMetaProfile.topTensions)[index]);
    if (action === "meta-build-subject") prompt = buildMetaSubjectPrompt(asArray(latestMetaProfile.topSubjectLinks)[index]);
    if (!prompt) return;
    if (!savePendingChatPrompt(prompt)) return;
    window.location.href = "chat.html";
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

    const metaProfileEl = document.getElementById("aha-meta-profile-home");
    if (metaProfileEl) {
      const meta = collectAhaMetaProfile();
      latestMetaProfile = meta;
      metaProfileEl.onclick = handleMetaProfileAction;
      const noData = !meta.topThemes.length && !meta.topConcepts.length && !meta.topTensions.length && !meta.topSubjectLinks.length && !meta.recentAfterwork.length;
      if (noData) {
        metaProfileEl.innerHTML = `<p class="aha-afterwork-empty">AHA har ikke nok materiale ennå. Start en samtale eller lagre et etterarbeid.</p>`;
      } else {
        const chips = (items, action, kind) => items.length ? `<div class="aha-meta-chip-list">${items.map((item, index) => `<div class="aha-meta-chip-row"><span class="aha-meta-chip">${escapeHtml(item.label)} ×${escapeHtml(String(item.count || 0))}</span><button type="button" class="aha-meta-action aha-tile-btn aha-tile-btn-secondary" data-action="${escapeHtml(action)}" data-index="${index}"${kind ? ` data-kind="${escapeHtml(kind)}"` : ""}>Bygg videre</button></div>`).join("")}</div>` : `<p class="aha-afterwork-empty">Ingen data ennå.</p>`;
        const tensions = meta.topTensions.length ? `<ul class="aha-meta-line-list">${meta.topTensions.map((item, index) => `<li><div>${escapeHtml(item.source)} ↔ ${escapeHtml(item.target)} · styrke ${escapeHtml(String(item.strength || 0))}</div><button type="button" class="aha-meta-action aha-tile-btn aha-tile-btn-secondary aha-meta-line-action" data-action="meta-build-tension" data-index="${index}">Bygg videre</button></li>`).join("")}</ul>` : `<p class="aha-afterwork-empty">Ingen tydelige spenninger ennå.</p>`;
        const subjects = meta.topSubjectLinks.length ? `<ul class="aha-meta-mini-list">${meta.topSubjectLinks.map((item, index) => `<li><div>${escapeHtml(item.label)} <small>×${escapeHtml(String(item.count || 0))}</small></div><button type="button" class="aha-meta-action aha-tile-btn aha-tile-btn-secondary aha-meta-line-action" data-action="meta-build-subject" data-index="${index}">Bygg videre</button></li>`).join("")}</ul>` : `<p class="aha-afterwork-empty">Ingen fagkoblinger ennå.</p>`;
        const recent = meta.recentAfterwork.length ? `<ul class="aha-meta-mini-list">${meta.recentAfterwork.map((item) => `<li><strong>${escapeHtml(item.createdAt || "Ukjent dato")}</strong> · ${escapeHtml(item.title || item.preview || "AHA etterarbeid")}</li>`).join("")}</ul>` : `<p class="aha-afterwork-empty">Ingen lagrede etterarbeid ennå.</p>`;

        metaProfileEl.innerHTML = `<div class="aha-meta-profile-grid">
          <section class="aha-meta-profile-section"><h4>Hovedtemaer</h4>${chips(meta.topThemes, "meta-build-theme", "theme")}</section>
          <section class="aha-meta-profile-section"><h4>Begreper</h4>${chips(meta.topConcepts, "meta-build-concept", "concept")}</section>
          <section class="aha-meta-profile-section"><h4>Spenninger</h4>${tensions}</section>
          <section class="aha-meta-profile-section"><h4>Fagkoblinger</h4>${subjects}</section>
          <section class="aha-meta-profile-section"><h4>Siste etterarbeid</h4>${recent}</section>
        </div>`;
      }
    }

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

  global.AHAProfile = { collectProfileStatus, collectRecentActivity, collectHistoryGoStatus, collectPrivacyStatus, collectAfterworkArchive, collectAhaMetaProfile, render, refresh };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})(window);
