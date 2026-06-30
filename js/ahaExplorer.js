// AHA Analyse Explorer v1
// Viser alt AHA har hentet ut av samtalen i navigerbare faner under chatten:
// Oversikt · Innsikter · Begreper · Fag · Struktur · Kart · Data.
// Modulen endrer ingen analyse – den presenterer eksportbundlen fra
// AHAChatExport.buildAhaAnalysisExportBundle på en lesbar måte.
(function (global) {
  "use strict";

  const TAB_NAMES = ["oversikt", "innsikter", "begreper", "fag", "kilder", "struktur", "etterarbeid", "kart", "data"];

  let currentBundle = null;
  let initialized = false;

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function asList(value) {
    return Array.isArray(value) ? value : [];
  }

  function asText(value) {
    return String(value == null ? "" : value).trim();
  }

  function safeJson(value) {
    const serialize = global.AHAChatExport?.safeSerializeForExport;
    try {
      return JSON.stringify(serialize ? serialize(value) : value, null, 2);
    } catch {
      return Array.isArray(value) ? "[]" : "{}";
    }
  }


  function getActiveRun() {
    return global.AHAActiveRun?.get?.() || null;
  }

  function payloadRunId(value) {
    return String(value?.analysisRunId || value?.runId || value?.activeRun?.analysisRunId || value?.activeRun?.runId || "");
  }

  function payloadSourceHash(value) {
    return String(value?.sourceHash || value?.sourceTextHash || value?.normalizedSourceHash || value?.sourceFingerprint || value?.activeRun?.sourceHash || "");
  }

  function bundleMatchesActiveRun(bundle) {
    const run = getActiveRun();
    if (!run) return true;
    const expected = String(run.analysisRunId || run.runId || run.sourceHash || "");
    const gotRun = payloadRunId(bundle) || payloadRunId(bundle?.rawAutoPayload) || payloadRunId(bundle?.canonicalAnalysis) || payloadRunId(bundle?.afterwork);
    const gotHash = payloadSourceHash(bundle) || payloadSourceHash(bundle?.rawAutoPayload) || payloadSourceHash(bundle?.canonicalAnalysis) || payloadSourceHash(bundle?.afterwork);
    if (gotRun && gotRun !== String(run.analysisRunId || run.runId || "")) {
      console.warn(`Skipped stale AHA analysis payload: expected ${expected}, got ${gotRun}.`);
      return false;
    }
    if (gotHash && run.sourceHash && gotHash !== run.sourceHash) {
      console.warn(`Skipped stale AHA analysis payload: expected ${run.sourceHash}, got ${gotHash}.`);
      return false;
    }
    return true;
  }

  function clear(run = getActiveRun()) {
    init();
    currentBundle = null;
    TAB_NAMES.forEach((name) => {
      const host = getContainer(name);
      if (host) host.innerHTML = emptyNote(name === "innsikter" ? "Lagrede innsikter vises separat. AHA venter på ny analyse." : "AHA venter på ny analyse.");
      setTabCount(name, 0);
    });
    renderAhaNow({ ahaSer: {}, afterwork: {}, insights: [], concepts: [], sourceTextHash: run?.sourceHash || "", analysisRunId: run?.analysisRunId || run?.runId || "" });
  }

  function humanizeTextType(type) {
    const key = String(type || "").trim().toLowerCase();
    const labels = {
      academic_article: "Fagtekst / leksikontekst / mediehistorisk tekst",
      day_log: "Dagbokmateriale",
      literary_diary: "Personlig refleksjon / dagbokprosa",
      literary_fragment: "Kreativ tekst",
      opinion_article: "Politisk / argumenterende tekst",
      theory_idea: "Teoritekst",
      project_note: "Prosjektarbeid",
      legal_text: "Juridisk tekst",
      technical_work: "Teknisk arbeid",
      learning_note: "Læringsnotat",
      general: "AHA venter på tekst"
    };
    return labels[key] || (key ? key : "AHA venter på tekst");
  }

  function card(title, bodyHtml, opts = {}) {
    const cls = opts.primary ? " exp-card-primary" : "";
    return `<article class="exp-card${cls}"><h3>${esc(title)}</h3>${bodyHtml}</article>`;
  }

  function chipRow(items, cls = "exp-chip") {
    const list = asList(items).map(asText).filter(Boolean);
    if (!list.length) return "";
    return `<div class="exp-chips">${list.map((item) => `<span class="${cls}">${esc(item)}</span>`).join("")}</div>`;
  }

  function emptyNote(text) {
    return `<p class="exp-empty">${esc(text)}</p>`;
  }

  function orderedList(items, max = 12) {
    const list = asList(items).map(asText).filter(Boolean).slice(0, max);
    if (!list.length) return emptyNote("(ingen)");
    return `<ol class="exp-list">${list.map((item) => `<li>${esc(item)}</li>`).join("")}</ol>`;
  }

  function dlRow(label, value) {
    const text = asText(value);
    if (!text) return "";
    return `<div><dt>${esc(label)}</dt><dd>${esc(text)}</dd></div>`;
  }

  function getContainer(name) {
    return document.getElementById(`exp-${name}`);
  }

  // ── Oversikt ────────────────────────────────────────────────
  function renderOversikt(b) {
    const host = getContainer("oversikt");
    if (!host) return;
    const ser = b.ahaSer || {};
    const afterwork = b.afterwork || {};
    const kortSvar = asText(ser.kortSvar) || asText(b.ahaReply);
    const hasAnything = kortSvar || asText(ser.tema) || asText(afterwork.summary) || asList(b.insights).length;
    if (!hasAnything) {
      host.innerHTML = emptyNote("AHA venter på tekst. Oversikten vises her når AHA har nok materiale.");
      return;
    }
    const points = asList(b.insights).map(asText).filter(Boolean);
    const fallbackPoints = asList(afterwork.list).map(asText).filter(Boolean);
    const mainPoints = (points.length ? points : fallbackPoints).slice(0, 5);
    const nesteSteg = asText(ser.nesteSteg) || asText(afterwork?.thoughts?.neste_steg) || asText(asList(afterwork.path)[0]);
    host.innerHTML = [
      kortSvar ? card("Kort svar", `<p class="exp-lede">${esc(kortSvar)}</p>`, { primary: true }) : "",
      asText(afterwork.summary) ? card("Oppsummering", `<p>${esc(afterwork.summary)}</p>`) : "",
      mainPoints.length ? card("Viktigste punkter", orderedList(mainPoints, 5)) : "",
      nesteSteg && !asText(ser.nesteSteg) ? card("Neste steg", `<p>${esc(nesteSteg)}</p>`) : ""
    ].filter(Boolean).join("");
  }

  // ── Innsikter ───────────────────────────────────────────────
  function chamberInsightCard(ins) {
    const title = asText(ins?.title) || "Innsikt uten tittel";
    const summary = asText(ins?.summary);
    const meta = [];
    const type = asText(ins?.insight_type || ins?.type);
    const fn = asText(ins?.functional_type || ins?.function_type);
    const status = asText(ins?.status);
    const score = Number(ins?.strength?.total_score);
    const evidence = Number(ins?.strength?.evidence_count);
    const depth = Number(ins?.depth_score);
    if (type) meta.push(`Type: ${type}`);
    if (fn) meta.push(`Funksjon: ${fn}`);
    if (status) meta.push(`Status: ${status}`);
    if (Number.isFinite(score) && score > 0) meta.push(`Styrke: ${score}${Number.isFinite(evidence) && evidence > 0 ? ` (${evidence} belegg)` : ""}`);
    if (Number.isFinite(depth) && depth > 0) meta.push(`Dybde: ${depth}`);
    const dimensions = asList(ins?.dimensions).map(asText).filter(Boolean);
    const rawTerms = asList(ins?.raw_terms).map((term) => asText(term?.label || term?.key || term)).filter(Boolean).slice(0, 10);
    return `<article class="exp-card exp-insight-card">
      <h3>${esc(title)}</h3>
      ${summary ? `<p>${esc(summary)}</p>` : ""}
      ${meta.length ? chipRow(meta, "exp-chip exp-chip-meta") : ""}
      ${dimensions.length ? `<p class="exp-kicker">Dimensjoner</p>${chipRow(dimensions)}` : ""}
      ${rawTerms.length ? `<p class="exp-kicker">Nøkkelord</p>${chipRow(rawTerms)}` : ""}
      <details class="exp-acc exp-acc-inline"><summary>Vis grunnlag</summary><pre class="exp-json">${esc(safeJson(ins))}</pre></details>
    </article>`;
  }

  function renderInnsikter(b) {
    const host = getContainer("innsikter");
    if (!host) return;
    const simple = asList(b.insights).map(asText).filter(Boolean);
    const chamber = asList(b.chamberInsights).filter((ins) => ins && typeof ins === "object");
    if (!simple.length && !chamber.length) {
      host.innerHTML = emptyNote("AHA har ikke laget innsikter for denne analysen ennå. Innsikter bygges automatisk når du sender tekster i chatten.");
      return;
    }
    const parts = [];
    if (simple.length) {
      parts.push(`<p class="exp-kicker">Innsikter fra denne analysen</p>`);
      parts.push(simple.map((text) => `<article class="exp-card"><p>${esc(text)}</p></article>`).join(""));
    }
    if (chamber.length) {
      parts.push(`<p class="exp-kicker">Lagrede innsikter / relevante tidligere innsikter (${chamber.length})</p>`);
      parts.push(chamber.map(chamberInsightCard).join(""));
    }
    host.innerHTML = parts.join("");
  }

  // ── Begreper ────────────────────────────────────────────────
  function conceptSnippet(concept, sourceText) {
    const text = String(sourceText || "");
    if (!text) return "";
    const idx = text.toLowerCase().indexOf(String(concept || "").toLowerCase());
    if (idx < 0) return "";
    const start = Math.max(0, idx - 90);
    const end = Math.min(text.length, idx + String(concept).length + 90);
    return `${start > 0 ? "… " : ""}${text.slice(start, end).replace(/\s+/g, " ").trim()}${end < text.length ? " …" : ""}`;
  }

  function renderConceptDetail(concept) {
    const detail = document.getElementById("exp-concept-detail");
    if (!detail || !currentBundle) return;
    const b = currentBundle;
    const snippet = conceptSnippet(concept, b.sourceText);
    const links = [];
    asList(b.ahaSer?.fagkoblinger).forEach((item) => links.push(asText(item)));
    asList(b.subjectMatches).forEach((match) => links.push(asText(match?.title || match?.subject_label)));
    const uniqueLinks = [...new Set(links.filter(Boolean))].slice(0, 8);
    detail.innerHTML = `<article class="exp-card exp-card-primary">
      <h3>Begrep: ${esc(concept)}</h3>
      <p class="exp-kicker">Forekomst</p>
      <p>${snippet ? esc(snippet) : "AHA fant begrepet i analysen av teksten."}</p>
      <p class="exp-kicker">Koblinger</p>
      ${uniqueLinks.length ? chipRow(uniqueLinks) : emptyNote("Koblinger vises her når AHA finner tydelige sammenhenger.")}
      <p class="exp-kicker">Handling</p>
      <button type="button" class="exp-action-btn" data-concept-add="${esc(concept)}">Legg til i kunnskapskart</button>
    </article>`;
  }

  function renderBegreper(b) {
    const host = getContainer("begreper");
    if (!host) return;
    const concepts = [...new Set(asList(b.concepts).map(asText).filter(Boolean))];
    const candidates = [...new Set(asList(b.rawAutoPayload?.keywords).map(asText).filter(Boolean))]
      .filter((word) => !concepts.some((c) => c.toLowerCase() === word.toLowerCase()));
    const parts = [];
    if (concepts.length) {
      parts.push(`<p class="exp-kicker">Begreper funnet</p>`);
      parts.push(`<div class="exp-chips">${concepts.map((c) => `<button type="button" class="exp-chip exp-chip-btn" data-concept="${esc(c)}">${esc(c)}</button>`).join("")}</div>`);
    } else {
      parts.push(emptyNote("Begreper vises her når AHA finner tydelige mønstre i teksten."));
    }
    if (candidates.length) {
      parts.push(`<p class="exp-kicker">Mulige begrepskandidater</p>`);
      parts.push(`<div class="exp-chips">${candidates.slice(0, 12).map((c) => `<button type="button" class="exp-chip exp-chip-btn exp-chip-muted" data-concept="${esc(c)}">${esc(c)}</button>`).join("")}</div>`);
    }
    parts.push(`<div id="exp-concept-detail" class="exp-concept-detail"></div>`);
    host.innerHTML = parts.join("");
  }

  // ── Fag ─────────────────────────────────────────────────────
  function subjectMatchCard(match) {
    const title = asText(match?.title || match?.subject_label) || "Uten tittel";
    const id = asText(match?.subject_id);
    const score = Number(match?.score);
    const terms = asList(match?.matched_terms).map(asText).filter(Boolean).slice(0, 6);
    const reason = asText(match?.reason || match?.why);
    return `<article class="exp-card exp-subject-card">
      <h3>${esc(title)}</h3>
      <p class="exp-subject-meta">${id ? `<code>${esc(id)}</code>` : ""}${Number.isFinite(score) && score > 0 ? `<span>relevans ${score.toFixed(2)}</span>` : ""}</p>
      ${reason ? `<p>${esc(reason)}</p>` : ""}
      ${terms.length ? chipRow(terms, "exp-chip exp-chip-muted") : ""}
    </article>`;
  }

  function renderFag(b) {
    const host = getContainer("fag");
    if (!host) return;
    const matches = asList(b.subjectMatches).filter((m) => m && typeof m === "object");
    const fagkoblinger = asList(b.ahaSer?.fagkoblinger).map(asText).filter(Boolean);
    if (!matches.length && !fagkoblinger.length) {
      host.innerHTML = emptyNote("Ingen fagkoblinger funnet for denne analysen ennå.");
      return;
    }
    const strong = [];
    const possible = [];
    const weak = [];
    matches.forEach((match) => {
      const score = Number(match?.score);
      if (Number.isFinite(score) && score >= 1.5) strong.push(match);
      else if (!Number.isFinite(score) || score === 0 || score >= 0.8) possible.push(match);
      else weak.push(match);
    });
    const group = (label, list) => (list.length
      ? `<p class="exp-kicker">${esc(label)} (${list.length})</p>${list.map(subjectMatchCard).join("")}`
      : "");
    host.innerHTML = [
      fagkoblinger.length ? `<p class="exp-kicker">Fagkoblinger fra AHA SER</p>${chipRow(fagkoblinger)}` : "",
      group("Sterke fagkoblinger", strong),
      group("Mulige fagkoblinger", possible),
      group("Svake / tekniske treff", weak)
    ].filter(Boolean).join("");
  }


  // ── Kilder ──────────────────────────────────────────────────
  function loadWebArticleSourceEvents() {
    try {
      const apiEvents = global.AHASources?.loadSourceEvents?.();
      const events = Array.isArray(apiEvents)
        ? apiEvents
        : JSON.parse(localStorage.getItem("aha_source_events_v1") || "[]");
      return asList(events)
        .filter((event) => event?.source_type === "web_article" && event?.source_app === "aha_link_reader")
        .slice(0, 12);
    } catch {
      return [];
    }
  }

  function sourceEventCard(event) {
    const meta = event?.meta || {};
    const title = asText(event?.title) || asText(meta.url) || "Webkilde";
    const publisher = asText(meta.publisher || meta.domain) || "Ukjent kilde";
    const status = asText(meta.access_status) || "metadata_only";
    const usedFulltext = meta.transient_fulltext_read === true ? "Ja" : "Nei";
    const rawStored = meta.raw_article_stored === true ? "Ja" : "Nei";
    const url = asText(meta.canonical_url || meta.url);
    const rows = [
      dlRow("Kilde", publisher),
      dlRow("Status", status),
      dlRow("Fulltekst brukt transient", usedFulltext),
      dlRow("Rå artikkeltekst lagret", rawStored),
      dlRow("URL", url)
    ].join("");
    return `<article class="exp-card exp-source-card">
      <h3>${esc(title)}</h3>
      <dl class="exp-dl">${rows}</dl>
      <p class="exp-kicker">Brukt til analyse</p>
      <p>${esc(asText(event?.text) || "AHA lagret bare trygg metadata/oppsummering for denne kilden.")}</p>
    </article>`;
  }

  function renderKilder() {
    const host = getContainer("kilder");
    if (!host) return;
    const events = loadWebArticleSourceEvents();
    host.innerHTML = events.length
      ? events.map(sourceEventCard).join("")
      : emptyNote("Kilder vises her når teksten inneholder lenker eller referanser.");
    setTabCount("kilder", events.length);
  }

  // ── Struktur ────────────────────────────────────────────────
  function renderStruktur(b) {
    const host = getContainer("struktur");
    if (!host) return;
    const afterwork = b.afterwork || {};
    const sortItems = asList(afterwork.sortItems)
      .map((item) => ({ label: asText(item?.label) || "Punkt", text: asText(item?.text) }))
      .filter((item) => item.text);
    const list = asList(afterwork.list).map(asText).filter(Boolean);
    const path = asList(afterwork.path).map(asText).filter(Boolean);
    const thoughts = afterwork.thoughts || {};
    const thoughtRows = [
      dlRow("Hovedspor", thoughts.hovedspor),
      dlRow("Løse tanker", thoughts.lose_tanker),
      dlRow("Neste steg", thoughts.neste_steg)
    ].join("");
    const afterworkRows = [
      dlRow("Oppsummering", afterwork.summary),
      dlRow("Innsikt", afterwork.insight),
      dlRow("Refleksjon", afterwork.reflection)
    ].join("");
    const parts = [
      sortItems.length ? card("Sortert struktur", `<ul class="exp-sort-list">${sortItems.map((item) => `<li><strong>${esc(item.label)}:</strong> ${esc(item.text)}</li>`).join("")}</ul>`) : "",
      list.length ? card("Liste", orderedList(list)) : "",
      path.length ? card("Læringssti", orderedList(path)) : "",
      afterworkRows ? card("Etterarbeid", `<dl class="exp-dl">${afterworkRows}</dl>`) : "",
      thoughtRows ? card("Tanker", `<dl class="exp-dl">${thoughtRows}</dl>`) : ""
    ].filter(Boolean);
    host.innerHTML = parts.length
      ? `<div class="exp-grid">${parts.join("")}</div>`
      : emptyNote("AHA har ikke laget arbeidsmateriale (struktur, liste eller sti) for denne analysen ennå.");
  }

  // ── Kart ────────────────────────────────────────────────────
  function knowledgeItemLabel(item) {
    if (item == null) return "";
    if (typeof item === "string" || typeof item === "number") return String(item);
    return asText(item.title || item.label || item.name || item.key || item.id) || JSON.stringify(item).slice(0, 80);
  }

  function renderKart(b) {
    const host = getContainer("kart");
    if (!host) return;
    const summary = b.chamberSummary || {};
    const meta = b.chamberMeta || {};
    const updatedAt = asText(meta.updatedAt || meta.updated_at || meta.lastUpdated || b.createdAt);
    const statusRows = [
      dlRow("Innsikter", String(Number(summary.insightCount) || 0)),
      dlRow("Chat turns", String(Number(summary.chatTurns) || 0)),
      dlRow("Afterworks", String(Number(summary.recentAfterworkCount) || 0)),
      dlRow("Siste oppdatering", updatedAt)
    ].join("");
    const parts = [card("Kunnskapskart – status", `<dl class="exp-dl">${statusRows}</dl>`)];

    const map = b.knowledgeMap && typeof b.knowledgeMap === "object" ? b.knowledgeMap : {};
    const sectionLabels = {
      relations: "Relasjoner", relasjoner: "Relasjoner",
      themes: "Temaer", temaer: "Temaer",
      persons: "Personer", people: "Personer", personer: "Personer",
      places: "Steder", steder: "Steder",
      concepts: "Begreper", begreper: "Begreper"
    };
    const mapSections = Object.keys(map)
      .map((key) => {
        const items = asList(map[key]).map(knowledgeItemLabel).filter(Boolean);
        if (!items.length) return "";
        const label = sectionLabels[key.toLowerCase()] || key;
        return card(label, chipRow(items.slice(0, 14)));
      })
      .filter(Boolean);
    if (mapSections.length) {
      parts.push(`<div class="exp-grid">${mapSections.join("")}</div>`);
    } else {
      parts.push(emptyNote("AHA har ikke bygget et kunnskapskart for denne analysen ennå."));
    }
    if (Object.keys(meta).length) {
      parts.push(`<details class="exp-acc"><summary>Chamber-status</summary><pre class="exp-json">${esc(safeJson(meta))}</pre></details>`);
    }
    host.innerHTML = parts.join("");
  }


  function renderAhaNow(b) {
    const host = document.getElementById("aha-now-content");
    if (!host) return;
    const ser = b.ahaSer || {};
    const rows = [
      dlRow("Innholdstype", ser.innholdstype ? humanizeTextType(ser.innholdstype) : ""),
      dlRow("Tema", ser.tema),
      dlRow("Hovedspenning", ser.hovedspenning),
      dlRow("Viktigste innsikt", ser.viktigsteInnsikt),
      dlRow("Neste steg", ser.nesteSteg)
    ].join("");
    host.innerHTML = rows
      ? `<dl class="aha-now-list">${rows}</dl>`
      : emptyNote("Send en tekst, så bygger AHA oversikt, begreper og innsikter her.");
  }

  function renderEtterarbeid(b) {
    const host = getContainer("etterarbeid");
    if (!host) return;
    const afterwork = b.afterwork || {};
    const rows = [
      dlRow("Oppsummering", afterwork.summary),
      dlRow("Innsikt", afterwork.insight),
      dlRow("Refleksjon", afterwork.reflection),
      dlRow("Neste steg", afterwork?.thoughts?.neste_steg)
    ].join("");
    host.innerHTML = rows
      ? card("Etterarbeid", `<dl class="exp-dl">${rows}</dl>`)
      : emptyNote("Etterarbeid vises her når AHA har nok materiale til forslag, lister eller læringssteg.");
  }

  // ── Data ────────────────────────────────────────────────────
  const DATA_SECTIONS = [
    { key: "fullBundle", label: "Full bundle", get: (b) => b },
    { key: "rawAutoPayload", label: "Rå auto-output payload", get: (b) => b.rawAutoPayload },
    { key: "canonicalAnalysis", label: "Canonical analysis", get: (b) => b.canonicalAnalysis },
    { key: "selectedAfterwork", label: "Valgt afterwork", get: (b) => b.selectedAfterwork },
    { key: "relevantAfterworks", label: "Relevante afterworks", get: (b) => b.relevantAfterworks },
    { key: "chamberInsights", label: "Chamber insights", get: (b) => b.chamberInsights },
    { key: "chamberChatLog", label: "Chamber chatLog", get: (b) => b.chamberChatLog },
    { key: "metaProfile", label: "Meta-profil", get: (b) => b.metaProfile },
    { key: "knowledgeMap", label: "KnowledgeMap / kunnskapstre", get: (b) => b.knowledgeMap },
    { key: "calibrationStatus", label: "Calibration status", get: (b) => b.calibrationStatus },
    { key: "sourceText", label: "Kildetekst", get: (b) => b.sourceText, isText: true },
    { key: "fullChamberSnapshot", label: "Full chamber snapshot", get: (b) => b.fullChamberSnapshot }
  ];

  function dataSectionContent(section) {
    if (!currentBundle) return "";
    const value = section.get(currentBundle);
    if (section.isText) return asText(value) || "(ingen kildetekst)";
    return safeJson(value);
  }

  function renderData(b) {
    const host = getContainer("data");
    if (!host) return;
    host.innerHTML = DATA_SECTIONS.map((section) => `
      <details class="exp-acc" data-data-key="${esc(section.key)}">
        <summary>${esc(section.label)}</summary>
        <div class="exp-json-actions">
          <button type="button" class="exp-action-btn" data-json-copy="${esc(section.key)}">Kopier</button>
          <button type="button" class="exp-action-btn" data-json-download="${esc(section.key)}">Last ned JSON</button>
        </div>
        <pre class="exp-json" data-json-target="${esc(section.key)}"></pre>
      </details>`).join("");
    // JSON fylles først når seksjonen åpnes, slik at store snapshots
    // ikke koster noe før brukeren ber om dem.
    host.querySelectorAll("details[data-data-key]").forEach((details) => {
      details.addEventListener("toggle", () => {
        if (!details.open) return;
        const pre = details.querySelector("[data-json-target]");
        if (pre && !pre.textContent) {
          const section = DATA_SECTIONS.find((s) => s.key === details.dataset.dataKey);
          if (section) pre.textContent = dataSectionContent(section);
        }
      });
    });
  }

  function findDataSection(key) {
    return DATA_SECTIONS.find((s) => s.key === key) || null;
  }

  async function copyDataSection(key) {
    const section = findDataSection(key);
    if (!section) return;
    try {
      await navigator.clipboard.writeText(dataSectionContent(section));
    } catch {
      /* clipboard utilgjengelig – innholdet vises uansett i panelet */
    }
  }

  function downloadDataSection(key) {
    const section = findDataSection(key);
    if (!section) return;
    const content = dataSectionContent(section);
    const isText = Boolean(section.isText);
    const blob = new Blob([content], { type: isText ? "text/plain" : "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aha-${key}.${isText ? "txt" : "json"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ── Faner ───────────────────────────────────────────────────
  function open(name) {
    const root = document.getElementById("aha-explorer");
    if (!root || !TAB_NAMES.includes(name)) return;
    root.querySelectorAll("[data-tab]").forEach((btn) => {
      const active = btn.dataset.tab === name;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    root.querySelectorAll("[data-tab-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.tabPanel !== name;
    });
    // Legacy-panelene fylles av ahaChat.js sine eksisterende motorer.
    try {
      if (name === "kart") global.showMeta?.();
      if (name === "struktur") global.showSavedAfterwork?.();
    } catch (err) {
      console.warn("AHA Explorer: klarte ikke å oppdatere legacy-panel", err);
    }
  }

  function setTabCount(name, count) {
    const btn = document.querySelector(`#aha-explorer [data-tab="${name}"] .exp-tab-count`);
    if (btn) btn.textContent = count > 0 ? String(count) : "";
  }

  function setComposerText(text) {
    const msg = document.getElementById("msg");
    if (!msg) return;
    msg.value = text;
    msg.dispatchEvent(new Event("input", { bubbles: true }));
    msg.focus();
  }

  function bindDelegatedActions() {
    const root = document.getElementById("aha-explorer");
    if (!root) return;
    root.addEventListener("click", (event) => {
      const target = event.target.closest("[data-tab], [data-concept], [data-concept-add], [data-json-copy], [data-json-download]");
      if (!target) return;
      if (target.dataset.tab) return open(target.dataset.tab);
      if (target.dataset.concept) return renderConceptDetail(target.dataset.concept);
      if (target.dataset.conceptAdd) {
        return setComposerText(`Legg til begrepet «${target.dataset.conceptAdd}» i kunnskapskartet mitt.`);
      }
      if (target.dataset.jsonCopy) return void copyDataSection(target.dataset.jsonCopy);
      if (target.dataset.jsonDownload) return downloadDataSection(target.dataset.jsonDownload);
    });
  }

  function init() {
    if (initialized) return;
    const root = document.getElementById("aha-explorer");
    if (!root) return;
    initialized = true;
    bindDelegatedActions();
    global.addEventListener?.("aha:source-event-added", () => {
      renderKilder();
    });
    open("oversikt");
  }

  function render(bundle) {
    if (!bundle || typeof bundle !== "object") return;
    init();
    if (!bundleMatchesActiveRun(bundle)) return;
    currentBundle = bundle;
    renderAhaNow(bundle);
    renderOversikt(bundle);
    renderInnsikter(bundle);
    renderBegreper(bundle);
    renderFag(bundle);
    renderKilder();
    renderStruktur(bundle);
    renderEtterarbeid(bundle);
    renderKart(bundle);
    renderData(bundle);
    setTabCount("innsikter", asList(bundle.insights).filter(Boolean).length + asList(bundle.chamberInsights).length);
    setTabCount("begreper", [...new Set(asList(bundle.concepts).map(asText).filter(Boolean))].length);
    setTabCount("fag", asList(bundle.subjectMatches).length);
    setTabCount("kilder", loadWebArticleSourceEvents().length);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  global.AHAExplorer = { render, open, init, clear, bundleMatchesActiveRun };
}(window));
