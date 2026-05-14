// ahaInsights.js
// Leser eksisterende innsiktskammer + source events og viser innsikter i insights.html.

(function (global) {
  "use strict";

  const CHAMBER_KEY = "aha_insight_chamber_v1";
  const EVENTS_KEY = "aha_source_events_v1";

  function safeParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function asText(value, fallback) {
    const text = String(value || "").trim();
    return text || fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ts(item) {
    const raw = item?.updated_at || item?.updatedAt || item?.last_updated || item?.lastUpdated || item?.created_at || item?.createdAt || item?.first_seen || item?.firstSeen || "";
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : 0;
  }

  function loadChamber() {
    const raw = localStorage.getItem(CHAMBER_KEY);
    const parsed = safeParse(raw || "{}", { insights: [] });
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { insights: [] };
    if (!Array.isArray(parsed.insights)) parsed.insights = [];
    return parsed;
  }

  function loadSourceEvents() {
    const raw = localStorage.getItem(EVENTS_KEY);
    const parsed = safeParse(raw || "[]", []);
    return Array.isArray(parsed) ? parsed : [];
  }

  function getInsights() {
    const chamber = loadChamber();
    const items = asArray(chamber?.insights).slice();
    items.sort((a, b) => ts(b) - ts(a));
    return items;
  }

  function extractTermValue(entry) {
    if (typeof entry === "string") return entry;
    if (!entry || typeof entry !== "object") return "";
    return entry?.term || entry?.label || entry?.name || entry?.text || entry?.value || entry?.key || "";
  }

  function normalizeTerms(insight) {
    const collected = asArray(insight?.terms)
      .concat(
        asArray(insight?.tokens),
        asArray(insight?.keywords),
        asArray(insight?.raw_terms),
        asArray(insight?.rawTerms),
        asArray(insight?.concepts)
      )
      .map((entry) => asText(extractTermValue(entry), ""))
      .filter(Boolean);

    const seen = new Set();
    return collected.filter((term) => {
      const key = term.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeInsightForView(insight) {
    const base = global.AHAContracts?.normalizeBaseItem
      ? global.AHAContracts.normalizeBaseItem(insight, { type: "insight", source: "aha" })
      : null;

    return {
      raw: insight,
      title: asText(insight?.title || insight?.heading || insight?.label || base?.title, "Innsikt"),
      summary: asText(insight?.summary || insight?.text || insight?.content || insight?.claim, "Ingen oppsummering ennå."),
      date: asText(insight?.updated_at || insight?.updatedAt || insight?.last_updated || insight?.lastUpdated || insight?.created_at || insight?.createdAt || insight?.first_seen || insight?.firstSeen, "Ukjent tidspunkt"),
      sourceEventId: asText(insight?.source_event_id || insight?.sourceEventId || insight?.source_id || insight?.sourceId || insight?.event_id || insight?.eventId, ""),
      terms: normalizeTerms(insight),
      topic: asText(insight?.topic || insight?.emne || insight?.category, ""),
      confidence: insight?.confidence ?? insight?.score ?? null
    };
  }

  function eventPreview(event) {
    const text = asText(event?.text || event?.title, "");
    return text.length > 140 ? `${text.slice(0, 137)}…` : text;
  }

  function findSourceById(sourceEvents, id) {
    if (!id) return null;
    return sourceEvents.find((ev) => String(ev?.id || ev?.event_id || ev?.source_event_id || "") === String(id)) || null;
  }

  function countArray(data) {
    return Array.isArray(data) ? data.length : 0;
  }

  function getInsightRefId(insight, index) {
    return asText(insight?.id || insight?.base?.id, `insight_idx_${index}`);
  }

  function getInsightTitle(insight) {
    return asText(insight?.title || insight?.heading || insight?.label || insight?.summary, "Innsikt");
  }

  function getActiveLists() {
    if (!global.AHALists?.loadLists) return [];
    return asArray(global.AHALists.loadLists()).filter((list) => !list?.deletedAt);
  }
  function getActiveGroups() {
    if (!global.AHAGroups?.getActiveGroups) return [];
    return asArray(global.AHAGroups.getActiveGroups());
  }
  function sendInsightToGroup(groupId, insight, index) {
    if (!global.AHAGroups?.addReferenceToGroupByObject) {
      return { ok: false, message: "Grupper er ikke tilgjengelig." };
    }
    const refId = getInsightRefId(insight, index);
    const result = global.AHAGroups.addReferenceToGroupByObject(groupId, {
      title: getInsightTitle(insight),
      type: "insight",
      source: "aha_insights",
      refId,
      meta: { index }
    });
    if (!result) return { ok: false, message: "Kunne ikke legge til i gruppe." };
    if (result?.references) return { ok: true, message: "Finnes allerede i gruppen" };
    return { ok: true, message: "Lagt i gruppe" };
  }

  function sendInsightToList(listId, insight, index) {
    if (!global.AHALists?.addItemToList) {
      return { ok: false, reason: "lists_unavailable", message: "Lister er ikke tilgjengelig." };
    }
    const refId = getInsightRefId(insight, index);
    const title = getInsightTitle(insight);
    const item = {
      id: `insight_${refId}`,
      title,
      type: "insight",
      source: "aha_insights",
      refId,
      addedAt: new Date().toISOString(),
      meta: { index, sourceEventId: asText(insight?.source_event_id || insight?.sourceEventId, "") }
    };
    const result = global.AHALists.addItemToList(listId, item);
    if (!result) return { ok: false, reason: "add_failed", message: "Kunne ikke legge til i listen." };
    if (result?.items) return { ok: true, reason: "duplicate", message: "Finnes allerede i listen" };
    return { ok: true, reason: "added", message: "Lagt til i liste" };
  }

  function renderSubjectLinks(matches) {
    const items = Array.isArray(matches) ? matches.slice(0, 8) : [];
    if (!items.length) return "";
    const chips = items.map((item) => `<span class="subject-link-chip insight-subject-chip">${escapeHtml(asText(item?.title || item?.subject_label, "Fagkobling"))}</span>`).join("");
    return `<section class="subject-links insight-subject-links"><span class="subject-links-label">Fagkoblinger</span><div class="subject-link-chips">${chips}</div></section>`;
  }

  function createInsightCard(view, sourceEvent, insight, index) {
    const card = document.createElement("article");
    card.className = "insight-card insight-archive-card";
    const lists = getActiveLists();
    const groups = getActiveGroups();

    const terms = view.terms.slice(0, 8).map((t) => `<span class="insight-chip">${escapeHtml(t)}</span>`).join("");
    const sourceHtml = sourceEvent
      ? `<div class="insight-source"><strong>Kilde:</strong> ${escapeHtml(asText(sourceEvent.source_type, "ukjent"))} · ${escapeHtml(asText(sourceEvent.source_app, "ukjent"))}</div>
         <div class="insight-source-preview">${escapeHtml(eventPreview(sourceEvent))}</div>
         <div class="insight-source-time">${escapeHtml(asText(sourceEvent.created_at, "Ukjent tidspunkt"))}</div>
         <a class="aha-tile-btn" href="#source-${escapeHtml(asText(sourceEvent.id, ""))}">Åpne kilde</a>`
      : `<div class="insight-source-missing">Ingen kilde koblet ennå</div>`;

    const listSection = lists.length
      ? `
      <section class="insight-list-linker">
        <label>
          Velg liste
          <select data-insight-list-select="${escapeHtml(String(index))}">
            <option value="">Velg liste</option>
            ${lists.map((list) => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.title)}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="aha-tile-btn" data-insight-add-to-list="${escapeHtml(String(index))}">Legg i liste</button>
        <div class="insight-list-status" data-insight-list-status="${escapeHtml(String(index))}"></div>
      </section>
    `
      : `
      <section class="insight-list-linker">
        <p class="insight-list-empty">Ingen lister ennå. <a href="lists.html">Lag en liste først.</a></p>
      </section>
    `;
    const groupSection = groups.length
      ? `
      <section class="insight-list-linker">
        <label>
          Velg gruppe
          <select class="gruppe-select" data-insight-group-select="${escapeHtml(String(index))}">
            <option value="">Velg gruppe</option>
            ${groups.map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.title)}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="aha-tile-btn gruppe-knapp" data-insight-add-to-group="${escapeHtml(String(index))}">Legg i gruppe</button>
        <div class="insight-list-status statuslinje" data-insight-group-status="${escapeHtml(String(index))}"></div>
      </section>
    `
      : `
      <section class="insight-list-linker">
        <p class="insight-list-empty statuslinje">Ingen grupper ennå. <a href="groups.html">Lag en gruppe først.</a></p>
      </section>
    `;

    card.innerHTML = `
      <header class="insight-card-head">
        <h3>${escapeHtml(view.title)}</h3>
        <span class="insight-chip">${escapeHtml(view.date)}</span>
      </header>
      <p class="insight-card-summary">${escapeHtml(view.summary)}</p>
      <div class="insight-meta-row">
        ${view.topic ? `<span class="insight-chip">Emne: ${escapeHtml(view.topic)}</span>` : ""}
        ${view.confidence !== null ? `<span class="insight-chip">Score: ${escapeHtml(Number(view.confidence).toFixed(2))}</span>` : ""}
        ${view.sourceEventId ? `<span class="insight-chip">Kilde-ID: ${escapeHtml(view.sourceEventId)}</span>` : ""}
      </div>
      ${terms ? `<div class="insight-layer-chips">${terms}</div>` : ""}
      <div class="insight-subject-links-host"></div>
      <section class="insight-source-block">${sourceHtml}</section>
      ${listSection}
      ${groupSection}
    `;
    card.dataset.insightIndex = String(index);
    card._insightRaw = insight;

    if (global.AHASubjectEngine?.matchInsight) {
      global.AHASubjectEngine.matchInsight(insight).then((matches) => {
        const host = card.querySelector(".insight-subject-links-host");
        if (!host) return;
        host.innerHTML = renderSubjectLinks(matches);
      }).catch(() => {});
    }

    return card;
  }

  function applyFilters(insights, eventsById, query, filter) {
    const q = String(query || "").toLowerCase().trim();
    return insights.filter((ins) => {
      const view = normalizeInsightForView(ins);
      const sourceEvent = findSourceById(eventsById, view.sourceEventId);
      const haystack = [
        view.title,
        view.summary,
        view.terms.join(" ")
      ].join(" ").toLowerCase();
      const searchMatch = !q || haystack.includes(q);
      if (!searchMatch) return false;

      if (filter === "with_source") return Boolean(sourceEvent);
      if (filter === "without_source") return !sourceEvent;
      if (filter === "with_terms") return view.terms.length > 0;
      if (filter === "emne") return Boolean(ins?.emne_suggestions || ins?.topic_suggestions);
      if (filter === "merge") return Boolean(ins?.merge_suggestions);
      return true;
    });
  }

  function renderMeta(chamber) {
    const target = document.getElementById("insights-meta");
    if (!target) return;
    const emne = asArray(chamber?.emne_suggestions);
    const merge = asArray(chamber?.merge_suggestions);
    const dismiss = asArray(chamber?.merge_dismissals);
    const patterns = asArray(chamber?.patterns);
    const metaInsights = asArray(chamber?.meta_insights);

    const list = (items, mapper) => items.slice(0, 5).map(mapper).join("");

    target.innerHTML = `
      <h2>Meta / forslag</h2>
      <div class="insight-meta-row">
        <span class="insight-chip">Emneforslag: ${emne.length}</span>
        <span class="insight-chip">Merge suggestions: ${merge.length}</span>
        <span class="insight-chip">Merge dismissals: ${dismiss.length}</span>
        <span class="insight-chip">Patterns: ${patterns.length}</span>
        <span class="insight-chip">Meta insights: ${metaInsights.length}</span>
      </div>
      <div class="meta-columns">
        <div><h4>Emneforslag</h4><ul>${list(emne, (x) => `<li>${escapeHtml(asText(x?.label || x?.title || x?.emne_id, "Forslag"))}</li>`) || "<li>Ingen ennå</li>"}</ul></div>
        <div><h4>Merge suggestions</h4><ul>${list(merge, (x) => `<li>${escapeHtml(asText(x?.reason || x?.description || x?.id, "Forslag"))}</li>`) || "<li>Ingen ennå</li>"}</ul></div>
        <div><h4>Patterns / Meta</h4><ul>${list(patterns.concat(metaInsights), (x) => `<li>${escapeHtml(asText(x?.description || x?.title || x?.id, "Meta"))}</li>`) || "<li>Ingen ennå</li>"}</ul></div>
      </div>
    `;
  }

  function render() {
    const chamber = loadChamber();
    const sourceEvents = loadSourceEvents();
    const insights = getInsights();

    const search = document.getElementById("insights-search")?.value || "";
    const filter = document.getElementById("insights-filter")?.value || "all";
    const listEl = document.getElementById("insights-list");

    const filtered = applyFilters(insights, sourceEvents, search, filter);
    const indexedInsights = filtered.map((ins) => ({ insight: ins, originalIndex: insights.indexOf(ins) }));

    const stats = document.getElementById("insights-stats");
    if (stats) {
      stats.innerHTML = `
        <span class="insight-chip">Innsikter: ${insights.length}</span>
        <span class="insight-chip">Source events: ${sourceEvents.length}</span>
        <span class="insight-chip">Emneforslag: ${countArray(chamber?.emne_suggestions)}</span>
        <span class="insight-chip">Merge suggestions: ${countArray(chamber?.merge_suggestions)}</span>
      `;
    }

    if (listEl) {
      listEl.innerHTML = "";
      if (!indexedInsights.length) {
        listEl.innerHTML = '<article class="insight-card"><p class="insight-card-summary">Ingen innsikter matcher søk/filter ennå.</p></article>';
      } else {
        indexedInsights.forEach(({ insight, originalIndex }) => {
          const safeIndex = originalIndex >= 0 ? originalIndex : 0;
          const ins = insight;
          const view = normalizeInsightForView(ins);
          const sourceEvent = findSourceById(sourceEvents, view.sourceEventId);
          listEl.appendChild(createInsightCard(view, sourceEvent, ins, safeIndex));
        });
      }
    }

    renderMeta(chamber);
  }

  function refresh() {
    render();
  }

  function attach() {
    const refreshBtn = document.getElementById("insights-refresh");
    const search = document.getElementById("insights-search");
    const filter = document.getElementById("insights-filter");

    if (refreshBtn) refreshBtn.addEventListener("click", refresh);
    if (search) search.addEventListener("input", render);
    if (filter) filter.addEventListener("change", render);
    document.getElementById("insights-list")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const index = target.dataset.insightAddToList;
      if (index) {
        const card = target.closest(".insight-card");
        if (!card) return;
        const select = card.querySelector(`[data-insight-list-select="${index}"]`);
        const status = card.querySelector(`[data-insight-list-status="${index}"]`);
        if (!(select instanceof HTMLSelectElement) || !(status instanceof HTMLElement)) return;
        if (!select.value) {
          status.textContent = "Velg en liste først";
          return;
        }
        const insight = card._insightRaw;
        const result = sendInsightToList(select.value, insight, Number(index));
        status.textContent = result.message;
        return;
      }
      const groupIndex = target.dataset.insightAddToGroup;
      if (!groupIndex) return;
      const groupCard = target.closest(".insight-card");
      if (!groupCard) return;
      const groupSelect = groupCard.querySelector(`[data-insight-group-select="${groupIndex}"]`);
      const groupStatus = groupCard.querySelector(`[data-insight-group-status="${groupIndex}"]`);
      if (!(groupSelect instanceof HTMLSelectElement) || !(groupStatus instanceof HTMLElement)) return;
      if (!groupSelect.value) {
        groupStatus.textContent = "Velg en gruppe først";
        return;
      }
      const groupInsight = groupCard._insightRaw;
      const groupResult = sendInsightToGroup(groupSelect.value, groupInsight, Number(groupIndex));
      groupStatus.textContent = groupResult.message;
    });

    render();
  }

  global.AHAInsights = {
    loadChamber,
    loadSourceEvents,
    getInsights,
    render,
    refresh,
    sendInsightToList,
    sendInsightToGroup
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach);
  } else {
    attach();
  }
})(window);
