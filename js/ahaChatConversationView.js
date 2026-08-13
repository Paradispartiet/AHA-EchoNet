// ahaChatConversationView.js
// DOM-visning for samtalemeldinger, fagkoblinger og highlights i AHA Chat.

(function (global) {
  "use strict";

  function create(deps = {}) {
    const {
      storageKey,
      threadId,
      shortHash,
      setStatusNote,
      renderAhaMemoryTransparency,
      renderAhaAnswerEvaluation,
      refreshAhaExplorer
    } = deps;

    function normalizePreview(text) {
      return String(text || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
    }

    function makeStableMessageId(role, text, createdAt) {
      const key = `${String(role || "").trim()}|${String(createdAt || "").trim()}|${normalizePreview(text)}`;
      return `msg_${shortHash(key)}`;
    }

    function loadHighlights() {
      try {
        const raw = localStorage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        return {};
      }
    }

    function saveHighlights(highlights) {
      localStorage.setItem(storageKey, JSON.stringify(highlights || {}));
    }

    function dedupeSubjectMatches(matches) {
      const list = Array.isArray(matches) ? matches : [];
      const seenLabels = new Set();
      const seenIds = new Set();
      return list.filter((item) => {
        const label = String(item?.title || item?.subject_label || "").trim().toLowerCase();
        const id = String(item?.subject_id || item?.emne_id || "").trim().toLowerCase();
        if (label) {
          if (seenLabels.has(label)) return false;
          seenLabels.add(label);
          return true;
        }
        if (!id || seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
      });
    }

    function setComposerText(value) {
      const textarea = document.getElementById("msg");
      if (!textarea) return;
      textarea.value = value;
      textarea.focus();
    }

    function renderSubjectChips(row, matches) {
      const links = dedupeSubjectMatches(matches);
      if (!row || !links.length) return;
      const wrap = document.createElement("section");
      wrap.className = "subject-links";
      wrap.innerHTML = '<span class="subject-links-label">Fagkoblinger</span>';
      const chips = document.createElement("div");
      chips.className = "subject-link-chips";
      links.forEach((item) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "subject-link-chip";
        chip.textContent = String(item?.title || item?.subject_label || "Fagkobling");
        chip.addEventListener("click", () => {
          setComposerText(`Bygg videre på dette med utgangspunkt i [${chip.textContent}].`);
          setStatusNote(`La inn fagkobling: ${chip.textContent}`);
        });
        chips.appendChild(chip);
      });
      wrap.appendChild(chips);
      row.appendChild(wrap);
    }

    function previewText(text) {
      return String(text || "").trim().replace(/\s+/g, " ").slice(0, 96);
    }

    function isHighlighted(messageId) {
      const thread = loadHighlights()[threadId] || {};
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
      const thread = loadHighlights()[threadId] || {};
      const rows = Array.from(log.querySelectorAll(".chat-line-row"));
      const max = Math.max(1, log.scrollHeight - log.clientHeight);
      let markerCount = 0;
      rows.forEach((row) => {
        const messageId = row.dataset.messageId;
        if (!thread[messageId]) return;
        markerCount += 1;
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
      rail.classList.toggle("is-empty", markerCount === 0);
    }

    function toggleHighlight(row, text) {
      const messageId = row?.dataset?.messageId;
      if (!messageId) return;
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
      setStatusNote(thread[messageId] ? "Highlight lagret." : "Highlight fjernet.");
    }

    function updateAnswerActionsVisibility() {
      const actions = document.querySelector?.(".answer-actions");
      const log = document.getElementById("chat-log");
      if (!actions || !log) return;
      const hasAhaAnswer = Boolean(log.querySelector?.(".chat-line-row-aha"));
      actions.classList.toggle("has-aha-answer", hasAhaAnswer);
    }

    function updateEmptyState() {
      const empty = document.getElementById("empty-state");
      const log = document.getElementById("chat-log");
      if (!empty || !log) return;
      empty.style.display = log.children.length ? "none" : "block";
      renderHighlightsRail();
      updateAnswerActionsVisibility();
    }

    function appendChat(role, text, options) {
      const log = document.getElementById("chat-log");
      if (!log) return;
      const createdAt = String(options?.createdAt || new Date().toISOString());
      const messageId = String(options?.messageId || makeStableMessageId(role, text, createdAt));
      const row = document.createElement("article");
      row.className = `chat-line-row chat-line-row-${role}`;
      row.dataset.messageId = messageId;
      row.dataset.createdAt = createdAt;
      row.dataset.messageRole = role === "aha" ? "assistant" : role;

      const sender = document.createElement("span");
      sender.className = "chat-line-sender";
      sender.textContent = role === "user" ? "Du" : "AHA";
      row.appendChild(sender);

      const div = document.createElement("div");
      div.className = `chat-line chat-line-${role}`;
      div.id = `chat-message-${messageId}`;
      if (role === "user" && text.length > 480) {
        div.classList.add("chat-line-paste");
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = `Innlimt tekst (${text.length} tegn) – «${previewText(text)} …»`;
        const body = document.createElement("p");
        body.className = "chat-line-paste-body";
        body.textContent = text;
        details.appendChild(summary);
        details.appendChild(body);
        div.appendChild(details);
      } else {
        div.textContent = text;
      }

      const highlightBtn = document.createElement("button");
      highlightBtn.type = "button";
      highlightBtn.className = "highlight-toggle-btn";
      highlightBtn.setAttribute("aria-label", "Marker melding som highlight");
      highlightBtn.setAttribute("title", "Highlight");
      highlightBtn.textContent = "✦";
      highlightBtn.addEventListener("click", () => toggleHighlight(row, text));

      row.appendChild(div);
      const categories = Array.isArray(options?.categoryChips) ? options.categoryChips.filter(Boolean).slice(0, 8) : [];
      const subjectMatches = Array.isArray(options?.subjectMatches) ? options.subjectMatches.slice(0, 8) : [];
      if (categories.length) {
        const chips = document.createElement("div");
        chips.className = "message-category-chips";
        chips.setAttribute("aria-label", "Bygg-videre-kategorier");
        categories.forEach((label) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "message-category-chip";
          chip.textContent = String(label);
          chip.addEventListener("click", () => {
            setComposerText(`Bygg videre på svaret med fokus på "${label}".`);
            setStatusNote(`La inn forslag for videre arbeid: ${label}`);
          });
          chips.appendChild(chip);
        });
        row.appendChild(chips);
      }
      if (subjectMatches.length) renderSubjectChips(row, subjectMatches);
      if (role === "aha" && options?.memoryContext) renderAhaMemoryTransparency(row, options.memoryContext);
      if (role === "aha" && options?.answerEvaluation) renderAhaAnswerEvaluation(row, options.answerEvaluation);
      row.appendChild(highlightBtn);
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
      syncMessageHighlightState(row);
      renderHighlightsRail();
      updateEmptyState();
      updateAnswerActionsVisibility();
      if (role === "aha") refreshAhaExplorer();
      return row;
    }

    return Object.freeze({
      appendChat,
      renderHighlightsRail,
      updateEmptyState,
      updateAnswerActionsVisibility
    });
  }

  const api = Object.freeze({ create });
  global.AHAChatConversationView = api;
  global.AHAModuleApi?.register?.("chat.conversationView", api, {
    version: 1,
    legacyGlobal: "AHAChatConversationView",
    exports: ["create"]
  });
})(typeof window !== "undefined" ? window : globalThis);
