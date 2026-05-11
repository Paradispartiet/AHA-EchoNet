// ahaChat.js
// Ren kobling mellom AHA Chat UI og eksisterende InsightsEngine.

(function (global) {
  "use strict";

  const SUBJECT_ID = "sub_laring";
  const STORAGE_KEY = "aha_insight_chamber_v1";
  const HIGHLIGHTS_STORAGE_KEY = "aha_chat_highlights_v1";
  const CHAT_THREAD_ID = "default_thread";
  let chatMessageCounter = 0;

  function makeMessageId() {
    chatMessageCounter += 1;
    return `msg_${Date.now()}_${chatMessageCounter}`;
  }

  function getThreadId() {
    return CHAT_THREAD_ID;
  }

  function loadHighlights() {
    try {
      const raw = localStorage.getItem(HIGHLIGHTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveHighlights(highlights) {
    localStorage.setItem(HIGHLIGHTS_STORAGE_KEY, JSON.stringify(highlights || {}));
  }

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
      // Stempler hvert lokale skriv med tidspunkt så ahaChamberSync kan
      // sammenligne mot Supabase sin updated_at i pull-fasen.
      if (chamber && typeof chamber === "object") {
        chamber._local_updated_at = new Date().toISOString();
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chamber));
      try {
        global.dispatchEvent(new CustomEvent("aha:chamber-saved", {
          detail: { source: "ahaChat", insight_count: (chamber?.insights || []).length }
        }));
      } catch {}
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
    const messageId = makeMessageId();
    const createdAt = new Date().toISOString();
    const row = document.createElement("article");
    row.className = "chat-line-row";
    row.dataset.messageId = messageId;
    row.dataset.createdAt = createdAt;

    const div = document.createElement("div");
    div.className = `chat-line chat-line-${role}`;
    div.id = `chat-message-${messageId}`;
    div.textContent = text;

    const highlightBtn = document.createElement("button");
    highlightBtn.type = "button";
    highlightBtn.className = "highlight-toggle-btn";
    highlightBtn.setAttribute("aria-label", "Marker melding som highlight");
    highlightBtn.setAttribute("title", "Highlight");
    highlightBtn.textContent = "✦";
    highlightBtn.addEventListener("click", () => toggleHighlight(row, text));

    row.appendChild(div);
    row.appendChild(highlightBtn);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    syncMessageHighlightState(row);
    renderHighlightsRail();
    updateEmptyState();
  }

  function previewText(text) {
    return String(text || "").trim().replace(/\s+/g, " ").slice(0, 96);
  }

  function toggleHighlight(row, text) {
    const messageId = row?.dataset?.messageId;
    if (!messageId) return;
    const threadId = getThreadId();
    const all = loadHighlights();
    const thread = all[threadId] || {};
    if (thread[messageId]) {
      delete thread[messageId];
    } else {
      thread[messageId] = { messageId, createdAt: row.dataset.createdAt || new Date().toISOString(), preview: previewText(text) };
    }
    all[threadId] = thread;
    saveHighlights(all);
    syncMessageHighlightState(row);
    renderHighlightsRail();
  }

  function isHighlighted(messageId) {
    const thread = loadHighlights()[getThreadId()] || {};
    return Boolean(thread[messageId]);
  }

  function syncMessageHighlightState(row) {
    const messageId = row?.dataset?.messageId;
    if (!messageId) return;
    row.classList.toggle("is-highlighted", isHighlighted(messageId));
  }

  function renderHighlightsRail() {
    const rail = document.getElementById("chat-highlights-rail");
    const log = document.getElementById("chat-log");
    if (!rail || !log) return;
    rail.innerHTML = "";
    const thread = loadHighlights()[getThreadId()] || {};
    const rows = Array.from(log.querySelectorAll(".chat-line-row"));
    const max = Math.max(1, log.scrollHeight - log.clientHeight);
    rows.forEach((row) => {
      const messageId = row.dataset.messageId;
      if (!thread[messageId]) return;
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "highlight-rail-marker";
      const offset = Math.max(0, row.offsetTop - 8);
      const ratio = Math.min(1, Math.max(0, offset / max));
      marker.style.top = `${ratio * 100}%`;
      marker.title = thread[messageId].preview || "Highlight";
      marker.setAttribute("aria-label", `Gå til highlight: ${thread[messageId].preview || "melding"}`);
      marker.addEventListener("click", () => {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      rail.appendChild(marker);
    });
  }

  function updateEmptyState() {
    const empty = document.getElementById("empty-state");
    const log = document.getElementById("chat-log");
    if (!empty || !log) return;
    empty.style.display = log.children.length ? "none" : "block";
    renderHighlightsRail();
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
        const simRes = await global.AHAEmbeddings.findSimilarToText(message, {
          limit: 5,
          // Filtrer ut insights som er sammenslått inn i andre, slik at
          // merged sources ikke konkurrerer som aktive kandidater.
          chamber: loadChamberFromStorage()
        });
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

  function resolvePanelAction(target) {
    if (!target) return null;
    const button = target.closest && target.closest("[data-action]");
    if (!button) return null;
    const action = button.getAttribute("data-action");
    if (action === "confirm-emne" || action === "dismiss-emne") {
      return {
        action,
        insightId: button.getAttribute("data-insight-id") || "",
        emneId: button.getAttribute("data-emne-id") || ""
      };
    }
    if (action === "confirm-merge" || action === "dismiss-merge") {
      return {
        action,
        sourceId: button.getAttribute("data-source-id") || "",
        targetId: button.getAttribute("data-target-id") || ""
      };
    }
    return null;
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

  function refreshTargetEmbedding(target) {
    if (!target?.id) return;
    if (!global.AHAEmbeddings || typeof global.AHAEmbeddings.embedAndStore !== "function") return;
    if (typeof global.AHAEmbeddings.isConfigured === "function" && !global.AHAEmbeddings.isConfigured()) return;
    // Fire-and-forget: target-insighten har fått ny mening gjennom
    // merge (concepts, claims, patterns, markers, emner). Vi re-embed-er
    // den så semantisk søk treffer den nye representasjonen, men
    // hovedflyten venter aldri på dette.
    global.AHAEmbeddings.embedAndStore(target).then((result) => {
      if (!result?.ok) return;
      try {
        global.dispatchEvent(new CustomEvent("aha:embedding-refreshed", {
          detail: { insight_id: target.id, reason: "merge_confirmed" }
        }));
      } catch {}
    }).catch((err) => {
      console.warn("AHAChat: re-embed etter merge feilet", err);
    });
  }

  function applyMergeAction(action, sourceId, targetId) {
    if (!sourceId || !targetId) return false;
    const chamber = loadChamberFromStorage();
    const engine = global.InsightsEngine || {};
    let changed = false;
    if (action === "confirm-merge" && typeof engine.confirmMerge === "function") {
      changed = engine.confirmMerge(chamber, sourceId, targetId);
    } else if (action === "dismiss-merge" && typeof engine.dismissMergeSuggestion === "function") {
      changed = engine.dismissMergeSuggestion(chamber, sourceId, targetId);
    }
    if (!changed) return false;

    saveChamberToStorage(chamber);

    if (action === "confirm-merge") {
      const target = (chamber.insights || []).find((ins) => ins.id === targetId);
      if (target) refreshTargetEmbedding(target);
    }

    try {
      global.dispatchEvent(new CustomEvent("aha:merge-resolved", {
        detail: { source_id: sourceId, target_id: targetId, action }
      }));
    } catch {}

    return true;
  }

  function bindPanelActionHandler() {
    const panel = document.getElementById("panel");
    if (!panel || panel.dataset.ahaPanelBound === "true") return;
    panel.dataset.ahaPanelBound = "true";
    panel.addEventListener("click", (event) => {
      const resolved = resolvePanelAction(event.target);
      if (!resolved) return;
      event.preventDefault();
      let ok = false;
      if (resolved.action === "confirm-emne" || resolved.action === "dismiss-emne") {
        ok = applyEmneSuggestionAction(resolved.action, resolved.insightId, resolved.emneId);
      } else if (resolved.action === "confirm-merge" || resolved.action === "dismiss-merge") {
        ok = applyMergeAction(resolved.action, resolved.sourceId, resolved.targetId);
      }
      if (ok) showInsights();
    });
  }

  function renderMergeSuggestionsSection() {
    const chamber = loadChamberFromStorage();
    const suggestions = (Array.isArray(chamber.merge_suggestions) ? chamber.merge_suggestions : [])
      .filter((s) => s && s.status === "pending");
    if (!suggestions.length) return "";

    const items = suggestions.map((s) => {
      const sourceSummary = escHtml((s.source_summary || s.source_id || "").slice(0, 120));
      const targetSummary = escHtml((s.target_summary || s.target_id || "").slice(0, 120));
      const sim = Number.isFinite(s.similarity) ? s.similarity.toFixed(2) : "?";
      const sourceId = escHtml(s.source_id || "");
      const targetId = escHtml(s.target_id || "");
      return `<li class="merge-suggestion">
        <div class="merge-suggestion-text">
          <div class="merge-suggestion-row"><span class="merge-suggestion-label">Ny:</span> ${sourceSummary}</div>
          <div class="merge-suggestion-row"><span class="merge-suggestion-label">Ligner på:</span> ${targetSummary}</div>
          <small class="merge-suggestion-meta">cosine ${sim}</small>
        </div>
        <div class="merge-suggestion-actions">
          <button type="button" class="merge-confirm-btn" data-action="confirm-merge" data-source-id="${sourceId}" data-target-id="${targetId}">Slå sammen</button>
          <button type="button" class="merge-dismiss-btn" data-action="dismiss-merge" data-source-id="${sourceId}" data-target-id="${targetId}">Ignorer</button>
        </div>
      </li>`;
    }).join("");

    return `<section class="merge-suggestion-panel">
      <h3>Foreslåtte sammenslåinger</h3>
      <p class="merge-suggestion-hint">Embedding-laget mener disse innsiktene kan være samme tanke. Ingenting slås sammen før du bekrefter.</p>
      <ul class="merge-suggestion-list">${items}</ul>
    </section>`;
  }

  function showInsights() {
    const insights = currentInsights();
    const mergeSection = renderMergeSuggestionsSection();
    renderPanel(
      `<div class="insight-panel">${mergeSection}<h2>Innsikter</h2>${
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

  function renderMetaSection(label, items) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return "";
    const body = list.map((item) => `<li>${item}</li>`).join("");
    return `<section class="meta-section">
      <h4 class="meta-section-label">${escHtml(label)}</h4>
      <ul class="meta-section-list">${body}</ul>
    </section>`;
  }

  function renderMetaProfile(profile) {
    if (!profile || typeof profile !== "object") return "";

    const recent = profile.temporal?.recent_focus || {};
    const tensions = profile.tensions || {};
    const recs = profile.recommendations || {};
    const totalInsights = Array.isArray(profile.insights) ? profile.insights.length : 0;
    const window = recent.window_days ? ` (siste ${recent.window_days} dager)` : "";

    const recentConcepts = (recent.concepts || []).slice(0, 6).map((c) =>
      `${escHtml(c.key)} <span class="meta-count">×${c.count}</span>`
    );
    const emerging = (recent.emerging || []).slice(0, 5).map((c) =>
      `${escHtml(c.key)} <span class="meta-count">×${c.count}</span>`
    );
    const fading = (recent.fading || []).slice(0, 5).map((c) =>
      `${escHtml(c.key)} <span class="meta-count">tidligere ×${c.prev_count}</span>`
    );
    const conceptTensions = (tensions.concept_tensions || []).slice(0, 5).map((t) =>
      `${escHtml(t.key)} <span class="meta-count">spenning ${Number(t.combined).toFixed(2)}</span>`
    );
    const paradoxes = (tensions.paradox_pairs || []).slice(0, 5).map((p) => {
      const shared = (p.shared_concepts || []).slice(0, 3).map(escHtml).join(", ");
      const themeText = p.theme_id ? ` i <em>${escHtml(p.theme_id)}</em>` : "";
      return `${shared || "(begreper)"}${themeText}`;
    });
    const unstick = (recs.unstick_prompts || []).slice(0, 4).map((u) =>
      escHtml(u.prompt || "")
    );
    const resurface = (recs.resurface_insights || []).slice(0, 4).map((r) =>
      `${escHtml((r.summary || "").slice(0, 160))} <span class="meta-count">${escHtml((r.shared_concepts || []).join(", "))}</span>`
    );
    const bridging = (recs.bridging_pairs || []).slice(0, 4).map((b) =>
      `${escHtml(b.source)} ↔ ${escHtml(b.target)} <span class="meta-count">npmi ${Number(b.npmi).toFixed(2)}</span>`
    );
    const underexplored = (recs.underexplored_concepts || []).slice(0, 5).map((u) =>
      `${escHtml(u.key)} <span class="meta-count">×${u.count} · ${escHtml(u.reason || "")}</span>`
    );

    const sections = [
      renderMetaSection(`Det du tenker mest på${window}`, recentConcepts),
      renderMetaSection("Nye temaer som dukker opp", emerging),
      renderMetaSection("Tankegods som har stilnet", fading),
      renderMetaSection("Spenninger jeg ser", conceptTensions),
      renderMetaSection("Paradokser i materialet", paradoxes),
      renderMetaSection("Spørsmål som kan løsne fastlåsthet", unstick),
      renderMetaSection("Refleksjoner verdt å hente frem", resurface),
      renderMetaSection("Koblinger verdt å tenke videre på", bridging),
      renderMetaSection("Tanker som ikke kobler seg ennå", underexplored)
    ].filter(Boolean).join("");

    if (!sections) {
      return `<div class="meta-profile">
        <h3>Hva AHA ser i materialet ditt</h3>
        <p class="meta-empty">AHA har ennå ikke nok å gå på. Skriv mer i chat eller importer fra History Go.</p>
      </div>`;
    }

    return `<div class="meta-profile">
      <h3>Hva AHA ser i materialet ditt</h3>
      <p class="meta-meta">${totalInsights} innsikter analysert.</p>
      ${sections}
    </div>`;
  }

  function showMeta() {
    const chamber = loadChamberFromStorage();
    if (!global.MetaInsightsEngine?.buildUserMetaProfile) {
      out("MetaInsightsEngine mangler buildUserMetaProfile.");
      return;
    }
    const profile = global.MetaInsightsEngine.buildUserMetaProfile(chamber, SUBJECT_ID);
    renderPanel(renderMetaProfile(profile));
    out("");
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HIGHLIGHTS_STORAGE_KEY);
    out("AHA-kammer nullstilt.");
    renderPanel("");
    const log = document.getElementById("chat-log");
    if (log) log.innerHTML = "";
    renderHighlightsRail();
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

    bindPanelActionHandler();

    // Når et nytt merge-forslag persisteres på chamberet, re-rendr
    // panelet hvis det vises. UI-en henter forslagene rett fra
    // localStorage, så den trenger bare et signal om å oppdatere seg.
    global.addEventListener("aha:merge-suggested", () => {
      const panel = document.getElementById("panel");
      if (panel && panel.querySelector(".insight-panel")) showInsights();
    });

    updateEmptyState();
    renderHighlightsRail();
    const log = document.getElementById("chat-log");
    if (log) {
      log.addEventListener("scroll", renderHighlightsRail);
      window.addEventListener("resize", renderHighlightsRail);
    }
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
