// ahaProvenanceSurface.js
// Read-only presentasjonslag for eksisterende analyse- og kandidatproveniens.

(function (global) {
  "use strict";

  const VERSION = "aha_provenance_surface_v1";

  function safeArray(value) { return Array.isArray(value) ? value : []; }
  function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function textOf(value) { return String(value || "").trim(); }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
  }
  function shortId(value) {
    const text = textOf(value);
    if (!text) return "—";
    return text.length > 22 ? `${text.slice(0, 10)}…${text.slice(-7)}` : text;
  }
  function formatDate(value) {
    const text = textOf(value);
    if (!text) return "";
    const date = new Date(text);
    if (!Number.isFinite(date.getTime())) return text;
    try {
      return new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeStyle: "short" }).format(date);
    } catch {
      return text;
    }
  }
  function sourceKindLabel(value) {
    const kind = textOf(value).toLowerCase();
    if (kind === "pasted_text") return "tekst i Chat";
    if (kind === "url") return "lenke i Chat";
    if (kind === "chat" || kind === "chat_message") return "Chat";
    if (kind === "notes" || kind === "note") return "Notes";
    if (kind === "feed" || kind === "feed_post") return "Feed";
    if (kind === "gallery") return "Galleri";
    if (kind === "insta") return "AHA Insta";
    if (kind === "historygo") return "History Go";
    return kind || "ukjent kilde";
  }
  function actionLabel(value) {
    const action = textOf(value).toLowerCase();
    if (action === "reinforced" || action === "reinforce") return "Forsterket";
    if (action === "created" || action === "create") return "Opprettet";
    return action ? "Bearbeidet" : "Analysert";
  }
  function normalizeTrace(value) {
    const src = safeObject(value);
    const analysisRunId = textOf(src.analysisRunId || src.analysis_run_id || src.runId);
    const conversationId = textOf(src.conversationId || src.conversation_id || src.sessionId);
    const turnId = textOf(src.turnId || src.turn_id);
    const sourceHash = textOf(src.sourceHash || src.source_hash || src.sourceTextHash || src.normalizedSourceHash || src.sourceFingerprint);
    const sourceEventId = textOf(src.source_event_id || src.sourceEventId);
    if (!analysisRunId && !conversationId && !turnId && !sourceHash && !sourceEventId) return null;
    return {
      analysisRunId,
      conversationId,
      turnId,
      sourceId: textOf(src.sourceId || src.source_id),
      sourceKind: textOf(src.sourceKind || src.source_kind),
      sourceHash,
      sourceEventId,
      candidateFingerprint: textOf(src.candidate_fingerprint || src.candidateFingerprint),
      candidateOrigin: textOf(src.candidate_origin || src.candidateOrigin),
      action: textOf(src.ingest_action || src.action),
      createdAt: textOf(src.createdAt || src.created_at)
    };
  }
  function fallbackInsightTrace(insight) {
    const raw = safeObject(insight);
    return normalizeTrace(raw.analysis_trace || {
      analysisRunId: raw.analysisRunId || raw.runId,
      conversationId: raw.conversationId || raw.sessionId,
      turnId: raw.turnId,
      sourceId: raw.sourceId,
      sourceKind: raw.sourceKind,
      sourceHash: raw.sourceHash || raw.sourceTextHash || raw.normalizedSourceHash || raw.sourceFingerprint,
      source_event_id: raw.source_event_id,
      createdAt: raw.createdAt || raw.created_at
    });
  }
  function insightAnalysisEntries(insight) {
    const entries = safeArray(insight?.analysis_provenance).map(normalizeTrace).filter(Boolean);
    if (entries.length) return entries.slice(-6);
    const fallback = fallbackInsightTrace(insight);
    return fallback ? [fallback] : [];
  }
  function candidateOrigins(insight) {
    const origins = safeArray(insight?.candidate_provenance)
      .map((entry) => textOf(entry?.candidate_origin || entry?.origin).toLowerCase())
      .filter(Boolean);
    return Array.from(new Set(origins));
  }
  function traceTechnicalRows(trace) {
    return [
      ["Analyse-run", trace.analysisRunId],
      ["Samtale", trace.conversationId],
      ["Turn", trace.turnId],
      ["Source", trace.sourceId],
      ["Source event", trace.sourceEventId],
      ["Source hash", trace.sourceHash],
      ["Kandidat", trace.candidateFingerprint]
    ].filter(([, value]) => textOf(value)).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(shortId(value))}</dd></div>`).join("");
  }
  function renderInsightProvenance(insight) {
    const entries = insightAnalysisEntries(insight);
    const candidates = safeArray(insight?.candidate_provenance);
    if (!entries.length && !candidates.length) return "";
    const visible = entries.map((trace) => {
      const when = formatDate(trace.createdAt);
      return `<li><strong>${escapeHtml(actionLabel(trace.action))}</strong> fra ${escapeHtml(sourceKindLabel(trace.sourceKind))}${when ? ` · ${escapeHtml(when)}` : ""}</li>`;
    }).join("");
    const origins = candidateOrigins(insight);
    const candidateSummary = candidates.length
      ? `<p class="aha-meta-summary">${escapeHtml(String(candidates.length))} kandidatsignal${candidates.length === 1 ? "" : "er"}${origins.length ? ` · ${escapeHtml(origins.join(" / "))}` : ""}</p>`
      : "";
    const technical = entries.map((trace, index) => `<section><strong>${escapeHtml(actionLabel(trace.action))} ${index + 1}</strong><dl>${traceTechnicalRows(trace)}</dl></section>`).join("");
    return `<section class="aha-provenance-surface insight-source-block" aria-label="Analyseproveniens"><span class="insight-section-label">Proveniens</span><ul>${visible}</ul>${candidateSummary}<details><summary>Sporbarhet (${entries.length} analyseledd)</summary>${technical}</details></section>`;
  }
  function renderSourceEventProvenance(event) {
    const meta = safeObject(event?.meta);
    const trace = normalizeTrace(meta.analysis_trace);
    const quality = safeObject(meta.insight_quality_contract);
    const linkedCount = safeArray(event?.linked_insights).length;
    const hasQuality = Object.keys(quality).length > 0;
    if (!trace && !hasQuality && linkedCount === 0) return "";
    const bits = [];
    if (trace) bits.push(sourceKindLabel(trace.sourceKind));
    bits.push(`${linkedCount} insight${linkedCount === 1 ? "" : "s"}`);
    if (hasQuality) {
      const total = Number(quality.candidate_count || 0);
      const unique = Number(quality.unique_candidate_count || 0);
      if (total || unique) bits.push(`${total} → ${unique} kandidater`);
      const duplicates = Number(quality.duplicates_skipped || 0);
      if (duplicates) bits.push(`${duplicates} duplikat${duplicates === 1 ? "" : "er"} filtrert`);
    }
    const traceRows = trace ? traceTechnicalRows(trace) : "";
    const qualityRows = hasQuality ? [
      ["Kontrakt", quality.version],
      ["Kilde-fingerprint", quality.source_fingerprint],
      ["Analyse-run", quality.analysis_run_id],
      ["Turn", quality.turn_id],
      ["Analyse-source hash", quality.analysis_source_hash]
    ].filter(([, value]) => textOf(value)).map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(shortId(value))}</dd></div>`).join("") : "";
    return `<section class="aha-provenance-surface" aria-label="Source-proveniens"><p class="aha-meta-summary"><strong>Proveniens:</strong> ${escapeHtml(bits.join(" · "))}</p><details><summary>Analyse- og kvalitetsdetaljer</summary>${traceRows ? `<h4>Analyse</h4><dl>${traceRows}</dl>` : ""}${qualityRows ? `<h4>Kvalitetskontrakt</h4><dl>${qualityRows}</dl>` : ""}</details></section>`;
  }
  function enhanceInsights(root) {
    const scope = root || global.document;
    if (!scope?.querySelectorAll) return 0;
    let added = 0;
    scope.querySelectorAll(".insight-card").forEach((card) => {
      if (card.querySelector?.(".aha-provenance-surface")) return;
      const html = renderInsightProvenance(card._insightRaw);
      if (!html) return;
      const source = card.querySelector?.(".insight-source-block");
      if (source?.insertAdjacentHTML) source.insertAdjacentHTML("afterend", html);
      else if (card.insertAdjacentHTML) card.insertAdjacentHTML("beforeend", html);
      added += 1;
    });
    return added;
  }
  function enhanceSources(root) {
    const scope = root || global.document;
    const api = global.AHASourcesAudit;
    const host = scope?.querySelector?.("#sources-events") || global.document?.getElementById?.("sources-events");
    if (!host?.querySelectorAll || !api?.collectAuditReport || !api?.filterAuditReport) return 0;
    const report = api.filterAuditReport(api.collectAuditReport(), global.__ahaSourcesAuditFilter || "all");
    const cards = Array.from(host.querySelectorAll(".aha-source-event"));
    let added = 0;
    cards.forEach((card, index) => {
      if (card.querySelector?.(".aha-provenance-surface")) return;
      const html = renderSourceEventProvenance(report.events[index]);
      if (!html || !card.insertAdjacentHTML) return;
      card.insertAdjacentHTML("beforeend", html);
      added += 1;
    });
    return added;
  }
  function enhanceAll() {
    enhanceInsights(global.document);
    enhanceSources(global.document);
  }
  function observeHost(id, enhance) {
    const host = global.document?.getElementById?.(id);
    if (!host || typeof global.MutationObserver !== "function") return null;
    const observer = new global.MutationObserver(() => enhance(global.document));
    observer.observe(host, { childList: true });
    return observer;
  }
  function install() {
    enhanceAll();
    observeHost("insights-list", enhanceInsights);
    observeHost("sources-events", enhanceSources);
  }

  global.AHAProvenanceSurface = {
    VERSION,
    normalizeTrace,
    insightAnalysisEntries,
    renderInsightProvenance,
    renderSourceEventProvenance,
    enhanceInsights,
    enhanceSources,
    install
  };

  if (global.document?.addEventListener) global.document.addEventListener("DOMContentLoaded", install);
})(window);
