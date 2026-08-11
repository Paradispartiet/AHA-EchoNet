// ahaAvisaUserExperience.js
// User-facing adapter for AHAavisa. Reads/writes only through canonical AHAAvisa APIs.

(function (global) {
  "use strict";

  const STATUS = {
    draft: {
      label: "Utkast",
      explanation: "Du jobber fortsatt med teksten.",
      next: { status: "review", label: "Send til gjennomgang", after: "Deretter kan du vurdere teksten før den markeres som klar." }
    },
    review: {
      label: "Til gjennomgang",
      explanation: "Teksten er klar for en egen kvalitetsrunde.",
      next: { status: "ready", label: "Marker som klar", after: "Deretter kan den markeres som publisert i din lokale AHAavis." }
    },
    ready: {
      label: "Klar",
      explanation: "Teksten er ferdig vurdert, men ikke markert som publisert.",
      next: { status: "published_local", label: "Publiser i min AHAavis", after: "Dette markerer artikkelen som publisert bare i denne nettleseren." }
    },
    published_local: {
      label: "Publisert i AHAavisa",
      explanation: "Artikkelen er markert som publisert lokalt i denne nettleseren.",
      next: { status: "draft", label: "Åpne som utkast igjen", after: "Da kan du redigere videre uten å sende noe ut av AHA." }
    }
  };

  const LAYERS = {
    personal: { label: "Personlig avis", explanation: "Bare en lokal organisering av din egen artikkel." },
    group: { label: "Gruppeavis", explanation: "Artikkelen er knyttet til gruppekontekst, men deles ikke automatisk." },
    public_candidate: { label: "Offentlig kandidat", explanation: "Bare lokal merking for mulig senere vurdering. Ingenting publiseres nå." }
  };

  function asText(value, fallback) {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function statusExperience(status) {
    return STATUS[asText(status, "draft")] || STATUS.draft;
  }

  function layerExperience(layer) {
    return LAYERS[asText(layer, "personal")] || LAYERS.personal;
  }

  function buildArticleExperience(article) {
    const current = article && typeof article === "object" ? article : {};
    const status = statusExperience(current.status);
    const layer = layerExperience(current.publicationLayer || current.publication_layer);
    return {
      id: asText(current.id, ""),
      statusLabel: status.label,
      statusExplanation: status.explanation,
      nextAction: { ...status.next },
      layerLabel: layer.label,
      layerExplanation: layer.explanation,
      isPublicCandidate: (current.publicationLayer || current.publication_layer) === "public_candidate",
      localOnly: true
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function findArticle(id) {
    if (!global.AHAAvisa?.loadArticles) return null;
    return global.AHAAvisa.loadArticles().find((article) => article?.id === id) || null;
  }

  function humanizeLegacyActions(card) {
    const labels = [
      ["[data-avisa-save-body]", "Lagre tekst"],
      ["[data-avisa-status-review]", "Send til gjennomgang"],
      ["[data-avisa-status-ready]", "Marker som klar"],
      ["[data-avisa-status-published]", "Publiser i min AHAavis"],
      ["[data-avisa-status-draft]", "Tilbake til utkast"],
      ["[data-avisa-layer-personal]", "Personlig avis"],
      ["[data-avisa-layer-group]", "Gruppeavis"],
      ["[data-avisa-layer-public-candidate]", "Offentlig kandidat"],
      ["[data-avisa-delete]", "Slett utkast"]
    ];
    labels.forEach(([selector, label]) => {
      const button = card.querySelector(selector);
      if (button) button.textContent = label;
    });
  }

  function ensureAdvancedActions(card) {
    const actions = card.querySelector(".status-actions");
    if (!actions || actions.closest("details[data-avisa-advanced-actions]")) return;
    const details = document.createElement("details");
    details.setAttribute("data-avisa-advanced-actions", "");
    details.className = "aha-module-details avisa-advanced-actions";
    const summary = document.createElement("summary");
    summary.textContent = "Flere handlinger og publiseringslag";
    actions.parentNode.insertBefore(details, actions);
    details.appendChild(summary);
    details.appendChild(actions);
  }

  function renderGuide(card, article) {
    if (!card || !article) return;
    const model = buildArticleExperience(article);
    const guide = document.createElement("section");
    guide.setAttribute("data-avisa-user-guide", "");
    guide.className = "avisa-user-guide";
    guide.innerHTML = `
      <div class="avisa-user-guide-copy">
        <p class="eyebrow">Hvor er teksten nå?</p>
        <strong>${escapeHtml(model.statusLabel)}</strong>
        <p>${escapeHtml(model.statusExplanation)}</p>
        <p class="module-meta">${escapeHtml(model.layerLabel)} · ${escapeHtml(model.layerExplanation)}</p>
      </div>
      <div class="avisa-user-guide-next">
        <p class="eyebrow">Neste naturlige steg</p>
        <button type="button" class="aha-tile-btn aha-tile-btn-primary" data-avisa-guided-status="${escapeHtml(model.nextAction.status)}" data-avisa-guided-article="${escapeHtml(model.id)}">${escapeHtml(model.nextAction.label)}</button>
        <p class="module-meta">${escapeHtml(model.nextAction.after)}</p>
      </div>
    `;

    const header = card.querySelector(".avisa-header-row");
    if (header?.nextSibling) header.parentNode.insertBefore(guide, header.nextSibling);
    else card.prepend(guide);
  }

  function renderPublicCandidateBoundary(card, articleId) {
    if (!card) return;
    card.querySelector("[data-avisa-public-boundary]")?.remove();
    const boundary = document.createElement("aside");
    boundary.setAttribute("data-avisa-public-boundary", "");
    boundary.className = "avisa-public-boundary";
    boundary.innerHTML = `
      <strong>Dette publiserer ikke artikkelen</strong>
      <p>«Offentlig kandidat» er bare en lokal merkelapp for senere vurdering. AHA sender ikke teksten til en server, en ekstern tjeneste eller et offentlig nettsted.</p>
      <div class="aha-tile-actions">
        <button type="button" class="aha-tile-btn aha-tile-btn-primary" data-avisa-confirm-public-candidate="${escapeHtml(articleId)}">Jeg forstår – marker lokalt</button>
        <button type="button" class="aha-tile-btn" data-avisa-cancel-public-candidate>Avbryt</button>
      </div>
    `;
    const details = card.querySelector("details[data-avisa-advanced-actions]");
    if (details) details.parentNode.insertBefore(boundary, details);
    else card.appendChild(boundary);
  }

  function enhanceCard(card) {
    if (!card || card.getAttribute("data-avisa-user-enhanced") === "1") return;
    const id = card.getAttribute("data-avisa-article-id") || "";
    if (!id) return;
    const article = findArticle(id);
    if (!article) return;
    card.setAttribute("data-avisa-user-enhanced", "1");
    const statusBadge = card.querySelector(".avisa-status");
    if (statusBadge) statusBadge.textContent = statusExperience(article.status).label;
    const layerBadge = card.querySelector(".avisa-layer-badge");
    if (layerBadge) layerBadge.textContent = layerExperience(article.publicationLayer).label;
    humanizeLegacyActions(card);
    ensureAdvancedActions(card);
    renderGuide(card, article);
  }

  function enhanceAll() {
    document.querySelectorAll("[data-avisa-article-id]").forEach(enhanceCard);
  }

  function install() {
    if (!global.document || !global.AHAAvisa || global.__ahaAvisaUserExperienceInstalled) return false;
    global.__ahaAvisaUserExperienceInstalled = true;

    document.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const candidateId = target.getAttribute("data-avisa-layer-public-candidate");
      if (candidateId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        renderPublicCandidateBoundary(target.closest("[data-avisa-article-id]"), candidateId);
        return;
      }

      const confirmId = target.getAttribute("data-avisa-confirm-public-candidate");
      if (confirmId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        global.AHAAvisa.setArticlePublicationLayer(confirmId, "public_candidate");
        global.AHAAvisa.render();
        return;
      }

      if (target.hasAttribute("data-avisa-cancel-public-candidate")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        target.closest("[data-avisa-public-boundary]")?.remove();
        return;
      }

      const guidedStatus = target.getAttribute("data-avisa-guided-status");
      const guidedArticle = target.getAttribute("data-avisa-guided-article");
      if (guidedStatus && guidedArticle) {
        event.preventDefault();
        event.stopImmediatePropagation();
        global.AHAAvisa.setArticleStatus(guidedArticle, guidedStatus);
        global.AHAAvisa.render();
      }
    }, true);

    const mount = document.getElementById("avisa-articles");
    if (mount && global.MutationObserver) {
      const observer = new global.MutationObserver(function () { enhanceAll(); });
      observer.observe(mount, { childList: true, subtree: true });
    }
    enhanceAll();
    return true;
  }

  global.AHAAvisaUserExperience = {
    statusExperience,
    layerExperience,
    buildArticleExperience,
    install
  };

  if (global.document) {
    document.addEventListener("DOMContentLoaded", install);
  }
})(window);
