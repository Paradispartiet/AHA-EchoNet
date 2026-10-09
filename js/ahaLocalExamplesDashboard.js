// AHA Local Examples Dashboard V1
// UI wrapper for explicit install/remove of reversible local example data.
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

  function api() {
    return global.AHALocalExamples;
  }

  function renderStatus() {
    const host = doc?.getElementById("aha-examples-status");
    if (!host || !api()) return null;
    const status = api().collectExampleStatus();

    host.innerHTML = status.fully_installed
      ? `<strong>Eksempeldata er installert lokalt.</strong><span>${status.installed} av ${status.expected} eksempelrecords finnes.</span>`
      : `<strong>Eksempeldata er ikke installert.</strong><span>${status.installed} av ${status.expected} eksempelrecords finnes lokalt.</span>`;
    host.classList.toggle("is-installed", status.fully_installed);
    return status;
  }

  function renderPreview() {
    const host = doc?.getElementById("aha-examples-preview");
    if (!host || !api()) return null;
    const preview = api().previewExamples();
    const feed = preview.stores.feed || [];
    const gallery = preview.stores.gallery || [];

    host.innerHTML = `
      <section class="aha-examples-preview-group">
        <p class="eyebrow">Feed</p>
        <h2>${feed.length} lokale eksempelposter</h2>
        <div class="aha-examples-preview-list">
          ${feed.map((item) => `<article><strong>${esc(item.text)}</strong><small>${esc(item.tags.join(" · "))}</small></article>`).join("")}
        </div>
      </section>
      <section class="aha-examples-preview-group">
        <p class="eyebrow">Galleri</p>
        <h2>${gallery.length} lokale eksempelreferanser</h2>
        <div class="aha-examples-preview-list">
          ${gallery.map((item) => `<article><strong>${esc(item.title)}</strong><span>${esc(item.description)}</span><small>${esc(item.tags.join(" · "))}</small></article>`).join("")}
        </div>
      </section>
    `;
    return preview;
  }

  function setMessage(text, tone = "") {
    const host = doc?.getElementById("aha-examples-message");
    if (!host) return;
    host.textContent = text || "";
    host.dataset.tone = tone;
  }

  function bind() {
    doc?.getElementById("aha-examples-install")?.addEventListener("click", () => {
      const result = api()?.installExamples?.();
      if (!result?.ok) {
        setMessage("Kunne ikke installere eksempeldata i lokal lagring.", "error");
        return;
      }
      setMessage(
        result.added
          ? `${result.added} eksempelrecords ble lagt inn lokalt.`
          : "Eksempeldataene finnes allerede; ingen records ble duplisert.",
        "success"
      );
      renderStatus();
    });

    doc?.getElementById("aha-examples-remove")?.addEventListener("click", () => {
      const result = api()?.removeExamples?.();
      if (!result?.ok) {
        setMessage("Kunne ikke fjerne eksempeldata fra lokal lagring.", "error");
        return;
      }
      setMessage(
        result.removed
          ? `${result.removed} eksempelrecords ble fjernet. Dine øvrige data er beholdt.`
          : "Ingen eksempelrecords var installert.",
        "success"
      );
      renderStatus();
    });
  }

  function init() {
    renderPreview();
    renderStatus();
    bind();
  }

  const dashboard = { init, renderPreview, renderStatus };
  global.AHALocalExamplesDashboard = dashboard;

  if (typeof module !== "undefined" && module.exports) module.exports = dashboard;
  if (doc) doc.readyState === "loading" ? doc.addEventListener("DOMContentLoaded", init) : init();
})(typeof window !== "undefined" ? window : globalThis);
