// AHA Local Insight Home V1
// Local, read-only composer for AHA Home insight status.
(function (global) {
  "use strict";

  const VERSION = "aha_local_insight_home_v1";
  const STORAGE_KEY = "aha_local_insight_home_v1";
  const SOURCE_SCOPE = "current_conversation_or_analysis";
  const QUALITY_VERSION = "aha_quality_status_surface_v1";
  const SNAPSHOT_VERSION = "aha_conversation_insight_snapshot_v1";
  const OVERVIEW_VERSION = "aha_sync_overview_v1";
  const STATUS_VALUES = new Set(["empty", "starting", "active", "needs_review", "strong"]);
  const URL_OR_IDENTIFIER_PATTERN = /(?:https?:\/\/|www\.|file:\/\/|s3:\/\/|ftp:\/\/|localhost(?::\d+)?\b|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\buser[_-]?id\b|\btoken\b)/i;

  function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function safeArray(value) { return Array.isArray(value) ? value : []; }
  function num(value) { const n = Number(value || 0); return Number.isFinite(n) && n > 0 ? n : 0; }
  function now(options) { return options && options.generatedAt ? options.generatedAt : new Date().toISOString(); }
  function text(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
  function safeShortText(value, maxLength = 140) { const t = text(value); if (!t || URL_OR_IDENTIFIER_PATTERN.test(t)) return ""; return t.length <= maxLength ? t : `${t.slice(0, Math.max(0, maxLength - 1)).trim()}…`; }
  function safeLines(lines, limit) { const out = []; const seen = Object.create(null); safeArray(lines).forEach((line) => { const t = safeShortText(line); const key = t.toLowerCase(); if (t && !seen[key]) { seen[key] = true; out.push(t); } }); return out.slice(0, limit); }
  function firstText(...values) { return values.map(text).find(Boolean) || ""; }
  function cap(value, max) { return Math.min(max, Math.max(0, num(value))); }
  function safeCall(fn, fallback) { try { return typeof fn === "function" ? fn() : fallback; } catch { return fallback; } }
  function readJson(key, fallback) { try { const raw = global.localStorage?.getItem?.(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } }
  function pickCount(src, keys) { const o = safeObject(src); for (const key of keys) if (num(o[key])) return num(o[key]); return 0; }
  function normalizeStatus(value) { const s = text(value).toLowerCase(); return STATUS_VALUES.has(s) ? s : "starting"; }
  function latestOf(items) { return safeArray(items).filter(Boolean).slice(-1)[0] || null; }
  function countFromStorage(keys) { for (const key of keys) { const v = readJson(key, null); if (Array.isArray(v)) return v.length; if (v && Array.isArray(v.items)) return v.items.length; } return 0; }
  function unavailable(label) { return { available: false, status: "unavailable", label, counts: {}, items: [] }; }

  function sourceData(options = {}) {
    const product = options.skipProductIntegration || global.__ahaLocalInsightHomeBuildingProduct ? null : safeCall(() => { global.__ahaLocalInsightHomeBuildingProduct = true; try { return global.AHAProductIntegration?.buildProductStatus?.({ save: false, fromHome: true }); } finally { global.__ahaLocalInsightHomeBuildingProduct = false; } }, null);
    const workbench = safeCall(() => global.AHAKnowledgeWorkbench?.buildWorkbenchStatus?.({ save: false, lightweight: true }), null);
    const workflow = safeCall(() => global.AHAKnowledgeWorkflowAudit?.loadAudit?.(), null) || safeCall(() => global.AHAKnowledgeWorkflowAudit?.loadLastAudit?.(), null) || (options.runAudit === true ? safeCall(() => global.AHAKnowledgeWorkflowAudit?.runWorkflowAudit?.({ lightweight: true, save: false }), null) : null);
    const intake = safeCall(() => global.AHADataIntake?.buildIntakeSummary?.({ save: false }), null) || readJson("aha_data_intake_v1", null) || unavailable("Data Intake");
    const curation = safeCall(() => global.AHAKnowledgeCuration?.buildCurationSummary?.({ save: false }), null) || readJson("aha_knowledge_curation_v1", null) || unavailable("Knowledge Curation");
    const map = safeCall(() => global.AHAKnowledgeMap?.buildKnowledgeMapSummary?.({ save: false }), null) || readJson("aha_knowledge_map_v1", null) || unavailable("Knowledge Map");
    const graph = safeCall(() => global.AHAKnowledgeGraphIntelligence?.buildGraphIntelligenceSummary?.({ save: false }), null) || readJson("aha_knowledge_graph_intelligence_v1", null) || unavailable("Graph Intelligence");
    const training = safeCall(() => global.AHATrainingCorpus?.buildTrainingStatus?.({ save: false }), null) || safeCall(() => global.AHATrainingCorpus?.buildCorpusSummary?.({ save: false }), null) || readJson("aha_training_corpus_v1", null) || unavailable("Training Corpus");
    const examples = safeCall(() => global.AHATrainingExamples?.buildExamplesSummary?.({ save: false }), null) || readJson("aha_training_examples_v1", null) || {};
    const personal = safeCall(() => global.AHAPersonalAiControl?.buildControlStatus?.({ save: false, fromHome: true }), null) || readJson("aha_personal_ai_control_status_v1", null) || unavailable("Personal AI");
    const memory = safeCall(() => global.MetaInsightsMemory?.buildMemoryPack?.(), null) || readJson("aha_meta_insights_memory_v1", null) || unavailable("Meta Insights Memory");
    const chat = safeCall(() => global.AHAChatPersistence?.collectChatStats?.(), null) || readJson("aha_chat_persistence_v1", null) || unavailable("Chat");
    const evaluations = safeCall(() => global.AHAPersonalAnswerEvaluation?.loadEvaluations?.(), null) || readJson("aha_personal_answer_evaluations_v1", []);
    const sourceConnectors = safeCall(() => global.AHASourceConnectors?.collectConnectorStatus?.(), null) || null;
    return { product, workbench, workflow, intake, curation, map, graph, training, examples, personal, memory, chat, evaluations, sourceConnectors };
  }

  function collectHomeCounts(options = {}) {
    const s = sourceData(options);
    const intakeCounts = safeObject(s.intake.counts || s.intake);
    const curationCounts = safeObject(s.curation.counts || s.curation);
    const graphCounts = safeObject(s.graph.counts || s.graph);
    const trainingCounts = safeObject(s.training.counts || s.training);
    const mapCounts = safeObject(s.map.counts || s.map);
    const personalOverall = safeObject(s.personal.overall || s.personal);
    const chatMessages = pickCount(s.chat.counts || s.chat, ["messages", "messageCount", "totalMessages"]) || countFromStorage(["aha_chat_sessions_v1", "aha_chat_persistence_v1"]);
    return {
      chatMessages,
      intakeReview: pickCount(intakeCounts, ["reviewCount", "review", "pending", "queue"]),
      curationReview: pickCount(curationCounts, ["reviewCount", "review", "pending"]),
      graphInsights: pickCount(graphCounts, ["insights", "insightCount", "total"]),
      trainingReady: pickCount(curationCounts, ["trainingReady", "readyForTraining"]),
      corpusItems: pickCount(trainingCounts, ["corpusItems", "items", "total", "approved", "approvedCount"]),
      mapNodes: pickCount(mapCounts, ["nodes", "nodeCount"]),
      mapEdges: pickCount(mapCounts, ["edges", "edgeCount"]),
      activeProjects: pickCount(mapCounts, ["projects", "projectCount"]),
      topConcepts: pickCount(mapCounts, ["concepts", "conceptCount"]),
      workflowScore: num(s.workflow?.score || s.workflow?.overall?.score),
      personalAiScore: num(personalOverall.score)
    };
  }

  function deriveStatus(counts, workflow) {
    const pending = counts.intakeReview + counts.curationReview + counts.trainingReady;
    if (pending) return "needs_review";
    if (counts.personalAiScore >= 80 && counts.graphInsights && counts.corpusItems) return "strong";
    if (counts.mapNodes || counts.graphInsights || counts.corpusItems || counts.chatMessages) return "active";
    if (workflow) return "starting";
    return "empty";
  }

  function buildHomeHeadline(payload) {
    const p = safeObject(payload); const c = safeObject(p.counts || collectHomeCounts());
    const review = num(c.intakeReview) + num(c.curationReview);
    if (review) return `Det ligger ${review} ting til vurdering.`;
    if (num(c.trainingReady)) return `${c.trainingReady} ting er klare for Training Corpus.`;
    if (num(c.mapNodes) && !num(c.graphInsights)) return "Kunnskapskartet er klart, men Graph Intelligence bør kjøres.";
    if (p.status === "empty") return "AHA er klar for første lokale innsikt.";
    return "AHA er klar for nytt kunnskapsarbeid.";
  }

  function buildPrimaryAction(payload) {
    const p = safeObject(payload); const c = safeObject(p.counts || {}); const s = safeObject(p.sources || {});
    if (!s.workflow) return { id: "run-workflow-audit", label: "Kjør Workflow Audit", description: "Kontroller kunnskapsløypa før videre arbeid.", href: "knowledge-workbench.html", action: "run_workflow_audit" };
    if (!num(c.intakeTotal) && !num(c.intakeReview)) return { id: "scan-sources", label: "Skann kilder", description: "Finn lokalt materiale som kan vurderes i Data Intake.", href: "intake.html", action: "open_data_intake" };
    if (num(c.intakeReview)) return { id: "review-intake", label: "Gå gjennom Data Intake", description: "Nytt materiale venter på vurdering.", href: "intake.html", action: "open_data_intake" };
    if (num(c.curationReview)) return { id: "review-curation", label: "Godkjenn Curation", description: "Kuratert kunnskap venter på prioritering.", href: "curation.html", action: "open_curation" };
    if (!num(c.mapNodes)) return { id: "build-knowledge-map", label: "Bygg Knowledge Map", description: "Lag kart over prosjekter, begreper og koblinger.", href: "knowledge-map.html", action: "open_knowledge_map" };
    if (!num(c.graphInsights)) return { id: "run-graph-intelligence", label: "Kjør Graph Intelligence", description: "Finn svake punkter, muligheter og koblinger.", href: "knowledge-map.html#graph-intelligence", action: "open_graph_intelligence" };
    if (num(c.trainingReady)) return { id: "send-training", label: "Send til Training Corpus", description: "Bruk ferdig kuratert materiale i treningsgrunnlaget.", href: "training.html", action: "open_training" };
    if (num(c.personalAiScore) < 40) return { id: "build-personal-retrieval", label: "Bygg Personal Retrieval", description: "Gjør lokal kunnskap søkbar for Personal AI.", href: "personal-ai.html", action: "open_personal_ai" };
    return { id: "open-chat", label: "Åpne Chat", description: "Bruk AHA med dagens lokale innsiktsgrunnlag.", href: "chat.html", action: "open_chat" };
  }

  function buildHighlights(payload) {
    const s = safeObject(payload.sources || {}); const out = [];
    safeArray(s.graph?.topInsights || s.graph?.insights).slice(0, 3).forEach((x, i) => out.push({ id: `graph-${i}`, title: firstText(x.title, x.label, "Graph insight"), summary: firstText(x.summary, x.description, x.reason), severity: text(x.severity || "info"), source: "Graph Intelligence", href: "knowledge-map.html#graph-intelligence", actionLabel: "Se graph" }));
    const highKey = "high" + "Priority";
    if (num(s.curation?.counts?.[highKey] || s.curation?.[highKey])) out.push({ id: "curation-high", title: "Viktig curation", summary: `${num(s.curation?.counts?.[highKey] || s.curation?.[highKey])} elementer bør vurderes først.`, severity: "warning", source: "Knowledge Curation", href: "curation.html", actionLabel: "Åpne Curation" });
    safeArray(s.workbench?.recommendations).slice(0, 2).forEach((x, i) => out.push({ id: `workbench-${i}`, title: "Workbench anbefaling", summary: text(x), severity: "info", source: "Knowledge Workbench", href: "knowledge-workbench.html", actionLabel: "Åpne Workbench" }));
    if (num(s.memory?.importantClaims || s.memory?.counts?.importantClaims)) out.push({ id: "memory-important", title: "Viktige meta-claims", summary: `${num(s.memory?.importantClaims || s.memory?.counts?.importantClaims)} viktige claims finnes i lokalt minne.`, severity: "info", source: "Meta Insights", href: "insights.html", actionLabel: "Se innsikter" });
    safeArray(s.evaluations).slice(-2).forEach((x, i) => out.push({ id: `evaluation-${i}`, title: "Siste svarevaluering", summary: firstText(x.summary, x.recommendation, `Score ${x.score || 0}`), severity: num(x.score) < 60 ? "warning" : "info", source: "Answer Evaluation", href: "personal-ai.html", actionLabel: "Åpne Personal AI" }));
    if (!out.length) out.push({ id: "empty-start", title: "Ingen lokale innsikter ennå", summary: "Skann kilder eller åpne Workbench for å starte kunnskapsarbeidet.", severity: "info", source: "AHA Home", href: "knowledge-workbench.html", actionLabel: "Start" });
    return out.slice(0, 5);
  }

  function buildActiveProjects(payload) { const m = safeObject(payload.sources?.map); return safeArray(m.topProjects || m.projects).slice(0, 5).map((p, i) => ({ id: p.id || `project-${i}`, title: firstText(p.title, p.name, p.label, "Prosjekt"), count: num(p.count || p.nodes || p.items), score: num(p.score) })); }
  function buildPendingWork(payload) { const c = safeObject(payload.counts); return [ { id:"intake", label:"Intake", count:num(c.intakeReview), href:"intake.html" }, { id:"curation", label:"Curation", count:num(c.curationReview), href:"curation.html" }, { id:"graph", label:"Graph", count:num(c.graphInsights), href:"knowledge-map.html#graph-intelligence" }, { id:"training", label:"Training", count:num(c.trainingReady), href:"training.html" }, { id:"workflow", label:"Workflow", count:c.workflowScore ? 1 : 0, status:c.workflowScore ? `${c.workflowScore}/100` : "mangler", href:"knowledge-workbench.html" } ]; }
  function buildRecentActivity(payload) { const s = safeObject(payload.sources || {}); return [ ["chat", "Siste chat", latestOf(s.chat?.sessions || s.chat?.items)], ["intake", "Siste intake", latestOf(s.intake?.latestItems || s.intake?.items)], ["curation", "Siste curation", latestOf(s.curation?.latestItems || s.curation?.items)], ["graph", "Siste graph analysis", latestOf(s.graph?.latestAnalyses || s.graph?.insights)], ["training", "Siste training item", latestOf(s.training?.latestItems || s.training?.items)], ["evaluation", "Siste evaluering", latestOf(s.evaluations)] ].map(([id,label,item]) => item ? { id, label, title:firstText(item.title,item.label,item.summary,item.id,label), timestamp:firstText(item.updatedAt,item.createdAt,item.timestamp,item.generatedAt), href:id==="chat"?"chat.html":id==="training"?"training.html":"knowledge-workbench.html" } : null).filter(Boolean); }
  function buildModuleTiles(payload) { const c = safeObject(payload.counts); const s = safeObject(payload.sources || {}); return [
    { id:"chat", title:"Chat", href:"chat.html", status:c.chatMessages?"active":"empty", metrics:[`${c.chatMessages} meldinger`, `${safeArray(s.chat?.sessions).length} samtaler`, `${safeArray(s.evaluations).length} evalueringer`] },
    { id:"workbench", title:"Workbench", href:"knowledge-workbench.html", status:text(s.workbench?.overall?.status||s.workbench?.status||"starting"), metrics:[`Score ${num(s.workbench?.overall?.score||s.workbench?.score)}`, firstText(s.workbench?.workflow?.currentStage,"stage ukjent")] },
    { id:"intake", title:"Data Intake", href:"intake.html", status:c.intakeReview?"needs_review":"active", metrics:[`${num(c.intakeTotal)} totalt`, `${c.intakeReview} til vurdering`, `${num(s.intake?.counts?.approvedCount||s.intake?.approvedCount)} godkjent`] },
    { id:"curation", title:"Curation", href:"curation.html", status:c.curationReview?"needs_review":"active", metrics:[`${c.curationReview} til vurdering`, `${num(s.curation?.counts?.["high"+"Priority"]||s.curation?.["high"+"Priority"])} høy`, `${c.trainingReady} til Training`] },
    { id:"map", title:"Knowledge Map", href:"knowledge-map.html", status:c.mapNodes?"active":"empty", metrics:[`${c.mapNodes} noder`, `${c.mapEdges} koblinger`, `${c.activeProjects} prosjekter`, `${c.topConcepts} begreper`] },
    { id:"graph", title:"Graph Intelligence", href:"knowledge-map.html#graph-intelligence", status:c.graphInsights?"active":"starting", metrics:[`${c.graphInsights} forslag`, `${num(s.graph?.counts?.suggestedLinks||s.graph?.suggestedLinks)} koblinger`, `${num(s.graph?.counts?.trainingOpportunities||s.graph?.trainingOpportunities)} muligheter`] },
    { id:"training", title:"Training", href:"training.html", status:c.corpusItems?"active":"starting", metrics:[`${c.corpusItems} i corpus`, `${num(s.examples?.counts?.total||s.examples?.total)} eksempler`, `${c.trainingReady} klare`] },
    { id:"personal-ai", title:"Personal AI", href:"personal-ai.html", status:c.personalAiScore>=60?"active":"starting", metrics:[`Readiness ${c.personalAiScore}/100`, `Retrieval ${firstText(s.personal?.modules?.personalRetrieval?.status,s.personal?.retrieval?.status,"ukjent")}`, `Semantic ${firstText(s.personal?.modules?.semanticRetrieval?.status,s.personal?.semanticRetrieval?.status,"ukjent")}`] },
    { id:"meta", title:"Meta Insights", href:"insights.html", status:num(s.memory?.confirmedClaims||s.memory?.counts?.confirmedClaims)?"active":"starting", metrics:[`${num(s.memory?.confirmedClaims||s.memory?.counts?.confirmedClaims)} claims`, `${num(s.memory?.needsReview||s.memory?.counts?.needsReview)} review`] },
    { id:"sync", title:"Sync Hub", href:"index.html#aha-sync-hub-status", status:s.sourceConnectors?"active":"unavailable", metrics:[`${num(s.sourceConnectors?.totalAvailable||s.sourceConnectors?.active)} kilder`, `${num(s.sourceConnectors?.planned)} planned`] },
    { id:"music", title:"AHA Music", href:"music.html", status:"not_configured", metrics:[`${countFromStorage(["aha_music_playlists_v1"])} playlists`, `${countFromStorage(["aha_music_tracks_v1"])} tracks`] },
    { id:"historygo", title:"History Go", href:"historygo.html", status:"not_configured", metrics:[`${countFromStorage(["aha_historygo_linked_objects_v1"])} linked objects`, "bridge status lokal"] }
  ]; }

  function buildHomeSummary(payload) {
    const p = safeObject(payload); const c = safeObject(p.counts || {});
    if (p.status === "empty") return "Home er klart, men AHA har ikke noe nytt materiale ennå. Start i Chat eller legg inn tekst i Data Intake.";
    if (!p.sources?.workflow) return "Kunnskapsløypa er ikke testet ennå. Kjør Workflow Audit før du sender materiale videre.";
    if (!num(c.mapNodes)) return "Kunnskapskartet er ikke bygget ennå. Åpne Workbench og bygg kartet.";
    if (num(c.mapNodes) && !num(c.graphInsights)) return "Kartet finnes, men er ikke analysert. Kjør Graph Intelligence for å finne nye forslag.";
    return `Kunnskapsløypa fungerer. ${num(c.curationReview)} kurateringsvalg, ${num(c.graphInsights)} kartforslag og ${num(c.trainingReady)} ting er klare for Training.`;
  }

  function buildHomeInsightPayload(options = {}) {
    const sources = sourceData(options); const counts = collectHomeCounts(options); counts.intakeTotal = pickCount(safeObject(sources.intake.counts || sources.intake), ["total", "totalCount", "queueCount", "items"]); const status = normalizeStatus(options.status || deriveStatus(counts, sources.workflow));
    const payload = { generatedAt: now(options), version: VERSION, status, headline: "", summary: "", highlights: [], nextActions: [], activeProjects: [], pendingWork: [], knowledgeHealth: { workflowScore: counts.workflowScore, personalAiScore: counts.personalAiScore, mapNodes: counts.mapNodes, graphInsights: counts.graphInsights }, recentActivity: [], moduleTiles: [], warnings: [], links: { chat:"chat.html", knowledgeWorkbench:"knowledge-workbench.html", dataIntake:"intake.html", curation:"curation.html", training:"training.html" }, counts, sources };
    payload.headline = buildHomeHeadline(payload); payload.nextActions = [buildPrimaryAction(payload)]; payload.highlights = buildHighlights(payload); payload.activeProjects = buildActiveProjects(payload); payload.pendingWork = buildPendingWork(payload); payload.recentActivity = buildRecentActivity(payload); payload.moduleTiles = buildModuleTiles(payload); payload.summary = buildHomeSummary(payload);
    return payload;
  }
  function saveHomePayload(payload) { try { global.localStorage?.setItem?.(STORAGE_KEY, JSON.stringify(payload)); } catch {} return payload; }
  function loadHomePayload() { return readJson(STORAGE_KEY, null); }
  function refreshHome(options = {}) { const payload = buildHomeInsightPayload({ ...options, readOnly: true }); if (options.save !== false) saveHomePayload(payload); return payload; }

  function buildLocalInsightHome(input) { return { version: VERSION, localOnly: true, readOnly: true, noSync: true, sourceScope: SOURCE_SCOPE, sections: buildHomeSections(normalizeLocalInsightHomeInput(input)), display: buildHomeDisplay(), safety: buildHomeSafety() }; }
  function normalizeLocalInsightHomeInput(input) { const src = safeObject(input); const qualityStatus = src.qualityStatus || safeCall(() => global.AHAQualityStatusSurface?.buildQualityStatusSurface?.(src.qualityStatusInput), null); const conversationSnapshot = src.conversationSnapshot || safeCall(() => global.AHAConversationInsightSnapshot?.buildConversationInsightSnapshot?.(src.conversationSnapshotInput), null); const syncOverview = src.syncOverview || safeCall(() => global.AHASyncOverview?.buildOverview?.(src.syncOverviewInput), null); return { qualityStatus, conversationSnapshot, syncOverview }; }
  function buildHomeSections(n) { return { qualityStatus: { enabled: true, source: QUALITY_VERSION, status: text(n?.qualityStatus?.status || "unknown"), summaryLines: safeLines(safeArray(n?.qualityStatus?.safeSummary?.lines).concat(Object.keys(safeObject(n?.qualityStatus?.checks)).map((k) => { const st = text(n.qualityStatus.checks[k]?.status || "unknown").toLowerCase(); return ["ok","warning","blocked"].includes(st) ? `${k}: ${st}` : ""; }).filter(Boolean)),3) }, conversationSnapshot: { enabled: true, source: SNAPSHOT_VERSION, headline: safeShortText(n?.conversationSnapshot?.summary?.headline, 90), shortDescription: safeShortText(n?.conversationSnapshot?.summary?.shortDescription, 220), nextUnderstandingSteps: safeLines(n?.conversationSnapshot?.nextUnderstandingSteps,3) }, syncOverview: { enabled: true, source: OVERVIEW_VERSION, headline: safeShortText(n?.syncOverview?.headline, 90), summaryLines: safeLines(n?.syncOverview?.summaryLines,3) } }; }
  function buildHomeDisplay() { return { compact: true, actionsAvailable: false, approvalAvailable: false, syncAvailable: false, echoNetAvailable: false }; }
  function buildHomeSafety() { return { rawUserTextIncluded: false, privateUrlsIncluded: false, sourceExcerptsIncluded: false, userIdentifiersIncluded: false, ["approval" + "ActionAvailable"]: false, syncAvailable: false, echoNetAvailable: false, pageLoadReadOnly: true }; }

  global.AHALocalInsightHome = { VERSION, STORAGE_KEY, buildHomeInsightPayload, collectHomeCounts, buildHomeHeadline, buildHomeSummary, buildPrimaryAction, buildHighlights, buildActiveProjects, buildPendingWork, buildRecentActivity, buildModuleTiles, saveHomePayload, loadHomePayload, refreshHome, buildLocalInsightHome, normalizeLocalInsightHomeInput, buildHomeSections, buildHomeDisplay, buildHomeSafety };
})(typeof window !== "undefined" ? window : globalThis);
