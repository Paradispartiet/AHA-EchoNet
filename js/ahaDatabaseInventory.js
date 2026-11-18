/* AHA ParadisDB: remote PUBLIC metadata inventory only. No database write or credentials. */
(function (global) {
  "use strict";
  const SOURCE_URL = "https://raw.githubusercontent.com/Paradispartiet/Paradispartiet/main/docs/paradisdb-inventory.json";
  const REGISTER_URL = "https://github.com/Paradispartiet/Paradispartiet/blob/main/docs/DATABASE_REGISTER.md";

  function validateInventory(input) {
    if (!input || input.schema_version !== 1 || input.source !== "docs/DATABASE_REGISTER.md"
      || input.metadata_only !== true || input.live_paradisdb_sync_verified !== false
      || !Array.isArray(input.databases) || !Array.isArray(input.projects)
      || input.databases.length > 100 || input.projects.length > 200) {
      throw new Error("Ukjent eller ufullstendig registerformat.");
    }
    const ids = new Set();
    input.databases.forEach((entry) => {
      if (!entry || !/^DB-\d{2}$/.test(entry.id) || ids.has(entry.id)
        || !entry.system || !entry.provider_environment || !entry.verification) {
        throw new Error("Ugyldig eller duplisert databasepost.");
      }
      ids.add(entry.id);
    });
    const projectIds = new Set();
    input.projects.forEach((entry) => {
      if (!entry || !/^PRJ-\d{2}$/.test(entry.id) || projectIds.has(entry.id)
        || !entry.name || !/^[a-z0-9_.-]+$/i.test(entry.repository)
        || !Array.isArray(entry.database_ids)
        || entry.database_ids.some((id) => !ids.has(id))) {
        throw new Error("Prosjektregisteret har en ugyldig databasekobling.");
      }
      projectIds.add(entry.id);
    });
    return input;
  }

  function summarize(input) {
    const data = validateInventory(input);
    return {
      databases: data.databases.length,
      projects: data.projects.length,
      unmapped: data.projects.filter((p) => p.database_ids.length === 0).length
    };
  }

  function el(tag, className, text) {
    const node = global.document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function appendText(parent, tag, className, text) {
    const node = el(tag, className, text);
    parent.appendChild(node);
    return node;
  }

  function renderStats(data) {
    const counts = summarize(data);
    const root = global.document.getElementById("aha-paradisdb-summary");
    root.replaceChildren();
    [
      [counts.databases, "Identifiserte databaser"],
      [counts.projects, "Prosjektoppføringer"],
      [counts.unmapped, "Uten bekreftet DB-kobling"]
    ].forEach(([count, label]) => {
      const card = el("div", "aha-paradisdb-stat");
      appendText(card, "strong", "", count);
      appendText(card, "span", "", label);
      root.appendChild(card);
    });
  }

  function renderProjects(data) {
    const root = global.document.getElementById("aha-paradisdb-projects");
    root.replaceChildren();
    const byId = new Map(data.databases.map((entry) => [entry.id, entry]));
    data.projects.forEach((project) => {
      const card = el("article", "aha-paradisdb-project");
      appendText(card, "h3", "", project.name);
      const repo = appendText(card, "a", "aha-paradisdb-meta", project.repository);
      repo.href = "https://github.com/Paradispartiet/" + project.repository;
      repo.target = "_blank";
      repo.rel = "noopener noreferrer";
      const refs = el("div", "aha-paradisdb-refs");
      if (project.database_ids.length === 0) {
        appendText(refs, "span", "aha-paradisdb-ref", "Ingen bekreftet database");
      } else {
        project.database_ids.forEach((id) => {
          appendText(refs, "span", "aha-paradisdb-ref", id + " · " + byId.get(id).system);
        });
      }
      card.appendChild(refs);
      appendText(card, "p", "", project.verification || "Status ikke dokumentert");
      appendText(card, "p", "aha-paradisdb-meta", "Annen lagring: " + (project.other_storage || "Uavklart"));
      card.dataset.search = (project.name + " " + project.repository + " " + project.database_ids.join(" ")).toLocaleLowerCase("no");
      root.appendChild(card);
    });
    filterProjects();
  }

  function renderDatabases(data) {
    const root = global.document.getElementById("aha-paradisdb-databases");
    root.replaceChildren();
    data.databases.forEach((db) => {
      const details = el("details", "aha-paradisdb-db");
      const summary = el("summary");
      appendText(summary, "strong", "", db.id + " · " + db.system);
      appendText(summary, "span", "", db.provider_environment);
      details.appendChild(summary);
      const dl = el("dl");
      [
        ["Identifikasjon", db.identity],
        ["Plassering", db.location],
        ["Siste dokumenterte status", db.verification],
        ["Neste kontroll", db.next_check]
      ].forEach(([key, value]) => {
        appendText(dl, "dt", "", key);
        appendText(dl, "dd", "", value || "Uavklart");
      });
      details.appendChild(dl);
      root.appendChild(details);
    });
  }

  function filterProjects() {
    const input = global.document.getElementById("aha-paradisdb-project-search");
    const value = (input?.value || "").trim().toLocaleLowerCase("no");
    let count = 0;
    global.document.querySelectorAll(".aha-paradisdb-project").forEach((card) => {
      const matches = !value || card.dataset.search.includes(value);
      card.hidden = !matches;
      if (matches) count++;
    });
    const target = global.document.getElementById("aha-paradisdb-project-count");
    if (target) target.textContent = count + " prosjekter vises";
  }

  async function load() {
    const status = global.document.getElementById("aha-paradisdb-status");
    const refresh = global.document.getElementById("aha-paradisdb-refresh");
    const content = global.document.getElementById("aha-paradisdb-content");
    if (!status || !refresh || !content) return;
    refresh.disabled = true;
    status.dataset.state = "loading";
    status.textContent = "Henter sist publiserte metadata fra hovedregisteret …";
    content.hidden = true;
    try {
      const response = await global.fetch(SOURCE_URL, {
        cache: "no-store",
        mode: "cors",
        credentials: "omit"
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = validateInventory(await response.json());
      renderStats(data);
      renderProjects(data);
      renderDatabases(data);
      content.hidden = false;
      status.dataset.state = "loaded";
      status.textContent = "Hentet fra GitHub nå. Statusfeltene viser sist dokumenterte kontroll – ikke en ny live-kontroll av databaser.";
    } catch (error) {
      status.dataset.state = "error";
      status.textContent = "Kunne ikke hente eller kontrollere registeret. Ingen gammel status vises som oppdatert. Åpne hovedregisteret i GitHub.";
      global.console?.warn?.("ParadisDB metadata unavailable", error);
    } finally {
      refresh.disabled = false;
    }
  }

  function initialize() {
    if (!global.document.getElementById("aha-paradisdb-main")) return;
    global.document.getElementById("aha-paradisdb-refresh")?.addEventListener("click", load);
    global.document.getElementById("aha-paradisdb-project-search")?.addEventListener("input", filterProjects);
    load();
  }

  global.AHAParadisDB = Object.freeze({
    sourceUrl: SOURCE_URL,
    registerUrl: REGISTER_URL,
    validateInventory,
    summarize
  });
  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})(window);
