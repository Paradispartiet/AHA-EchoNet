// AHA Release Readiness Dashboard V1
// Presentation only; renders the read-only readiness model on status.html.
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

  function stateLabel(state) {
    return ({
      ready: "Ready",
      shell: "Shell",
      planned: "Planned",
      unknown: "Ukjent"
    })[state] || "Ukjent";
  }

  function renderReleaseReadiness(statusArg) {
    const host = doc?.getElementById("aha-release-readiness");
    if (!host) return null;

    const status = statusArg || global.AHAReleaseReadiness?.buildReleaseReadinessStatus?.();
    if (!status) {
      host.innerHTML = '<p class="aha-panel-subtitle">Release readiness er ikke tilgjengelig.</p>';
      return null;
    }

    const nonReady = Array.isArray(status.intentional_non_ready) ? status.intentional_non_ready : [];
    const boundaries = status.global_boundaries || {};
    const disabledBoundaries = [
      ["Backend", boundaries.backend_enabled],
      ["Sync", boundaries.sync_enabled],
      ["EchoNet", boundaries.echonet_enabled],
      ["Ekstern deling", boundaries.external_sharing_enabled],
      ["Modelltrening", boundaries.model_training_enabled],
      ["History Go write-back", boundaries.historygo_writeback_enabled]
    ];

    host.innerHTML = `
      <div class="aha-panel-head">
        <div>
          <p class="eyebrow">Release readiness</p>
          <h2>Lokal-only baseline</h2>
          <p class="aha-panel-subtitle">${esc(status.summary)}</p>
        </div>
        <span class="aha-release-badge ${status.local_only_ready ? "is-ready" : "is-warning"}">
          ${status.local_only_ready ? "Klar lokalt" : "Krever kontroll"}
        </span>
      </div>

      <div class="aha-profile-status-grid aha-release-readiness-stats" aria-label="Release readiness nøkkeltall">
        <div class="aha-mini-stat"><strong>${status.counts.ready}</strong><span>Ready</span></div>
        <div class="aha-mini-stat"><strong>${status.counts.shell}</strong><span>Shell</span></div>
        <div class="aha-mini-stat"><strong>${status.counts.planned}</strong><span>Planned</span></div>
        <div class="aha-mini-stat"><strong>${status.counts.total}</strong><span>Totalt</span></div>
      </div>

      <div class="aha-tile-actions aha-release-readiness-actions">
        <a class="aha-tile-btn aha-tile-btn-secondary" href="demo.html">Se kom-i-gang-flyten</a>
      </div>

      <div class="aha-release-readiness-grid">
        <section class="aha-release-readiness-block" aria-labelledby="aha-release-non-ready-title">
          <h3 id="aha-release-non-ready-title">Bevisst ikke aktivert</h3>
          <div class="aha-release-module-list">
            ${nonReady.map((module) => `
              <a class="aha-release-module-row" href="${esc(module.href || "status.html")}">
                <span><strong>${esc(module.title)}</strong><small>${esc(module.id)}</small></span>
                <span class="aha-release-state is-${esc(module.release_state)}">${esc(stateLabel(module.release_state))}</span>
              </a>
            `).join("") || '<p class="aha-panel-subtitle">Ingen bevisste ikke-klare moduler.</p>'}
          </div>
        </section>

        <section class="aha-release-readiness-block" aria-labelledby="aha-release-boundaries-title">
          <h3 id="aha-release-boundaries-title">Globale grenser</h3>
          <ul class="aha-release-boundary-list">
            ${disabledBoundaries.map(([label, enabled]) => `
              <li><span>${esc(label)}</span><strong class="${enabled ? "is-warning" : "is-off"}">${enabled ? "Aktiv" : "Av"}</strong></li>
            `).join("")}
          </ul>
        </section>
      </div>

      <div class="aha-tile-actions aha-release-readiness-actions">
        <a class="aha-tile-btn aha-tile-btn-secondary" href="demo.html">Se kom-i-gang-flyt</a>
      </div>
    `;

    return status;
  }

  function init() {
    renderReleaseReadiness();
  }

  const api = { init, renderReleaseReadiness };
  global.AHAReleaseReadinessDashboard = api;

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (doc) doc.readyState === "loading" ? doc.addEventListener("DOMContentLoaded", init) : init();
})(typeof window !== "undefined" ? window : globalThis);
