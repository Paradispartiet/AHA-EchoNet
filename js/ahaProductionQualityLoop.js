// AHA Production Quality Loop v1
// Human answer-quality feedback for real AHA use. Feedback stays on the existing
// local chat message and is derived into a review queue; it is never a memory
// fact, never model training, never uploaded and never synced automatically.
(function (global) {
  "use strict";

  const VERSION = "aha_production_quality_loop_v1";
  const META_HISTORY = "productionQualityFeedback";
  const META_SNAPSHOT = "productionQuality";
  const RATINGS = new Set(["good", "bad"]);
  const ISSUE_DEFS = Object.freeze({
    too_shallow: Object.freeze({ label: "For overfladisk", layer: "analysis_depth" }),
    misunderstood: Object.freeze({ label: "Misforsto spørsmålet", layer: "intent_interpretation" }),
    repetitive: Object.freeze({ label: "Gjentar seg", layer: "answer_composition" }),
    factual_precision: Object.freeze({ label: "Faglig upresist", layer: "evidence_and_precision" }),
    weak_sources: Object.freeze({ label: "Svake eller manglende kilder", layer: "evidence_and_precision" }),
    poor_context_use: Object.freeze({ label: "Brukte kontekst/minne dårlig", layer: "context_and_retrieval" }),
    low_insight: Object.freeze({ label: "Lite ny innsikt", layer: "analysis_depth" }),
    irrelevant: Object.freeze({ label: "Irrelevant", layer: "intent_interpretation" }),
    too_long: Object.freeze({ label: "For langt", layer: "answer_composition" }),
    too_short: Object.freeze({ label: "For kort", layer: "answer_composition" })
  });
  const LAYER_LABELS = Object.freeze({
    intent_interpretation: "Spørsmålsforståelse / relevans",
    evidence_and_precision: "Faglig presisjon / belegg",
    context_and_retrieval: "Kontekst / retrieval",
    analysis_depth: "Analyse / innsiktsdybde",
    answer_composition: "Svar-komposisjon"
  });

  const arr = (value) => Array.isArray(value) ? value : [];
  const obj = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const text = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  function persistence() {
    const api = global.AHAChatPersistence;
    return api && typeof api.loadSessions === "function" && typeof api.updateMessage === "function" ? api : null;
  }

  function normalizeIssues(values) {
    const seen = new Set();
    return arr(values).map((item) => text(item).toLowerCase()).filter((item) => ISSUE_DEFS[item]).filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  }

  function sameIssues(a, b) {
    const aa = normalizeIssues(a).slice().sort();
    const bb = normalizeIssues(b).slice().sort();
    return aa.length === bb.length && aa.every((item, index) => item === bb[index]);
  }

  function loadSessions() {
    try { return persistence()?.loadSessions?.() || []; } catch { return []; }
  }

  function latestReview(message) {
    const snapshot = obj(message?.meta?.[META_SNAPSHOT]);
    if (RATINGS.has(text(snapshot.rating).toLowerCase())) {
      return {
        rating: text(snapshot.rating).toLowerCase(),
        issues: normalizeIssues(snapshot.issues),
        createdAt: text(snapshot.createdAt),
        updatedAt: text(snapshot.updatedAt || snapshot.createdAt),
        source: text(snapshot.source || VERSION),
        local_only: true,
        evaluation_only: true
      };
    }
    const history = arr(message?.meta?.[META_HISTORY]);
    const active = history.slice().reverse().find((item) => RATINGS.has(text(item?.rating).toLowerCase()) && !item?.undone_at);
    if (!active) return null;
    return {
      rating: text(active.rating).toLowerCase(),
      issues: normalizeIssues(active.issues),
      createdAt: text(active.createdAt || active.created_at),
      updatedAt: text(active.updatedAt || active.updated_at || active.createdAt || active.created_at),
      source: text(active.source || VERSION),
      local_only: true,
      evaluation_only: true
    };
  }

  function findMessage(messageOrId, options = {}) {
    const candidate = messageOrId && typeof messageOrId === "object" ? messageOrId : null;
    if (candidate?.id && candidate?.role) return candidate;
    const id = text(candidate?.id || messageOrId);
    const answerText = text(options.answerText);
    const sessions = options.sessions || loadSessions();
    for (const session of sessions) {
      const messages = arr(session?.messages);
      if (id) {
        const exact = messages.find((message) => text(message?.id) === id);
        if (exact) return exact;
      }
    }
    if (answerText) {
      for (const session of sessions) {
        const exactText = arr(session?.messages).slice().reverse().find((message) => message?.role === "assistant" && text(message?.text) === answerText);
        if (exactText) return exactText;
      }
    }
    return null;
  }

  function recordReview(messageOrId, ratingArg, issueCodes = [], options = {}) {
    const rating = text(ratingArg).toLowerCase();
    if (!RATINGS.has(rating)) return { ok: false, reason: "invalid_rating" };
    const api = options.persistence || persistence();
    if (!api) return { ok: false, reason: "chat_persistence_unavailable" };
    const message = findMessage(messageOrId, { ...options, sessions: options.sessions || api.loadSessions() });
    if (!message || message.role !== "assistant") return { ok: false, reason: "assistant_message_not_found" };
    const issues = rating === "bad" ? normalizeIssues(issueCodes) : [];
    const previous = latestReview(message);
    if (previous?.rating === rating && sameIssues(previous.issues, issues)) {
      return { ok: true, noChange: true, message, review: previous };
    }
    const now = options.now || new Date().toISOString();
    const history = arr(message?.meta?.[META_HISTORY]).map((item) => ({ ...item }));
    const event = {
      rating,
      issues,
      createdAt: now,
      source: VERSION,
      local_only: true,
      evaluation_only: true,
      memory_fact: false,
      model_training_enabled: false,
      fine_tuning_enabled: false,
      remote_upload_enabled: false,
      backend_enabled: false,
      sync_enabled: false,
      echonet_shared: false
    };
    history.push(event);
    const snapshot = {
      rating,
      issues,
      createdAt: previous?.createdAt || now,
      updatedAt: now,
      source: VERSION,
      local_only: true,
      evaluation_only: true,
      memory_fact: false,
      model_training_enabled: false,
      sync_enabled: false
    };
    const updated = api.updateMessage(message.id, {
      meta: {
        ...obj(message.meta),
        [META_HISTORY]: history.slice(-30),
        [META_SNAPSHOT]: snapshot
      }
    });
    if (!updated) return { ok: false, reason: "write_failed", message };
    try {
      global.dispatchEvent?.(new global.CustomEvent("aha:production-quality-feedback", {
        detail: { rating, issueCount: issues.length, source: VERSION }
      }));
    } catch {}
    return { ok: true, message: updated, review: snapshot };
  }

  function evaluationMap() {
    const list = global.AHAPersonalAnswerEvaluation?.loadEvaluations?.() || [];
    return new Map(arr(list).map((evaluation) => [text(evaluation?.id), evaluation]).filter(([id]) => id));
  }

  function findEvaluation(message, map = evaluationMap()) {
    const id = text(message?.answerEvaluationId || message?.meta?.answerEvaluation?.id);
    if (id && map.has(id)) return map.get(id);
    const generatedAt = text(message?.meta?.answerEvaluation?.generatedAt);
    if (generatedAt) {
      return Array.from(map.values()).find((evaluation) => text(evaluation?.generatedAt) === generatedAt) || null;
    }
    return null;
  }

  function diagnosticAxes(evaluation) {
    const dims = obj(evaluation?.dimensions);
    const score = (key) => Number.isFinite(Number(dims?.[key]?.score)) ? Number(dims[key].score) : null;
    return {
      relevance: score("intentAlignment"),
      sourceGrounding: score("sourceGrounding"),
      contextUse: score("personalRelevance"),
      transparency: score("transparency"),
      nextStepClarity: score("nextStep")
    };
  }

  function failureLayers(issueCodes) {
    const codes = normalizeIssues(issueCodes);
    const seen = new Set();
    return codes.map((code) => ISSUE_DEFS[code]?.layer).filter(Boolean).filter((layer) => {
      if (seen.has(layer)) return false;
      seen.add(layer);
      return true;
    });
  }

  function buildReviewQueue(options = {}) {
    const sessions = options.sessions || loadSessions();
    const evals = options.evaluations instanceof Map ? options.evaluations : evaluationMap();
    const queue = [];
    sessions.forEach((session) => {
      let lastUser = null;
      arr(session?.messages).forEach((message) => {
        if (message?.role === "user") lastUser = message;
        if (message?.role !== "assistant") return;
        const review = latestReview(message);
        if (review?.rating !== "bad") return;
        const evaluation = findEvaluation(message, evals);
        const layers = failureLayers(review.issues);
        queue.push({
          sessionId: text(session?.id),
          messageId: text(message?.id),
          createdAt: text(message?.createdAt),
          question: text(lastUser?.text),
          answer: text(message?.text),
          issues: review.issues.slice(),
          issueLabels: review.issues.map((code) => ISSUE_DEFS[code]?.label || code),
          failureLayers: layers,
          failureLayerLabels: layers.map((layer) => LAYER_LABELS[layer] || layer),
          diagnosticAxes: diagnosticAxes(evaluation),
          evaluatorScore: Number.isFinite(Number(evaluation?.score)) ? Number(evaluation.score) : null,
          evaluatorStatus: text(evaluation?.status),
          local_only: true
        });
      });
    });
    return queue.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function buildSummary(options = {}) {
    const sessions = options.sessions || loadSessions();
    const assistants = sessions.flatMap((session) => arr(session?.messages)).filter((message) => message?.role === "assistant");
    const reviewed = assistants.map((message) => latestReview(message)).filter(Boolean);
    const good = reviewed.filter((review) => review.rating === "good").length;
    const bad = reviewed.filter((review) => review.rating === "bad").length;
    const issueCounts = Object.fromEntries(Object.keys(ISSUE_DEFS).map((key) => [key, 0]));
    reviewed.filter((review) => review.rating === "bad").forEach((review) => normalizeIssues(review.issues).forEach((issue) => { issueCounts[issue] += 1; }));
    return {
      version: VERSION,
      assistantAnswers: assistants.length,
      reviewed: reviewed.length,
      unreviewed: Math.max(0, assistants.length - reviewed.length),
      good,
      bad,
      goodRate: reviewed.length ? Number((good / reviewed.length).toFixed(3)) : 0,
      badRate: reviewed.length ? Number((bad / reviewed.length).toFixed(3)) : 0,
      issueCounts,
      queueCount: bad,
      local_only: true
    };
  }

  function buildRegressionCandidate(item) {
    const row = obj(item);
    return {
      version: "aha_production_quality_regression_candidate_v1",
      capturedAt: row.createdAt || new Date().toISOString(),
      userPrompt: text(row.question),
      assistantAnswer: text(row.answer),
      issueCodes: normalizeIssues(row.issues),
      issueLabels: arr(row.issueLabels).map(text).filter(Boolean),
      likelyFailureLayers: arr(row.failureLayers).map(text).filter(Boolean),
      diagnosticAxes: obj(row.diagnosticAxes),
      evaluatorScore: row.evaluatorScore ?? null,
      evaluatorStatus: text(row.evaluatorStatus) || null,
      boundary: {
        local_only: true,
        user_initiated_copy_required: true,
        profile_identifier_included: false,
        workspace_identifier_included: false,
        access_token_included: false
      }
    };
  }

  function rowAnswerText(row) {
    return text(row?.querySelector?.(".chat-line-aha")?.textContent || row?.querySelector?.(".chat-line")?.textContent);
  }

  function rowMessage(row) {
    return findMessage(row?.dataset?.messageId, { answerText: rowAnswerText(row) });
  }

  function setTrainingExampleBoundary(row, review) {
    const button = row?.querySelector?.('[data-save-training-example="1"]');
    if (!button) return;
    if (review?.rating === "bad") {
      if (button.dataset.productionQualityDisabled !== "true") {
        button.dataset.productionQualityDisabled = "true";
        button.dataset.productionQualityPreviousDisabled = button.disabled ? "true" : "false";
      }
      button.disabled = true;
      button.title = "Blokkert fordi du har markert dette svaret som ikke bra.";
    } else if (button.dataset.productionQualityDisabled === "true") {
      button.disabled = button.dataset.productionQualityPreviousDisabled === "true";
      delete button.dataset.productionQualityDisabled;
      delete button.dataset.productionQualityPreviousDisabled;
      button.removeAttribute("title");
    }
  }

  function installStyles() {
    if (!global.document?.head || global.document.getElementById("aha-production-quality-loop-styles")) return false;
    const style = global.document.createElement("style");
    style.id = "aha-production-quality-loop-styles";
    style.textContent = `
      .aha-production-quality-feedback{margin:10px 0 2px;padding:10px 12px;border:1px solid rgba(255,255,255,.11);border-radius:14px;background:rgba(255,255,255,.025);max-width:780px}
      .aha-production-quality-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.aha-production-quality-head>span{font-size:.78rem;opacity:.76;margin-right:2px}
      .aha-production-quality-feedback button{border:1px solid rgba(255,255,255,.15);border-radius:999px;background:rgba(255,255,255,.045);color:inherit;padding:6px 10px;font:inherit;font-size:.78rem;cursor:pointer}
      .aha-production-quality-feedback button[aria-pressed="true"]{background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.28)}
      .aha-production-quality-issues{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}.aha-production-quality-issues[hidden]{display:none}
      .aha-production-quality-status{display:block;margin-top:7px;font-size:.75rem;opacity:.72}
      .aha-production-quality-dashboard{display:grid;gap:12px}.aha-production-quality-stats{display:flex;flex-wrap:wrap;gap:8px}.aha-production-quality-stat{padding:8px 10px;border:1px solid rgba(255,255,255,.11);border-radius:12px;background:rgba(255,255,255,.025)}
      .aha-production-quality-stat strong{display:block;font-size:1.1rem}.aha-production-quality-stat span{font-size:.75rem;opacity:.72}
      .aha-production-quality-issue-summary{display:flex;flex-wrap:wrap;gap:6px}.aha-production-quality-chip{border:1px solid rgba(255,255,255,.11);border-radius:999px;padding:5px 8px;font-size:.75rem;opacity:.86}
      .aha-production-quality-card{padding:12px 14px;border:1px solid rgba(255,255,255,.11);border-radius:14px;background:rgba(255,255,255,.025);margin-top:10px}.aha-production-quality-card h3{margin:0 0 7px;font-size:.96rem}.aha-production-quality-card p{margin:5px 0}.aha-production-quality-card details{margin-top:8px}.aha-production-quality-card pre{white-space:pre-wrap;word-break:break-word}
      .aha-production-quality-card-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:9px}.aha-production-quality-card-actions button{border-radius:999px;padding:7px 10px}
    `;
    global.document.head.appendChild(style);
    return true;
  }

  function decorateChatRow(row) {
    if (!row || row.dataset.productionQualityDecorated === "true" || !row.classList?.contains?.("chat-line-row-aha")) return false;
    installStyles();
    row.dataset.productionQualityDecorated = "true";
    const wrap = global.document.createElement("section");
    wrap.className = "aha-production-quality-feedback";
    wrap.setAttribute("aria-label", "Vurder kvaliteten på AHA-svaret");
    wrap.innerHTML = `<div class="aha-production-quality-head"><span>Hvordan var dette svaret?</span><button type="button" data-production-quality-rating="good" aria-pressed="false">Bra</button><button type="button" data-production-quality-rating="bad" aria-pressed="false">Ikke bra</button></div><div class="aha-production-quality-issues" hidden>${Object.entries(ISSUE_DEFS).map(([code, def]) => `<button type="button" data-production-quality-issue="${esc(code)}" aria-pressed="false">${esc(def.label)}</button>`).join("")}</div><span class="aha-production-quality-status" aria-live="polite"></span>`;
    row.appendChild(wrap);

    function refresh(reviewArg = null) {
      const message = rowMessage(row);
      const review = reviewArg || latestReview(message);
      wrap.querySelectorAll?.("[data-production-quality-rating]")?.forEach?.((button) => {
        button.setAttribute("aria-pressed", review?.rating === button.dataset.productionQualityRating ? "true" : "false");
      });
      const issues = wrap.querySelector?.(".aha-production-quality-issues");
      if (issues) issues.hidden = review?.rating !== "bad";
      wrap.querySelectorAll?.("[data-production-quality-issue]")?.forEach?.((button) => {
        button.setAttribute("aria-pressed", review?.issues?.includes?.(button.dataset.productionQualityIssue) ? "true" : "false");
      });
      setTrainingExampleBoundary(row, review);
      return review;
    }

    wrap.querySelectorAll?.("[data-production-quality-rating]")?.forEach?.((button) => {
      button.addEventListener("click", () => {
        const rating = button.dataset.productionQualityRating;
        const current = latestReview(rowMessage(row));
        const result = recordReview(row?.dataset?.messageId, rating, rating === "bad" ? current?.issues || [] : [], { answerText: rowAnswerText(row) });
        const status = wrap.querySelector?.(".aha-production-quality-status");
        if (status) status.textContent = result.ok
          ? (rating === "good" ? "Lagret som bra svar." : "Lagret som ikke bra. Velg gjerne én eller flere årsaker.")
          : "Kunne ikke lagre kvalitetsvurderingen lokalt.";
        if (result.ok) refresh(result.review);
      });
    });

    wrap.querySelectorAll?.("[data-production-quality-issue]")?.forEach?.((button) => {
      button.addEventListener("click", () => {
        const current = latestReview(rowMessage(row));
        const selected = new Set(normalizeIssues(current?.issues));
        const code = button.dataset.productionQualityIssue;
        if (selected.has(code)) selected.delete(code); else selected.add(code);
        const result = recordReview(row?.dataset?.messageId, "bad", Array.from(selected), { answerText: rowAnswerText(row) });
        const status = wrap.querySelector?.(".aha-production-quality-status");
        if (status) status.textContent = result.ok ? "Årsakene er lagret lokalt i kvalitetskøen." : "Kunne ikke lagre årsaken.";
        if (result.ok) refresh(result.review);
      });
    });

    refresh();
    return true;
  }

  function decorateChat() {
    const log = global.document?.getElementById?.("chat-log");
    if (!log) return false;
    log.querySelectorAll?.(".chat-line-row-aha")?.forEach?.(decorateChatRow);
    return true;
  }

  function installChatObserver() {
    const log = global.document?.getElementById?.("chat-log");
    if (!log || typeof global.MutationObserver !== "function" || global.__ahaProductionQualityObserver) return false;
    const observer = new global.MutationObserver(() => setTimeout(decorateChat, 0));
    observer.observe(log, { childList: true, subtree: true });
    global.__ahaProductionQualityObserver = observer;
    return true;
  }

  function axisMarkup(axes) {
    const entries = [
      ["Relevans/intensjon", axes?.relevance],
      ["Kildebelegg", axes?.sourceGrounding],
      ["Kontekstbruk", axes?.contextUse],
      ["Transparens", axes?.transparency],
      ["Neste steg", axes?.nextStepClarity]
    ].filter(([, value]) => Number.isFinite(Number(value)));
    if (!entries.length) return "<span class=\"aha-production-quality-chip\">Ingen full auto-evaluering knyttet til svaret</span>";
    return entries.map(([label, value]) => `<span class="aha-production-quality-chip">${esc(label)}: ${Number(value)}/100</span>`).join("");
  }

  function renderTrainingDashboard() {
    const host = global.document?.getElementById?.("training-production-quality-report");
    if (!host) return false;
    installStyles();
    const summary = buildSummary();
    const queue = buildReviewQueue();
    const issueMarkup = Object.entries(summary.issueCounts).filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]).map(([code, count]) => `<span class="aha-production-quality-chip">${esc(ISSUE_DEFS[code]?.label || code)}: ${count}</span>`).join("") || '<span class="aha-production-quality-chip">Ingen registrerte problemårsaker ennå</span>';
    const queueMarkup = queue.length ? queue.map((item, index) => `<article class="aha-production-quality-card" data-production-quality-card="${index}"><h3>Review ${index + 1} · ${esc(item.issueLabels.join(" · ") || "Ikke bra")}</h3><p><strong>Foreløpig feillag:</strong> ${esc(item.failureLayerLabels.join(" · ") || "Ikke klassifisert")}</p><div class="aha-production-quality-issue-summary">${axisMarkup(item.diagnosticAxes)}</div><details><summary>Se spørsmål og svar lokalt</summary><p><strong>Spørsmål</strong></p><pre>${esc(item.question || "Spørsmålet ble ikke funnet i lokal sesjon.")}</pre><p><strong>AHA-svar</strong></p><pre>${esc(item.answer)}</pre></details><div class="aha-production-quality-card-actions"><button type="button" data-production-quality-copy="${index}">Kopier regresjonsutkast</button><span class="aha-production-quality-status" aria-live="polite"></span></div></article>`).join("") : '<p class="module-meta">Kvalitetskøen er tom. Marker et AHA-svar som «Ikke bra» i Chat for å legge det hit.</p>';
    host.innerHTML = `<div class="aha-production-quality-dashboard"><div class="aha-production-quality-stats"><div class="aha-production-quality-stat"><strong>${summary.reviewed}</strong><span>vurdert</span></div><div class="aha-production-quality-stat"><strong>${summary.good}</strong><span>bra</span></div><div class="aha-production-quality-stat"><strong>${summary.bad}</strong><span>ikke bra</span></div><div class="aha-production-quality-stat"><strong>${summary.unreviewed}</strong><span>ikke vurdert</span></div></div><div><strong>Problemårsaker</strong><div class="aha-production-quality-issue-summary">${issueMarkup}</div></div><div><strong>Kvalitetskø</strong>${queueMarkup}</div><p class="module-meta">Automatiske score er diagnostikk, ikke fasit. Faglig korrekthet og faktisk innsiktsverdi blir ikke erklært automatisk; brukerens vurdering beholdes som separat kvalitetsbevis. Dårlige svar blokkeres fra Chat → Data Intake.</p></div>`;
    host.querySelectorAll?.("[data-production-quality-copy]")?.forEach?.((button) => {
      button.addEventListener("click", async () => {
        const item = queue[Number(button.dataset.productionQualityCopy)];
        const status = button.parentElement?.querySelector?.(".aha-production-quality-status");
        if (!item) return;
        const payload = JSON.stringify(buildRegressionCandidate(item), null, 2);
        try {
          if (!global.navigator?.clipboard?.writeText) throw new Error("clipboard unavailable");
          await global.navigator.clipboard.writeText(payload);
          if (status) status.textContent = "Regresjonsutkast kopiert. Innhold kopieres bare etter denne eksplisitte handlingen.";
        } catch {
          if (status) status.textContent = "Kunne ikke kopiere automatisk i denne nettleseren.";
        }
      });
    });
    return true;
  }

  function init() {
    decorateChat();
    installChatObserver();
    renderTrainingDashboard();
    global.addEventListener?.("aha:production-quality-feedback", () => renderTrainingDashboard());
  }

  const api = Object.freeze({
    VERSION,
    ISSUE_DEFS,
    LAYER_LABELS,
    normalizeIssues,
    latestReview,
    findMessage,
    recordReview,
    diagnosticAxes,
    failureLayers,
    buildReviewQueue,
    buildSummary,
    buildRegressionCandidate,
    decorateChat,
    renderTrainingDashboard,
    init
  });
  global.AHAProductionQualityLoop = api;
  global.AHAModuleApi?.register?.("quality.productionLoop", api, {
    version: 1,
    legacyGlobal: "AHAProductionQualityLoop",
    exports: Object.keys(api)
  });

  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init, { once: true });
  else if (global.document) init();
})(typeof window !== "undefined" ? window : globalThis);
