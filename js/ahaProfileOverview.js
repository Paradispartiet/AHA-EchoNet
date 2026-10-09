(function (global) {
  "use strict";

  const ROOT_ID = "aha-profile-overview";

  function asNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeCall(fn, fallback) {
    try {
      return typeof fn === "function" ? (fn() || fallback) : fallback;
    } catch {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function buildOverviewModel(profileApi) {
    const api = profileApi || {};
    const status = safeCall(api.collectProfileStatus, {});
    const meta = safeCall(api.collectAhaMetaProfile, {});
    const historyGo = safeCall(api.collectHistoryGoStatus, {});
    const privacy = safeCall(api.collectPrivacyStatus, { localOnly: true });

    const footprint = [
      { key: "insights", label: "Innsikter", count: asNumber(status.insightsCount), href: "insights.html" },
      { key: "sources", label: "Kilder", count: asNumber(status.sourceEventsCount), href: "sources.html" },
      { key: "notes", label: "Notater", count: asNumber(status.notesCount), href: "notes.html" },
      { key: "lists", label: "Lister", count: asNumber(status.listsCount), href: "lists.html" },
      { key: "paths", label: "Stier", count: asNumber(status.pathsCount), href: "paths.html" },
      { key: "afterwork", label: "Etterarbeid", count: asNumber(status.afterworkCount), href: "chat.html" }
    ];

    const total = footprint.reduce((sum, item) => sum + item.count, 0);
    const themes = asArray(meta.topThemes).map((item) => String(item?.label || "").trim()).filter(Boolean).slice(0, 3);
    const concepts = asArray(meta.topConcepts).map((item) => String(item?.label || "").trim()).filter(Boolean).slice(0, 3);
    const historyGoCount = asNumber(historyGo.visitedPlacesCount) + asNumber(historyGo.peopleCollectedCount) + asNumber(historyGo.unlocksCount);

    return {
      total,
      footprint,
      themes,
      concepts,
      historyGoCount,
      historyGoConnected: Boolean(historyGo.hasImportPayload || historyGo.progressExists || historyGoCount),
      localOnly: privacy.localOnly !== false,
      lastActivityAt: String(status.lastActivityAt || "").trim(),
      actions: [
        { label: "Søk i mitt AHA", href: "search.html" },
        { label: "Kunnskapsverksted", href: "knowledge-workbench.html" },
        { label: "Spør min AHA", href: "personal-ai.html" },
        { label: "Se innsikter", href: "insights.html" }
      ],
      local_only: true,
      read_only: true,
      profile_overview_only: true,
      social_profile_enabled: false,
      echonet_shared: false,
      sync_enabled: false,
      backend_enabled: false,
      writes_to_insight_chamber: false
    };
  }

  function renderOverview(root, model) {
    if (!root || !model) return false;

    const footprintMarkup = model.footprint.map((item) => (
      `<a class="aha-status-card" href="${escapeHtml(item.href)}"><strong>${escapeHtml(item.count)}</strong><span>${escapeHtml(item.label)}</span></a>`
    )).join("");

    const signalBits = [];
    if (model.themes.length) signalBits.push(`Temaer: ${model.themes.map(escapeHtml).join(" · ")}`);
    if (model.concepts.length) signalBits.push(`Begreper: ${model.concepts.map(escapeHtml).join(" · ")}`);
    const metaMarkup = signalBits.length
      ? `<p class="aha-module-purpose">${signalBits.join("<br>")}</p>`
      : `<p class="aha-module-purpose">Mønsterbildet vokser etter hvert som AHA får innsikter og etterarbeid å lese.</p>`;

    const historyMarkup = model.historyGoConnected
      ? `<span>History Go: ${escapeHtml(model.historyGoCount)} lokale progresjonssignaler</span>`
      : `<span>History Go: ingen lokal progresjon koblet inn ennå</span>`;

    const actionMarkup = model.actions.map((action, index) => (
      `<a class="aha-tile-btn ${index === 0 ? "aha-tile-btn-primary" : "aha-tile-btn-secondary"}" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`
    )).join("");

    root.innerHTML = `
      <div class="aha-status-stack">
        <strong>${escapeHtml(model.total)} lokale arbeidsobjekter</strong>
        <span>${model.localOnly ? "Alt i denne oversikten er lokalt på enheten." : "Lokal modus er slått av i personverninnstillingene."}</span>
        ${historyMarkup}
        ${model.lastActivityAt ? `<small>Siste lokale aktivitet: ${escapeHtml(model.lastActivityAt)}</small>` : ""}
      </div>
      ${model.total === 0 ? `<section class="aha-onboarding-empty" aria-labelledby="aha-profile-empty-title">
        <p class="eyebrow">Kom i gang med Mitt AHA</p>
        <h3 id="aha-profile-empty-title">Din oversikt fylles med det du velger å lagre</h3>
        <p>Ingen lokale AHA-arbeidsobjekter er registrert i denne oversikten ennå. Start med et spørsmål eller et notat, eller se hvordan de ferdige modulene henger sammen.</p>
        <div class="aha-tile-actions">
          <a class="aha-tile-btn aha-tile-btn-primary" href="chat.html">Åpne Chat</a>
          <a class="aha-tile-btn" href="notes.html">Skriv et notat</a>
          <a class="aha-tile-btn" href="demo.html">Se kom-i-gang-guiden</a>
        </div>
      </section>` : ""}
      <div class="aha-profile-status-grid">${footprintMarkup}</div>
      <div class="aha-meta-profile-section">
        <h3>Det AHA ser nå</h3>
        ${metaMarkup}
      </div>
      <div class="aha-tile-actions">${actionMarkup}</div>
    `;
    return true;
  }

  function install() {
    const root = global.document?.getElementById?.(ROOT_ID);
    if (!root) return false;

    const profileApi = global.AHAProfile;
    if (!profileApi) return false;
    return renderOverview(root, buildOverviewModel(profileApi));
  }

  global.AHAProfileOverview = {
    buildOverviewModel,
    renderOverview,
    install
  };

  if (global.document?.readyState === "loading") {
    global.document.addEventListener?.("DOMContentLoaded", install);
  } else {
    install();
  }
})(window);
