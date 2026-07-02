// ahaLinkReader.js
// Brukerinitiert, transient lenkeanalyse for AHA Chat.
(function (global) {
  "use strict";

  const MAX_URLS = 3;
  let lastLinkReadResults = [];
  let latestArticleAnalysis = null;

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


  function safeList(list, maxItems, maxLen) {
    return (Array.isArray(list) ? list : [])
      .map((item) => {
        if (item && typeof item === "object") return compact(item.claim || item.label || item.title || item.name || item.text || item.summary || "");
        return compact(item);
      })
      .filter(Boolean)
      .map((item) => item.slice(0, maxLen || 260))
      .slice(0, maxItems || 8);
  }

  function buildSafeArticleAnalysis(result, url, candidates) {
    const data = result && typeof result === "object" ? result : {};
    const source = data.source && typeof data.source === "object" ? data.source : {};
    const analysis = data.analysis && typeof data.analysis === "object" ? data.analysis : {};
    const policy = data.policy && typeof data.policy === "object" ? data.policy : {};
    const accessStatus = compact(data.access_status, "metadata_only");
    return {
      source_id: compact(source.source_id || source.id || source.canonical_url || url, url),
      source_type: "web_article",
      url: compact(source.url || url),
      title: compact(source.title, source.url || url).slice(0, 220),
      publisher: compact(source.publisher, source.domain || "ukjent kilde").slice(0, 120),
      domain: compact(source.domain).slice(0, 120),
      access_status: accessStatus,
      short_summary: compact(analysis.short_summary).slice(0, 700),
      main_points: safeList(analysis.main_points, 8, 320),
      actors: safeList(analysis.actors, 10, 120),
      claims: safeList(analysis.claims, 8, 260),
      concepts: safeList(analysis.concepts, 12, 80),
      conflict_lines: safeList(analysis.conflict_lines, 8, 220),
      candidates: safeCandidates(candidates || data.candidates).slice(0, 5),
      raw_article_stored: false,
      transient_fulltext_read: policy.transient_fulltext_read === true || accessStatus === "full"
    };
  }

  function setLatestArticleAnalysis(value) {
    latestArticleAnalysis = value && typeof value === "object" ? Object.assign({}, value, { raw_article_stored: false }) : null;
    return latestArticleAnalysis;
  }

  function clearLatestArticleAnalysis() {
    latestArticleAnalysis = null;
    return latestArticleAnalysis;
  }

  function getLatestArticleAnalysis() {
    return latestArticleAnalysis ? Object.assign({}, latestArticleAnalysis, {
      main_points: (latestArticleAnalysis.main_points || []).slice(),
      actors: (latestArticleAnalysis.actors || []).slice(),
      claims: (latestArticleAnalysis.claims || []).slice(),
      concepts: (latestArticleAnalysis.concepts || []).slice(),
      conflict_lines: (latestArticleAnalysis.conflict_lines || []).slice(),
      candidates: (latestArticleAnalysis.candidates || []).map((item) => Object.assign({}, item))
    }) : null;
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
    const safeAnalysis = buildSafeArticleAnalysis(data, url, candidates);
    setLatestArticleAnalysis(safeAnalysis);
    const ingestResult = global.AHAIngest?.ingestWithCandidates?.(sourcePayload, candidates);
    global.refreshAhaExplorer?.();
    return { url, data, sourcePayload, analysis: safeAnalysis, candidate_count: candidates.length, ingestResult };
  }

  async function processUrlsFromMessage(text, context) {
    const urls = detectUrls(text);
    if (!urls.length) return [];
    clearLatestArticleAnalysis();
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
      analysis: item.analysis || null,
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

  global.AHALinkReader = { detectUrls, hasUrls, processUrlsFromMessage, buildSafeSourcePayload, renderLinkStatus, getLastLinkReadResults, setLatestArticleAnalysis, getLatestArticleAnalysis, clearLatestArticleAnalysis };
}(window));
