// ahaChatPersonalUi.js
// Personal AI-status, Answer Composer/evaluering og minnetransparens for AHA Chat.

(function (global) {
  "use strict";

  function create(deps = {}) {
    const {
      getActiveAnalysisRun,
      bindAnalysisArtifact,
      buildAhaMemoryTransparency,
      showInsights,
      setStatusNote,
      excludeAhaMemoryInsight,
      normalizeAhaMemoryControls,
      loadAhaMemoryControls,
      formatAhaMemoryTimestamp,
      getAhaExcludedMemoryItems,
      setAhaMemoryControl,
      includeAhaMemoryInsight,
      resetAhaMemoryExclusions,
      buildAhaMemoryStatus
    } = deps;
    const document = global.document;

  function getAhaPersonalContextApi() {
    return global.AHAChatPersonalContext && typeof global.AHAChatPersonalContext === "object"
      ? global.AHAChatPersonalContext
      : null;
  }

  function buildAhaPersonalMessageContext(userText) {
    const api = getAhaPersonalContextApi();
    if (!api || typeof api.buildMessageContext !== "function") return null;
    try {
      return api.buildMessageContext(userText, { maxLength: 900 });
    } catch (err) {
      console.warn("AHA personlig kontekst kunne ikke bygges", err);
      return null;
    }
  }

  function buildAhaAnswerPackage(userText) {
    const api = global.AHAPersonalAnswerComposer;
    if (!api || typeof api.buildAnswerPackage !== "function") return null;
    try { return api.buildAnswerPackage(userText, { maxLength: 2200 }); }
    catch (err) { console.warn("AHA Answer Composer kunne ikke bygge svargrunnlag", err); return null; }
  }

  function renderAhaAnswerComposer(answerPackage) {
    const status = document.getElementById("aha-answer-composer-status");
    const details = document.getElementById("aha-answer-composer-details");
    if (!status || !details) return;
    const pack = answerPackage && typeof answerPackage === "object" ? answerPackage : null;
    if (!pack) {
      status.textContent = "AHA Answer Composer er ikke tilgjengelig for denne meldingen.";
      details.innerHTML = "";
      return;
    }
    const st = pack.status || {};
    const retrievalMode = pack.context?.retrieval?.mode || (st.hasSemanticRetrieval ? "hybrid" : (st.hasRetrieval ? "lexical" : "none"));
    status.textContent = `AHA Answer Composer aktiv · intent: ${st.intent || "unknown"} · kilder: ${Number(st.selectedSourceCount) || 0} · retrieval mode: ${retrievalMode} · semantic available: ${st.hasSemanticRetrieval ? "ja" : "nei"} · ready: ${st.ready ? "ja" : "nei"}.`;
    const sources = Array.isArray(pack.context?.selectedSources) ? pack.context.selectedSources : [];
    const sections = Array.isArray(pack.context?.answerPlan?.sections) ? pack.context.answerPlan.sections.join(", ") : "kort svar, neste steg";
    details.innerHTML = `
      <article class="aha-personal-retrieval-result">
        <strong>Answer plan</strong>
        <span>${escHtml(pack.context?.answerPlan?.responseMode || "direct_answer")} · ${escHtml(sections)}</span>
        <small>${escHtml(pack.localPreview?.summary || "Lokal preview ikke tilgjengelig.")}</small>
      </article>
      ${sources.slice(0, 5).map((item) => `
        <article class="aha-personal-retrieval-result">
          <strong>${escHtml(item.title || item.source)}</strong>
          <span>${escHtml(item.sourceType || item.source)} · lexicalScore ${Number(item.lexicalScore) || 0} · semanticScore ${Number(item.semanticScore) || 0} · hybridScore ${Number(item.hybridScore) || 0}</span>
          <small>${escHtml((item.reasons || []).slice(0, 4).join(" · "))}</small>
        </article>
      `).join("")}
    `;
  }


  function renderAhaAnswerEvaluation(row, evaluation) {
    const panelStatus = document.getElementById("aha-answer-evaluation-status");
    if (panelStatus && evaluation) {
      panelStatus.textContent = `Svar-evaluering aktiv · score ${Number(evaluation.score) || 0}/100 · status ${evaluation.status || "unknown"} · training suggestion: ${evaluation.trainingSuggestion?.shouldCreateExample ? "ja" : "nei"}.`;
    }
    if (!row || !evaluation) return;
    const wrap = document.createElement("section");
    wrap.className = "aha-answer-evaluation";
    const dims = evaluation.dimensions || {};
    const used = Array.isArray(evaluation.sourceUse?.usedSources) ? evaluation.sourceUse.usedSources : [];
    const suggestions = Array.isArray(evaluation.improvementSuggestions) ? evaluation.improvementSuggestions : [];
    wrap.innerHTML = `
      <strong>AHA svar-evaluering</strong>
      <span>Score ${Number(evaluation.score) || 0}/100 · status ${escHtml(evaluation.status || "unknown")} · intent ${Number(dims.intentAlignment?.score) || 0} · source grounding ${Number(dims.sourceGrounding?.score) || 0} · personal relevance ${Number(dims.personalRelevance?.score) || 0} · next step ${Number(dims.nextStep?.score) || 0}</span>
      <details><summary>Svar-evaluering</summary>
        <div>Dimensjoner: intent ${Number(dims.intentAlignment?.score) || 0}, kilder ${Number(dims.sourceGrounding?.score) || 0}, personlig relevans ${Number(dims.personalRelevance?.score) || 0}, transparens ${Number(dims.transparency?.score) || 0}, neste steg ${Number(dims.nextStep?.score) || 0}.</div>
        <div>Kilder brukt: ${used.length ? used.map((s) => escHtml(s.title || s.sourceId || s.source)).join(" · ") : "Ingen tydelig kildebruk funnet."}</div>
        <ul>${suggestions.slice(0,5).map((x) => `<li>${escHtml(x)}</li>`).join("")}</ul>
        ${evaluation.trainingSuggestion?.shouldCreateExample ? `<button type="button" data-save-training-example="1">Lagre som training example</button> <a href="training.html">Åpne training.html</a>` : `<small>${escHtml(evaluation.trainingSuggestion?.reason || "Ingen training suggestion.")}</small>`}
      </details>`;
    const btn = wrap.querySelector('[data-save-training-example="1"]');
    btn?.addEventListener("click", () => {
      const api = global.AHATrainingExamples;
      const draft = evaluation.trainingSuggestion?.draftExample;
      if (api?.addExample && draft) {
        api.addExample({ ...draft, status: "needs_review" });
        btn.textContent = "Lagret som training example";
        btn.disabled = true;
      }
    });
    row.appendChild(wrap);
  }

  function evaluateAhaAnswerForChat(userMessage, answerText, answerPackage, row) {
    const api = global.AHAPersonalAnswerEvaluation;
    if (!api?.evaluateAnswer) return null;
    try {
      const activeRun = getActiveAnalysisRun();
      const evaluation = bindAnalysisArtifact(api.evaluateAnswer(userMessage, answerText, answerPackage), activeRun);
      const saved = api.saveEvaluation ? bindAnalysisArtifact(api.saveEvaluation(evaluation), activeRun) : evaluation;
      renderAhaAnswerEvaluation(row, saved);
      return saved;
    } catch (err) {
      console.warn("AHA svar-evaluering feilet", err);
      return null;
    }
  }

  function renderAhaPersonalContextStatus(statusArg = null) {
    const host = document.getElementById("aha-personal-context-status");
    if (!host) return null;
    const api = getAhaPersonalContextApi();
    if (!api || typeof api.getPersonalContextStatus !== "function") {
      host.textContent = "Personlig kontekst er ikke tilgjengelig ennå.";
      return null;
    }
    let status = statusArg;
    try { status = status || api.getPersonalContextStatus(); } catch { status = null; }
    if (!status) {
      host.textContent = "Personlig kontekst kunne ikke leses akkurat nå.";
      return null;
    }
    const active = status.available ? "AHA personlig kontekst aktiv" : "AHA personlig kontekst klar, men trenger mer godkjent materiale";
    const retrieval = status.retrievalAvailable ? ` Personlig søk aktiv (${Number(status.indexedItems) || 0} indeksert).` : "";
    const semantic = status.semanticRetrievalAvailable ? ` Semantisk søk aktiv (${Number(status.semanticIndexedItems) || 0} indeksert, ${status.semanticVectorModel || "local_semantic_v1"}). Retrieval mode: ${status.retrievalMode || "hybrid"}.` : "";
    host.textContent = `${active}. Readiness: ${status.readinessLevel || "ukjent"} (${Number(status.readinessScore) || 0}/100). Bekreftet selvinnsikt: ${Number(status.confirmedClaims) || 0}. Godkjent corpus: ${Number(status.approvedCorpus) || 0}. Godkjente examples: ${Number(status.approvedExamples) || 0}.${retrieval}${semantic}`;
    return status;
  }

  function renderAhaPersonalRetrieval(retrieval) {
    const status = document.getElementById("aha-personal-retrieval-status");
    const results = document.getElementById("aha-personal-retrieval-results");
    if (!status || !results) return;
    const hits = Array.isArray(retrieval?.results) ? retrieval.results : [];
    status.textContent = retrieval
      ? `Personlig søk aktiv. Semantisk søk ${retrieval.semanticAvailable ? "aktiv" : "ikke aktiv"}. Mode: ${retrieval.mode || "lexical"}. Query: «${retrieval.query || ""}». ${hits.length} relevante treff.`
      : "Personlig søk er ikke tilgjengelig for denne meldingen.";
    results.innerHTML = hits.slice(0, 3).map((item) => `
      <article class="aha-personal-retrieval-result">
        <strong>${escHtml(item.title || item.source)}</strong>
        <span>${escHtml(item.source)} · lexicalScore ${Number(item.lexicalScore ?? item.score) || 0} · semanticScore ${Number(item.semanticScore) || 0} · hybridScore ${Number(item.hybridScore) || 0}</span>
        <small>${escHtml((item.reasons || []).slice(0, 4).join(" · "))}</small>
      </article>
    `).join("");
  }


  const AHA_CHAT_READINESS_LABELS = {
    ready: "Ready",
    partially_ready: "Partially ready",
    blocked: "Blocked",
    unknown: "Unknown"
  };

  function compactAhaChatReadinessText(value, fallback) {
    const text = String(value || fallback || "")
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted]")
      .replace(/\b(?:sk|pk|ghp)_[A-Za-z0-9_\-]{6,}\b/gi, "[redacted]")
      .replace(/\b(?:api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi, "credential [redacted]")
      .replace(/\b(?:api[_-]?key|token|secret)\b/gi, "credential")
      .replace(/\s+/g, " ")
      .trim();
    return (text || String(fallback || "Manual review required.")).slice(0, 120);
  }

  function compactAhaChatReadinessList(items) {
    const seen = new Set();
    return (Array.isArray(items) ? items : [])
      .map((item) => compactAhaChatReadinessText(typeof item === "string" ? item : item?.title, "Review status"))
      .filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      })
      .slice(0, 3);
  }

  function failClosedAhaChatReadinessStatus(message) {
    return {
      state: "unknown",
      label: AHA_CHAT_READINESS_LABELS.unknown,
      message: compactAhaChatReadinessText(message, "Cached readiness is missing or invalid."),
      blockerCount: 0,
      warningCount: 0,
      topBlockers: [],
      topWarnings: [],
      operatorNextStep: "Manual audit/review required in Training Dashboard.",
      source: "cached_audit_summary",
      compactOnly: true,
      redacted: true,
      requiresManualReview: true
    };
  }

  function buildAhaPersonalAiLoopChatReadinessStatus(cachedSummaryOrAuditResult) {
    if (!cachedSummaryOrAuditResult || typeof cachedSummaryOrAuditResult !== "object" || Array.isArray(cachedSummaryOrAuditResult)) {
      return failClosedAhaChatReadinessStatus("Cached readiness is missing or invalid.");
    }

    const compact = cachedSummaryOrAuditResult.compactOperatorRecommendationSummary
      || cachedSummaryOrAuditResult.operatorRecommendationSummary
      || (global.AHAPersonalAiLoopAudit?.["buildCompact" + "OperatorRecommendationSummary"]
        ? global.AHAPersonalAiLoopAudit["buildCompact" + "OperatorRecommendationSummary"](cachedSummaryOrAuditResult)
        : null);
    const counts = compact && typeof compact === "object" ? (compact.countsBySeverity || {}) : {};
    const blockerCount = Math.max(0, Number(counts.blocker || cachedSummaryOrAuditResult.blockerCount || 0) || 0);
    const warningCount = Math.max(0, Number(counts.warning || cachedSummaryOrAuditResult.warningCount || 0) || 0);
    const topBlockerWarningTitles = compactAhaChatReadinessList(compact?.topBlockerWarningTitles);
    const topBlockers = compactAhaChatReadinessList(cachedSummaryOrAuditResult.topBlockers || compact?.topBlockers)
      .concat(topBlockerWarningTitles.slice(0, blockerCount ? 3 : 0))
      .slice(0, 3);
    const topWarnings = compactAhaChatReadinessList(cachedSummaryOrAuditResult.topWarnings || compact?.topWarnings)
      .concat(topBlockerWarningTitles.slice(blockerCount ? 0 : 0, warningCount ? 3 : 0))
      .slice(0, 3);
    const approved = cachedSummaryOrAuditResult.checks?.approvedMaterial || cachedSummaryOrAuditResult.approvedMaterial || {};
    const approvedMaterialCount = (Number(approved.approvedCorpus) || 0)
      + (Number(approved.approvedExamples) || 0)
      + (Number(approved.confirmedClaims) || 0)
      + (Number(approved.importantClaims) || 0);
    const compactAvailable = Boolean(compact && typeof compact === "object" && compact.compactOnly === true && compact.redacted === true);
    const auditStatus = String(cachedSummaryOrAuditResult.status || compact?.status || "").trim();

    let state = "unknown";
    if (blockerCount > 0) state = "blocked";
    else if (!compactAvailable || !approvedMaterialCount) state = "unknown";
    else if (warningCount > 0) state = "partially_ready";
    else if (["working", "strong", "ready"].includes(auditStatus) || cachedSummaryOrAuditResult.ready === true) state = "ready";
    else state = "partially_ready";

    const needsManual = state !== "ready";
    const message = state === "ready"
      ? "Personal AI Loop has compact cached readiness for Chat."
      : state === "partially_ready"
        ? "Personal AI Loop has warnings that need manual review."
        : state === "blocked"
          ? "Personal AI Loop has blockers that prevent Chat readiness."
          : "Personal AI Loop readiness cannot be confirmed from cache.";

    return {
      state,
      label: AHA_CHAT_READINESS_LABELS[state] || AHA_CHAT_READINESS_LABELS.unknown,
      message,
      blockerCount,
      warningCount,
      topBlockers: blockerCount ? (topBlockers.length ? topBlockers : ["Review blockers manually"]) : [],
      topWarnings: warningCount ? (topWarnings.length ? topWarnings : ["Review warnings manually"]) : [],
      operatorNextStep: compactAhaChatReadinessText(compact?.operatorNextStep || cachedSummaryOrAuditResult.operatorNextStep, "Manual audit/review required in Training Dashboard."),
      source: "cached_audit_summary",
      compactOnly: true,
      redacted: true,
      requiresManualReview: needsManual
    };
  }

  function renderAhaPersonalAiLoopStatus() {
    const host = document.getElementById("aha-personal-ai-loop-status");
    if (!host) return null;
    const api = global.AHAPersonalAiLoopAudit;
    let audit = null;
    if (api?.loadLastAudit) {
      try { audit = api.loadLastAudit(); } catch {}
    }
    const status = buildAhaPersonalAiLoopChatReadinessStatus(audit);
    const manual = status.requiresManualReview ? " Manual audit/review required." : "";
    const blockers = status.topBlockers.length ? ` Blockers: ${status.topBlockers.join(" · ")}.` : "";
    const warnings = status.topWarnings.length ? ` Warnings: ${status.topWarnings.join(" · ")}.` : "";
    host.textContent = `Chat readiness: ${status.label}. ${status.message} Blockers: ${status.blockerCount}. Warnings: ${status.warningCount}. Next step: ${status.operatorNextStep}.${manual}${blockers}${warnings}`;
    return status;
  }


  function renderAhaMemoryTransparency(row, memoryContext) {
    if (!row || !memoryContext) return null;
    const transparency = buildAhaMemoryTransparency(memoryContext);
    if (!transparency.visible) return null;

    const details = document.createElement("details");
    details.className = `memory-transparency${transparency.used ? "" : " memory-transparency-debug"}`;

    const summary = document.createElement("summary");
    summary.textContent = `${transparency.label} · ${transparency.used ? "Vis" : "Vis grunn"}`;
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "memory-transparency-details";

    if (!transparency.used) {
      const title = document.createElement("p");
      title.className = "memory-transparency-meta";
      title.textContent = "Minne ikke brukt";
      body.appendChild(title);
    }

    const meta = document.createElement("dl");
    meta.className = "memory-transparency-meta";
    [
      ["Grunn", transparency.reason || "Ukjent"],
      ["Modus", transparency.mode || "off"],
      ["Sikkerhet", Number(transparency.confidence || 0).toFixed(2)]
    ].forEach(([term, value]) => {
      const dt = document.createElement("dt");
      dt.textContent = term;
      const dd = document.createElement("dd");
      dd.textContent = value;
      meta.appendChild(dt);
      meta.appendChild(dd);
    });
    body.appendChild(meta);

    if (transparency.used && transparency.selectedInsights.length) {
      const listLabel = document.createElement("p");
      listLabel.className = "memory-transparency-list-label";
      listLabel.textContent = "Innsikter brukt:";
      body.appendChild(listLabel);

      const list = document.createElement("ol");
      list.className = "memory-transparency-list";
      transparency.selectedInsights.forEach((insight) => {
        const item = document.createElement("li");
        item.className = "memory-transparency-insight";
        const title = document.createElement("strong");
        title.textContent = insight.title;
        item.appendChild(title);
        if (insight.summary) {
          const summaryText = document.createElement("p");
          summaryText.textContent = insight.summary;
          item.appendChild(summaryText);
        }
        if (insight.concepts?.length) {
          const concepts = document.createElement("span");
          concepts.className = "memory-transparency-concepts";
          concepts.textContent = `Begreper: ${insight.concepts.join(", ")}`;
          item.appendChild(concepts);
        }
        const actions = document.createElement("div");
        actions.className = "memory-transparency-actions";
        if (insight.id) {
          const openBtn = document.createElement("button");
          openBtn.type = "button";
          openBtn.className = "memory-transparency-action";
          openBtn.textContent = "Åpne";
          openBtn.addEventListener("click", () => {
            showInsights();
            setStatusNote(`Viser innsiktspanel for ${insight.title}.`);
          });
          actions.appendChild(openBtn);
        }
        const excludeBtn = document.createElement("button");
        excludeBtn.type = "button";
        excludeBtn.className = "memory-transparency-action memory-transparency-exclude";
        excludeBtn.textContent = insight.excluded ? "Ekskludert fra fremtidig minnebruk" : "Ikke bruk igjen";
        excludeBtn.disabled = Boolean(insight.excluded);
        excludeBtn.addEventListener("click", () => {
          excludeAhaMemoryInsight(insight, "memory_transparency");
          insight.excluded = true;
          excludeBtn.textContent = "Ekskludert fra fremtidig minnebruk";
          excludeBtn.disabled = true;
          item.classList?.add?.("memory-transparency-insight-excluded");
          setStatusNote("Innsikten er fjernet fra fremtidig minnebruk.");
        });
        actions.appendChild(excludeBtn);
        item.appendChild(actions);
        if (insight.excluded) item.classList?.add?.("memory-transparency-insight-excluded");
        list.appendChild(item);
      });
      body.appendChild(list);
    }

    details.appendChild(body);
    row.appendChild(details);
    return details;
  }


  function escHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderAhaMemoryStatus(status) {
    const el = document.getElementById("aha-memory-status");
    if (!el) return;
    if (!status || typeof status !== "object") {
      el.textContent = "Minne kunne ikke leses akkurat nå.";
      return;
    }
    const local = status.local || {};
    const controls = normalizeAhaMemoryControls(status.controls || loadAhaMemoryControls());
    const savedCount = Number(local.activeInsights || 0);
    const savedAt = local.lastLocalSave ? formatAhaMemoryTimestamp(local.lastLocalSave) : "";
    const embeddingCode = String(status.embedding?.status || status.embedding?.reason || "");
    const backendWarning = embeddingCode === "backend_unreachable"
      ? `<span class="memory-warning">Backend utilgjengelig – semantisk minne kan være begrenset.</span>`
      : "";
    el.innerHTML = `
      <span><strong>Lokalt minne aktivt</strong></span>
      <span>${escHtml(String(savedCount))} innsikt${savedCount === 1 ? "" : "er"} lagret</span>
      ${savedAt ? `<span><strong>Siste lagring:</strong> ${escHtml(savedAt)}</span>` : ""}
      <span><strong>Lagring:</strong> ${controls.saveNewInsights ? "på" : "av"}</span>
      ${backendWarning}
    `;
  }

  function renderAhaMemoryControls(controls = loadAhaMemoryControls()) {
    const host = document.getElementById("aha-memory-controls");
    if (!host) return null;
    const current = normalizeAhaMemoryControls(controls);
    const excludedItems = getAhaExcludedMemoryItems();
    const exclusionCount = excludedItems.length;
    const visibleItems = excludedItems.slice(0, 20);
    const exclusionMarkup = visibleItems.length
      ? `<div class="aha-memory-exclusions-list">${visibleItems.map((item) => `
          <div class="aha-memory-exclusion-item">
            <div class="aha-memory-exclusion-copy">
              <div class="aha-memory-exclusion-title">${escHtml(item.title)}</div>
              <div class="aha-memory-exclusion-summary">${escHtml(item.summary || "Ingen sammendragstekst.")}</div>
              <div class="aha-memory-exclusion-meta">${item.foundInChamber ? "Funnet i innsiktskammer" : "Kun lokal nøkkel"}</div>
            </div>
            <div class="aha-memory-exclusion-actions">
              <button type="button" class="aha-memory-exclusion-btn" data-aha-memory-exclusion-action="include" data-aha-memory-exclusion-type="${escHtml(item.type)}" data-aha-memory-exclusion-value="${escHtml(item.value)}">Bruk igjen</button>
            </div>
          </div>
        `).join("")}</div>`
      : `<p class="aha-memory-exclusions-empty">Ingen innsikter er ekskludert fra minnebruk.</p>`;
    const overflowMarkup = excludedItems.length > visibleItems.length
      ? `<p class="aha-memory-exclusion-meta">Viser 20 av ${escHtml(String(excludedItems.length))} ekskluderte innsikter.</p>`
      : "";
    host.innerHTML = `
      <details class="aha-memory-controls-panel">
        <summary>Minnestyring</summary>
        <div class="aha-memory-controls-body">
          <label><input type="checkbox" data-aha-memory-control="saveNewInsights" ${current.saveNewInsights ? "checked" : ""}> Lagre nye innsikter fra chat</label>
          <label><input type="checkbox" data-aha-memory-control="useExistingMemory" ${current.useExistingMemory ? "checked" : ""}> Bruk relevant AHA-minne i svar</label>
          <div class="aha-memory-controls-status" aria-live="polite">
            <span><strong>Lagring:</strong> ${current.saveNewInsights ? "på" : "av"}</span>
            <span><strong>Minnebruk:</strong> ${current.useExistingMemory ? "på" : "av"}</span>
            <span><strong>Ekskluderte innsikter:</strong> ${escHtml(String(exclusionCount))}</span>
          </div>
          <details class="aha-memory-exclusions">
            <summary>Ekskluderte innsikter (${escHtml(String(exclusionCount))})</summary>
            <div class="aha-memory-exclusions-body">
              ${exclusionMarkup}
              ${overflowMarkup}
              <button type="button" class="aha-memory-exclusion-btn aha-memory-exclusion-reset" data-aha-memory-exclusion-action="reset" ${exclusionCount ? "" : "disabled"}>Nullstill ekskluderinger</button>
            </div>
          </details>
        </div>
      </details>
    `;
    return current;
  }

  function bindAhaMemoryControls() {
    const host = document.getElementById("aha-memory-controls");
    if (!host) return;
    renderAhaMemoryControls();
    host.addEventListener("change", (event) => {
      const input = event?.target;
      const key = input?.getAttribute?.("data-aha-memory-control");
      if (!key) return;
      const next = setAhaMemoryControl(key, Boolean(input.checked));
      renderAhaMemoryControls(next);
      setStatusNote(`Minnestyring oppdatert: lagring ${next.saveNewInsights ? "på" : "av"}, minnebruk ${next.useExistingMemory ? "på" : "av"}.`);
    });
    host.addEventListener("click", (event) => {
      const button = event?.target?.closest?.("[data-aha-memory-exclusion-action]") || event?.target;
      const action = button?.getAttribute?.("data-aha-memory-exclusion-action");
      if (!action) return;
      if (action === "include") {
        const value = button.getAttribute("data-aha-memory-exclusion-value") || "";
        includeAhaMemoryInsight(value);
        renderAhaMemoryControls();
        void updateAhaMemoryStatus();
        setStatusNote("Innsikten kan nå brukes som minne igjen.");
        return;
      }
      if (action === "reset") {
        resetAhaMemoryExclusions();
        renderAhaMemoryControls();
        void updateAhaMemoryStatus();
        setStatusNote("Alle minne-ekskluderinger er nullstilt.");
      }
    });
  }

  async function updateAhaMemoryStatus() {
    const el = document.getElementById("aha-memory-status");
    if (el) el.textContent = "Leser minnestatus …";
    try {
      const status = await buildAhaMemoryStatus();
      renderAhaMemoryStatus(status);
      return status;
    } catch (err) {
      console.warn("Minnestatus kunne ikke leses", err);
      if (el) el.textContent = "Minnestatus kunne ikke leses akkurat nå.";
      return null;
    }
  }

    return Object.freeze({
      getAhaPersonalContextApi,
      buildAhaPersonalMessageContext,
      buildAhaAnswerPackage,
      renderAhaAnswerComposer,
      renderAhaAnswerEvaluation,
      evaluateAhaAnswerForChat,
      renderAhaPersonalContextStatus,
      renderAhaPersonalRetrieval,
      compactAhaChatReadinessText,
      compactAhaChatReadinessList,
      failClosedAhaChatReadinessStatus,
      buildAhaPersonalAiLoopChatReadinessStatus,
      renderAhaPersonalAiLoopStatus,
      renderAhaMemoryTransparency,
      renderAhaMemoryStatus,
      renderAhaMemoryControls,
      bindAhaMemoryControls,
      updateAhaMemoryStatus
    });
  }

  global.AHAChatPersonalUi = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
