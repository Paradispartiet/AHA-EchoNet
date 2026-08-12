// ahaChatInsightView.js
// Rendering og brukerhandlinger for innsiktsvisningen i AHA Chat.

(function (global) {
  "use strict";

  function create(deps = {}) {
    const {
      escHtml,
      normalizeConceptKey,
      normalizeDisplayText,
      filterConceptLabels,
      resolveConceptTerm,
      canonicalizeDisplayConcept,
      currentInsights,
      readLatestAcademicContext,
      filterDomainInsightCards,
      buildAcademicSyntheticInsightCards,
      loadChamber,
      saveChamber,
      loadAfterworkEntries,
      deleteAfterworkEntry,
      buildFromAfterworkEntry,
      setStatusNote,
      renderPanel,
      loadAutoOutputs
    } = deps;

    const sanitizeInsightText = typeof deps.sanitizeInsightText === "function"
      ? deps.sanitizeInsightText
      : (value) => normalizeDisplayText(value);
    const shouldHideInsightCard = typeof deps.shouldHideInsightCard === "function"
      ? deps.shouldHideInsightCard
      : () => false;

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
      const open = list.filter((suggestion) => suggestion && suggestion.emne_id && (suggestion.status || "suggested") === "suggested");
      if (!open.length) return "";

      const items = open.map((suggestion) => {
        const label = escHtml(suggestion.label || suggestion.short_label || suggestion.title || suggestion.emne_id);
        const subject = suggestion.subject_id ? `<small class="emne-subject">${escHtml(suggestion.subject_id)}</small>` : "";
        const insightId = escHtml(insight.id || "");
        const emneId = escHtml(suggestion.emne_id);
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

    function dedupeTheoryLabels(labels, excludedLower) {
      const seen = new Set();
      const excluded = excludedLower || new Set();
      return (Array.isArray(labels) ? labels : [])
        .map((label) => String(label || "").trim())
        .filter((label) => {
          if (!label) return false;
          const key = label.toLowerCase();
          if (excluded.has(key) || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }

    function buildTheorySection(insight) {
      const links = (Array.isArray(insight.theoretical_links) ? insight.theoretical_links : [])
        .map((item) => ({
          thinker: String(item?.name || "").trim(),
          theory: String(item?.theory || "").trim(),
          relation: String(item?.relation || "").trim()
        }))
        .filter((item) => item.thinker && item.relation)
        .slice(0, 3);

      const linkedThinkers = new Set(links.map((item) => item.thinker.toLowerCase()));
      const fallbackTheoryChips = dedupeTheoryLabels(
        []
          .concat(Array.isArray(insight.thinkers) ? insight.thinkers : [])
          .concat(Array.isArray(insight.theories) ? insight.theories : [])
          .concat(Array.isArray(insight.traditions) ? insight.traditions : []),
        linkedThinkers
      );

      if (!links.length && !fallbackTheoryChips.length) return "";

      const linksHtml = links.length
        ? `<div class="insight-theory-links">${links
          .map((item) => `<article class="insight-theory-link">
              <p><span class="insight-theory-key">Tenker:</span> ${escHtml(item.thinker)}</p>
              ${item.theory ? `<p><span class="insight-theory-key">Teori:</span> ${escHtml(item.theory)}</p>` : ""}
              <p><span class="insight-theory-key">Kobling:</span> ${escHtml(item.relation)}</p>
            </article>`)
          .join("")}</div>`
        : "";

      const fallbackChipsHtml = fallbackTheoryChips.length
        ? renderLayerChips(fallbackTheoryChips.map((label) => ({ label })), (item) => item?.label)
        : "";

      return `<div class="insight-section"><span class="insight-section-label">Teori</span>${linksHtml}${fallbackChipsHtml}</div>`;
    }

    function endsMidWord(text) {
      const raw = String(text || "").trim().toLowerCase();
      if (!raw) return false;
      return /(erfari|ressursknapphe|miljødegrader|politisk økolo|marginali|forklari)$/.test(raw);
    }

    function normalizedInsightComparableText(text) {
      return String(text || "").toLowerCase().replace(/[….,;:!?]/g, " ").replace(/\s+/g, " ").trim();
    }

    function isFragmentaryInsightCard(insight, titleValue, summaryValue) {
      const title = String(titleValue || insight?.candidate_title || insight?.title || "").trim();
      const summary = String(summaryValue || insight?.candidate_summary || insight?.summary || "").trim();
      const protectedTitles = new Set(["hovedinnsikt", "hovedargument", "motargument/kritikk", "spenning i teksten"]);
      if (protectedTitles.has(normalizeConceptKey(title))) return false;
      if (!title && !summary) return true;
      const titleComparable = normalizedInsightComparableText(title);
      const summaryComparable = normalizedInsightComparableText(summary);
      const overlap = titleComparable && summaryComparable && (titleComparable === summaryComparable || titleComparable.includes(summaryComparable) || summaryComparable.includes(titleComparable));
      const fragmentSignals = /(erfari|marginali|forklari|ressursknapphe|miljødegrader|politisk økolo|manglende må|forståelsen av|implikasjonene av vår analyse)$/i;
      const weakTitle = title.split(/\s+/).length <= 3 && !/[.!?…:]/.test(title);
      const repeatedEllipsis = /…/.test(summary) && overlap;
      const missingClaim = !/[.!?…]/.test(summary) && summary.split(/\s+/).length < 10;
      const trailingFragment = /(manglende må|forståelsen av|implikasjonene av vår analyse|^vi diskuterer implikasjonene)/i.test(summary);
      const titleHasTruncatedSignal = title.split(/\s+/).length > 3 && endsMidWord(title);
      return titleHasTruncatedSignal || endsMidWord(summary) || fragmentSignals.test(title) || fragmentSignals.test(summary) || trailingFragment || (overlap && weakTitle) || repeatedEllipsis || (weakTitle && missingClaim);
    }

    function renderInsightCard(insight) {
      const cleanTitleRaw = sanitizeInsightText(insight.candidate_title || insight.title || "Innsikt");
      const cleanSummaryRaw = sanitizeInsightText(insight.candidate_summary || insight.summary || "");
      if (isFragmentaryInsightCard(insight, cleanTitleRaw, cleanSummaryRaw) || shouldHideInsightCard(cleanTitleRaw, cleanSummaryRaw)) return "";
      const titleKey = normalizeConceptKey(cleanTitleRaw || insight?.title || "");
      const isSyntheticAcademicCard = insight?.candidate_type === "synthetic"
        && ["hovedinnsikt", "hovedargument", "motargument/kritikk", "spenning i teksten"].includes(titleKey);
      const title = escHtml(normalizeDisplayText(cleanTitleRaw || "Innsikt"));
      const summaryText = normalizeDisplayText(cleanSummaryRaw || "");
      const summary = escHtml(summaryText);

      const prioritizedConcepts = filterConceptLabels([
        ...(Array.isArray(insight.concepts) ? insight.concepts : []),
        ...(Array.isArray(insight.subjectLinks) ? insight.subjectLinks.map((item) => item?.title || item?.label || item?.key || item?.name || "") : []),
        ...(Array.isArray(insight.keywords) ? insight.keywords : [])
      ]
        .map(resolveConceptTerm)
        .map(canonicalizeDisplayConcept)
        .filter(Boolean));
      const conceptsHtml = renderLayerChips(prioritizedConcepts.map((label) => ({ label })), (item) => item?.label);
      const patternsHtml = renderLayerChips(insight.patterns, (item) => item?.label || item?.key);
      const markersHtml = renderLayerChips(insight.markers, (item) => item?.value);
      const emnerHtml = renderLayerChips((insight.emner || []).map((key) => ({ key })), (item) => item?.key);
      const theorySection = buildTheorySection(insight);
      const suggestionsHtml = renderEmneSuggestions(insight);

      const claims = isSyntheticAcademicCard
        ? []
        : (insight.claims || [])
          .map((claim) => (claim && claim.text) || "")
          .filter((text) => {
            const normalizedClaim = normalizeConceptKey(text || "");
            const normalizedSummary = normalizeConceptKey(summaryText || "");
            if (!normalizedClaim) return false;
            if (normalizedSummary && (normalizedClaim === normalizedSummary || normalizedSummary.includes(normalizedClaim) || normalizedClaim.includes(normalizedSummary))) return false;
            return true;
          });
      const claimsHtml = claims.length
        ? `<ul class="insight-claims">${claims.map((claim) => `<li>“${escHtml(claim)}”</li>`).join("")}</ul>`
        : "";

      const sections = [
        conceptsHtml ? `<div class="insight-section"><span class="insight-section-label">Begreper</span>${conceptsHtml}</div>` : "",
        patternsHtml ? `<div class="insight-section"><span class="insight-section-label">Mønstre</span>${patternsHtml}</div>` : "",
        claimsHtml ? `<div class="insight-section"><span class="insight-section-label">Påstander</span>${claimsHtml}</div>` : "",
        markersHtml ? `<div class="insight-section"><span class="insight-section-label">Markører</span>${markersHtml}</div>` : "",
        emnerHtml ? `<div class="insight-section"><span class="insight-section-label">Bekreftede emner</span>${emnerHtml}</div>` : "",
        theorySection,
        suggestionsHtml
      ].filter(Boolean).join("");

      return `<li class="insight-card" data-insight-id="${escHtml(insight.id || "")}">
        <strong class="insight-card-title">${title}</strong>
        ${summary ? `<p class="insight-card-summary">${summary}</p>` : ""}
        ${sections}
      </li>`;
    }

    function getDisplayInsights() {
      try {
        const insights = currentInsights();
        const filtered = insights.filter((insight) => !isFragmentaryInsightCard(insight));
        const context = readLatestAcademicContext();
        const domainFiltered = filterDomainInsightCards(filtered, context?.sourceText || "");
        if (context?.textType !== "academic_article") return domainFiltered;

        const synthetic = filterDomainInsightCards(buildAcademicSyntheticInsightCards(), context?.sourceText || "");
        if (synthetic.length >= 4) return synthetic.slice(0, 4);
        if (synthetic.length > 0 && domainFiltered.length < 4) return synthetic;
        if (synthetic.length > 0 && !domainFiltered.length) return synthetic;

        const strong = domainFiltered.filter((insight) => /hoved|argument|kritikk|spenning|teori|synt/i.test(`${insight?.title || ""} ${insight?.summary || ""}`));
        if (strong.length >= 2) return strong.slice(0, 4);
        if (strong.length) return strong;
        return domainFiltered;
      } catch (err) {
        console.warn("Kunne ikke bygge innsiktsvisning", err);
        try {
          return currentInsights().filter((insight) => !isFragmentaryInsightCard(insight));
        } catch (nestedErr) {
          console.warn("Kunne ikke bygge fallback for innsikter", nestedErr);
          return [];
        }
      }
    }

    function resolvePanelAction(target) {
      if (!target) return null;
      const button = target.closest && target.closest("[data-action]");
      if (!button) return null;
      const action = button.getAttribute("data-action");
      if (action === "confirm-emne" || action === "dismiss-emne") {
        return { action, insightId: button.getAttribute("data-insight-id") || "", emneId: button.getAttribute("data-emne-id") || "" };
      }
      if (action === "delete-afterwork" || action === "build-from-afterwork" || action === "open-afterwork" || action === "export-afterwork-json" || action === "link-afterwork-historygo") {
        return { action, afterworkId: button.getAttribute("data-afterwork-id") || "" };
      }
      if (action === "confirm-merge" || action === "dismiss-merge") {
        return { action, sourceId: button.getAttribute("data-source-id") || "", targetId: button.getAttribute("data-target-id") || "" };
      }
      return null;
    }

    function applyEmneSuggestionAction(action, insightId, emneId) {
      if (!insightId || !emneId) return false;
      const chamber = loadChamber();
      const insight = (chamber.insights || []).find((item) => item.id === insightId);
      if (!insight) return false;

      const engine = global.InsightsEngine || {};
      let changed = false;
      if (action === "confirm-emne" && typeof engine.confirmEmneSuggestion === "function") {
        changed = engine.confirmEmneSuggestion(insight, emneId);
      } else if (action === "dismiss-emne" && typeof engine.dismissEmneSuggestion === "function") {
        changed = engine.dismissEmneSuggestion(insight, emneId);
      }
      if (!changed) return false;

      saveChamber(chamber);
      try {
        global.dispatchEvent(new global.CustomEvent("aha:emne-suggestion-resolved", {
          detail: { insight_id: insightId, emne_id: emneId, action }
        }));
      } catch {}
      return true;
    }

    function refreshTargetEmbedding(target) {
      if (!target?.id) return;
      if (!global.AHAEmbeddings || typeof global.AHAEmbeddings.embedAndStore !== "function") return;
      if (typeof global.AHAEmbeddings.isConfigured === "function" && !global.AHAEmbeddings.isConfigured()) return;
      global.AHAEmbeddings.embedAndStore(target).then((result) => {
        if (!result?.ok) return;
        try {
          global.dispatchEvent(new global.CustomEvent("aha:embedding-refreshed", {
            detail: { insight_id: target.id, reason: "merge_confirmed" }
          }));
        } catch {}
      }).catch((err) => console.warn("AHAChat: re-embed etter merge feilet", err));
    }

    function applyMergeAction(action, sourceId, targetId) {
      if (!sourceId || !targetId) return false;
      const chamber = loadChamber();
      const engine = global.InsightsEngine || {};
      let changed = false;
      if (action === "confirm-merge" && typeof engine.confirmMerge === "function") {
        changed = engine.confirmMerge(chamber, sourceId, targetId);
      } else if (action === "dismiss-merge" && typeof engine.dismissMergeSuggestion === "function") {
        changed = engine.dismissMergeSuggestion(chamber, sourceId, targetId);
      }
      if (!changed) return false;

      saveChamber(chamber);
      if (action === "confirm-merge") {
        const target = (chamber.insights || []).find((insight) => insight.id === targetId);
        if (target) refreshTargetEmbedding(target);
      }
      try {
        global.dispatchEvent(new global.CustomEvent("aha:merge-resolved", {
          detail: { source_id: sourceId, target_id: targetId, action }
        }));
      } catch {}
      return true;
    }

    function handleResolvedPanelAction(resolved, panelEl) {
      if (!resolved || !panelEl) return false;
      let ok = false;
      if (resolved.action === "confirm-emne" || resolved.action === "dismiss-emne") {
        ok = applyEmneSuggestionAction(resolved.action, resolved.insightId, resolved.emneId);
      } else if (resolved.action === "confirm-merge" || resolved.action === "dismiss-merge") {
        ok = applyMergeAction(resolved.action, resolved.sourceId, resolved.targetId);
      } else if (resolved.action === "delete-afterwork") {
        deleteAfterworkEntry(resolved.afterworkId);
        ok = true;
      } else if (resolved.action === "build-from-afterwork") {
        buildFromAfterworkEntry(resolved.afterworkId);
        ok = true;
      } else if (resolved.action === "open-afterwork") {
        const selector = `.saved-afterwork-card[data-afterwork-id="${resolved.afterworkId}"]`;
        const detailsEl = panelEl.querySelector(`${selector} details`);
        if (detailsEl) detailsEl.open = true;
        panelEl.querySelector(selector)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
        setStatusNote("Etterarbeid åpnet.");
        ok = true;
      } else if (resolved.action === "export-afterwork-json") {
        const entry = loadAfterworkEntries().find((item) => item?.id === resolved.afterworkId);
        if (entry) {
          if (global.navigator?.clipboard?.writeText) {
            global.navigator.clipboard.writeText(JSON.stringify(entry, null, 2))
              .then(() => setStatusNote("Etterarbeid kopiert som JSON."))
              .catch(() => setStatusNote("Kunne ikke kopiere JSON (clipboard utilgjengelig)."));
          } else {
            setStatusNote("Clipboard er ikke tilgjengelig i denne klienten.");
          }
          ok = true;
        }
      } else if (resolved.action === "link-afterwork-historygo") {
        const entry = loadAfterworkEntries().find((item) => item?.id === resolved.afterworkId) || {};
        const signalText = `${entry?.sourceTextPreview || ""} ${(Array.isArray(entry?.concepts) ? entry.concepts : []).join(" ")}`;
        setStatusNote(/nav|forvaltning|kommune|statlig|velferd/i.test(signalText) ? "History Go-kobling: politikk — Politikk & samfunn." : "History Go-kobling foreslått basert på tema.");
        ok = true;
      }
      if (ok && resolved.action !== "delete-afterwork" && resolved.action !== "build-from-afterwork") showInsights();
      return ok;
    }

    function bindPanelActionHandler() {
      ["panel", "afterwork-panel"].forEach((panelId) => {
        const panel = global.document.getElementById(panelId);
        if (!panel || panel.dataset.ahaPanelBound === "true") return;
        panel.dataset.ahaPanelBound = "true";
        panel.addEventListener("click", (event) => {
          const resolved = resolvePanelAction(event.target);
          if (!resolved) return;
          event.preventDefault();
          handleResolvedPanelAction(resolved, panel);
        });
      });
    }

    function renderMergeSuggestionsSection() {
      const chamber = loadChamber();
      const suggestions = (Array.isArray(chamber.merge_suggestions) ? chamber.merge_suggestions : [])
        .filter((suggestion) => suggestion && suggestion.status === "pending");
      if (!suggestions.length) return "";

      const items = suggestions.map((suggestion) => {
        const sourceSummary = escHtml((suggestion.source_summary || suggestion.source_id || "").slice(0, 120));
        const targetSummary = escHtml((suggestion.target_summary || suggestion.target_id || "").slice(0, 120));
        const similarity = Number.isFinite(suggestion.similarity) ? suggestion.similarity.toFixed(2) : "?";
        const sourceId = escHtml(suggestion.source_id || "");
        const targetId = escHtml(suggestion.target_id || "");
        return `<li class="merge-suggestion">
          <div class="merge-suggestion-text">
            <div class="merge-suggestion-row"><span class="merge-suggestion-label">Ny:</span> ${sourceSummary}</div>
            <div class="merge-suggestion-row"><span class="merge-suggestion-label">Ligner på:</span> ${targetSummary}</div>
            <small class="merge-suggestion-meta">cosine ${similarity}</small>
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
      let insights = getDisplayInsights();
      if (!insights.length) {
        const cache = loadAutoOutputs();
        const payload = cache?.payload && typeof cache.payload === "object" ? cache.payload : null;
        if (payload?.textType === "academic_article") {
          const synthetic = buildAcademicSyntheticInsightCards();
          if (synthetic.length) insights = synthetic;
        }
      }
      const mergeSection = renderMergeSuggestionsSection();
      renderPanel(
        `<div class="insight-panel">${mergeSection}<h2>Innsikter</h2>${
          insights.length
            ? `<ul class="insight-list">${insights.map(renderInsightCard).join("")}</ul>`
            : "<p>Ingen innsikter ennå.</p>"
        }</div>`
      );
    }

    return {
      renderInsightCard,
      isFragmentaryInsightCard,
      getDisplayInsights,
      resolvePanelAction,
      applyEmneSuggestionAction,
      applyMergeAction,
      handleResolvedPanelAction,
      bindPanelActionHandler,
      renderMergeSuggestionsSection,
      showInsights
    };
  }

  global.AHAChatInsightView = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
