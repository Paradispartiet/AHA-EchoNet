// ahaLinkReader.js
// Brukerinitiert, transient lenkeanalyse for AHA Chat.
(function (global) {
  "use strict";

  const MAX_URLS = 3;
  let lastLinkReadResults = [];

  function normalizeUrlCandidate(raw) {
    const cleaned = String(raw || "").trim().replace(/[),.;!?]+$/g, "");
    try {
      const url = new URL(cleaned);
      if (!["http:", "https:"].includes(url.protocol)) return "";
      return url.toString();
    } catch {
      return "";
    }
  }

  function detectUrls(text) {
    const matches = String(text || "").match(/https?:\/\/[^\s<>'"]+/gi) || [];
    const seen = new Set();
    const urls = [];
    matches.forEach((match) => {
      const normalized = normalizeUrlCandidate(match);
      if (!normalized || seen.has(normalized) || urls.length >= MAX_URLS) return;
      seen.add(normalized);
      urls.push(normalized);
    });
    return urls;
  }

  function hasUrls(text) {
    return detectUrls(text).length > 0;
  }

  function renderLinkStatus(message) {
    const el = document.getElementById("chat-status-note");
    if (el) el.textContent = String(message || "");
  }

  function buildAhaAgentUrl(path) {
    const rawBase = String(global.AHA_AGENT_API || "").trim();
    if (!rawBase) return "";
    const base = rawBase.replace(/\/+$/, "");
    const normalizedPath = `/${String(path || "").trim().replace(/^\/+/, "")}`;
    const hasApiBase = /\/api\/aha-agent$/i.test(base);
    return `${hasApiBase ? base : `${base}/api/aha-agent`}${normalizedPath}`;
  }

  function compact(value, fallback) {
    return String(value || fallback || "").replace(/\s+/g, " ").trim();
  }

  function buildSafeSourcePayload(result, context) {
    const source = result?.source && typeof result.source === "object" ? result.source : {};
    const url = compact(source.url || context?.url);
    const title = compact(source.title, url);
    const publisher = compact(source.publisher, source.domain || "ukjent kilde");
    const accessStatus = compact(result?.access_status, "metadata_only");
    const full = accessStatus === "full";
    const safeSourceSummary = full
      ? `Kilde lest transient: ${title}. AHA brukte tilgjengelig artikkeltekst midlertidig til analyse, men rå artikkeltekst er ikke lagret. Kilde: ${publisher}. Status: ${accessStatus}.`
      : `Kilde registrert fra metadata: ${title}. Full artikkeltekst var ikke tilgjengelig for AHA. Kilde: ${publisher}. Status: ${accessStatus}.`;
    return {
      source_type: "web_article",
      source_app: "aha_link_reader",
      content_type: "article_metadata",
      title,
      text: safeSourceSummary,
      user_created: false,
      imported: false,
      tags: ["kilde", "artikkel", "lenke"],
      created_at: new Date().toISOString(),
      subject_id: context?.subject_id,
      theme_id: context?.theme_id,
      field_id: context?.field_id,
      meta: {
        url,
        canonical_url: compact(source.canonical_url, url),
        domain: compact(source.domain),
        publisher: compact(source.publisher),
        author: compact(source.author),
        published_at: compact(source.published_at),
        access_status: accessStatus,
        extraction_method: compact(source.extraction_method),
        source_kind: "user_pasted_url",
        raw_article_stored: false,
        transient_fulltext_read: full,
        approvalState: "suggested",
        visibility: "local_only",
        requiresUserConfirmation: true,
        approvalBoundary: "personal_ai_loop_source_approval"
      }
    };
  }

  function safeCandidates(candidates) {
    return (Array.isArray(candidates) ? candidates : [])
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        title: compact(item.title).slice(0, 160),
        summary: compact(item.summary).slice(0, 360),
        text: compact(item.text || item.summary).slice(0, 1200),
        functional_type: compact(item.functional_type, "observation"),
        concepts: Array.isArray(item.concepts) ? item.concepts.map(compact).filter(Boolean).slice(0, 8) : [],
        candidate_type: compact(item.candidate_type, "web_article_analysis")
      }))
      .filter((item) => item.text);
  }

  async function analyzeSingleUrl(url, context) {
    const endpoint = buildAhaAgentUrl("analyze-url");
    if (!endpoint) throw new Error("AHA_AGENT_API mangler");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        mode: "transient_article_analysis_v1",
        return_raw_text: false,
        max_analysis_chars: 12000
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${res.status}`);
    const sourcePayload = buildSafeSourcePayload(data, Object.assign({}, context || {}, { url }));
    const candidates = safeCandidates(data.candidates);
    const ingestResult = global.AHAIngest?.ingestWithCandidates?.(sourcePayload, candidates);
    global.refreshAhaExplorer?.();
    return { url, data, sourcePayload, candidate_count: candidates.length, ingestResult };
  }

  async function processUrlsFromMessage(text, context) {
    const urls = detectUrls(text);
    if (!urls.length) return [];
    renderLinkStatus("Lenke oppdaget – AHA leser kilden …");
    const results = [];
    for (const url of urls) {
      try {
        results.push(await analyzeSingleUrl(url, context || {}));
      } catch (err) {
        results.push({ url, error: err?.message || "lenkeanalyse_feilet" });
      }
    }
    lastLinkReadResults = results.map((item) => ({
      url: item.url,
      ok: !item.error,
      access_status: item.data?.access_status || "error",
      source: item.data?.source || null,
      candidate_count: item.candidate_count || 0,
      policy: item.data?.policy || { raw_article_stored: false, raw_article_returned: false }
    }));
    const first = lastLinkReadResults.find((item) => item.ok) || lastLinkReadResults[0];
    if (!first || !first.ok) renderLinkStatus("Lenkeanalyse feilet – AHA lagret ikke rå artikkeltekst.");
    else if (first.access_status === "full") renderLinkStatus(`Kilde lest: ${first.source?.publisher || first.source?.domain || "kilde"}. Full tekst ble brukt midlertidig til analyse, men rå artikkeltekst er ikke lagret. ${first.candidate_count} innsikter lagt i Utforsk det AHA fant.`);
    else if (first.access_status === "paywall" || first.access_status === "blocked") renderLinkStatus("Kilden krever innlogging eller er blokkert.");
    else renderLinkStatus("Kun metadata tilgjengelig – full artikkel kunne ikke leses.");
    return lastLinkReadResults;
  }

  function getLastLinkReadResults() {
    return lastLinkReadResults.slice();
  }

  global.AHALinkReader = { detectUrls, hasUrls, processUrlsFromMessage, buildSafeSourcePayload, renderLinkStatus, getLastLinkReadResults };
}(window));
