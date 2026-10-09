// AHA Local Demo Seed Dashboard V1
(function (global) {
  "use strict";

  const doc = global.document;

  function text(value) {
    return String(value ?? "");
  }

  function renderStatus(result) {
    const status = doc?.getElementById("aha-demo-seed-status");
    if (!status) return;

    if (!result?.ok) {
      status.textContent = "Eksempeldata er ikke tilgjengelig.";
      status.className = "aha-demo-status is-warning";
      return;
    }

    const inspection = global.AHALocalDemoSeed?.inspectSeed?.() || result;
    if (inspection.installed) {
      status.textContent = `Eksempeldata er lagt inn lokalt (${inspection.count} seed-objekter).`;
      status.className = "aha-demo-status";
    } else {
      status.textContent = "Ingen AHA-eksempeldata er lagt inn i denne nettleseren.";
      status.className = "aha-demo-status is-neutral";
    }
  }

  function bind() {
    const apply = doc?.getElementById("aha-demo-seed-apply");
    const remove = doc?.getElementById("aha-demo-seed-remove");
    if (!apply || !remove || !global.AHALocalDemoSeed) return false;

    apply.addEventListener("click", () => {
      const result = global.AHALocalDemoSeed.applySeed();
      renderStatus(result);
      const output = doc.getElementById("aha-demo-seed-output");
      if (output && result?.ok) {
        output.textContent = `La inn ${result.installed} seed-objekter. ${result.preserved} eksisterende objekter ble bevart.`;
      }
    });

    remove.addEventListener("click", () => {
      const result = global.AHALocalDemoSeed.removeSeed();
      renderStatus(result);
      const output = doc.getElementById("aha-demo-seed-output");
      if (output && result?.ok) {
        output.textContent = `Fjernet ${result.removed} seed-objekter. Dine øvrige lokale data ble beholdt.`;
      }
    });

    renderStatus(global.AHALocalDemoSeed.inspectSeed());
    return true;
  }

  global.AHALocalDemoSeedDashboard = { bind, renderStatus };

  if (typeof module !== "undefined" && module.exports) module.exports = global.AHALocalDemoSeedDashboard;
  if (doc) doc.readyState === "loading" ? doc.addEventListener("DOMContentLoaded", bind) : bind();
})(typeof window !== "undefined" ? window : globalThis);
