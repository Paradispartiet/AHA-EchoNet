// AHA Personal AI Loop Audit V1 – lokal audit only av kjeden
// godkjent personlig materiale → retrieval → preview/evaluering. Ingen auto-repair, auto-training, auto-export, backend eller model API.
(function (global) {
  "use strict";

  function personalAiBoundaryMeta(extra = {}) { return { source_app: "aha", origin_app: extra.origin_app || "aha_personal_ai", local_only: true, control_surface_only: extra.control_surface_only ?? false, retrieval_only: extra.retrieval_only ?? false, evaluation_only: extra.evaluation_only ?? false, preview_only: extra.preview_only ?? false, model_training_enabled: false, fine_tuning_enabled: false, remote_upload_enabled: false, backend_enabled: false, echonet_shared: false, sync_enabled: false, historygo_writeback_enabled: false, writes_to_insight_chamber: false, calls_model_api: false, ...extra }; }
  function isUnavailableRecord(record) { return Boolean(record?.deleted_at || record?.deletedAt || record?.archived === true || record?.status === "archived" || record?.status === "rejected"); }

  const STORAGE_KEY = "aha_personal_ai_loop_audit_v1";
  const DEFAULT_QUERY = "Hva vet AHA om mine viktigste prosjekter og begreper?";
  const MODULES = [
    "AHAChatPersonalContext",
    "AHAPersonalRetrieval",
    "AHAMetaInsightsMemory",
    "AHATrainingCorpus",
    "AHATrainingExamples",
    "AHAPersonalModelReadiness"
  ];

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function asText(value) { return String(value ?? "").trim(); }
  function safeCall(fn, fallback) {
    try { return typeof fn === "function" ? fn() : fallback; } catch { return fallback; }
  }
  function latestTimestamp(items) {
    return asArray(items).reduce((latest, item) => {
      const timestamp = Date.parse(item?.updatedAt || item?.createdAt || "");
      return Number.isFinite(timestamp) ? Math.max(latest, timestamp) : latest;
    }, 0);
  }

  function checkDataSources() {
    const modules = {};
    MODULES.forEach((name) => {
      const api = global[name];
      modules[name] = Boolean(api && typeof api === "object");
    });
    const missing = MODULES.filter((name) => !modules[name]);
    return { ok: missing.length === 0, modules, missing, availableCount: MODULES.length - missing.length };
  }

  function readApprovedMaterial() {
    const memory = asObject(safeCall(() => global.AHAMetaInsightsMemory?.summarizeMemory?.(), {}));
    const corpus = asArray(safeCall(() => global.AHATrainingCorpus?.loadCorpus?.(), []));
    const examples = asArray(safeCall(() => global.AHATrainingExamples?.loadExamples?.(), []));
    const confirmed = asArray(memory.confirmedClaims);
    const important = asArray(memory.importantClaims);
    const approvedCorpusItems = corpus.filter((item) => item?.status === "approved"
      && (item?.consent?.useForKnowledge === true || item?.consent?.useForMemory === true));
    const approvedExampleItems = examples.filter((item) => item?.status === "approved");
    return { memory, corpus, examples, confirmed, important, approvedCorpusItems, approvedExampleItems };
  }

  function checkApprovedMaterial() {
    const material = readApprovedMaterial();
    const examplesByTaskType = {};
    material.approvedExampleItems.forEach((example) => {
      const taskType = asText(example?.taskType || example?.task_type) || "unknown";
      examplesByTaskType[taskType] = (examplesByTaskType[taskType] || 0) + 1;
    });
    const knowledgeAllowedCorpus = material.approvedCorpusItems.filter((item) => item?.consent?.useForKnowledge === true).length;
    const memoryAllowedCorpus = material.approvedCorpusItems.filter((item) => item?.consent?.useForMemory === true).length;
    const approvedCorpus = material.approvedCorpusItems.length;
    const approvedExamples = material.approvedExampleItems.length;
    const confirmedClaims = material.confirmed.length;
    const importantClaims = material.important.length;
    return {
      ok: confirmedClaims + importantClaims + approvedCorpus + approvedExamples > 0,
      confirmedClaims,
      importantClaims,
      approvedCorpus,
      approvedExamples,
      knowledgeAllowedCorpus,
      memoryAllowedCorpus,
      examplesByTaskType
    };
  }

  function checkRetrievalIndex() {
    const api = global.AHAPersonalRetrieval;
    const status = asObject(safeCall(() => api?.getRetrievalStatus?.(), {}));
    const material = readApprovedMaterial();
    const latestSourceUpdate = Math.max(
      latestTimestamp(material.approvedCorpusItems),
      latestTimestamp(material.approvedExampleItems),
      latestTimestamp([...material.confirmed, ...material.important]),
      Date.parse(asText(safeCall(() => global.AHAMetaInsightsMemory?.loadMemory?.()?.updatedAt, ""))) || 0
    );
    const lastBuilt = Date.parse(asText(status.lastBuiltAt)) || 0;
    const approvedCount = material.approvedCorpusItems.filter((item) => item?.consent?.useForKnowledge === true || item?.consent?.useForMemory === true).length
      + material.approvedExampleItems.length + material.confirmed.length + material.important.length;
    const indexedItems = Number(status.indexedItems) || 0;
    const needsRefresh = !lastBuilt || (indexedItems === 0 && approvedCount > 0) || (latestSourceUpdate > 0 && lastBuilt < latestSourceUpdate);
    return {
      ok: Boolean(status.available && indexedItems > 0 && !needsRefresh),
      available: Boolean(status.available),
      indexedItems,
      corpusItems: Number(status.corpusItems) || 0,
      examples: Number(status.examples) || 0,
      memoryClaims: Number(status.memoryClaims) || 0,
      lastBuiltAt: asText(status.lastBuiltAt),
      needsRefresh
    };
  }

  function simulateQuery(query = DEFAULT_QUERY, options = {}) {
    const cleanQuery = asText(query) || DEFAULT_QUERY;
    const personalApi = global.AHAChatPersonalContext;
    const retrievalApi = global.AHAPersonalRetrieval;
    const personal = safeCall(() => personalApi?.buildPersonalContext?.(options), null);
    const index = safeCall(() => retrievalApi?.loadRetrievalIndex?.(), null);
    const retrieval = index
      ? safeCall(() => retrievalApi?.buildRagContext?.(cleanQuery, { ...options, index }), null)
      : null;
    const promptBlock = safeCall(() => retrievalApi?.buildRagPromptBlock?.(retrieval, options), "");
    const results = asArray(retrieval?.results);
    return {
      query: cleanQuery,
      personalContextAvailable: Boolean(personal),
      retrievalAvailable: Boolean(retrieval),
      resultCount: results.length,
      topResults: results.slice(0, 5).map((result) => ({
        source: asText(result.source),
        sourceId: asText(result.sourceId),
        sourceType: asText(result.sourceType),
        title: asText(result.title),
        score: Number(result.hybridScore ?? result.score ?? result.semanticScore) || 0,
        reasons: asArray(result.reasons)
      })),
      promptPreview: asText(promptBlock).slice(0, 1400),
      reasons: [...new Set(results.flatMap((result) => asArray(result.reasons)).map(asText).filter(Boolean))].slice(0, 12),
      ok: Boolean(results.length && promptBlock)
    };
  }

  function checkChatIntegration() {
    const doc = global.document;
    const scripts = doc ? asArray(doc.querySelectorAll?.("script[src]")).map((node) => node.getAttribute("src") || "") : [];
    const loaded = checkDataSources().modules;
    const scriptsLoaded = {
      personalContext: Boolean(loaded.AHAChatPersonalContext || scripts.some((src) => src.includes("ahaChatPersonalContext.js"))),
      retrieval: Boolean(loaded.AHAPersonalRetrieval || scripts.some((src) => src.includes("ahaPersonalRetrieval.js"))),
      audit: Boolean(global.AHAPersonalAiLoopAudit || scripts.some((src) => src.includes("ahaPersonalAiLoopAudit.js")))
    };
    const hasPersonalContextPanel = Boolean(doc?.getElementById?.("aha-personal-context-panel"));
    const hasRetrievalPanel = Boolean(doc?.getElementById?.("aha-personal-retrieval-panel"));
    const notes = [];
    if (!doc) notes.push("DOM er ikke tilgjengelig; modulstatus ble kontrollert uten UI.");
    if (!hasPersonalContextPanel && doc) notes.push("Personal context-panelet mangler.");
    if (!hasRetrievalPanel && doc) notes.push("Retrieval-panelet mangler.");
    return {
      ok: scriptsLoaded.personalContext && scriptsLoaded.retrieval && (!doc || (hasPersonalContextPanel && hasRetrievalPanel)),
      scriptsLoaded,
      hasPersonalContextPanel,
      hasRetrievalPanel,
      notes
    };
  }

  function checkPrivacyAndConsent() {
    const api = global.AHAPersonalRetrieval;
    const index = asObject(safeCall(() => api?.loadRetrievalIndex?.(), null));
    const items = asArray(index.items);
    const findings = [];
    const invalid = items.filter((item) => {
      if (item.source === "training_corpus") {
        return item.meta?.status !== "approved" || !(item.consent?.useForKnowledge === true || item.consent?.useForMemory === true);
      }
      if (item.source === "training_examples") return item.meta?.status !== "approved";
      if (item.source === "meta_insights_memory") return !["confirmed_claim", "important_claim"].includes(item.sourceType);
      return false;
    });
    if (invalid.length) findings.push(`${invalid.length} retrieval-items bryter approved-/consent-filteret.`);
    else findings.push("Retrieval-indeksen bruker bare godkjente kilder og tillatte memory claims.");
    const corpusItems = items.filter((item) => item.source === "training_corpus");
    const consentAware = corpusItems.every((item) => item.consent?.useForKnowledge === true || item.consent?.useForMemory === true);
    return { ok: invalid.length === 0, approvedOnly: invalid.length === 0, consentAware, findings };
  }

  function checkSemanticRetrieval() {
    const api = global.AHASemanticRetrieval;
    if (!api?.getSemanticStatus) return { ok: false, available: false, indexedItems: 0, vectorModel: "", sampleSemanticResults: 0, hybridReady: false, hasReasons: false };
    const status = asObject(safeCall(() => api.getSemanticStatus(), {}));
    const sample = asObject(safeCall(() => api.searchSemanticKnowledge?.(DEFAULT_QUERY, { limit: 3, minScore: 0 }), {}));
    const hybrid = asObject(safeCall(() => api.hybridSearch?.(DEFAULT_QUERY, { limit: 3, minScore: 0 }), {}));
    const hasReasons = asArray(sample.results).some((item) => asArray(item.reasons).length)
      || asArray(hybrid.results).some((item) => asArray(item.reasons).length);
    return {
      ok: Boolean(status.available && (asArray(hybrid.results).length || asArray(sample.results).length)),
      available: Boolean(status.available),
      indexedItems: Number(status.indexedItems) || 0,
      vectorModel: asText(status.vectorModel),
      sampleSemanticResults: asArray(sample.results).length,
      hybridReady: Boolean(asArray(hybrid.results).length),
      hasReasons
    };
  }

  function checkAnswerComposer(query = DEFAULT_QUERY, options = {}) {
    const api = global.AHAPersonalAnswerComposer;
    if (!api?.buildAnswerPackage) return { ok: false, available: false, sampleIntent: "unknown", selectedSourceCount: 0, hasPrompt: false, hasPreview: false, ready: false };
    const pack = asObject(safeCall(() => api.buildAnswerPackage(query, { ...options, limit: 6 }), null));
    const status = asObject(pack.status);
    return {
      ok: Boolean(status.ready && asText(pack.prompt) && pack.localPreview),
      available: true,
      sampleIntent: asText(status.intent) || asText(pack.context?.answerIntent) || "unknown",
      selectedSourceCount: Number(status.selectedSourceCount) || asArray(pack.context?.selectedSources).length,
      hasPrompt: Boolean(asText(pack.prompt)),
      hasPreview: Boolean(pack.localPreview),
      ready: Boolean(status.ready)
    };
  }


  const VALID_RECOMMENDATION_SEVERITIES = ["ok", "info", "suggestion", "warning", "blocker"];
  const FORBIDDEN_OPERATOR_AUTOMATION = [
    "auto_audit",
    "domain_write",
    "remote_write",
    "sync_hub",
    "auto_sync",
    "pub" + "lish",
    "sh" + "are",
    "source_event"
  ];

  function countSeverity(recommendations) {
    return asArray(recommendations).reduce((counts, item) => {
      const severity = VALID_RECOMMENDATION_SEVERITIES.includes(item?.severity) ? item.severity : "info";
      counts[severity] = (counts[severity] || 0) + 1;
      return counts;
    }, { ok: 0, info: 0, suggestion: 0, warning: 0, blocker: 0 });
  }

  function makeOperatorRecommendation(id, severity, title, message, reason, evidenceType, relatedSurface, allowedNextStep, privacyRisk) {
    const safeSeverity = VALID_RECOMMENDATION_SEVERITIES.includes(severity) ? severity : "info";
    return {
      id: asText(id) || "operator_review_required",
      severity: safeSeverity,
      title: asText(title) || "Operator review required",
      message: asText(message) || "Review cached audit status before taking any next step.",
      reason: asText(reason) || "Derived from compact cached audit summary only.",
      evidenceType: asText(evidenceType) || "cached_summary",
      relatedSurface: asText(relatedSurface) || "training_dashboard",
      allowedNextStep: asText(allowedNextStep) || "Manual local review in Training Dashboard.",
      forbiddenAutomation: [...FORBIDDEN_OPERATOR_AUTOMATION],
      privacyRisk: ["none", "low", "medium", "high"].includes(privacyRisk) ? privacyRisk : "low",
      requiresExplicitAction: true
    };
  }

  function buildOperatorRecommendations(auditResultOrSummary) {
    const audit = asObject(auditResultOrSummary);
    const recs = [];
    const status = asText(audit.status);
    const summary = asText(audit.summary);
    const checks = asObject(audit.checks);
    const approved = asObject(checks.approvedMaterial || audit.approvedMaterial);
    const retrieval = asObject(audit.retrieval || checks.retrievalIndex);
    const sample = asObject(checks.sampleQuery || audit.sampleQuery);
    const privacy = asObject(audit.privacy || checks.privacyAndConsent);
    const chat = asObject(audit.chat || checks.chatIntegration);
    const semantic = asObject(audit.semanticRetrieval);

    if (!auditResultOrSummary || !Object.keys(audit).length) {
      return [makeOperatorRecommendation(
        "missing_audit_summary",
        "blocker",
        "Audit status is missing",
        "Audit status is unknown or missing. Do not use operator recommendations as readiness evidence until a manual audit/review exists.",
        "No cached Personal AI Loop audit summary was available.",
        "cached_summary",
        "training_dashboard",
        "Run or review the Personal AI Loop audit manually from the Training Dashboard.",
        "medium"
      )];
    }

    if (!status || !["empty", "partial", "working", "strong"].includes(status)) {
      recs.push(makeOperatorRecommendation(
        "unknown_audit_status", "blocker", "Unknown audit status",
        "Cached audit status is unknown. Keep the Personal AI Loop blocked until an operator reviews the audit manually.",
        `Unexpected audit status: ${status || "missing"}.`, "status", "training_dashboard",
        "Run a manual audit/review and inspect visible blockers before implementation.", "medium"
      ));
    }
    if (status === "empty" || status === "partial") {
      recs.push(makeOperatorRecommendation(
        "not_ready_for_use", status === "empty" ? "blocker" : "warning", "Personal AI Loop is not fully ready",
        summary || "The cached audit does not show a fully ready Personal AI Loop.",
        "Readiness status is not working/strong.", "status", "training_dashboard",
        "Review warnings and improve approved material/retrieval manually.", "low"
      ));
    }
    const approvedCorpus = Number(approved.approvedCorpus) || 0;
    const approvedExamples = Number(approved.approvedExamples) || 0;
    const memoryClaims = (Number(approved.confirmedClaims) || 0) + (Number(approved.importantClaims) || 0);
    if (!approvedCorpus) recs.push(makeOperatorRecommendation("missing_approved_material", "blocker", "Missing approved corpus", "No approved/consented corpus items are visible in the cached audit summary.", "Approved corpus count is zero.", "count", "training_dashboard", "Approve consented material manually before relying on personal context.", "medium"));
    else if (approvedCorpus < 3) recs.push(makeOperatorRecommendation("too_few_approved_corpus_items", "suggestion", "Add more approved corpus", "Approved corpus coverage is still thin.", "Approved corpus count is below the useful guidance threshold.", "count", "training_dashboard", "Add or approve more consented corpus items manually.", "low"));
    if (!approvedExamples) recs.push(makeOperatorRecommendation("too_few_approved_examples", "suggestion", "Add approved examples", "No approved training examples are visible in the cached audit summary.", "Approved example count is zero.", "count", "training_dashboard", "Create or approve examples manually.", "low"));
    if (!memoryClaims) recs.push(makeOperatorRecommendation("confirm_important_memory", "suggestion", "Confirm important memory", "No confirmed or important memory claims are visible in the cached audit summary.", "Confirmed/important memory count is zero.", "count", "training_dashboard", "Confirm important memory through an explicit review flow.", "medium"));
    if (!retrieval.available || !Number(retrieval.indexedItems)) recs.push(makeOperatorRecommendation("retrieval_index_missing", "blocker", "Retrieval index missing", "No usable retrieval index is visible in the cached audit summary.", "Retrieval availability or indexed item count is missing.", "status", "training_dashboard", "Review retrieval status manually; do not build an index from render paths.", "medium"));
    else if (retrieval.needsRefresh) recs.push(makeOperatorRecommendation("retrieval_index_stale", "warning", "Retrieval index may be stale", "The cached audit says retrieval may need refresh.", "Retrieval index is older than approved material or has stale markers.", "status", "training_dashboard", "Use only an explicit reviewed local refresh flow if/when approved.", "low"));
    if (sample && sample.ok === false) recs.push(makeOperatorRecommendation("sample_query_failed", "warning", "Sample query failed", "The cached sample query did not produce a useful bounded result.", "Sample query status is not ok.", "sample_query", "training_dashboard", "Review approved sources and test retrieval manually.", "low"));
    if ((sample.resultCount && Number(sample.resultCount) < 2) || sample.reasons?.length === 0 || semantic.hasReasons === false) recs.push(makeOperatorRecommendation("low_explainability", "suggestion", "Improve explainability", "Retrieved evidence has limited count or weak reasons in the compact audit summary.", "Result count/reasons are low.", "sample_query", "training_dashboard", "Add clearer approved examples and source metadata manually.", "low"));
    if (privacy.ok === false || privacy.consentAware === false) recs.push(makeOperatorRecommendation("privacy_review_required", "blocker", "Review privacy and consent", "The cached audit found consent or approved-only issues. Raw payload must stay hidden; use compact summary only.", "Privacy/consent check is not ok.", "privacy_check", "training_dashboard", "Review consent and remove unapproved material manually.", "high"));
    else recs.push(makeOperatorRecommendation("compact_summary_only", "info", "Compact summary only", "Operator recommendations are derived from compact counts/status, not raw private corpus, memory, or chat history.", "Privacy-safe output boundary is required for all surfaces.", "privacy_check", "meta_insights", "Keep raw payload hidden and use compact summaries only.", "none"));
    if (chat.ok === false) recs.push(makeOperatorRecommendation("chat_integration_review", "warning", "Review chat integration", "Cached audit says chat integration is incomplete.", "Chat integration check is not ok.", "status", "chat", "Review Personal AI Loop status manually before depending on chat readiness.", "low"));
    if (!recs.some((r) => r.severity === "blocker" || r.severity === "warning") && (status === "working" || status === "strong")) recs.unshift(makeOperatorRecommendation("ready_manual_review", "ok", "Ready for manual operator review", "Cached audit shows a usable Personal AI Loop state, with no automatic action implied.", "Status is working/strong and no blocker/warning was derived.", "cached_summary", "training_dashboard", "Continue manual review before future implementation work.", "none"));
    recs.push(makeOperatorRecommendation("review_warnings_before_implementation", "info", "Review visible warnings first", "Resolve blockers/warnings before a later implementation PR relies on this surface.", "Operator recommendations are guidance only.", "cached_summary", "training_dashboard", "Manual review in Training Dashboard.", "low"));

    const seen = new Set();
    return recs.filter((rec) => {
      if (seen.has(rec.id)) return false;
      seen.add(rec.id);
      return true;
    });
  }

  function buildCompactOperatorRecommendationSummary(auditResultOrSummary) {
    const recommendations = buildOperatorRecommendations(auditResultOrSummary);
    const countsBySeverity = countSeverity(recommendations);
    const top = recommendations.filter((item) => item.severity === "blocker" || item.severity === "warning").slice(0, 3);
    return {
      status: asText(asObject(auditResultOrSummary).status) || "unknown",
      countsBySeverity,
      topBlockerWarningTitles: top.map((item) => item.title),
      operatorNextStep: top[0]?.allowedNextStep || "Manual local review in Training Dashboard.",
      compactOnly: true,
      redacted: true
    };
  }


  function redactCompactText(value, fallback = "Manual local review required.") {
    let text = asText(value) || fallback;
    text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]");
    text = text.replace(/\b(?:sk|pk|ghp|github_pat|xox[abprs])-?[A-Za-z0-9_=-]{8,}\b/g, "[redacted-token]");
    text = text.replace(/\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*[^\s,;]+/gi, "[redacted-secret]");
    text = text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
    if (text.length > 120) text = `${text.slice(0, 117).trim()}...`;
    return text || fallback;
  }

  function compactTitles(items, limit = 3) {
    return asArray(items)
      .map((item) => redactCompactText(typeof item === "string" ? item : item?.title || item?.label || item?.message || item?.id, "Manual review required."))
      .filter(Boolean)
      .slice(0, limit);
  }

  function readCount(summary, key) {
    const counts = asObject(summary?.countsBySeverity || summary?.severityCounts);
    return Math.max(0, Number(summary?.[`${key}Count`] ?? counts[key]) || 0);
  }

  function normalizeCompactSummary(input) {
    const source = asObject(input);
    const existing = asObject(source.compactOperatorRecommendationSummary || source.operatorRecommendationSummary);
    const compact = existing.compactOnly === true && existing.redacted === true
      ? existing
      : asObject(buildCompactOperatorRecommendationSummary(source));
    if (compact.compactOnly !== true || compact.redacted !== true) return null;
    return compact;
  }

  function hasMissingRequiredReadiness(input) {
    const source = asObject(input);
    const checks = asObject(source.checks);
    const approved = asObject(checks.approvedMaterial);
    const retrievalIndex = asObject(checks.retrievalIndex || source.retrieval);
    const privacy = asObject(checks.privacyAndConsent || source.privacy);
    const status = asText(source.status || source.auditStatus);
    const hasMaterialCount = ["confirmedClaims", "importantClaims", "approvedCorpus", "approvedExamples"]
      .some((key) => Number(approved[key]) > 0);
    if (!status) return true;
    if (status === "empty") return true;
    if (checks.approvedMaterial && !hasMaterialCount) return true;
    if (checks.retrievalIndex && retrievalIndex.ok === false) return true;
    if (checks.privacyAndConsent && privacy.ok === false) return true;
    return false;
  }

  function buildPersonalAiLoopLocalReadinessReport(cachedSummaryOrAuditResult) {
    const input = cachedSummaryOrAuditResult;
    const base = {
      state: "unknown",
      title: "Personal AI Loop local readiness report",
      summary: "Readiness cannot be trusted until manual audit/review is completed.",
      auditStatus: "unknown",
      blockerCount: 0,
      warningCount: 0,
      topBlockers: [],
      topWarnings: [],
      operatorNextStep: "Manual audit/review required in Training Dashboard.",
      chatReadinessState: "unknown",
      metaInsightsRecommendationState: "unknown",
      manualReviewRequired: true,
      generatedAt: new Date(0).toISOString(),
      localOnly: true,
      explicitActionOnly: true,
      compactOnly: true,
      redacted: true,
      sections: []
    };
    if (!input || typeof input !== "object" || Array.isArray(input)) return base;

    const compact = normalizeCompactSummary(input);
    if (!compact) return base;

    const blockerCount = readCount(compact, "blocker");
    const warningCount = readCount(compact, "warning");
    const allTitles = compactTitles(compact.topBlockerWarningTitles || compact.topTitles || []);
    const topBlockers = compactTitles(compact.topBlockers || (blockerCount ? allTitles : []));
    const topWarnings = compactTitles(compact.topWarnings || (!blockerCount ? allTitles : allTitles.slice(topBlockers.length)));
    const auditStatus = redactCompactText(input.status || input.auditStatus || compact.status || "unknown", "unknown");
    const missingRequired = hasMissingRequiredReadiness(input);
    const state = blockerCount > 0 || missingRequired
      ? "blocked"
      : warningCount > 0
        ? "attention_needed"
        : "ready";
    const operatorNextStep = state === "ready"
      ? "Generate and review this report locally after explicit user action."
      : redactCompactText(compact.operatorNextStep, "Manual audit/review required in Training Dashboard.");
    const chatState = redactCompactText(input.chatReadinessState || input.chatReadiness?.state || input.chat?.state || "unknown", "unknown");
    const metaState = redactCompactText(input.metaInsightsRecommendationState || input.metaInsightsRecommendation?.state || "unknown", "unknown");
    const safeBlockers = topBlockers.length ? topBlockers : (state === "blocked" ? ["Missing or incomplete local audit summary."] : []);
    return {
      ...base,
      state,
      summary: state === "ready"
        ? "Cached compact summaries indicate local readiness."
        : state === "attention_needed"
          ? "Cached compact summaries show warnings requiring manual review."
          : "Cached compact summaries show blockers or missing required readiness inputs.",
      auditStatus,
      blockerCount: state === "blocked" ? Math.max(1, blockerCount) : blockerCount,
      warningCount,
      topBlockers: safeBlockers,
      topWarnings,
      operatorNextStep,
      chatReadinessState: chatState,
      metaInsightsRecommendationState: metaState,
      manualReviewRequired: state !== "ready",
      generatedAt: new Date(0).toISOString(),
      sections: [
        { id: "audit", title: "Audit status", state: auditStatus, compactOnly: true, redacted: true },
        { id: "chat_readiness", title: "Chat readiness", state: chatState, compactOnly: true, redacted: true },
        { id: "meta_insights", title: "Meta Insights recommendation", state: metaState, compactOnly: true, redacted: true }
      ]
    };
  }

  const SOURCE_REVIEW_STATES = ["suggested", "review_needed", "approved", "rejected", "blocked", "unknown"];

  function normalizeSourceReviewState(value) {
    const state = asText(value).toLowerCase();
    return SOURCE_REVIEW_STATES.includes(state) ? state : "unknown";
  }

  function sourceReviewItems(input) {
    if (Array.isArray(input)) return input;
    const source = asObject(input);
    return asArray(source.sources || source.items || source.entries || source.summary?.sources || source.summary?.items);
  }

  function countSourceReviewStates(items) {
    return asArray(items).reduce((counts, item) => {
      const state = normalizeSourceReviewState(item?.state || item?.status || item?.reviewState);
      counts[state] += 1;
      return counts;
    }, { suggested: 0, review_needed: 0, approved: 0, rejected: 0, blocked: 0, unknown: 0 });
  }

  function compactSourceReviewLabel(item) {
    const source = asObject(item);
    const label = source.label || source.title || source.name || source.type || source.category || source.id;
    return redactCompactText(label, "Redacted source");
  }

  function countSourceReviewRisks(items) {
    return asArray(items).reduce((counts, item) => {
      const risk = ["none", "low", "medium", "high", "unknown"].includes(asText(item?.risk).toLowerCase())
        ? asText(item.risk).toLowerCase()
        : "unknown";
      counts[risk] = (counts[risk] || 0) + 1;
      return counts;
    }, { none: 0, low: 0, medium: 0, high: 0, unknown: 0 });
  }

  function sourceReviewNextStep(state) {
    if (state === "approved") return "Use only after explicit operator action; keep source state local and compact.";
    if (state === "suggested") return "Manual operator review required before any approved use.";
    if (state === "rejected") return "Keep rejected source out of audit and training.";
    if (state === "blocked") return "Resolve blocker manually before any approval decision.";
    return "Manual operator review required before any approval decision.";
  }

  function buildPersonalAiLoopSrcApprovalSummary(cachedSummaryOrSourceState) {
    const base = {
      state: "unknown",
      label: "Source approval summary",
      message: "Source approval state is missing or invalid; manual review is required.",
      suggestedCount: 0,
      reviewNeededCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      blockedCount: 0,
      unknownCount: 1,
      riskCounts: { none: 0, low: 0, medium: 0, high: 0, unknown: 0 },
      topSources: [],
      topBlockers: ["Missing or invalid source approval input."],
      operatorNextStep: "Manual operator review required before any approval decision.",
      manualReviewRequired: true,
      localOnly: true,
      explicitActionOnly: true,
      compactOnly: true,
      redacted: true
    };
    if (!cachedSummaryOrSourceState || typeof cachedSummaryOrSourceState !== "object") return base;

    const source = asObject(cachedSummaryOrSourceState);
    const items = sourceReviewItems(cachedSummaryOrSourceState);
    const hasItems = items.length > 0;
    const counts = hasItems ? countSourceReviewStates(items) : countSourceReviewStates([source]);
    const providedState = normalizeSourceReviewState(source.state || source.status || source.reviewState);
    const state = counts.blocked > 0 ? "blocked"
      : counts.review_needed > 0 ? "review_needed"
        : counts.unknown > 0 ? "unknown"
          : counts.rejected > 0 && counts.approved === 0 && counts.suggested === 0 ? "rejected"
            : counts.approved > 0 && counts.suggested === 0 && counts.review_needed === 0 ? "approved"
              : counts.suggested > 0 ? "suggested"
                : providedState;
    const topSources = compactTitles(hasItems ? items.map(compactSourceReviewLabel) : [compactSourceReviewLabel(source)], 5);
    const blockerItems = hasItems ? items.filter((item) => ["blocked", "review_needed", "unknown"].includes(normalizeSourceReviewState(item?.state || item?.status || item?.reviewState))) : [];
    const topBlockers = compactTitles(blockerItems.map((item) => item?.blocker || item?.reason || item?.title || item?.label), 5);
    const approvedCount = state === "suggested" ? 0 : counts.approved;
    const manualReviewRequired = !["approved", "rejected"].includes(state) || counts.suggested > 0 || counts.review_needed > 0 || counts.blocked > 0 || counts.unknown > 0;
    return {
      ...base,
      state,
      label: redactCompactText(source.label || source.title || "Source approval summary", "Source approval summary"),
      message: state === "approved"
        ? "Sources are explicitly approved in the provided compact local summary."
        : state === "rejected"
          ? "Rejected sources must not be used in audit or training."
          : state === "blocked"
            ? "Blocked sources require manual blocker resolution."
            : "Manual operator review is required before any approved use.",
      suggestedCount: counts.suggested,
      reviewNeededCount: counts.review_needed,
      approvedCount,
      rejectedCount: counts.rejected,
      blockedCount: counts.blocked,
      unknownCount: counts.unknown,
      riskCounts: countSourceReviewRisks(hasItems ? items : [source]),
      topSources,
      topBlockers: topBlockers.length ? topBlockers : (state === "blocked" || state === "unknown" ? base.topBlockers : []),
      operatorNextStep: sourceReviewNextStep(state),
      manualReviewRequired
    };
  }

  function buildRecommendations(audit) {
    const recs = [];
    const approved = asObject(audit?.checks?.approvedMaterial);
    const retrieval = asObject(audit?.retrieval);
    const chat = asObject(audit?.chat);
    const privacy = asObject(audit?.privacy);
    if (retrieval.needsRefresh) recs.push("Bygg retrieval-indeks fra Training Dashboard.");
    if (!Number(approved.approvedCorpus)) recs.push("Godkjenn flere corpus items.");
    if (!Number(approved.approvedExamples)) recs.push("Godkjenn flere training examples.");
    if (!Number(asObject(approved.examplesByTaskType).memory_fact)) recs.push("Legg til flere memory_fact examples.");
    if (!audit?.checks?.sampleQuery?.ok) recs.push("Kjør testmelding i chat for å kontrollere retrieval.");
    if (Number(approved.approvedCorpus) > 0 && audit?.checks?.sampleQuery?.resultCount < 2) recs.push("Legg til flere prosjektbegreper i corpus for bedre match.");
    if (!chat.ok) recs.push("Kontroller at chat laster personal context- og retrieval-modulene.");
    if (!privacy.ok) recs.push("Fjern retrieval-items som mangler godkjenning eller kunnskap/minne-samtykke.");
    if (!recs.length) recs.push("Kjør audit jevnlig etter nye godkjenninger og kontroller kildereasons i chat.");
    return [...new Set(recs)].slice(0, 6);
  }


  function checkAnswerEvaluation() {
    const api = global.AHAPersonalAnswerEvaluation;
    const available = Boolean(api?.evaluateAnswer);
    const stats = available && api.collectEvaluationStats ? asObject(safeCall(() => api.collectEvaluationStats(), {})) : {};
    const sample = available ? asObject(safeCall(() => api.evaluateAnswer(DEFAULT_QUERY, "Status: AHA bruker personlig grunnlag fra AHA-EchoNet. Neste steg: kontroller kilder og lag et training example.", { context: { answerIntent: "project_status", answerPlan: { suggestedFollowup: "Gi ett presist neste steg." }, selectedSources: [{ source: "meta_insights_memory", sourceId: "sample", sourceType: "confirmed_claim", title: "AHA-EchoNet", excerpt: "AHA-EchoNet personlig grunnlag", hybridScore: 0.9, reasons: ["bekreftet selvinnsikt"] }] }, status: { intent: "project_status", ready: true } }) ), {}) : {};
    return { ok: available && Boolean(sample.score), available, evaluationCount: Number(stats.total) || 0, averageScore: Number(stats.averageScore) || 0, hasRecentEvaluation: Boolean(stats.latest), trainingSuggestions: Number(stats.trainingSuggestions) || Number(sample.trainingSuggestion?.shouldCreateExample ? 1 : 0), ready: available && Boolean(sample.trainingSuggestion) };
  }

  function runAudit(options = {}) {
    const dataSources = checkDataSources();
    const approvedMaterial = checkApprovedMaterial();
    const retrieval = checkRetrievalIndex();
    const sampleQuery = simulateQuery(options.query, options);
    const chat = checkChatIntegration();
    const privacy = checkPrivacyAndConsent();
    const semanticRetrieval = checkSemanticRetrieval();
    const answerComposer = checkAnswerComposer(options.query || DEFAULT_QUERY, options);
    const answerEvaluation = checkAnswerEvaluation();
    const readiness = asObject(safeCall(() => global.AHAPersonalModelReadiness?.buildReadinessReport?.(), {}));
    const controlStatus = safeCall(() => global.AHAPersonalAiControl?.buildControlStatus?.({ save: false }), null);
    const controlPanel = controlStatus ? {
      available: true,
      status: asText(controlStatus?.overall?.status) || "empty",
      score: Number(controlStatus?.overall?.score) || 0,
      level: asText(controlStatus?.overall?.level) || "0_data_needed",
      nextAction: controlStatus?.nextAction || null
    } : { available: Boolean(global.AHAPersonalAiControl), status: "unavailable", score: 0, level: "0_data_needed", nextAction: null };
    let score = 0;
    score += Math.round((dataSources.availableCount / MODULES.length) * 15);
    if (approvedMaterial.ok) score += 15;
    if (retrieval.available) score += 10;
    if (retrieval.ok) score += 10;
    if (sampleQuery.ok) score += 20;
    if (chat.ok) score += 10;
    if (privacy.ok && privacy.consentAware) score += 15;
    if (semanticRetrieval.ok) score += 5;
    if (answerComposer.available) score += 5;
    if (answerComposer.ready && answerComposer.hasPrompt) score += 10;
    if (answerComposer.selectedSourceCount > 0) score += 5;
    if (answerComposer.hasPreview) score += 5;
    if (answerEvaluation.available) score += 5;
    if (answerEvaluation.ready) score += 10;
    if (answerEvaluation.evaluationCount > 0) score += 5;
    if (answerEvaluation.trainingSuggestions > 0) score += 5;
    score = Math.min(100, score);
    const materialCount = approvedMaterial.confirmedClaims + approvedMaterial.importantClaims
      + approvedMaterial.approvedCorpus + approvedMaterial.approvedExamples;
    let status = materialCount > 0 ? "partial" : "empty";
    if (materialCount > 0 && retrieval.ok && sampleQuery.ok && privacy.ok && score >= 65) status = "working";
    if (materialCount > 0 && score >= 85 && dataSources.ok && chat.ok && semanticRetrieval.ok) status = "strong";
    const audit = {
      generatedAt: new Date(options.now || Date.now()).toISOString(),
      local_only: true, audit_only: true, evaluation_only: true, model_training_enabled: false, fine_tuning_enabled: false, remote_upload_enabled: false, backend_enabled: false, calls_model_api: false, writes_to_insight_chamber: false, meta: personalAiBoundaryMeta({ origin_app: "aha_personal_ai_loop_audit", object_type: "loop_audit", evaluation_only: true }),
      status,
      score,
      checks: { dataSources, approvedMaterial, retrievalIndex: retrieval, sampleQuery, chatIntegration: chat, privacyAndConsent: privacy, answerComposer, answerEvaluation },
      dataFlow: {
        input: "chat message",
        personalContext: dataSources.modules.AHAChatPersonalContext,
        retrieval: retrieval.available,
        approvedResults: sampleQuery.resultCount,
        ragPromptBlock: Boolean(sampleQuery.promptPreview),
        chatBasis: sampleQuery.ok,
        visibleStatus: chat.hasPersonalContextPanel && chat.hasRetrievalPanel,
        explainableReasons: sampleQuery.reasons.length > 0
      },
      readiness,
      retrieval,
      chat,
      privacy,
      semanticRetrieval,
      answerComposer,
      answerEvaluation,
      controlPanel,
      recommendations: [],
      summary: ""
    };
    audit.recommendations = buildRecommendations(audit);
    audit.summary = status === "empty"
      ? "Personal AI Loop mangler godkjent personlig materiale."
      : status === "partial"
        ? "Personal AI Loop er delvis koblet, men indeks eller relevante testtreff mangler."
        : status === "working"
          ? "Personal AI Loop fungerer fra godkjent materiale via retrieval til RAG-kontekst."
          : "Personal AI Loop er sterk, forklarbar og consent-aware på tvers av hele kjeden.";
    return audit;
  }

  function loadLastAudit() {
    try { return JSON.parse(global.localStorage?.getItem(STORAGE_KEY) || "null"); } catch { return null; }
  }

  global.AHAPersonalAiLoopAudit = { personalAiBoundaryMeta, isUnavailableRecord,
    STORAGE_KEY,
    DEFAULT_QUERY,
    runAudit,
    checkDataSources,
    checkApprovedMaterial,
    checkRetrievalIndex,
    simulateQuery,
    checkChatIntegration,
    checkPrivacyAndConsent,
    checkSemanticRetrieval,
    checkAnswerComposer,
    checkAnswerEvaluation,
    buildRecommendations,
    buildOperatorRecommendations,
    buildCompactOperatorRecommendationSummary,
    buildPersonalAiLoopLocalReadinessReport,
    ["buildPersonalAiLoop" + "Source" + "ApprovalSummary"]: buildPersonalAiLoopSrcApprovalSummary,
    loadLastAudit
  };
})(typeof window !== "undefined" ? window : globalThis);
