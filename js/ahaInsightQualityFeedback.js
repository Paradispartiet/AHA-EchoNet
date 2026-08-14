// AHA Insight Quality Feedback
// User control + advisory quality audit on the canonical insight chamber.
// No parallel store: feedback is append-only metadata on the existing insight.
(function (global) {
  "use strict";

  const VERSION = "aha_insight_quality_feedback_v1";
  const CHAMBER_KEY = "aha_insight_chamber_v1";
  const RESPONSE_IMPORTANT = "important";
  const RESPONSE_NOT_INSIGHT = "not_insight";
  const RESPONSE_USEFUL = "useful";
  const RESPONSE_TOO_GENERIC = "too_generic";
  const RESPONSE_MISINTERPRETED = "misinterpreted";
  const RESPONSE_MISSING_EVIDENCE = "missing_evidence";
  const RESPONSE_UNDO = "undo";
  const ACTIVE_ANALYSIS_FEEDBACK_VALUES = new Set([RESPONSE_USEFUL, RESPONSE_TOO_GENERIC, RESPONSE_MISINTERPRETED, RESPONSE_MISSING_EVIDENCE, RESPONSE_UNDO]);
  const FEEDBACK_VALUES = new Set([RESPONSE_IMPORTANT, RESPONSE_NOT_INSIGHT, ...ACTIVE_ANALYSIS_FEEDBACK_VALUES]);
  const AUTO_OUTPUT_KEY = "aha_chat_auto_outputs_v1";
  const text = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const arr = (value) => Array.isArray(value) ? value : [];
  const obj = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  function readChamber() {
    try {
      if (typeof global.loadChamberFromStorage === "function") return global.loadChamberFromStorage();
      if (global.AHAInsights?.loadChamber) return global.AHAInsights.loadChamber();
      const raw = global.localStorage?.getItem?.(CHAMBER_KEY);
      const parsed = raw ? JSON.parse(raw) : { insights: [] };
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { insights: [] };
      if (!Array.isArray(parsed.insights)) parsed.insights = [];
      return parsed;
    } catch {
      return { insights: [] };
    }
  }

  function writeChamber(chamber) {
    if (!chamber || typeof chamber !== "object") return false;
    chamber._local_updated_at = new Date().toISOString();
    if (typeof global.saveChamberToStorage === "function") {
      global.saveChamberToStorage(chamber);
    } else {
      global.localStorage?.setItem?.(CHAMBER_KEY, JSON.stringify(chamber));
    }
    try {
      global.dispatchEvent?.(new global.CustomEvent("aha:insight-quality-feedback", {
        detail: { source: VERSION, insight_count: arr(chamber.insights).length }
      }));
    } catch {}
    return true;
  }

  function findInsight(chamber, insightOrId) {
    if (insightOrId && typeof insightOrId === "object") {
      const id = text(insightOrId.id);
      if (!id) return insightOrId;
      return arr(chamber?.insights).find((item) => text(item?.id) === id) || insightOrId;
    }
    const id = text(insightOrId);
    return arr(chamber?.insights).find((item) => text(item?.id) === id) || null;
  }

  function snapshotUserQuality(insight) {
    return {
      status: insight?.status ?? null,
      user_priority: insight?.user_priority ?? null,
      user_quality_status: insight?.user_quality_status ?? null,
      user_quality_reason: insight?.user_quality_reason ?? null,
      user_quality_updated_at: insight?.user_quality_updated_at ?? null,
      rejected_at: insight?.rejected_at ?? null,
      rejection_reason: insight?.rejection_reason ?? null
    };
  }

  function restoreSnapshot(insight, before) {
    const fields = ["status", "user_priority", "user_quality_status", "user_quality_reason", "user_quality_updated_at", "rejected_at", "rejection_reason"];
    fields.forEach((field) => {
      if (before && before[field] !== null && before[field] !== undefined) insight[field] = before[field];
      else delete insight[field];
    });
  }

  function feedbackHistory(insight) {
    if (!Array.isArray(insight.user_quality_feedback)) insight.user_quality_feedback = [];
    return insight.user_quality_feedback;
  }

  function applyFeedback(insightOrId, response, options = {}) {
    const normalized = text(response).toLowerCase();
    if (!FEEDBACK_VALUES.has(normalized)) return { ok: false, reason: "invalid_response" };
    const chamber = options.chamber || readChamber();
    const insight = findInsight(chamber, insightOrId);
    if (!insight) return { ok: false, reason: "insight_not_found" };
    const history = feedbackHistory(insight);
    const now = options.now || new Date().toISOString();

    if (normalized === RESPONSE_UNDO) {
      const previous = history.slice().reverse().find((item) => item && item.response !== RESPONSE_UNDO && !item.undone_at);
      if (!previous) return { ok: false, reason: "nothing_to_undo", insight };
      previous.undone_at = now;
      restoreSnapshot(insight, obj(previous.before));
      history.push({ response: RESPONSE_UNDO, created_at: now, target_created_at: previous.created_at || null, source: VERSION });
      insight.last_updated = now;
      if (options.save !== false) writeChamber(chamber);
      return { ok: true, response: normalized, insight, chamber, restored: true };
    }

    if (normalized === RESPONSE_IMPORTANT && insight.user_priority === "important" && insight.status !== "rejected") {
      return { ok: true, response: normalized, insight, chamber, noChange: true };
    }
    if (normalized === RESPONSE_NOT_INSIGHT && String(insight.status || "").toLowerCase() === "rejected" && insight.rejection_reason === "user_not_insight") {
      return { ok: true, response: normalized, insight, chamber, noChange: true };
    }
    const latestActive = history.slice().reverse().find((item) => item && !item.undone_at && item.response !== RESPONSE_UNDO);
    if (latestActive?.response === normalized) return { ok: true, response: normalized, insight, chamber, noChange: true };

    const before = snapshotUserQuality(insight);
    history.push({ response: normalized, created_at: now, source: VERSION, before });
    if (normalized === RESPONSE_IMPORTANT) {
      insight.user_priority = "important";
      insight.user_quality_status = "important";
      insight.user_quality_updated_at = now;
    } else if (normalized === RESPONSE_NOT_INSIGHT) {
      insight.status = "rejected";
      insight.rejected_at = now;
      insight.rejection_reason = "user_not_insight";
      insight.user_quality_status = "rejected";
      insight.user_quality_updated_at = now;
      delete insight.user_priority;
    } else if (normalized === RESPONSE_USEFUL) {
      insight.user_quality_status = "useful";
      delete insight.user_quality_reason;
      insight.user_quality_updated_at = now;
    } else {
      insight.user_quality_status = "needs_review";
      insight.user_quality_reason = normalized;
      insight.user_quality_updated_at = now;
    }
    insight.last_updated = now;
    if (options.save !== false) writeChamber(chamber);
    return { ok: true, response: normalized, insight, chamber };
  }

  function applyActiveAnalysisFeedback(response, options = {}) {
    const normalized = text(response).toLowerCase();
    if (!ACTIVE_ANALYSIS_FEEDBACK_VALUES.has(normalized)) return { ok: false, reason: "invalid_response" };
    const storage = options.storage || global.localStorage;
    let cache;
    try {
      const raw = storage?.getItem?.(AUTO_OUTPUT_KEY);
      cache = raw ? JSON.parse(raw) : null;
    } catch {
      return { ok: false, reason: "read_failed" };
    }
    if (!cache || typeof cache !== "object") return { ok: false, reason: "analysis_not_found" };
    if (!cache.payload || typeof cache.payload !== "object") cache = { payload: cache };
    const payload = cache.payload;
    if (!payload.analysisQuality || typeof payload.analysisQuality !== "object") payload.analysisQuality = {};
    if (!Array.isArray(payload.analysisQuality.userFeedback)) payload.analysisQuality.userFeedback = [];
    const history = payload.analysisQuality.userFeedback;
    const now = options.now || new Date().toISOString();
    if (normalized === RESPONSE_UNDO) {
      const previous = history.slice().reverse().find((item) => item && item.response !== RESPONSE_UNDO && !item.undone_at);
      if (!previous) return { ok: false, reason: "nothing_to_undo", cache };
      previous.undone_at = now;
      history.push({ response: RESPONSE_UNDO, created_at: now, target_created_at: previous.created_at || null, source: VERSION });
      const prior = history.slice(0, -1).reverse().find((item) => item && item.response !== RESPONSE_UNDO && !item.undone_at);
      payload.analysisQuality.latestUserFeedback = prior?.response || "";
    } else {
      const latest = history.slice().reverse().find((item) => item && item.response !== RESPONSE_UNDO && !item.undone_at);
      if (latest?.response === normalized) return { ok: true, response: normalized, cache, noChange: true };
      history.push({
        response: normalized,
        created_at: now,
        source: VERSION,
        analysis_source_hash: text(cache.sourceHash || cache.sourceTextHash || payload?.canonicalAnalysis?.sourceHash) || null
      });
      payload.analysisQuality.latestUserFeedback = normalized;
    }
    if (options.save !== false) {
      try {
        storage?.setItem?.(AUTO_OUTPUT_KEY, JSON.stringify(cache));
      } catch {
        return { ok: false, reason: "write_failed", cache };
      }
      if (normalized === RESPONSE_UNDO) global.AHAAnalysisQualityProfile?.undoFeedback?.(cache, { now });
      else global.AHAAnalysisQualityProfile?.recordFeedback?.(cache, normalized, { now });
    }
    return { ok: true, response: normalized, cache, restored: normalized === RESPONSE_UNDO };
  }

  function activeInsight(insight) {
    if (!insight || insight.merged_into) return false;
    return !["archived", "rejected", "merged"].includes(text(insight.status || "suggested").toLowerCase());
  }

  function tokens(value) {
    return new Set(text(value).toLowerCase().split(/[^a-z0-9æøå]+/).filter((token) => token.length > 2));
  }

  function similarity(a, b) {
    const aa = tokens(a); const bb = tokens(b);
    if (!aa.size || !bb.size) return 0;
    let intersection = 0;
    aa.forEach((token) => { if (bb.has(token)) intersection += 1; });
    const union = aa.size + bb.size - intersection;
    return union ? intersection / union : 0;
  }

  function weakHeuristic(insight) {
    if (!activeInsight(insight)) return false;
    const evidence = Number(insight?.strength?.evidence_count || 0);
    const depth = Number(insight?.depth_score || 0);
    const semanticSignals = arr(insight?.claims).length + arr(insight?.patterns).length + arr(insight?.concepts).length;
    const body = `${text(insight?.title)} ${text(insight?.summary)}`;
    return evidence <= 1 && depth <= 1 && semanticSignals === 0 && body.length < 180;
  }

  function buildQualityAudit(chamberArg) {
    const chamber = chamberArg || readChamber();
    const all = arr(chamber?.insights);
    const active = all.filter(activeInsight);
    const important = active.filter((insight) => insight.user_priority === "important");
    const rejected = all.filter((insight) => String(insight?.status || "").toLowerCase() === "rejected" && insight.rejection_reason === "user_not_insight");
    const weak = active.filter(weakHeuristic);
    const duplicatePairs = [];
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        const a = active[i]; const b = active[j];
        const score = similarity(`${text(a.title)} ${text(a.summary)}`, `${text(b.title)} ${text(b.summary)}`);
        if (score >= 0.82) duplicatePairs.push({ a: a.id || null, b: b.id || null, score: Number(score.toFixed(3)) });
      }
    }
    const duplicateInsightIds = new Set(duplicatePairs.flatMap((pair) => [pair.a, pair.b]).filter(Boolean));
    const reviewCount = new Set(weak.map((item) => item.id).filter(Boolean).concat(Array.from(duplicateInsightIds))).size;
    return {
      version: VERSION,
      total: all.length,
      active: active.length,
      important: important.length,
      userRejected: rejected.length,
      weakCandidates: weak.length,
      duplicatePairs: duplicatePairs.length,
      reviewCount,
      advisoryOnly: true,
      description: reviewCount
        ? `${reviewCount} aktive innsikter bør få et ekstra menneskelig blikk.`
        : "Ingen tydelige kvalitetsvarsler i de aktive innsiktene akkurat nå."
    };
  }

  function qualityButtons(insight) {
    const important = insight?.user_priority === "important" && String(insight?.status || "").toLowerCase() !== "rejected";
    const rejected = String(insight?.status || "").toLowerCase() === "rejected" && insight?.rejection_reason === "user_not_insight";
    return `<div class="aha-insight-quality-actions" aria-label="Vurder innsikten">
      <button type="button" data-insight-quality="important"${important ? " disabled" : ""}>${important ? "Viktig ✓" : "Viktig"}</button>
      <button type="button" data-insight-quality="not_insight"${rejected ? " disabled" : ""}>${rejected ? "Ikke en innsikt ✓" : "Dette var ikke en innsikt"}</button>
      <button type="button" data-insight-quality="useful">Nyttig</button>
      <button type="button" data-insight-quality="too_generic">For generelt</button>
      <button type="button" data-insight-quality="misinterpreted">Feil tolket</button>
      <button type="button" data-insight-quality="missing_evidence">Mangler belegg</button>
      <button type="button" data-insight-quality="undo">Angre</button>
      <span class="aha-insight-quality-status" aria-live="polite"></span>
    </div>`;
  }

  function bindButtons(host, insight) {
    host.querySelectorAll?.("[data-insight-quality]")?.forEach?.((button) => {
      if (button.dataset.qualityBound === "true") return;
      button.dataset.qualityBound = "true";
      button.addEventListener("click", () => {
        const result = applyFeedback(insight, button.dataset.insightQuality);
        const status = host.querySelector?.(".aha-insight-quality-status");
        if (status) status.textContent = result.ok
          ? ({
            [RESPONSE_IMPORTANT]: "Markert som viktig.",
            [RESPONSE_NOT_INSIGHT]: "Fjernet fra aktive innsikter.",
            [RESPONSE_USEFUL]: "Markert som nyttig.",
            [RESPONSE_TOO_GENERIC]: "Markert som for generell.",
            [RESPONSE_MISINTERPRETED]: "Markert som feiltolket.",
            [RESPONSE_MISSING_EVIDENCE]: "Markert som manglende belegg.",
            [RESPONSE_UNDO]: "Siste vurdering er angret."
          }[result.response] || "Vurderingen ble lagret.")
          : (result.reason === "nothing_to_undo" ? "Ingenting å angre." : "Kunne ikke lagre vurderingen.");
        if (result.ok && !result.noChange) {
          global.AHAInsights?.refresh?.();
          setTimeout(() => { decorateInsightsPage(); decorateChatInsightChanges(); renderQualityAudit(); }, 0);
        }
      });
    });
  }

  function installStyles() {
    if (!global.document?.head || global.document.getElementById("aha-insight-quality-styles")) return;
    const style = global.document.createElement("style");
    style.id = "aha-insight-quality-styles";
    style.textContent = `
      .aha-insight-quality-actions{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1)}
      .aha-insight-quality-actions button{border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(255,255,255,.04);color:inherit;padding:6px 10px;font:inherit;font-size:.78rem;cursor:pointer}
      .aha-insight-quality-actions button:hover:not(:disabled){background:rgba(255,255,255,.09)}
      .aha-insight-quality-actions button:disabled{opacity:.58;cursor:default}
      .aha-insight-quality-status{font-size:.76rem;opacity:.72}
      .aha-insight-quality-audit{margin:0 0 14px;padding:14px 16px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.035)}
      .aha-insight-quality-audit h2{margin:0 0 6px;font-size:1rem}.aha-insight-quality-audit p{margin:0 0 10px}.aha-insight-quality-audit .insight-meta-row{margin:0}
    `;
    global.document.head.appendChild(style);
  }

  function decorateInsightsPage() {
    const list = global.document?.getElementById?.("insights-list");
    if (!list) return false;
    installStyles();
    list.querySelectorAll?.(".insight-card")?.forEach?.((card) => {
      if (card.dataset.insightQualityDecorated === "true" || !card._insightRaw) return;
      card.dataset.insightQualityDecorated = "true";
      card.insertAdjacentHTML("beforeend", qualityButtons(card._insightRaw));
      bindButtons(card, card._insightRaw);
    });
    return true;
  }

  function findInsightByVisibleCard(card, chamber) {
    const title = text(card?.querySelector?.("h3")?.textContent);
    const summary = text(card?.querySelector?.("p")?.textContent);
    const candidates = arr(chamber?.insights).filter((insight) => activeInsight(insight) || insight?.rejection_reason === "user_not_insight");
    const exact = candidates.find((insight) => title && text(insight?.title) === title);
    if (exact) return exact;
    return candidates.find((insight) => summary && [text(insight?.summary), text(insight?.title)].includes(summary)) || null;
  }

  function decorateChatInsightChanges() {
    const host = global.document?.getElementById?.("exp-innsikter");
    if (!host) return false;
    installStyles();
    const chamber = readChamber();
    host.querySelectorAll?.("[data-conversation-insight-changes] .exp-insight-card")?.forEach?.((card) => {
      if (card.dataset.insightQualityDecorated === "true") return;
      const insight = findInsightByVisibleCard(card, chamber);
      if (!insight) return;
      card.dataset.insightQualityDecorated = "true";
      card.insertAdjacentHTML("beforeend", qualityButtons(insight));
      bindButtons(card, insight);
    });
    return true;
  }

  function renderQualityAudit() {
    const list = global.document?.getElementById?.("insights-list");
    if (!list?.parentElement) return null;
    installStyles();
    const old = global.document.getElementById("aha-insight-quality-audit");
    old?.remove?.();
    const audit = buildQualityAudit();
    const section = global.document.createElement("section");
    section.id = "aha-insight-quality-audit";
    section.className = "aha-insight-quality-audit";
    section.innerHTML = `<h2>Kvalitet på innsiktene</h2><p>${esc(audit.description)}</p><div class="insight-meta-row">
      <span class="insight-chip">Aktive: ${audit.active}</span>
      <span class="insight-chip">Viktige: ${audit.important}</span>
      <span class="insight-chip">Avvist av deg: ${audit.userRejected}</span>
      <span class="insight-chip">Mulig svake: ${audit.weakCandidates}</span>
      <span class="insight-chip">Mulige duplikatpar: ${audit.duplicatePairs}</span>
    </div><small>«Mulig svak» og «mulig duplikat» er bare review-signaler. AHA avviser eller slår aldri sammen innsikter automatisk her.</small>`;
    list.parentElement.insertBefore(section, list);
    return audit;
  }

  function installObservers() {
    const insightsList = global.document?.getElementById?.("insights-list");
    if (insightsList && typeof global.MutationObserver === "function" && !global.__ahaInsightQualityInsightsObserver) {
      const observer = new global.MutationObserver(() => { decorateInsightsPage(); renderQualityAudit(); });
      observer.observe(insightsList, { childList: true, subtree: true });
      global.__ahaInsightQualityInsightsObserver = observer;
    }
    const chatHost = global.document?.getElementById?.("exp-innsikter");
    if (chatHost && typeof global.MutationObserver === "function" && !global.__ahaInsightQualityChatObserver) {
      const observer = new global.MutationObserver(() => decorateChatInsightChanges());
      observer.observe(chatHost, { childList: true, subtree: true });
      global.__ahaInsightQualityChatObserver = observer;
    }
  }

  function init() {
    decorateInsightsPage();
    decorateChatInsightChanges();
    renderQualityAudit();
    installObservers();
  }

  global.AHAInsightQualityFeedback = {
    VERSION,
    readChamber,
    writeChamber,
    applyFeedback,
    applyActiveAnalysisFeedback,
    activeInsight,
    similarity,
    weakHeuristic,
    buildQualityAudit,
    decorateInsightsPage,
    decorateChatInsightChanges,
    renderQualityAudit,
    init
  };

  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init, { once: true });
  else if (global.document) init();
})(typeof window !== "undefined" ? window : globalThis);
