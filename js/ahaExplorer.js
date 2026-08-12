// Samlet AHA-analyseflate.
// Viser alt AHA har hentet ut av samtalen i synlige kort under chatten.
// Hver datagruppe har ett kanonisk renderpunkt; handlinger flytter fokus til
// riktig kort i stedet for å skjule og vise fanepaneler. Modulen endrer ingen
// analyse – den presenterer eksportbundlen fra AHAChatExport på en lesbar måte.
(function (global) {
  "use strict";

  const CARD_NAMES = ["oversikt", "innsikter", "begreper", "samtalespor", "fag", "kilder", "struktur", "etterarbeid", "verktoy", "mer", "kart"];

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

  function uniqueText(values) {
    const seen = new Set();
    return asList(values).map(asText).filter((value) => {
      if (!value) return false;
      const key = value.toLocaleLowerCase("nb-NO");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function sameText(left, right) {
    const a = asText(left).toLocaleLowerCase("nb-NO");
    const b = asText(right).toLocaleLowerCase("nb-NO");
    return Boolean(a && b && a === b);
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
    CARD_NAMES.forEach((name) => {
      const host = getContainer(name);
      if (host && name !== "mer") host.innerHTML = emptyNote(name === "innsikter" ? "Lagrede innsikter vises separat. AHA venter på ny analyse." : "AHA venter på ny analyse.");
      setCardCount(name, 0);
    });
    const dataHost = getContainer("data");
    if (dataHost) dataHost.innerHTML = emptyNote("AHA venter på ny analyse.");
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
    const hasAnything = kortSvar || asText(ser.tema) || asText(ser.innholdstype) || asText(ser.hovedspenning) || asText(ser.viktigsteInnsikt) || asText(ser.nesteSteg) || asText(afterwork.summary);
    if (!hasAnything) {
      host.innerHTML = emptyNote("AHA venter på tekst. Hovedbildet vises her når AHA har nok materiale.");
      return;
    }
    const headline = asText(ser.tema) || humanizeTextType(ser.innholdstype) || "Samtaleinnsikt";
    const description = kortSvar || asText(afterwork.summary);
    const rows = [
      dlRow("Innholdstype", ser.innholdstype ? humanizeTextType(ser.innholdstype) : ""),
      dlRow("Hovedspenning", ser.hovedspenning),
      dlRow("Viktigste innsikt", ser.viktigsteInnsikt),
      dlRow("Neste steg", ser.nesteSteg)
    ].join("");
    host.innerHTML = `
      <div class="analysis-summary">
        <h4>${esc(headline)}</h4>
        ${description ? `<p class="exp-lede">${esc(description)}</p>` : ""}
        ${rows ? `<dl class="exp-dl analysis-summary-fields">${rows}</dl>` : ""}
        ${renderQualityStatusPreview(b)}
      </div>
    `;
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
    const primaryInsight = asText(b.ahaSer?.viktigsteInnsikt);
    const simple = uniqueText(b.insights).filter((item) => !sameText(item, primaryInsight));
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
    const concepts = uniqueText(asList(b.concepts).concat(asList(b.ahaSer?.begreper)));
    const candidates = uniqueText(b.rawAutoPayload?.keywords)
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
    const fagkoblinger = uniqueText(b.ahaSer?.fagkoblinger);
    if (!matches.length && !fagkoblinger.length) {
      host.innerHTML = emptyNote("Ingen fagkoblinger funnet for denne analysen ennå.");
      return;
    }
    const matchTitles = uniqueText(matches.map((match) => match?.title || match?.subject_label));
    const unmatchedFagkoblinger = fagkoblinger.filter((item) => !matchTitles.some((title) => sameText(item, title)));
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
      unmatchedFagkoblinger.length ? `<p class="exp-kicker">Andre fagkoblinger fra AHA SER</p>${chipRow(unmatchedFagkoblinger)}` : "",
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
    setCardCount("kilder", events.length);
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
    const parts = [
      sortItems.length ? card("Sortert struktur", `<ul class="exp-sort-list">${sortItems.map((item) => `<li><strong>${esc(item.label)}:</strong> ${esc(item.text)}</li>`).join("")}</ul>`) : "",
      list.length ? card("Liste", orderedList(list)) : "",
      path.length ? card("Læringssti", orderedList(path)) : ""
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

  function pickQualityStatusInput(b) {
    const src = b && typeof b === "object" ? b : {};
    return {
      quality: src.quality,
      sourceBinding: src.sourceBinding,
      topicConsistency: src.topicConsistency,
      staleData: src.staleData,
      staleDataGuarded: src.staleDataGuarded,
      analysisIsolation: src.analysisIsolation,
      isolated: src.isolated,
      canonicalAnalysis: { quality: src.canonicalAnalysis?.quality },
      analysis: { quality: src.analysis?.quality },
      snapshotQuality: src.snapshotQuality
    };
  }

  function renderQualityStatusPreview(b) {
    const builder = global.AHAQualityStatusSurface?.buildQualityStatusSurface;
    if (typeof builder !== "function") return "";
    const qualityStatus = builder(pickQualityStatusInput(b));
    const checks = qualityStatus.checks || {};
    const rows = [
      ["Kildebinding", checks.sourceBinding],
      ["Temakonsistens", checks.topicConsistency],
      ["Stale-data guard", checks.staleData],
      ["Analyse-isolering", checks.analysisIsolation]
    ];
    const summaryLines = asList(qualityStatus.safeSummary?.lines).map(asText).filter(Boolean).slice(0, 4);
    return `
      <aside class="aha-quality-status-preview" aria-label="Kvalitetsstatus">
        <div class="aha-quality-status-head">
          <h3>Kvalitetsstatus</h3>
          <span>Status: ${esc(qualityStatus.status || "unknown")}</span>
        </div>
        <dl class="aha-quality-status-checks">
          ${rows.map(([label, check]) => `<div><dt>${esc(label)}</dt><dd>${esc(check?.status || "unknown")}</dd></div>`).join("")}
        </dl>
        ${summaryLines.length ? `<ul class="aha-quality-status-summary">${summaryLines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>` : ""}
        <p class="aha-quality-status-safety">Lokal, read-only status. Ingen sync. Ingen rå brukerdata.</p>
      </aside>
    `;
  }


  function buildConversationSnapshot(b) {
    const builder = global.AHAConversationInsightSnapshot?.buildConversationInsightSnapshot;
    const ser = b.ahaSer || {};
    const structured = {
      headline: asText(ser.tema) || asText(ser.innholdstype ? humanizeTextType(ser.innholdstype) : ""),
      shortDescription: asText(ser.kortSvar) || asText(b.ahaReply) || asText(b.afterwork?.summary),
      concepts: asList(b.concepts).concat(asList(ser.begreper)),
      openQuestions: asList(ser.apneSporsmal).concat(asList(b.openQuestions)),
      perspectives: asList(ser.perspektiver).concat(asList(b.perspectives)),
      tensions: [ser.hovedspenning].concat(asList(ser.spenninger), asList(b.tensions)),
      conversationLinks: asList(ser.fagkoblinger).concat(asList(b.subjectMatches).map((match) => match?.title || match?.subject_label)),
      nextUnderstandingSteps: [ser.nesteSteg].concat(asList(b.nextUnderstandingSteps)),
      quality: b.quality
    };
    if (typeof builder === "function") return builder(structured);
    const labels = (items) => uniqueText(items).map((label) => ({ label }));
    return {
      summary: { headline: structured.headline, shortDescription: structured.shortDescription },
      signals: {
        concepts: labels(structured.concepts),
        openQuestions: labels(structured.openQuestions),
        perspectives: labels(structured.perspectives),
        tensions: labels(structured.tensions),
        conversationLinks: labels(structured.conversationLinks)
      },
      nextUnderstandingSteps: uniqueText(structured.nextUnderstandingSteps)
    };
  }

  function signalLabels(items) {
    return uniqueText(asList(items).map((item) => (item && typeof item === "object" ? item.label : item)));
  }

  function renderSamtalespor(b) {
    const host = getContainer("samtalespor");
    if (!host) return;
    const ser = b.ahaSer || {};
    const snapshot = buildConversationSnapshot(b);
    const signals = snapshot.signals || {};
    const groups = [
      ["Åpne spørsmål", signalLabels(signals.openQuestions)],
      ["Perspektiver", signalLabels(signals.perspectives)],
      ["Andre spenninger", signalLabels(signals.tensions).filter((item) => !sameText(item, ser.hovedspenning))],
      ["Videre forståelsessteg", signalLabels(snapshot.nextUnderstandingSteps).filter((item) => !sameText(item, ser.nesteSteg))]
    ];
    const cards = groups
      .filter(([, items]) => items.length)
      .map(([label, items]) => card(label, chipRow(items.slice(0, 8), "aha-snapshot-chip")));
    host.innerHTML = cards.length
      ? `<div class="exp-grid">${cards.join("")}</div>`
      : emptyNote("AHA har ikke funnet åpne spørsmål, perspektiver eller videre forståelsessteg ennå.");
  }

  function renderAhaNow(b) {
    renderOversikt(b);
  }

  function renderEtterarbeid(b) {
    const host = getContainer("etterarbeid");
    if (!host) return;
    const afterwork = b.afterwork || {};
    const ser = b.ahaSer || {};
    const thoughts = afterwork.thoughts || {};
    const overviewDescription = asText(ser.kortSvar) || asText(b.ahaReply) || asText(afterwork.summary);
    const insightOwners = [ser.viktigsteInnsikt].concat(asList(b.insights));
    const nextStepOwners = [ser.nesteSteg].concat(asList(b.nextUnderstandingSteps));
    const summary = sameText(afterwork.summary, overviewDescription) ? "" : afterwork.summary;
    const insight = insightOwners.some((item) => sameText(afterwork.insight, item)) ? "" : afterwork.insight;
    const nextStep = nextStepOwners.some((item) => sameText(thoughts.neste_steg, item)) ? "" : thoughts.neste_steg;
    const rows = [
      dlRow("Oppsummering", summary),
      dlRow("Innsikt", insight),
      dlRow("Refleksjon", afterwork.reflection),
      dlRow("Hovedspor", thoughts.hovedspor),
      dlRow("Løse tanker", thoughts.lose_tanker),
      dlRow("Neste steg", nextStep)
    ].join("");
    host.innerHTML = rows
      ? `<dl class="exp-dl">${rows}</dl>`
      : emptyNote("Etterarbeid vises her når AHA har nok materiale til refleksjon eller videre arbeid.");
  }

  // ── Verktøy / dataeksport ───────────────────────────────────
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

  // ── Kortfokus ───────────────────────────────────────────────
  function focusCard(name) {
    const root = document.getElementById("aha-explorer");
    if (!root || !CARD_NAMES.includes(name)) return;
    const card = document.getElementById(`analysis-card-${name}`);
    if (!card) return;
    // Legacy-panelene fylles av ahaChat.js sine eksisterende motorer.
    try {
      if (name === "kart") global.showMeta?.();
      if (name === "etterarbeid") global.showSavedAfterwork?.();
    } catch (err) {
      console.warn("AHA Explorer: klarte ikke å oppdatere legacy-panel", err);
    }
    root.querySelectorAll(".analysis-card.is-targeted").forEach((item) => item.classList.remove("is-targeted"));
    card.classList.add("is-targeted");
    card.setAttribute("tabindex", "-1");
    card.focus({ preventScroll: true });
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    global.setTimeout?.(() => card.classList.remove("is-targeted"), 1400);
  }

  function setCardCount(name, count) {
    const badge = document.querySelector(`#aha-explorer [data-analysis-count="${name}"]`);
    if (badge) {
      badge.textContent = count > 0 ? String(count) : "";
      badge.hidden = count <= 0;
    }
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
      const target = event.target.closest("[data-analysis-target], [data-concept], [data-concept-add], [data-json-copy], [data-json-download]");
      if (!target) return;
      if (target.dataset.analysisTarget) return focusCard(target.dataset.analysisTarget);
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
  }

  function render(bundle) {
    if (!bundle || typeof bundle !== "object") return;
    init();
    if (!bundleMatchesActiveRun(bundle)) return;
    currentBundle = bundle;
    renderAhaNow(bundle);
    renderInnsikter(bundle);
    renderBegreper(bundle);
    renderSamtalespor(bundle);
    renderFag(bundle);
    renderKilder();
    renderStruktur(bundle);
    renderEtterarbeid(bundle);
    renderKart(bundle);
    renderData(bundle);
    setCardCount("innsikter", uniqueText(bundle.insights).length + asList(bundle.chamberInsights).length);
    setCardCount("begreper", uniqueText(asList(bundle.concepts).concat(asList(bundle.ahaSer?.begreper))).length);
    setCardCount("fag", uniqueText(asList(bundle.ahaSer?.fagkoblinger).concat(asList(bundle.subjectMatches).map((match) => match?.title || match?.subject_label))).length);
    setCardCount("kilder", loadWebArticleSourceEvents().length);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  global.AHAExplorer = { render, open: focusCard, focus: focusCard, init, clear, bundleMatchesActiveRun };
}(window));
