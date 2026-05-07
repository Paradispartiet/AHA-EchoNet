// ahaChatClean.js
// Ren kobling mellom AHA Chat UI og eksisterende InsightsEngine.

(function (global) {
  "use strict";

  const SUBJECT_ID = "sub_laring";
  const STORAGE_KEY = "aha_insight_chamber_v1";

  function loadChamberFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return global.InsightsEngine.createEmptyChamber();
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Kunne ikke laste innsiktskammer, lager nytt.", e);
      return global.InsightsEngine.createEmptyChamber();
    }
  }

  function saveChamberToStorage(chamber) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chamber));
    } catch (e) {
      console.warn("Kunne ikke lagre innsiktskammer.", e);
    }
  }

  function getThemeId() {
    const input = document.getElementById("theme-id");
    const value = input && String(input.value || "").trim();
    return value || "th_default";
  }

  function getFieldId() {
    const select = document.getElementById("field-id");
    const value = select && String(select.value || "").trim();
    return value || null;
  }

  function out(message) {
    const el = document.getElementById("out");
    if (!el) return;
    el.textContent = String(message || "");
  }

  function appendChat(role, text) {
    const log = document.getElementById("chat-log");
    if (!log) return;
    const div = document.createElement("div");
    div.className = `chat-line chat-line-${role}`;
    div.textContent = text;
    log.appendChild(div);
  }

  function currentInsights() {
    const chamber = loadChamberFromStorage();
    return global.InsightsEngine.getInsightsForTopic(
      chamber,
      SUBJECT_ID,
      getThemeId()
    );
  }

  function renderPanel(html) {
    const panel = document.getElementById("panel");
    if (panel) panel.innerHTML = html;
  }

  function handleUserMessage(messageText) {
    const text = String(messageText || "").trim();
    if (!text || !global.InsightsEngine) return 0;

    const themeId = getThemeId();
    const fieldId = getFieldId();
    let chamber = loadChamberFromStorage();

    const sentences = global.InsightsEngine.splitIntoSentences(text);
    const chunks = sentences.length ? sentences : [text];

    chunks.forEach((chunk) => {
      const signal = global.InsightsEngine.createSignalFromMessage(
        chunk,
        SUBJECT_ID,
        themeId,
        { field_id: fieldId }
      );
      chamber = global.InsightsEngine.addSignalToChamber(chamber, signal);
    });

    saveChamberToStorage(chamber);

    global.AHASources?.addSourceEvent?.({
      source_type: "chat",
      source_app: "aha_chat",
      content_type: "text",
      title: "AHA Chat-melding",
      text,
      user_created: true,
      imported: false,
      created_at: new Date().toISOString(),
      meta: { theme_id: themeId, field_id: fieldId }
    });

    return chunks.length;
  }

  function showInsights() {
    const insights = currentInsights();
    renderPanel(
      `<div class="insight-panel"><h2>Innsikter</h2>${
        insights.length
          ? `<ul>${insights.map((ins) => `<li><strong>${ins.title || "Innsikt"}</strong><br>${ins.summary || ""}</li>`).join("")}</ul>`
          : "<p>Ingen innsikter ennå.</p>"
      }</div>`
    );
  }

  function showStatus() {
    const chamber = loadChamberFromStorage();
    const stats = global.InsightsEngine.computeTopicStats(chamber, SUBJECT_ID, getThemeId());
    out(JSON.stringify(stats, null, 2));
  }

  function showConcepts() {
    const insights = currentInsights();
    const concepts = [];
    insights.forEach((ins) => {
      (ins.concepts || []).forEach((c) => concepts.push(c.key || c.label || c));
    });
    out(JSON.stringify([...new Set(concepts)].filter(Boolean), null, 2));
  }

  function showMeta() {
    const chamber = loadChamberFromStorage();
    if (!global.MetaInsightsEngine?.buildUserMetaProfile) {
      out("MetaInsightsEngine mangler buildUserMetaProfile.");
      return;
    }
    out(JSON.stringify(global.MetaInsightsEngine.buildUserMetaProfile(chamber, SUBJECT_ID), null, 2));
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    out("AHA-kammer nullstilt.");
    renderPanel("");
  }

  function bind() {
    const button = document.getElementById("btn-send");
    const textarea = document.getElementById("msg");
    if (button && textarea) {
      button.addEventListener("click", () => {
        const text = textarea.value.trim();
        if (!text) return;
        appendChat("user", text);
        const count = handleUserMessage(text);
        appendChat("aha", `Registrert ${count} signal${count === 1 ? "" : "er"}.`);
        textarea.value = "";
      });
    }

    document.getElementById("btn-insights")?.addEventListener("click", showInsights);
    document.getElementById("btn-status")?.addEventListener("click", showStatus);
    document.getElementById("btn-concepts")?.addEventListener("click", showConcepts);
    document.getElementById("btn-meta")?.addEventListener("click", showMeta);
    document.getElementById("btn-export")?.addEventListener("click", () => out(JSON.stringify(loadChamberFromStorage(), null, 2)));
    document.getElementById("btn-reset")?.addEventListener("click", reset);
  }

  global.loadChamberFromStorage = global.loadChamberFromStorage || loadChamberFromStorage;
  global.saveChamberToStorage = global.saveChamberToStorage || saveChamberToStorage;
  global.AHAChat = {
    loadChamberFromStorage,
    saveChamberToStorage,
    handleUserMessage
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})(window);
