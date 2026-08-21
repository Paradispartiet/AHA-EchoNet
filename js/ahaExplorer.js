// Autoritativ AHA-analyseflate for AnalysisReadModelV2 og KnowledgeMapReadModelV2.
// Modulen er read-only: ingen Chamber-, produkt-, sync- eller fjernskriving.
(function (global) {
  "use strict";

  const CARD_NAMES = ["oversikt", "innsikter", "begreper", "samtalespor", "fag", "kilder", "struktur", "etterarbeid", "verktoy", "mer", "kart"];
  let current = null;
  let initialized = false;

  function esc(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function asList(value) { return Array.isArray(value) ? value : []; }
  function asText(value) {
    if (value == null) return "";
    if (["string", "number", "boolean"].includes(typeof value)) return String(value).replace(/\s+/g, " ").trim();
    if (value && typeof value === "object") {
      for (const key of ["insight", "text", "label", "title", "name", "summary", "value"]) {
        if (["string", "number", "boolean"].includes(typeof value[key])) return asText(value[key]);
      }
    }
    return "";
  }
  function safeJson(value) { try { return JSON.stringify(value, null, 2); } catch { return Array.isArray(value) ? "[]" : "{}"; } }
  function uniqueText(values) {
    const seen = new Set();
    return asList(values).map(asText).filter((value) => {
      const key = value.toLocaleLowerCase("nb-NO");
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  function itemText(item) { return asText(item?.display ?? item?.value); }
  function getContainer(name) { return document.getElementById(`exp-${name}`); }
  function emptyNote(text) { return `<p class="exp-empty">${esc(text)}</p>`; }
  function card(title, body, opts = {}) { return `<article class="exp-card${opts.primary ? " exp-card-primary" : ""}"><h3>${esc(title)}</h3>${body}</article>`; }
  function chipRow(values, cls = "exp-chip") {
    const items = uniqueText(values); return items.length ? `<div class="exp-chips">${items.map((item) => `<span class="${cls}">${esc(item)}</span>`).join("")}</div>` : "";
  }
  function dlRow(label, value) { const output = asText(value); return output ? `<div><dt>${esc(label)}</dt><dd>${esc(output)}</dd></div>` : ""; }
  function shortSha(value) { const sha = asText(value); return sha.length === 64 ? `${sha.slice(0, 12)}…` : sha; }
  function evidence(item, limit = 3) { return asList(item?.provenance?.evidence).map((entry) => asText(entry?.excerpt)).filter(Boolean).slice(0, limit); }
  function evidenceBlock(item) {
    const excerpts = evidence(item);
    return excerpts.length ? `<details class="exp-acc exp-acc-inline"><summary>Vis kildebelegg</summary><ul class="exp-list">${excerpts.map((excerpt) => `<li>${esc(excerpt)}</li>`).join("")}</ul></details>` : "";
  }
  function provenanceLine(item) { return `<p class="exp-kicker">Kilde ${esc(shortSha(item?.source_sha256))} · run ${esc(asText(item?.analysis_run_id))} · ${esc(asText(item?.quality?.status) || "ukjent")}</p>`; }
  function identityMatchesRun(identity, run) {
    if (!run) return true;
    return asText(identity?.analysis_run_id) === asText(run.analysisRunId || run.runId)
      && asText(identity?.source_sha256) === asText(run.sourceSha256 || run.source_sha256 || run.sourceTextHash || run.sourceHash)
      && (!asText(run.analysisId) || asText(identity?.analysis_id) === asText(run.analysisId))
      && (!asText(run.sourceId) || asText(identity?.source_id) === asText(run.sourceId));
  }
  function getActiveRun() { return global.AHAActiveRun?.get?.() || null; }
  function bundleMatchesActiveRun(bundle) {
    const identity = bundle?.analysisBundleV2?.identity || bundle?.identity;
    const matches = identityMatchesRun(identity, getActiveRun());
    if (!matches) console.warn("Skipped stale AHA analysis payload: AnalysisBundleV2 identity does not match the active run.");
    return matches;
  }

  function renderQualityStatus(model) {
    const quality = model?.quality || {};
    return `<aside class="aha-quality-status-preview" aria-label="Kvalitetsstatus"><div class="aha-quality-status-head"><h3>Kvalitetsstatus</h3><span>Status: ${esc(model?.status || "unknown")}</span></div>
      <dl class="aha-quality-status-checks"><div><dt>Kildebinding</dt><dd>verified</dd></div><div><dt>Temakonsistens</dt><dd>kontrollert per felt</dd></div><div><dt>Stale-data guard</dt><dd>passed</dd></div><div><dt>Analyse-isolering</dt><dd>verified</dd></div><div><dt>Synlige kildebundne felt</dt><dd>${esc(String(quality.visible_field_count || 0))}</dd></div><div><dt>Holdt tilbake</dt><dd>${esc(String(quality.blocked_field_count || 0))}</dd></div><div><dt>Innsiktsport</dt><dd>${esc(quality.synthesis_gate?.status || "not_run")}</dd></div></dl>
      <p class="aha-quality-status-safety">Kildekontroll per felt · read-only · ingen sync, rå brukerdata eller produktskriving.</p></aside>`;
  }
  function renderOversikt(model) {
    const host = getContainer("oversikt"); if (!host) return;
    const section = model.sections.overview || {};
    const theme = itemText(section.theme), tension = itemText(section.central_tension), insight = itemText(section.strongest_insight), next = itemText(section.next_inquiry);
    if (![theme, tension, insight, next].some(Boolean)) { host.innerHTML = emptyNote("AHA har ikke nok kildebelegg til et trygt hovedbilde ennå.") + renderQualityStatus(model); return; }
    host.innerHTML = `<div class="analysis-summary"><h4>${esc(theme || "Kildebundet analyse")}</h4><dl class="exp-dl analysis-summary-fields">${dlRow("Hovedspenning", tension)}${dlRow("Sterkeste innsikt", insight)}${dlRow("Neste undersøkelse", next)}</dl>
      ${[section.theme, section.central_tension, section.strongest_insight, section.next_inquiry].filter(Boolean).map(evidenceBlock).join("")}${renderQualityStatus(model)}</div>`;
  }
  function renderInnsikter(model) {
    const host = getContainer("innsikter"); if (!host) return;
    const items = asList(model.sections.insights);
    if (!items.length) { const gate = model.semantic_document?.synthesis_gate; host.innerHTML = emptyNote(gate?.status === "blocked" ? "Innsiktskandidatene ble blokkert fordi de manglet tilstrekkelig belegg eller semantisk løft." : "Ingen kvalitetssikrede innsikter for denne analysen ennå."); return; }
    host.innerHTML = items.map((item) => {
      const view = item.display || {};
      const meta = [view.type && `Type: ${view.type}`, view.confidence && `Sikkerhet: ${view.confidence}`, view.causal_status && `Kausalitet: ${view.causal_status}`].filter(Boolean);
      return `<article class="exp-card exp-insight-card"><h3>${esc(asText(view.insight) || itemText(item))}</h3>${view.abstraction ? `<p>${esc(view.abstraction)}</p>` : ""}${view.why_it_matters ? `<p><strong>Hvorfor viktig:</strong> ${esc(view.why_it_matters)}</p>` : ""}${view.uncertainty ? `<p><strong>Usikkerhet:</strong> ${esc(view.uncertainty)}</p>` : ""}${chipRow(meta, "exp-chip exp-chip-meta")}${evidenceBlock(item)}${provenanceLine(item)}</article>`;
    }).join("");
  }
  function renderConceptDetail(id) {
    const detail = document.getElementById("exp-concept-detail"); if (!detail || !current) return;
    const item = asList(current.analysis.sections.concepts).find((candidate) => candidate.item_id === id); if (!item) return;
    detail.innerHTML = `<article class="exp-card exp-card-primary"><h3>Begrep: ${esc(itemText(item))}</h3>${evidenceBlock(item) || emptyNote("Begrepet har ingen synlig evidens.")}${provenanceLine(item)}</article>`;
  }
  function renderBegreper(model) {
    const host = getContainer("begreper"); if (!host) return;
    const items = asList(model.sections.concepts);
    host.innerHTML = items.length ? `<p class="exp-kicker">Kildeforankrede begreper</p><div class="exp-chips">${items.map((item) => `<button type="button" class="exp-chip exp-chip-btn" data-concept-id="${esc(item.item_id)}">${esc(itemText(item))}</button>`).join("")}</div><div id="exp-concept-detail" class="exp-concept-detail"></div>` : emptyNote("Ingen meningsbærende, kildeforankrede begreper er klare ennå.");
  }
  function renderSamtalespor(model) {
    const host = getContainer("samtalespor"); if (!host) return;
    const items = asList(model.sections.conversation_tracks);
    host.innerHTML = '<p class="aha-snapshot-status">Kildebundet forhåndsvisning · read-only · local-only · ingen sync eller rå brukerdata</p>' + (items.length ? items.map((item) => card("Videre undersøkelse", `<p>${esc(itemText(item))}</p>${evidenceBlock(item)}${provenanceLine(item)}`)).join("") : emptyNote("Generiske samtalespor er undertrykt. Nye spor vises først når kilden gir konkret belegg."));
  }
  function renderFag(model) {
    const host = getContainer("fag"); if (!host) return;
    const items = asList(model.sections.subjects);
    host.innerHTML = items.length ? items.map((item) => { const value = item.value || {}; return `<article class="exp-card exp-subject-card"><h3>${esc(asText(value.label))}</h3><p class="exp-subject-meta">${value.subject_id ? `<code>${esc(value.subject_id)}</code>` : ""}<span>relevans ${esc(Number(value.score).toFixed(2))}</span></p><p>${esc(asText(value.explanation))}</p>${evidenceBlock(item)}${provenanceLine(item)}</article>`; }).join("") : emptyNote("Ingen Fag-kobling passerte kravene til terskel, forklaring og kildebelegg.");
  }
  function renderKilder(model) {
    const host = getContainer("kilder"); if (!host) return;
    const items = asList(model.sections.sources);
    host.innerHTML = items.length ? items.map((item) => { const value = item.value || {}; const title = value.role === "primary" ? "Primærkilde · innlimt fulltekst" : "Referanse · lenke"; const rows = [dlRow("Rolle", value.role), dlRow("Type", value.kind), dlRow("Tilgang", value.acquisition_status), dlRow("URL", value.url), dlRow("SHA-256", item.source_sha256)].join(""); return `<article class="exp-card exp-source-card"><h3>${esc(title)}</h3><dl class="exp-dl">${rows}</dl>${value.role === "reference" ? '<p class="exp-kicker">Lenken er referanse og erstatter ikke innlimt fulltekst.</p>' : evidenceBlock(item)}</article>`; }).join("") : emptyNote("Ingen kildeposter er tilgjengelige for den aktive analysen.");
  }
  function renderStruktur(model) {
    const host = getContainer("struktur"); if (!host) return;
    const section = model.sections.source_structure || {};
    const rows = [["Problemstilling", section.problem_statement], ["Hovedpåstand", section.main_claim], ["Belegg / metode", section.evidence_method], ["Sentral spenning", section.central_tension]].filter(([, item]) => item).map(([label, item]) => { const value = Array.isArray(item.value) ? item.value.join(" · ") : itemText(item); return `<article class="exp-card"><h3>${esc(label)}</h3><p>${esc(value)}</p>${evidenceBlock(item)}${provenanceLine(item)}</article>`; });
    host.innerHTML = rows.length ? `<div class="exp-grid">${rows.join("")}</div>` : emptyNote("Kildens struktur vises når problemstilling, påstand, belegg eller spenning er kildeforankret.");
  }
  function renderEtterarbeid(model) {
    const host = getContainer("etterarbeid"); if (!host) return;
    const section = model.sections.afterwork || {};
    const rows = [["Oppsummering", section.summary], ["Refleksjon", section.reflection], ["Hovedspor", section.main_thread], ["Uavklart tanke", section.unresolved_thought], ["Neste steg", section.next_step]].filter(([, item]) => item).map(([label, item]) => dlRow(label, itemText(item))).join("");
    host.innerHTML = rows ? `<dl class="exp-dl">${rows}</dl><p class="exp-kicker">Kun aktiv AnalysisBundleV2 · historisk etterarbeid er ikke slått sammen.</p>` : emptyNote("Ingen kildeforankret etterarbeidstekst er klar ennå.");
  }
  function renderMapScope(scope, historicalOnly = false) {
    const nodes = asList(scope?.nodes).filter((node) => historicalOnly ? node.origin_scope === "historical" : node.origin_scope !== "historical");
    const counts = nodes.reduce((out, node) => { out[node.node_type] = (out[node.node_type] || 0) + 1; return out; }, {});
    const labels = Object.entries(counts).map(([type, count]) => `${type}: ${count}`);
    const cards = nodes.filter((node) => node.node_type !== "source").slice(0, 20).map((node) => `<article class="exp-card"><h3>${esc(node.label)}</h3>${node.summary ? `<p>${esc(node.summary)}</p>` : ""}<p class="exp-kicker">${esc(node.node_type)} · ${esc(node.origin_scope)}</p></article>`).join("");
    return `${chipRow(labels, "exp-chip exp-chip-meta")}${cards || emptyNote(historicalOnly ? "Ingen eksplisitt relaterte historiske noder." : "Ingen kildeforankrede kartnoder ennå.")}`;
  }
  function renderKart(model) {
    const host = getContainer("kart"); if (!host) return;
    host.innerHTML = `${card("Denne analysen", renderMapScope(model.scopes.current_analysis), { primary: true })}${card("Hele Kunnskapskartet · historiske relasjoner", renderMapScope(model.scopes.whole_map, true))}<p class="exp-kicker">Noder og relasjoner er read-only. Kunnskapskartet materialiserer aldri et produkt direkte.</p><a class="exp-action-btn" href="mindmap.html">Åpne separat Tankekart-forhåndsvisning</a>`;
  }

  const DATA_SECTIONS = [
    { key: "analysisReadModelV2", label: "AnalysisReadModelV2", get: () => current?.analysis },
    { key: "knowledgeMapReadModelV2", label: "KnowledgeMapReadModelV2", get: () => current?.knowledge },
    { key: "analysisBundleV2", label: "AnalysisBundleV2", get: () => current?.run?.analysisBundleV2 }
  ];
  function dataContent(key) { return safeJson(DATA_SECTIONS.find((item) => item.key === key)?.get?.() || {}); }
  function renderData() {
    const host = getContainer("data"); if (!host) return;
    host.innerHTML = DATA_SECTIONS.map((section) => `<details class="exp-acc" data-data-key="${esc(section.key)}"><summary>${esc(section.label)}</summary><div class="exp-json-actions"><button type="button" class="exp-action-btn" data-json-copy="${esc(section.key)}">Kopier</button><button type="button" class="exp-action-btn" data-json-download="${esc(section.key)}">Last ned JSON</button></div><pre class="exp-json" data-json-target="${esc(section.key)}"></pre></details>`).join("");
    host.querySelectorAll("details[data-data-key]").forEach((details) => details.addEventListener("toggle", () => { const pre = details.querySelector("[data-json-target]"); if (details.open && pre && !pre.textContent) pre.textContent = dataContent(details.dataset.dataKey); }));
  }
  async function copyData(key) { try { await navigator.clipboard.writeText(dataContent(key)); } catch {} }
  function downloadData(key) { const blob = new Blob([dataContent(key)], { type: "application/json" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `aha-${key}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
  function setCardCount(name, count) { const badge = document.querySelector(`#aha-explorer [data-analysis-count="${name}"]`); if (!badge) return; badge.textContent = count > 0 ? String(count) : ""; badge.hidden = count <= 0; }
  function applyTerminology() {
    const mapTitle = document.getElementById("analysis-title-kart"); if (mapTitle) mapTitle.textContent = "Kunnskapskart";
    const structureTitle = document.getElementById("analysis-title-struktur"); if (structureTitle) structureTitle.textContent = "Kildens struktur";
    document.querySelectorAll('[data-analysis-target="kart"]').forEach((node) => { if (/kart/i.test(node.textContent || "")) node.textContent = "Gå til Kunnskapskart"; });
    document.querySelectorAll('a[href="mindmap.html"]').forEach((node) => { if ((node.textContent || "").trim() === "Kart") node.textContent = "Tankekart"; });
  }
  function focusCard(name) {
    const root = document.getElementById("aha-explorer"), target = document.getElementById(`analysis-card-${name}`); if (!root || !target || !CARD_NAMES.includes(name)) return;
    if (name === "etterarbeid") { try { global.showSavedAfterwork?.(); } catch {} }
    root.querySelectorAll(".analysis-card.is-targeted").forEach((item) => item.classList.remove("is-targeted")); target.classList.add("is-targeted"); target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); target.scrollIntoView({ behavior: "smooth", block: "start" }); global.setTimeout?.(() => target.classList.remove("is-targeted"), 1400);
  }
  function bindDelegatedActions() {
    const root = document.getElementById("aha-explorer"); if (!root) return;
    root.addEventListener("click", (event) => { const target = event.target.closest("[data-analysis-target], [data-concept-id], [data-json-copy], [data-json-download]"); if (!target) return; if (target.dataset.analysisTarget) return focusCard(target.dataset.analysisTarget); if (target.dataset.conceptId) return renderConceptDetail(target.dataset.conceptId); if (target.dataset.jsonCopy) return void copyData(target.dataset.jsonCopy); if (target.dataset.jsonDownload) return downloadData(target.dataset.jsonDownload); });
  }
  function init() { if (initialized) return; if (!document.getElementById("aha-explorer")) return; initialized = true; applyTerminology(); bindDelegatedActions(); }
  function clear() {
    init(); current = null;
    CARD_NAMES.forEach((name) => { const host = getContainer(name); if (host && name !== "mer") host.innerHTML = emptyNote("AHA venter på en gyldig, kildebundet analyse."); setCardCount(name, 0); });
    const dataHost = getContainer("data"); if (dataHost) dataHost.innerHTML = emptyNote("AHA venter på en gyldig, kildebundet analyse.");
  }
  function render(bundle) {
    if (!bundle || typeof bundle !== "object") return;
    init(); applyTerminology();
    const run = bundle.contractVersion === "aha_analysis_run_v1" ? bundle : (global.AHAChatAnalysisRunContract?.finalizeExport?.(bundle) || bundle);
    if (!bundleMatchesActiveRun(run)) return;
    const analysis = global.AHAAnalysisReadModelV2?.build?.(run.analysisBundleV2);
    if (!analysis || !identityMatchesRun(analysis.identity, getActiveRun())) { clear(); return; }
    const knowledge = global.AHAKnowledgeMapReadModelV2?.build?.({ analysisReadModel: analysis, historicalRelations: run.relevantAfterworks });
    if (!knowledge) { clear(); return; }
    current = { run, analysis, knowledge };
    renderOversikt(analysis); renderInnsikter(analysis); renderBegreper(analysis); renderSamtalespor(analysis); renderFag(analysis); renderKilder(analysis); renderStruktur(analysis); renderEtterarbeid(analysis); renderKart(knowledge); renderData();
    setCardCount("innsikter", analysis.sections.insights.length); setCardCount("begreper", analysis.sections.concepts.length); setCardCount("fag", analysis.sections.subjects.length); setCardCount("kilder", analysis.sections.sources.length); setCardCount("kart", knowledge.scopes.current_analysis.nodes.length);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  global.AHAExplorer = { render, open: focusCard, focus: focusCard, init, clear, bundleMatchesActiveRun };
})(window);
