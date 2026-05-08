// ahaDashboard.js

(function () {
  "use strict";

  function readArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function localStats() {
    return {
      source_events: readArray("aha_source_events_v1").length,
      notes: readArray("aha_notes_v1").length,
      gallery: readArray("aha_gallery_v1").length,
      feed: readArray("aha_feed_posts_v1").length,
      insta: readArray("aha_insta_posts_v1").length,
      imports: readArray("aha_imports_v1").length
    };
  }

  async function databaseStats() {
    if (!window.AHARepository?.loadDashboardCounts) return { ok: false };
    return await window.AHARepository.loadDashboardCounts();
  }

  function renderStatCards(stats, label) {
    const mount = document.getElementById("aha-dashboard-stats");
    if (!mount) return;

    const rows = [
      ["Source events", stats.source_events || 0],
      ["Notes", stats.notes || 0],
      ["Galleri", stats.gallery || 0],
      ["Feed", stats.feed || 0],
      ["Insta", stats.insta || 0],
      ["Importer", stats.imports || 0]
    ];

    mount.innerHTML = `
      <div class="aha-stat aha-stat-source">
        <strong>${label}</strong><br />
        <span>Datakilde</span>
      </div>
      ${rows.map(([name, value]) => `
        <div class="aha-stat">
          <strong>${value}</strong><br />
          <span>${name}</span>
        </div>
      `).join("")}
    `;
  }

  async function renderStats() {
    const local = localStats();
    renderStatCards(local, "localStorage");

    const db = await databaseStats();
    if (db?.ok && db.counts) {
      renderStatCards(db.counts, "Supabase");
    }
  }

  function bind() {
    renderStats();
    window.addEventListener("aha:source-event-added", renderStats);
    window.addEventListener("aha:historygo-imported", renderStats);
    window.addEventListener("aha:auth-ready", renderStats);
  }

  window.AHADashboard = { localStats, databaseStats, renderStats };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
