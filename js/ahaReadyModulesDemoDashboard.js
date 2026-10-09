// AHA Ready Modules Demo Dashboard V1
// Renders the read-only guide. It does not persist progress.
(function (global) {
  "use strict";

  const doc = global.document;

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderDemoPath(pathArg) {
    const host = doc?.getElementById("aha-demo-path");
    const status = doc?.getElementById("aha-demo-status");
    if (!host) return null;

    const model = pathArg || global.AHAReadyModulesDemo?.buildDemoPath?.();
    if (!model) {
      host.innerHTML = '<p class="aha-panel-subtitle">Kom-i-gang-flyten er ikke tilgjengelig.</p>';
      return null;
    }

    if (status) {
      status.textContent = model.all_ready
        ? "Alle fem steg er tilgjengelige på den lokale AHA-baselinen."
        : "Ett eller flere steg er ikke tilgjengelige ennå.";
      status.classList.toggle("is-warning", !model.all_ready);
    }

    host.innerHTML = model.steps.map((step) => `
      <article class="aha-demo-step ${step.ready ? "is-ready" : "is-blocked"}">
        <div class="aha-demo-step-number" aria-hidden="true">${step.position}</div>
        <div class="aha-demo-step-copy">
          <p class="eyebrow">${esc(step.label)}</p>
          <h2>${esc(step.title)}</h2>
          <p>${esc(step.description)}</p>
          <small>${step.ready ? "Klar på lokal baseline" : `Ikke klar · ${esc(step.registry_status)}`}</small>
        </div>
        <a class="aha-tile-btn ${step.position === 1 ? "aha-tile-btn-primary" : "aha-tile-btn-secondary"}"
           href="${esc(step.href)}"
           ${step.ready ? "" : 'aria-disabled="true" tabindex="-1"'}>
          Åpne
        </a>
      </article>
    `).join("");

    return model;
  }

  function init() {
    renderDemoPath();
  }

  const api = { init, renderDemoPath };
  global.AHAReadyModulesDemoDashboard = api;

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (doc) doc.readyState === "loading" ? doc.addEventListener("DOMContentLoaded", init) : init();
})(typeof window !== "undefined" ? window : globalThis);
