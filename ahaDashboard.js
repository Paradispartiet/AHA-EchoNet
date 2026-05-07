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

  function renderStats() {
    const mount = document.getElementById("aha-dashboard-stats");
    if (!mount) return;

    const stats = [
      ["Source events", readArray("aha_source_events_v1").length],
      ["Notes", readArray("aha_notes_v1").length],
      ["Galleri", readArray("aha_gallery_v1").length],
      ["Feed", readArray("aha_feed_posts_v1").length],
      ["Insta", readArray("aha_insta_posts_v1").length]
    ];

    mount.innerHTML = stats.map(([label, value]) => `
      <div class="aha-stat">
        <strong>${value}</strong><br />
        <span>${label}</span>
      </div>
    `).join("");
  }

  function bind() {
    renderStats();
    window.addEventListener("aha:source-event-added", renderStats);
    window.addEventListener("aha:historygo-imported", renderStats);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
