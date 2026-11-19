/* AHA ParadisDB: remote PUBLIC metadata inventory only. No database write or credentials. */
(function (global) {
  "use strict";
  const SOURCE_URL = "https://raw.githubusercontent.com/Paradispartiet/Paradispartiet/main/docs/paradisdb-inventory.json";
  const REGISTER_URL = "https://github.com/Paradispartiet/Paradispartiet/blob/main/docs/DATABASE_REGISTER.md";
  const PROVIDER_STATUS_URL = "https://raw.githubusercontent.com/Paradispartiet/Paradispartiet/main/docs/paradisdb-provider-status.json";
  const PROVIDER_MAX_AGE_MS = 48 * 60 * 60 * 1000;

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


  // Optional, sanitized provider observations. The canonical register remains authoritative.
  function validateProviderSnapshot(input, inventory) {
    if (!input || input.schema_version !== 1 ||
        input.source !== "docs/paradisdb-inventory.json" ||
        input.metadata_only !== true ||
        !input.provider_checks || typeof input.provider_checks !== "object" ||
        Array.isArray(input.provider_checks)) {
      throw new Error("Ukjent format for leverandørstatus.");
    }
    const ids = new Set(validateInventory(inventory).databases.map((db) => db.id));
    const entries = Object.entries(input.provider_checks);
    if (entries.length > ids.size || entries.some(([id, item]) =>
      !ids.has(id) || !item ||
      !["verified", "not_configured", "lookup_failed", "not_found_in_scope", "not_supported"].includes(item.result) ||
      !["supabase", "cloudflare_d1", "not_configured"].includes(item.provider) ||
      (item.checked_at !== null && (typeof item.checked_at !== "string" || !Number.isFinite(Date.parse(item.checked_at)))) ||
      (item.observed_status !== null && (typeof item.observed_status !== "string" || !/^[A-Z][A-Z_]{1,49}$/.test(item.observed_status))) ||
      (item.result === "verified" && (!item.checked_at || !item.observed_status))
    )) {
      throw new Error("Ugyldig eller uventet leverandørstatus.");
    }
    return input;
  }

  function describeProviderCheck(id, snapshot, now = Date.now()) {
    const value = snapshot?.provider_checks?.[id];
    if (!value) return "Ingen automatisk leverandørkontroll er publisert.";
    if (value.result === "not_supported") return "Ingen automatisk kontroll for denne databasen.";
    if (value.result === "not_configured") return "Ikke satt opp: begrenset lesetilgang mangler.";
    if (value.result === "lookup_failed") return "Siste leverandøroppslag feilet. Dette er ikke bevis på nedetid.";
    if (value.result === "not_found_in_scope") return "Ikke funnet i denne tilkoblede kontoen; ikke bevis på sletting.";
    if (value.result !== "verified") return "Ingen verifisert leverandørstatus.";
    const stamp = Date.parse(value.checked_at);
    if (!Number.isFinite(stamp) || stamp > now + 5 * 60 * 1000 || now - stamp > PROVIDER_MAX_AGE_MS) {
      return "Foreldet leverandørkontroll fra " + String(value.checked_at || "ukjent tidspunkt") +
        ". Kontroller på nytt før status brukes.";
    }
    const when = new Date(stamp).toLocaleString("nb-NO");
    if (value.provider === "supabase") {
      return "Supabase rapporterer " + value.observed_status + " (" + when +
        "). Gjelder prosjektstatus, ikke applikasjonens synk eller datalagring.";
    }
    if (value.provider === "cloudflare_d1") {
      const tableCount = Number.isSafeInteger(value.table_count) ? " · " + value.table_count + " tabeller" : "";
      return "Cloudflare D1-metadata lesbar (" + when + ")" + tableCount +
        ". Ingen bekreftelse på appkobling eller produksjonsdrift.";
    }
    return "Ingen verifisert leverandørstatus.";
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

  function renderDatabases(data, providerSnapshot) {
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
        ["Automatisk leverandørkontroll", describeProviderCheck(db.id, providerSnapshot)],
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
      let providerSnapshot = null;
      try {
        const providerResponse = await global.fetch(PROVIDER_STATUS_URL, {
          cache: "no-store",
          mode: "cors",
          credentials: "omit"
        });
        if (!providerResponse.ok) throw new Error("HTTP " + providerResponse.status);
        providerSnapshot = validateProviderSnapshot(await providerResponse.json(), data);
      } catch (providerError) {
        // Do not hide the main register when the optional status feed is unavailable.
        global.console?.warn?.("ParadisDB provider metadata unavailable", providerError);
      }
      renderStats(data);
      renderProjects(data);
      renderDatabases(data, providerSnapshot);
      content.hidden = false;
      status.dataset.state = "loaded";
      status.textContent = providerSnapshot
        ? "Hovedregister hentet fra GitHub. Leverandørkontroller har egne tidsstempler og er ikke direkte app-synk."
        : "Hovedregister hentet fra GitHub. Automatisk leverandørstatus er ikke tilgjengelig; bare dokumentert status vises.";
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
    providerStatusUrl: PROVIDER_STATUS_URL,
    registerUrl: REGISTER_URL,
    validateInventory,
    validateProviderSnapshot,
    describeProviderCheck,
    summarize
  });
  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})(window);
