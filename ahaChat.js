// ahaChat.js
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
    log.scrollTop = log.scrollHeight;
    updateEmptyState();
  }

  function updateEmptyState() {
    const empty = document.getElementById("empty-state");
    const log = document.getElementById("chat-log");
    if (!empty || !log) return;
    empty.style.display = log.children.length ? "none" : "block";
  }

  function setComposerText(value) {
    const textarea = document.getElementById("msg");
    if (!textarea) return;
    textarea.value = value;
    textarea.focus();
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

    const sentences = global.InsightsEngine.splitIntoSentences(text);
    const chunks = sentences.length ? sentences : [text];

    if (global.AHAIngest && typeof global.AHAIngest.ingest === "function") {
      // AHAIngest håndterer både source event-loggen, signal-konstruksjon
      // og innlegging i innsiktskammeret. Dobbeltlagring av source events
      // unngås ved at vi ikke lenger kaller AHASources.addSourceEvent her.
      chunks.forEach((chunk) => {
        global.AHAIngest.ingest({
          source_type: "chat",
          source_app: "aha_chat",
          content_type: "text",
          title: "AHA Chat-melding",
          text: chunk,
          user_created: true,
          imported: false,
          created_at: new Date().toISOString(),
          subject_id: SUBJECT_ID,
          theme_id: themeId,
          field_id: fieldId,
          meta: { theme_id: themeId, field_id: fieldId }
        });
      });
      return chunks.length;
    }

    // Fallback hvis AHAIngest ikke er lastet: skriv direkte til motoren
    // og logg source event manuelt slik vi alltid har gjort.
    let chamber = loadChamberFromStorage();
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

  function buildAIState() {
    const chamber = loadChamberFromStorage();
    const insights = currentInsights();
    const topInsights = insights.slice(0, 8).map((ins) => ({
      id: ins.id,
      title: ins.title || "Innsikt",
      summary: ins.summary || "",
      concepts: ins.concepts || [],
      theme_id: ins.theme_id || null,
      subject_id: ins.subject_id || null
    }));
    const concepts = [];
    topInsights.forEach((ins) => (ins.concepts || []).forEach((c) => concepts.push(c)));
    const metaProfile = global.MetaInsightsEngine?.buildUserMetaProfile?.(chamber, SUBJECT_ID) || {};
    return {
      top_insights: topInsights,
      concepts,
      meta_profile: metaProfile
    };
  }

  async function askAhaAgent(message) {
    const apiBase = String(global.AHA_AGENT_API || "").trim().replace(/\/$/, "");
    if (!apiBase) throw new Error("missing_api_base");

    let similar = [];
    if (global.AHAEmbeddings?.findSimilarToText) {
      try {
        const simRes = await global.AHAEmbeddings.findSimilarToText(message, { limit: 5 });
        if (simRes?.ok) similar = simRes.matches || [];
      } catch (err) {
        console.warn("Klarte ikke hente similar insights", err);
      }
    }

    const body = {
      message,
      ai_state: buildAIState(),
      similar_insights: similar,
      profile: {}
    };
    const res = await fetch(`${apiBase}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`chat_http_${res.status}`);
    return res.json();
  }

  function escHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderLayerChips(items, getLabel) {
    const labels = (items || [])
      .map((item) => {
        const label = getLabel(item);
        return label ? escHtml(label) : "";
      })
      .filter(Boolean);
    if (!labels.length) return "";
    return `<div class="insight-layer-chips">${labels
      .map((label) => `<span class="insight-chip">${label}</span>`)
      .join("")}</div>`;
  }

  function renderEmneSuggestions(insight) {
    const list = Array.isArray(insight.emne_suggestions) ? insight.emne_suggestions : [];
    const open = list.filter((s) => s && s.emne_id && (s.status || "suggested") === "suggested");
    if (!open.length) return "";

    const items = open.map((s) => {
      const label = escHtml(s.label || s.short_label || s.title || s.emne_id);
      const subject = s.subject_id ? `<small class="emne-subject">${escHtml(s.subject_id)}</small>` : "";
      const insightId = escHtml(insight.id || "");
      const emneId = escHtml(s.emne_id);
      return `<li class="emne-suggestion">
        <span class="emne-suggestion-label">${label}${subject}</span>
        <span class="emne-suggestion-actions">
          <button type="button" class="emne-confirm-btn" data-action="confirm-emne" data-insight-id="${insightId}" data-emne-id="${emneId}">Legg til</button>
          <button type="button" class="emne-dismiss-btn" data-action="dismiss-emne" data-insight-id="${insightId}" data-emne-id="${emneId}">Ignorer</button>
        </span>
      </li>`;
    }).join("");

    return `<div class="insight-section">
      <span class="insight-section-label">Foreslåtte emner</span>
      <ul class="emne-suggestion-list">${items}</ul>
    </div>`;
  }

  function renderInsightCard(ins) {
    const title = escHtml(ins.title || "Innsikt");
    const summary = escHtml(ins.summary || "");

    const conceptsHtml = renderLayerChips(ins.concepts, (c) => c?.label || c?.key);
    const patternsHtml = renderLayerChips(ins.patterns, (p) => p?.label || p?.key);
    const markersHtml = renderLayerChips(ins.markers, (m) => m?.value);
    const emnerHtml = renderLayerChips((ins.emner || []).map((e) => ({ key: e })), (e) => e?.key);
    const suggestionsHtml = renderEmneSuggestions(ins);

    const claims = (ins.claims || [])
      .map((c) => (c && c.text) || "")
      .filter(Boolean);
    const claimsHtml = claims.length
      ? `<ul class="insight-claims">${claims
          .map((q) => `<li>“${escHtml(q)}”</li>`)
          .join("")}</ul>`
      : "";

    const sections = [
      conceptsHtml ? `<div class="insight-section"><span class="insight-section-label">Begreper</span>${conceptsHtml}</div>` : "",
      patternsHtml ? `<div class="insight-section"><span class="insight-section-label">Mønstre</span>${patternsHtml}</div>` : "",
      claimsHtml ? `<div class="insight-section"><span class="insight-section-label">Påstander</span>${claimsHtml}</div>` : "",
      markersHtml ? `<div class="insight-section"><span class="insight-section-label">Markører</span>${markersHtml}</div>` : "",
      emnerHtml ? `<div class="insight-section"><span class="insight-section-label">Bekreftede emner</span>${emnerHtml}</div>` : "",
      suggestionsHtml
    ].filter(Boolean).join("");

    return `<li class="insight-card" data-insight-id="${escHtml(ins.id || "")}">
      <strong class="insight-card-title">${title}</strong>
      ${summary ? `<p class="insight-card-summary">${summary}</p>` : ""}
      ${sections}
    </li>`;
  }

  function resolveEmneSuggestionAction(target) {
    if (!target) return null;
    const button = target.closest && target.closest("[data-action]");
    if (!button) return null;
    const action = button.getAttribute("data-action");
    if (action !== "confirm-emne" && action !== "dismiss-emne") return null;
    return {
      action,
      insightId: button.getAttribute("data-insight-id") || "",
      emneId: button.getAttribute("data-emne-id") || ""
    };
  }

  function applyEmneSuggestionAction(action, insightId, emneId) {
    if (!insightId || !emneId) return false;
    const chamber = loadChamberFromStorage();
    const insight = (chamber.insights || []).find((ins) => ins.id === insightId);
    if (!insight) return false;

    const engine = global.InsightsEngine || {};
    let changed = false;
    if (action === "confirm-emne" && typeof engine.confirmEmneSuggestion === "function") {
      changed = engine.confirmEmneSuggestion(insight, emneId);
    } else if (action === "dismiss-emne" && typeof engine.dismissEmneSuggestion === "function") {
      changed = engine.dismissEmneSuggestion(insight, emneId);
    }
    if (!changed) return false;

    saveChamberToStorage(chamber);

    try {
      global.dispatchEvent(new CustomEvent("aha:emne-suggestion-resolved", {
        detail: { insight_id: insightId, emne_id: emneId, action }
      }));
    } catch {}

    return true;
  }

  function bindEmneSuggestionHandler() {
    const panel = document.getElementById("panel");
    if (!panel || panel.dataset.ahaEmneBound === "true") return;
    panel.dataset.ahaEmneBound = "true";
    panel.addEventListener("click", (event) => {
      const resolved = resolveEmneSuggestionAction(event.target);
      if (!resolved) return;
      event.preventDefault();
      const ok = applyEmneSuggestionAction(resolved.action, resolved.insightId, resolved.emneId);
      if (ok) showInsights();
    });
  }

  function showInsights() {
    const insights = currentInsights();
    renderPanel(
      `<div class="insight-panel"><h2>Innsikter</h2>${
        insights.length
          ? `<ul class="insight-list">${insights.map(renderInsightCard).join("")}</ul>`
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
    const concepts = new Set();
    const rawTerms = new Set();
    const claims = new Set();
    const patterns = new Set();
    const markers = new Set();

    insights.forEach((ins) => {
      (ins.concepts || []).forEach((c) => {
        const label = (c && (c.label || c.key)) || c;
        if (label) concepts.add(label);
      });
      (ins.raw_terms || []).forEach((c) => {
        const label = (c && (c.key || c.label)) || c;
        if (label) rawTerms.add(label);
      });
      (ins.claims || []).forEach((c) => {
        const label = c && c.text;
        if (label) claims.add(label);
      });
      (ins.patterns || []).forEach((c) => {
        const label = (c && (c.label || c.key)) || c;
        if (label) patterns.add(label);
      });
      (ins.markers || []).forEach((c) => {
        const label = c && c.value;
        if (label) markers.add(label);
      });
    });

    out(JSON.stringify({
      concepts: [...concepts].filter(Boolean),
      patterns: [...patterns].filter(Boolean),
      claims: [...claims].filter(Boolean),
      markers: [...markers].filter(Boolean),
      raw_terms: [...rawTerms].filter(Boolean)
    }, null, 2));
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
    const log = document.getElementById("chat-log");
    if (log) log.innerHTML = "";
    updateEmptyState();
  }

  function bind() {
    const button = document.getElementById("btn-send");
    const textarea = document.getElementById("msg");
    if (button && textarea) {
      button.addEventListener("click", async () => {
        const text = textarea.value.trim();
        if (!text) return;
        appendChat("user", text);
        const count = handleUserMessage(text);
        appendChat("aha", `Registrert ${count} signal${count === 1 ? "" : "er"}.`);
        try {
          const agent = await askAhaAgent(text);
          const reply = String(agent?.reply || "").trim() || "AHA-agenten returnerte tomt svar.";
          appendChat("aha", reply);
          // AHA-agentens egne svar skal vises i chatten og logges som
          // source event, men IKKE bli en ordinær brukerinnsikt. AI-
          // oppsummeringer hører ikke hjemme i innsiktskammeret. skip_insight
          // får AHAIngest til å stoppe etter source-event-loggen.
          global.AHAIngest?.ingest?.({
            source_type: "aha_agent",
            source_app: "aha_chat",
            content_type: "text",
            title: "AHA-agent svar",
            text: reply,
            user_created: false,
            imported: false,
            skip_insight: true,
            created_at: new Date().toISOString(),
            meta: { response_id: agent?.response_id || null, model: agent?.model || null }
          });
        } catch (err) {
          console.warn("AHA-agent utilgjengelig", err);
          appendChat("aha", "AHA-agenten er ikke tilgjengelig akkurat nå.");
        }
        textarea.value = "";
      });
    }

    document.getElementById("btn-insights")?.addEventListener("click", showInsights);
    document.getElementById("btn-status")?.addEventListener("click", showStatus);
    document.getElementById("btn-concepts")?.addEventListener("click", showConcepts);
    document.getElementById("btn-meta")?.addEventListener("click", showMeta);
    document.getElementById("btn-export")?.addEventListener("click", () => out(JSON.stringify(loadChamberFromStorage(), null, 2)));
    document.getElementById("btn-reset")?.addEventListener("click", reset);

    document.querySelectorAll(".quick-action-btn, .suggestion-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const prompt = String(btn.getAttribute("data-prompt") || "").trim();
        if (prompt) setComposerText(prompt + " ");
      });
    });

    bindEmneSuggestionHandler();

    updateEmptyState();
  }

  global.loadChamberFromStorage = global.loadChamberFromStorage || loadChamberFromStorage;
  global.saveChamberToStorage = global.saveChamberToStorage || saveChamberToStorage;
  global.AHAChat = {
    loadChamberFromStorage,
    saveChamberToStorage,
    handleUserMessage,
    askAhaAgent,
    buildAIState
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})(window);
