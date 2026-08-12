// ahaChatAfterwork.js
// Lokal lagring, visning og gjenbruk av AHA-etterarbeid.

(function (global) {
  "use strict";

  function create(deps = {}) {
    const {
      storageKey,
      sourceHash,
      escHtml,
      normalizeDisplayText,
      filterConceptLabels,
      canonicalizeDisplayConcept,
      renderAuxPanel,
      renderPanel,
      setStatusNote
    } = deps;

    function loadAfterworkEntries() {
      try {
        const raw = global.localStorage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(parsed) ? parsed : [];
        return list.map((item) => {
          const safe = item && typeof item === "object" ? item : {};
          const sourceText = String(safe.sourceText || "");
          const learningPath = Array.isArray(safe.learningPath) ? safe.learningPath : (Array.isArray(safe.learningPaths) ? safe.learningPaths : []);
          const sourceTextHash = String(safe.sourceTextHash || sourceHash(sourceText));
          return {
            ...safe,
            sourceText,
            sourceTextHash,
            sourceTextPreview: String(safe.sourceTextPreview || sourceText.replace(/\s+/g, " ").slice(0, 180)),
            learningPath,
            createdAt: safe.createdAt || new Date().toISOString()
          };
        });
      } catch {
        return [];
      }
    }

    function saveAfterworkEntries(entries) {
      global.localStorage.setItem(storageKey, JSON.stringify(Array.isArray(entries) ? entries : []));
    }

    function formatAfterworkDate(createdAt) {
      const stamp = new Date(createdAt);
      if (!createdAt || Number.isNaN(stamp.getTime())) return "Ukjent tidspunkt";
      return stamp.toLocaleString("no-NO");
    }

    function renderAfterworkArray(title, items) {
      const list = Array.isArray(items) ? items.filter(Boolean) : [];
      if (!list.length) return "";
      const rendered = list.map((item) => `<li>${escHtml(normalizeDisplayText(item))}</li>`).join("");
      return `<section class="saved-afterwork-section"><h4>${escHtml(title)}</h4><ul>${rendered}</ul></section>`;
    }

    function renderAfterworkSortItems(sortItems) {
      const list = Array.isArray(sortItems) ? sortItems : [];
      if (!list.length) return "";
      const rendered = list.map((item) => `<li><strong>${escHtml(normalizeDisplayText(item?.label || "Punkt"))}:</strong> ${escHtml(normalizeDisplayText(item?.text || ""))}</li>`).join("");
      return `<section class="saved-afterwork-section"><h4>Sortering</h4><ul>${rendered}</ul></section>`;
    }

    function renderAfterworkThoughtSorting(thoughtSorting) {
      if (typeof thoughtSorting === "string") {
        const text = thoughtSorting.trim();
        if (!text) return "";
        return `<section class="saved-afterwork-section"><h4>Tankesortering</h4><p>${escHtml(normalizeDisplayText(text))}</p></section>`;
      }
      if (!thoughtSorting || typeof thoughtSorting !== "object") return "";

      const getFirstText = (keys) => {
        for (let i = 0; i < keys.length; i += 1) {
          const value = thoughtSorting[keys[i]];
          if (value == null) continue;
          const text = String(value).trim();
          if (text) return text;
        }
        return "";
      };

      const mainTrack = getFirstText(["hovedspor", "mainTrack"]);
      const looseThoughts = getFirstText(["lose_tanker", "løse_tanker", "looseThoughts", "loseTanker", "loseTankerText"]);
      const nextStep = getFirstText(["neste_steg", "nesteSteg", "nextStep"]);
      const lines = [];
      if (mainTrack) lines.push(`<p><strong>Hovedspor:</strong> ${escHtml(normalizeDisplayText(mainTrack))}</p>`);
      if (looseThoughts) lines.push(`<p><strong>Løse tanker:</strong> ${escHtml(normalizeDisplayText(looseThoughts))}</p>`);
      if (nextStep) lines.push(`<p><strong>Neste steg:</strong> ${escHtml(normalizeDisplayText(nextStep))}</p>`);
      if (!lines.length) return "";
      return `<section class="saved-afterwork-section"><h4>Tankesortering</h4>${lines.join("")}</section>`;
    }

    function renderAfterworkSubjectLinks(subjectLinks) {
      const list = Array.isArray(subjectLinks) ? subjectLinks.filter(Boolean) : [];
      if (!list.length) return "";
      const rendered = list.map((link) => {
        const title = String(link?.title || link?.subject_id || "Fagkobling");
        const subject = link?.subject_id ? ` <small>(${escHtml(link.subject_id)})</small>` : "";
        return `<li>${escHtml(normalizeDisplayText(title))}${subject}</li>`;
      }).join("");
      return `<section class="saved-afterwork-section saved-afterwork-subjects"><h4>Fagkoblinger</h4><ul>${rendered}</ul></section>`;
    }

    function renderAfterworkEntry(entry) {
      const safeEntry = entry && typeof entry === "object" ? entry : {};
      const id = escHtml(safeEntry.id || "");
      const createdAt = formatAfterworkDate(safeEntry.createdAt);
      const textType = String(safeEntry.textType || "ukjent");
      const preview = String(safeEntry.sourceTextPreview || "Ingen kildepreview lagret.");
      const rawConcepts = Array.isArray(safeEntry.concepts) && safeEntry.concepts.length
        ? safeEntry.concepts
        : (Array.isArray(safeEntry.keywords) ? safeEntry.keywords : []);
      const conceptPool = filterConceptLabels(rawConcepts.map(canonicalizeDisplayConcept)).slice(0, 3);
      const conceptLine = conceptPool.length
        ? conceptPool.map((item) => `<span class="insight-chip">${escHtml(item)}</span>`).join("")
        : '<span class="insight-chip">Ingen begreper</span>';
      const insightsCount = Array.isArray(safeEntry.insights) ? safeEntry.insights.length : 0;
      const pathCount = Array.isArray(safeEntry.learningPath) ? safeEntry.learningPath.length : 0;
      const daySummarySection = safeEntry.daySummary
        ? `<section class="saved-afterwork-section"><h4>Dagsoppsummering</h4><p>${escHtml(normalizeDisplayText(safeEntry.daySummary))}</p></section>`
        : "";

      return `<article class="saved-afterwork-card" data-afterwork-id="${id}">
        <div class="saved-afterwork-meta"><strong>${escHtml(createdAt)}</strong><span>${escHtml(textType)}</span></div>
        <p class="saved-afterwork-preview">${escHtml(normalizeDisplayText(preview))}</p>
        <div class="saved-afterwork-concepts">${conceptLine}</div>
        <p class="saved-afterwork-meta">Innsikter: ${escHtml(String(insightsCount))} · Læringssti-steg: ${escHtml(String(pathCount))}</p>
        ${renderAfterworkSubjectLinks(safeEntry.subjectLinks)}
        <div class="saved-afterwork-actions"><button type="button" data-action="open-afterwork" data-afterwork-id="${id}">Åpne</button><button type="button" data-action="build-from-afterwork" data-afterwork-id="${id}">Bygg videre</button><button type="button" data-action="link-afterwork-historygo" data-afterwork-id="${id}">Koble til History Go</button><button type="button" data-action="export-afterwork-json" data-afterwork-id="${id}">Eksport JSON</button><button type="button" data-action="delete-afterwork" data-afterwork-id="${id}">Slett</button></div>
        <details>
          <summary>Vis detaljer</summary>
          <section class="saved-afterwork-section"><h4>Refleksjon</h4><p>${escHtml(normalizeDisplayText(safeEntry.reflection || ""))}</p></section>
          ${renderAfterworkSortItems(safeEntry.sortItems)}
          ${daySummarySection}
          ${renderAfterworkThoughtSorting(safeEntry.thoughtSorting)}
          ${renderAfterworkArray("Liste", safeEntry.list)}
          ${renderAfterworkArray("Innsikt", safeEntry.insights)}
          ${renderAfterworkArray("Læringssti", safeEntry.learningPath)}
          ${renderAfterworkSubjectLinks(safeEntry.subjectLinks)}
          <section class="saved-afterwork-section"><h4>Kildepreview</h4><p>${escHtml(normalizeDisplayText(preview))}</p></section>
        </details>
      </article>`;
    }

    function showSavedAfterwork() {
      const entries = loadAfterworkEntries().slice().sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
      if (!entries.length) {
        const html = '<div class="saved-afterwork-panel"><p>Ingen lagrede etterarbeid ennå. Kjør en analyse/sendt melding, og trykk «Lagre etterarbeid» nederst i AHA etterarbeid-panelet.</p></div>';
        renderAuxPanel("afterwork-panel", html);
        renderPanel(html);
        return;
      }
      const html = `<div class="saved-afterwork-panel"><div class="saved-afterwork-list">${entries.map(renderAfterworkEntry).join("")}</div></div>`;
      renderAuxPanel("afterwork-panel", html);
      renderPanel(html);
    }

    function buildAfterworkPrompt(entry) {
      const safeEntry = entry && typeof entry === "object" ? entry : {};
      const lines = ["Bygg videre på dette AHA-etterarbeidet."];
      const sourceTextPreview = String(safeEntry.sourceTextPreview || "").trim();
      if (sourceTextPreview) lines.push("", "Kilde:", sourceTextPreview);
      const reflection = String(safeEntry.reflection || "").trim();
      if (reflection) lines.push("", "Refleksjon:", reflection);

      const insights = (Array.isArray(safeEntry.insights) ? safeEntry.insights : []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4);
      if (insights.length) {
        lines.push("", "Hovedinnsikter:");
        insights.forEach((item) => lines.push(`- ${item}`));
      }
      const learningPath = (Array.isArray(safeEntry.learningPath) ? safeEntry.learningPath : []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5);
      if (learningPath.length) {
        lines.push("", "Læringssti:");
        learningPath.forEach((item) => lines.push(`- ${item}`));
      }
      const subjectLinks = (Array.isArray(safeEntry.subjectLinks) ? safeEntry.subjectLinks : [])
        .map((item) => String(item?.title || item?.subject_label || item?.subject_id || "").trim())
        .filter(Boolean)
        .slice(0, 6);
      if (subjectLinks.length) {
        lines.push("", "Fagkoblinger:");
        subjectLinks.forEach((item) => lines.push(`- ${item}`));
      }
      const concepts = (Array.isArray(safeEntry.concepts) ? safeEntry.concepts : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 6);
      if (concepts.length) lines.push("", "Begreper:", concepts.join(", "));
      lines.push("", "Lag et konkret neste steg basert på dette.");
      return lines.join("\n").trim();
    }

    function buildFromAfterworkEntry(entryId) {
      const id = String(entryId || "").trim();
      if (!id) {
        setStatusNote("Fant ikke lagret etterarbeid.");
        return;
      }
      const entry = loadAfterworkEntries().find((item) => String(item?.id || "") === id);
      if (!entry) {
        setStatusNote("Fant ikke lagret etterarbeid.");
        return;
      }
      const messageInput = global.document.getElementById("msg");
      if (!messageInput) return;
      messageInput.value = buildAfterworkPrompt(entry);
      messageInput.focus();
      messageInput.dispatchEvent(new global.Event("input", { bubbles: true }));
      setStatusNote("Etterarbeid lagt inn i skrivefeltet.");
    }

    function deleteAfterworkEntry(entryId) {
      const id = String(entryId || "").trim();
      if (!id) return;
      const entries = loadAfterworkEntries();
      saveAfterworkEntries(entries.filter((entry) => String(entry?.id || "") !== id));
      showSavedAfterwork();
      setStatusNote("Etterarbeid slettet.");
    }

    return {
      loadAfterworkEntries,
      saveAfterworkEntries,
      formatAfterworkDate,
      renderAfterworkEntry,
      showSavedAfterwork,
      buildAfterworkPrompt,
      buildFromAfterworkEntry,
      deleteAfterworkEntry
    };
  }

  global.AHAChatAfterwork = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
