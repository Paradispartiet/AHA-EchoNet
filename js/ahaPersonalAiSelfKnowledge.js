// AHA Personal AI Self Knowledge – read-only presentation of existing Meta Insights Memory.
// No new state: confirmed/important/partial feedback and active self-model tracks are only read and humanized here.
(function (global) {
  "use strict";

  const doc = global.document;

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function text(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function normalize(value) {
    return text(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  }
  function claimText(value) {
    return text(value?.claimText || value?.text || value?.title || value?.label || value);
  }
  function trackText(value) {
    if (typeof value === "string" || typeof value === "number") return text(value);
    return text(value?.label || value?.title || value?.name || value?.text || value?.summary);
  }
  function uniqueTexts(values, excluded = new Set()) {
    const seen = new Set();
    const out = [];
    asArray(values).forEach((value) => {
      const item = claimText(value);
      const key = normalize(item);
      if (!item || !key || seen.has(key) || excluded.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return out;
  }
  function uniqueTracks(values) {
    const seen = new Set();
    const out = [];
    asArray(values).forEach((value) => {
      const item = trackText(value);
      const key = normalize(item);
      if (!item || !key || seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return out;
  }

  function buildSelfKnowledgeModel(summaryArg) {
    let summary = summaryArg;
    if (!summary) {
      try { summary = global.AHAMetaInsightsMemory?.summarizeMemory?.() || {}; }
      catch { summary = {}; }
    }
    summary = asObject(summary);
    const selfModel = asObject(summary.activeSelfModel);

    const confirmed = uniqueTexts(summary.confirmedClaims);
    const confirmedKeys = new Set(confirmed.map(normalize));
    const important = uniqueTexts(summary.importantClaims, confirmedKeys);
    const importantKeys = new Set([...confirmedKeys, ...important.map(normalize)]);
    const partial = uniqueTexts(summary.partialClaims, importantKeys);

    const activeProjects = uniqueTracks(selfModel.activeProjects);
    const activePatterns = uniqueTracks(selfModel.activePatterns);
    const activeTensions = uniqueTracks(selfModel.activeTensions);
    const rejectedCount = asArray(summary.rejectedClaims).length || Number(summary.rejected) || 0;
    const outdatedCount = asArray(summary.outdatedClaims).length || Number(summary.outdated) || 0;

    return {
      local_only: true,
      read_only: true,
      source: "meta_insights_memory",
      confirmed,
      important,
      partial,
      activeProjects,
      activePatterns,
      activeTensions,
      excluded: {
        rejectedCount,
        outdatedCount,
        total: rejectedCount + outdatedCount
      },
      counts: {
        confirmed: confirmed.length,
        important: important.length,
        partial: partial.length,
        activeProjects: activeProjects.length,
        activePatterns: activePatterns.length,
        activeTensions: activeTensions.length
      }
    };
  }

  function claimControlsMarkup(item) {
    return `
      <div class="aha-module-actions aha-personal-ai-memory-actions" aria-label="Styr denne selvinnsikten">
        <button type="button" data-personal-ai-memory-response="stemmer">Stemmer</button>
        <button type="button" data-personal-ai-memory-response="delvis">Nyanser</button>
        <button type="button" data-personal-ai-memory-response="utdatert">Ikke lenger relevant</button>
        <button type="button" data-personal-ai-memory-response="feil">Feil</button>
      </div>
      <label class="module-meta">Kommentar eller nyanse (valgfritt)
        <input type="text" data-personal-ai-memory-note placeholder="Legg til en lokal kommentar" autocomplete="off" />
      </label>
      <details class="aha-personal-ai-memory-rewrite">
        <summary>Endre formuleringen</summary>
        <p class="module-meta">Bruk dette når innholdet er riktig, men AHA har formulert det feil eller for upresist. Den gamle formuleringen beholdes kun som utdatert historikk.</p>
        <label class="module-meta">Ny formulering
          <input type="text" data-personal-ai-memory-replacement placeholder="Skriv hva AHA heller skal huske" autocomplete="off" />
        </label>
        <button type="button" data-personal-ai-memory-replace>Erstatt formuleringen</button>
      </details>
      <span class="module-meta" data-personal-ai-memory-item-status aria-live="polite"></span>`;
  }

  function listMarkup(items, emptyText, controllable = false) {
    const values = asArray(items);
    if (!values.length) return `<p class="module-meta">${esc(emptyText)}</p>`;
    return `<ul class="aha-training-recommendations">${values.slice(0, 8).map((item) => controllable
      ? `<li data-personal-ai-memory-claim="${esc(item)}"><span>${esc(item)}</span>${claimControlsMarkup(item)}</li>`
      : `<li>${esc(item)}</li>`).join("")}</ul>`;
  }

  function activeTrackMarkup(model) {
    const rows = [];
    model.activeProjects.forEach((item) => rows.push(`<li><strong>Prosjekt:</strong> ${esc(item)}</li>`));
    model.activePatterns.forEach((item) => rows.push(`<li><strong>Mønster:</strong> ${esc(item)}</li>`));
    model.activeTensions.forEach((item) => rows.push(`<li><strong>Spenning:</strong> ${esc(item)}</li>`));
    return rows.length
      ? `<ul class="aha-training-recommendations">${rows.slice(0, 10).join("")}</ul>`
      : `<p class="module-meta">Ingen manuelt kuraterte aktive spor ennå.</p>`;
  }

  function renderSelfKnowledge(modelArg) {
    const host = doc?.getElementById?.("personal-ai-self-knowledge");
    const status = doc?.getElementById?.("personal-ai-self-knowledge-status");
    if (!host) return null;
    const model = modelArg || buildSelfKnowledgeModel();
    const visibleCount = model.confirmed.length + model.important.length + model.partial.length
      + model.activeProjects.length + model.activePatterns.length + model.activeTensions.length;

    if (status) {
      status.textContent = visibleCount
        ? `AHA viser ${model.confirmed.length} bekreftede selvinnsikter og skiller dem fra viktig, delvis og aktive spor.`
        : "AHA har ingen brukerbekreftet selvinnsikt å vise ennå.";
    }

    host.innerHTML = `
      <article class="aha-panel">
        <h3>Bekreftet om deg</h3>
        <p class="module-meta">Dette har du selv sagt stemmer. AHA kan behandle det som det tryggeste personlige grunnlaget.</p>
        ${listMarkup(model.confirmed, "Ingen selvinnsikter er bekreftet som «stemmer» ennå.", true)}
      </article>
      <article class="aha-panel">
        <h3>Viktig for deg</h3>
        <p class="module-meta">Markert som viktig. Viktig betyr prioritet, ikke automatisk at påstanden er bekreftet.</p>
        ${listMarkup(model.important, "Ingen egne påstander er markert som viktige utover de bekreftede.", true)}
      </article>
      <article class="aha-panel">
        <h3>Må nyanseres</h3>
        <p class="module-meta">Dette har du markert som delvis riktig og skal derfor brukes forsiktig.</p>
        ${listMarkup(model.partial, "Ingen delvis bekreftede selvinnsikter venter på nyansering.", true)}
      </article>
      <article class="aha-panel">
        <h3>Aktive spor</h3>
        <p class="module-meta">Kuraterte prosjekter, mønstre og spenninger er arbeidskontekst – ikke bekreftede fakta om deg.</p>
        ${activeTrackMarkup(model)}
      </article>
      <article class="aha-panel">
        <h3>Holdes utenfor</h3>
        <p>${model.excluded.total
          ? `${model.excluded.rejectedCount} avviste og ${model.excluded.outdatedCount} utdaterte påstander holdes utenfor denne kunnskapsflaten.`
          : "Ingen avviste eller utdaterte påstander ligger i minnet nå."}</p>
        <p class="module-meta">Avvist og utdatert materiale vises ikke her som personlig kunnskap.</p>
      </article>`;
    return model;
  }

  function refresh() { return renderSelfKnowledge(buildSelfKnowledgeModel()); }
  function init() { refresh(); }

  const api = { buildSelfKnowledgeModel, renderSelfKnowledge, refresh };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AHAPersonalAiSelfKnowledge = api;

  if (doc) doc.readyState === "loading" ? doc.addEventListener("DOMContentLoaded", init) : init();
})(typeof window !== "undefined" ? window : globalThis);