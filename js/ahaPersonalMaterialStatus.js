// ahaPersonalMaterialStatus.js
// Read-only presentation adapter for the AHA connection state of personal material.

(function (global) {
  "use strict";

  const SURFACES = Object.freeze([
    Object.freeze({
      key: "notes",
      rootId: "notes-list",
      moduleGlobal: "AHANotes",
      cardSelector: ".module-card",
      idSelector: "[data-note-edit]",
      idDatasetKey: "noteEdit",
      sourceMetaKey: "note_id",
      connectedLabel: "Koblet til AHA",
      disconnectedLabel: "Ikke koblet til AHA ennå"
    }),
    Object.freeze({
      key: "feed",
      rootId: "feed-list",
      moduleGlobal: "AHAFeed",
      cardSelector: ".module-card",
      idSelector: "[data-feed-delete]",
      idDatasetKey: "feedDelete",
      sourceMetaKey: "feed_post_id",
      connectedLabel: "Koblet til AHA",
      disconnectedLabel: "Ikke koblet til AHA ennå",
      hideActionWhenConnected: "[data-feed-ingest]"
    }),
    Object.freeze({
      key: "gallery",
      rootId: "gallery-list",
      moduleGlobal: "AHAGallery",
      cardSelector: ".module-card",
      idSelector: "[data-gallery-delete]",
      idDatasetKey: "galleryDelete",
      sourceMetaKey: "gallery_item_id",
      connectedLabel: "Teksten er koblet til AHA",
      disconnectedLabel: "Ingen tekst koblet til AHA ennå"
    }),
    Object.freeze({
      key: "insta",
      rootId: "insta-list",
      moduleGlobal: "AHAInsta",
      cardSelector: ".insta-post",
      idSelector: "[data-insta-like]",
      idDatasetKey: "instaLike",
      sourceMetaKey: "insta_post_id",
      connectedLabel: "Tekst koblet til AHA",
      disconnectedLabel: "Ingen tekst koblet til AHA"
    })
  ]);

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cleanId(value) {
    return String(value || "").trim();
  }

  function isUnavailable(record) {
    return Boolean(record?.deleted_at || record?.deletedAt || record?.archived === true);
  }

  function eventTime(event) {
    const value = Date.parse(event?.updated_at || event?.created_at || "");
    return Number.isFinite(value) ? value : 0;
  }

  function stripTechnicalSourceText(value) {
    return String(value ?? "")
      .replace(/\s*·\s*(?:AHA\s+source|source)\s*:\s*[^\s·]+/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function matchingSourceEvents(record, events, sourceMetaKey) {
    const objectId = cleanId(record?.id);
    const sourceEventId = cleanId(record?.last_source_event_id);
    if (!objectId && !sourceEventId) return [];

    return asArray(events)
      .filter((event) => event && typeof event === "object" && !isUnavailable(event))
      .filter((event) => {
        if (sourceEventId && cleanId(event.id) === sourceEventId) return true;
        if (!objectId || !sourceMetaKey) return false;
        return cleanId(event?.meta?.[sourceMetaKey]) === objectId;
      })
      .sort((a, b) => eventTime(b) - eventTime(a));
  }

  function hasSourceEvidence(record, events, sourceMetaKey) {
    if (cleanId(record?.last_source_event_id)) return true;
    return matchingSourceEvents(record, events, sourceMetaKey).length > 0;
  }

  function getMaterialStatus(record, events, surface) {
    const connected = hasSourceEvidence(record, events, surface?.sourceMetaKey);
    return {
      connected,
      label: connected
        ? String(surface?.connectedLabel || "Koblet til AHA")
        : String(surface?.disconnectedLabel || "Ikke koblet til AHA ennå"),
      insightsHref: connected ? "insights.html" : "",
      local_only: true,
      read_only: true,
      technical_id_visible: false,
      writes_to_ingest: false,
      writes_to_source_events: false,
      music_analysis_enabled: false
    };
  }

  function loadRecords(surface) {
    const api = global[surface.moduleGlobal];
    if (!api || typeof api.load !== "function") return [];
    try {
      return asArray(api.load()).filter((record) => !isUnavailable(record));
    } catch {
      return [];
    }
  }

  function loadSourceEvents() {
    try {
      return asArray(global.AHASources?.loadSourceEvents?.()).filter((event) => !isUnavailable(event));
    } catch {
      return [];
    }
  }

  function cardRecordId(card, surface) {
    const anchor = card?.querySelector?.(surface.idSelector);
    return cleanId(anchor?.dataset?.[surface.idDatasetKey]);
  }

  function stripTechnicalMeta(card) {
    card?.querySelectorAll?.(".module-meta")?.forEach?.((meta) => {
      if (meta?.dataset?.ahaPersonalMaterialStatus === "1") return;
      const current = String(meta?.textContent || "");
      const next = stripTechnicalSourceText(current);
      if (next !== current) meta.textContent = next;
    });
  }

  function placeStatusElement(card, surface) {
    let status = card?.querySelector?.("[data-aha-personal-material-status='1']");
    if (status) return status;
    if (!global.document?.createElement) return null;

    status = global.document.createElement("div");
    status.className = "module-meta aha-personal-material-status";
    status.dataset.ahaPersonalMaterialStatus = "1";

    if (surface.key === "insta") {
      const comments = card.querySelector?.(".insta-comments-block");
      if (comments?.parentNode) comments.parentNode.insertBefore(status, comments);
      else card.appendChild?.(status);
      return status;
    }

    const meta = card.querySelector?.(".module-meta:not([data-aha-personal-material-status='1'])");
    if (meta?.insertAdjacentElement) meta.insertAdjacentElement("afterend", status);
    else card.appendChild?.(status);
    return status;
  }

  function renderStatusElement(element, status) {
    if (!element || !status) return;
    const signature = `${status.connected ? "1" : "0"}|${status.label}`;
    if (element.dataset.ahaPersonalMaterialSignature === signature) return;
    element.dataset.ahaPersonalMaterialSignature = signature;

    while (element.firstChild) element.removeChild(element.firstChild);
    const label = global.document.createElement("span");
    label.textContent = status.label;
    element.appendChild(label);

    if (status.connected) {
      element.appendChild(global.document.createTextNode(" · "));
      const link = global.document.createElement("a");
      link.href = status.insightsHref;
      link.textContent = "Se AHA-innsikter";
      element.appendChild(link);
    }
  }

  function applySurface(surface) {
    const root = global.document?.getElementById?.(surface.rootId);
    if (!root) return false;

    const records = loadRecords(surface);
    const byId = new Map(records.map((record) => [cleanId(record?.id), record]).filter(([id]) => id));
    const events = loadSourceEvents();
    const cards = asArray(Array.from(root.querySelectorAll?.(surface.cardSelector) || []));

    cards.forEach((card) => {
      const id = cardRecordId(card, surface);
      const record = byId.get(id);
      if (!record) return;

      stripTechnicalMeta(card);
      const status = getMaterialStatus(record, events, surface);
      const element = placeStatusElement(card, surface);
      renderStatusElement(element, status);

      if (surface.hideActionWhenConnected) {
        const action = card.querySelector?.(surface.hideActionWhenConnected);
        if (action) action.hidden = status.connected;
      }
    });

    return true;
  }

  function detectSurface() {
    if (!global.document?.getElementById) return null;
    return SURFACES.find((surface) => global.document.getElementById(surface.rootId)) || null;
  }

  function schedule(fn) {
    if (typeof global.queueMicrotask === "function") global.queueMicrotask(fn);
    else Promise.resolve().then(fn);
  }

  function install() {
    const surface = detectSurface();
    if (!surface) return false;
    const root = global.document.getElementById(surface.rootId);
    let scheduled = false;
    const refresh = () => {
      if (scheduled) return;
      scheduled = true;
      schedule(() => {
        scheduled = false;
        applySurface(surface);
      });
    };

    applySurface(surface);

    if (typeof global.MutationObserver === "function") {
      const observer = new global.MutationObserver(refresh);
      observer.observe(root, { childList: true, subtree: true, characterData: true });
    }
    global.addEventListener?.("aha:source-event-added", refresh);
    return true;
  }

  global.AHAPersonalMaterialStatus = {
    SURFACES,
    stripTechnicalSourceText,
    matchingSourceEvents,
    hasSourceEvidence,
    getMaterialStatus,
    applySurface,
    install
  };

  if (global.document?.readyState === "loading") {
    global.document.addEventListener?.("DOMContentLoaded", install);
  } else {
    install();
  }
})(window);
