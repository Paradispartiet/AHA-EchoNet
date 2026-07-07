// ahaProductIntegration.js

(function () {
  "use strict";

  const VERSION = "AHA Product Integration V1";
  const STORAGE_KEY = "aha_product_integration_status_v1";
  const DEFAULT_LINKS = {
    homeHref: "index.html",
    chatHref: "chat.html",
    trainingHref: "training.html",
    personalAiHref: "personal-ai.html",
    syncHubHref: "index.html#aha-sync-hub-status",
    musicHref: "music.html",
    historyGoHref: "historygo.html",
    dataIntakeHref: "intake.html",
    knowledgeMapHref: "knowledge-map.html",
    knowledgeGraphIntelligenceHref: "knowledge-map.html#graph-intelligence",
    knowledgeWorkbenchHref: "knowledge-workbench.html"
  };

  function getModules() {
    return Array.isArray(window.AHA_MODULES) ? window.AHA_MODULES : (Array.isArray(window.AHAModules?.modules) ? window.AHAModules.modules : []);
  }

  function normalizeHref(value, fallback) {
    const href = String(value || "").trim();
    return href || fallback;
  }

  function hasModuleByTerms(modules, terms) {
    return modules.some((module) => {
      const haystack = `${module?.id || ""} ${module?.title || ""} ${module?.type || ""} ${module?.href || ""}`.toLowerCase();
      return terms.some((term) => haystack.includes(term));
    });
  }

  function findModule(modules, terms) {
    return modules.find((module) => {
      const haystack = `${module?.id || ""} ${module?.title || ""} ${module?.type || ""} ${module?.href || ""}`.toLowerCase();
      return terms.some((term) => haystack.includes(term));
    }) || null;
  }

  function collectModuleStatus() {
    const modules = getModules().map((module) => ({
      id: module.id,
      title: module.title,
      type: module.type,
      status: module.status,
      href: module.href,
      description: module.description,
      phase: module.phase
    }));
    return {
      modules,
      hasChat: hasModuleByTerms(modules, ["chat"]),
      hasTraining: hasModuleByTerms(modules, ["training"]),
      hasKnowledgeWorkbench: hasModuleByTerms(modules, ["knowledge-workbench", "knowledge workbench", "workbench"]),
      hasDataIntake: hasModuleByTerms(modules, ["data-intake", "data intake", "intake"]),
      hasKnowledgeCuration: hasModuleByTerms(modules, ["knowledge-curation", "knowledge curation", "curation"]),
      hasKnowledgeMap: hasModuleByTerms(modules, ["knowledge-map", "knowledge map"]),
      hasPersonalAI: hasModuleByTerms(modules, ["personal-ai", "personal ai"]),
      hasSyncHub: hasModuleByTerms(modules, ["sync", "sync hub"]),
      hasMusic: hasModuleByTerms(modules, ["music", "musikk"]),
      hasHistoryGo: hasModuleByTerms(modules, ["historygo", "history go"])
    };
  }

  function collectNavigationStatus() {
    const modules = getModules();
    const moduleStatus = collectModuleStatus();
    const chat = findModule(modules, ["chat"]);
    const training = findModule(modules, ["training"]);
    const knowledgeWorkbench = findModule(modules, ["knowledge-workbench", "knowledge workbench", "workbench"]);
    const dataIntake = findModule(modules, ["data-intake", "data intake", "intake"]);
    const knowledgeCuration = findModule(modules, ["knowledge-curation", "knowledge curation", "curation"]);
    const knowledgeMap = findModule(modules, ["knowledge-map", "knowledge map"]);
    const personalAI = findModule(modules, ["personal-ai", "personal ai"]);
    const syncHub = findModule(modules, ["sync", "sync hub"]);
    const music = findModule(modules, ["music", "musikk"]);
    const historyGo = findModule(modules, ["historygo", "history go"]);
    const nav = {
      homeHref: DEFAULT_LINKS.homeHref,
      chatHref: normalizeHref(chat?.href, DEFAULT_LINKS.chatHref),
      trainingHref: normalizeHref(training?.href, DEFAULT_LINKS.trainingHref),
      knowledgeWorkbenchHref: normalizeHref(knowledgeWorkbench?.href, DEFAULT_LINKS.knowledgeWorkbenchHref),
      dataIntakeHref: normalizeHref(dataIntake?.href, DEFAULT_LINKS.dataIntakeHref),
      knowledgeCurationHref: normalizeHref(knowledgeCuration?.href, "curation.html"),
      knowledgeMapHref: normalizeHref(knowledgeMap?.href, DEFAULT_LINKS.knowledgeMapHref),
      personalAiHref: normalizeHref(personalAI?.href, DEFAULT_LINKS.personalAiHref),
      syncHubHref: normalizeHref(syncHub?.href, DEFAULT_LINKS.syncHubHref),
      musicHref: normalizeHref(music?.href, DEFAULT_LINKS.musicHref),
      historyGoHref: normalizeHref(historyGo?.href, DEFAULT_LINKS.historyGoHref),
      missingLinks: []
    };
    [
      ["chatHref", moduleStatus.hasChat], ["knowledgeWorkbenchHref", moduleStatus.hasKnowledgeWorkbench], ["dataIntakeHref", moduleStatus.hasDataIntake], ["knowledgeCurationHref", moduleStatus.hasKnowledgeCuration], ["knowledgeMapHref", moduleStatus.hasKnowledgeMap], ["trainingHref", moduleStatus.hasTraining], ["personalAiHref", moduleStatus.hasPersonalAI],
      ["syncHubHref", moduleStatus.hasSyncHub], ["musicHref", moduleStatus.hasMusic], ["historyGoHref", moduleStatus.hasHistoryGo]
    ].forEach(([key, available]) => { if (!available || !nav[key]) nav.missingLinks.push(key); });
    return nav;
  }

  function isPersonalAiReady(options = {}) {
    const personal = options.personalAIStatus || window.AHAPersonalAiControl?.buildControlStatus?.({ save: false });
    return ["working", "strong", "ready"].includes(personal?.overall?.status) || Number(personal?.overall?.score || 0) >= 60;
  }

  function buildProductNextActions(status) {
    const nav = status.navigation || collectNavigationStatus();
    const actions = [];
    if (status.personalAI?.ready) actions.push({ id: "open-chat", label: "Åpne AHA Chat og still et spørsmål.", href: nav.chatHref });
    if (status.chat?.chatPersistenceAvailable && (status.dataIntake?.total || 0) < 3) actions.push({ id: "scan-chat-intake", label: "Skann Chat til Data Intake", href: nav.dataIntakeHref });
    if (status.knowledgeWorkbench?.available) actions.push({ id: "open-knowledge-workbench", label: "Åpne Knowledge Workbench.", href: nav.knowledgeWorkbenchHref });
    if (status.sourceConnectors?.available) actions.push({ id: "scan-source-connectors", label: "Skann aktive Source Connectors.", href: nav.knowledgeWorkbenchHref || nav.dataIntakeHref });
    if (status.dataIntake?.available) actions.push({ id: "open-data-intake", label: "Åpne Data Intake og vurder nytt materiale.", href: nav.dataIntakeHref });
    if (status.knowledgeCuration?.available) actions.push({ id: "open-knowledge-curation", label: "Rydd Data Intake i Knowledge Curation.", href: nav.knowledgeCurationHref || "curation.html" });
    if (status.knowledgeMap?.available) actions.push({ id: "open-knowledge-map", label: "Se koblinger i Knowledge Map.", href: nav.knowledgeMapHref || "knowledge-map.html" });
    if (status.knowledgeGraphIntelligence?.available) actions.push({ id: "open-graph-intelligence", label: "Analyser Knowledge Map med Graph Intelligence.", href: status.knowledgeGraphIntelligence.href });
    actions.push({ id: "approve-training", label: "Åpne Training Corpus og godkjenn materiale.", href: nav.trainingHref });
    actions.push({ id: "check-personal-ai", label: "Åpne Personal AI og kjør full kontrolltest.", href: nav.personalAiHref });
    if (status.syncHub?.available) actions.push({ id: "open-sync-hub", label: "Åpne Sync Hub og se importkandidater.", href: nav.syncHubHref });
    if (status.music?.available) actions.push({ id: "open-music", label: "Åpne AHA Music og koble musikk til History Go.", href: nav.musicHref });
    if (status.historyGo?.available) actions.push({ id: "open-history-go", label: "Åpne History Go-koblingen og se oppdagelser.", href: nav.historyGoHref });
    return actions.slice(0, 6);
  }

  function getPrimaryNextAction(status) {
    const nav = status.navigation || collectNavigationStatus();
    if (status.chat?.chatPersistenceAvailable && (status.dataIntake?.total || 0) < 3) return { id: "scan-chat-intake", label: "Skann Chat til Data Intake", href: nav.dataIntakeHref, description: "Chat-minne finnes og kan foreslås som Data Intake-kandidater." };
    if (status.personalAI?.ready) return { id: "chat", label: "Åpne AHA Chat", href: nav.chatHref, description: "Personal AI er klar nok til at chat er neste hovedhandling." };
    if (status.knowledgeCuration?.highPriority) return { id: "knowledge-curation", label: "Åpne Knowledge Curation", href: nav.knowledgeCurationHref || "curation.html", description: "High-priority materiale bør kurateres før Training Corpus." };
    if (status.dataIntake?.reviewCount) return { id: "data-intake", label: "Åpne Data Intake", href: nav.dataIntakeHref, description: "Nytt materiale venter på vurdering før Training Corpus." };
    if (!status.training?.approvedCount) return { id: "training", label: "Åpne Training", href: nav.trainingHref, description: "Godkjenn materiale slik at AHA får et tryggere grunnlag." };
    if (!status.personalAI?.controlAvailable) return { id: "personal-ai", label: "Åpne Personal AI", href: nav.personalAiHref, description: "Kjør kontrolltest og se status for minne, retrieval og evaluering." };
    if (status.syncHub?.available) return { id: "sync-hub", label: "Åpne Sync Hub", href: nav.syncHubHref, description: "Se hvilke kilder som kan mates inn i Training Corpus." };
    if (status.music?.available) return { id: "music", label: "Åpne AHA Music", href: nav.musicHref, description: "Koble musikkdata til innsikt og oppdagelser." };
    return { id: "history-go", label: "Åpne History Go", href: nav.historyGoHref, description: "Se oppdagelser og koblinger tilbake til AHA." };
  }

  function statusFromScore(score) {
    if (score >= 85) return "strong";
    if (score >= 65) return "connected";
    if (score >= 35) return "usable";
    return "starting";
  }

  function buildProductStatus(options = {}) {
    const modules = collectModuleStatus();
    const navigation = collectNavigationStatus();
    const sourceConnectorStatus = window.AHASourceConnectors?.collectConnectorStatus?.() || null;
    const chatStats = window.AHAChatPersistence?.collectChatStats?.() || null;
    const chatCandidates = window.AHAChatPersistence?.buildChatIntakeCandidates?.({ dryRun:true }) || null;
    const workbenchStatus = window.AHAKnowledgeWorkbench?.buildWorkbenchStatus?.({ save:false }) || null;
    const workflowAudit = window.AHAKnowledgeWorkflowAudit?.runWorkflowAudit?.({ save:false }) || window.AHAKnowledgeWorkflowAudit?.loadLastAudit?.() || null;
    const graphIntelligenceSummary = window.AHAKnowledgeGraphIntelligence?.buildGraphIntelligenceSummary?.() || { available: Boolean(window.AHAKnowledgeGraphIntelligence), status:"empty", score:0, insightCount:0, nextAction:"Analyser Knowledge Map." };
    const knowledgeMapSummary = window.AHAKnowledgeMap?.buildKnowledgeMapSummary?.() || { available: modules.hasKnowledgeMap, nodes:0, edges:0, projects:0, concepts:0, nextAction:"Bygg Knowledge Map fra kuratert materiale." };
    const curationSummary = window.AHAKnowledgeCuration?.buildCurationSummary?.() || { available: modules.hasKnowledgeCuration, total: 0, reviewCount: 0, highPriority: 0, duplicateGroups: 0, trainingReady: 0, nextAction: "Bygg kurateringskø fra Data Intake." };
    const dataIntakeSummary = window.AHADataIntake?.buildIntakeSummary?.() || { available: modules.hasDataIntake, total: 0, reviewCount: 0, approvedCount: 0, importedCount: 0, nextAction: "Skann AHA-kilder." };
    const trainingItems = window.AHATrainingCorpus?.listCorpus?.() || [];
    const approvedCount = trainingItems.filter((item) => item?.status === "approved").length;
    const personalReady = isPersonalAiReady(options);
    const localInsightPayload = window.AHALocalInsightHome?.loadHomePayload?.() || window.AHALocalInsightHome?.buildHomeInsightPayload?.({ lightweight: true, save: false });
    const status = {
      generatedAt: options.now || new Date().toISOString(),
      version: VERSION,
      navigation,
      home: { available: true, href: navigation.homeHref, modulesVisible: modules.modules.length, summary: "AHA Home er hovedinngangen til samlet produktflyt." },
      localInsightHome: { available: Boolean(window.AHALocalInsightHome), href: navigation.homeHref, status: localInsightPayload?.status || "unavailable", headline: localInsightPayload?.headline || "AHA Local Insight Home er ikke bygget ennå.", nextAction: localInsightPayload?.nextActions?.[0] || null, highlights: (localInsightPayload?.highlights || []).slice(0, 6), pendingWork: (localInsightPayload?.pendingWork || []).slice(0, 8) },
      workflowAudit: { available: Boolean(window.AHAKnowledgeWorkflowAudit), status: workflowAudit?.status || "empty", score: workflowAudit?.score || 0, missingStages: (workflowAudit?.stages?.missing || []).map(s=>s.id), consentWarnings: workflowAudit?.consent?.warnings || [], recommendations: (workflowAudit?.recommendations || []).slice(0,7), summary: "Workflow Audit sjekker stage availability, lenker, storage, samtykkegrenser og trygg mock workflow." },
      knowledgeWorkbench: { available: Boolean(window.AHAKnowledgeWorkbench) || modules.hasKnowledgeWorkbench, href: navigation.knowledgeWorkbenchHref, status: workbenchStatus?.overall?.status || "empty", score: workbenchStatus?.overall?.score || 0, currentStage: workbenchStatus?.workflow?.currentStage || "sources", nextAction: workbenchStatus?.nextAction || null, summary: "Knowledge Workbench samler Kilder → Data Intake → Curation → Knowledge Map → Graph Intelligence → Training → Personal AI → Chat." },
      chat: { available: modules.hasChat, href: navigation.chatHref, chatPersistenceAvailable: Boolean(window.AHAChatPersistence), chatSessions: chatStats?.sessions || 0, chatMessages: chatStats?.messages || 0, chatIntakeCandidates: chatCandidates?.items?.length || 0, summary: "AHA Chat er hovedsamtalen med godkjent personlig kontekst når den finnes." },
      personalAI: { available: modules.hasPersonalAI, controlAvailable: Boolean(window.AHAPersonalAiControl) || modules.hasPersonalAI, ready: personalReady, href: navigation.personalAiHref, summary: "Personal AI viser status for minne, corpus, retrieval, composer og evaluation." },
      sourceConnectors: { available: Boolean(window.AHASourceConnectors), active: sourceConnectorStatus?.active || 0, planned: sourceConnectorStatus?.planned || 0, missing: sourceConnectorStatus?.missing || 0, totalAvailable: sourceConnectorStatus?.totalAvailable || 0, nextAction: sourceConnectorStatus?.active ? "Skann aktive kilder." : "Koble runtime-kilder før skann." },
      dataIntake: { available: Boolean(window.AHADataIntake) || modules.hasDataIntake, href: navigation.dataIntakeHref, total: dataIntakeSummary.total || 0, reviewCount: dataIntakeSummary.reviewCount || 0, approvedCount: dataIntakeSummary.approvedCount || 0, importedCount: dataIntakeSummary.importedCount || 0, nextAction: dataIntakeSummary.nextAction || "Skann AHA-kilder.", summary: "Data Intake samler kilder før Training Corpus." },
      knowledgeCuration: { available: Boolean(window.AHAKnowledgeCuration) || modules.hasKnowledgeCuration, href: navigation.knowledgeCurationHref || "curation.html", total: curationSummary.total || 0, reviewCount: curationSummary.reviewCount || 0, highPriority: curationSummary.highPriority || 0, duplicateGroups: curationSummary.duplicateGroups || 0, trainingReady: curationSummary.trainingReady || 0, nextAction: curationSummary.nextAction || "Bygg kurateringskø fra Data Intake.", summary: "Knowledge Curation rydder materiale mellom Data Intake og Training Corpus." },
      knowledgeMap: { available: Boolean(window.AHAKnowledgeMap) || modules.hasKnowledgeMap, href: navigation.knowledgeMapHref || "knowledge-map.html", nodes: knowledgeMapSummary.nodes || 0, edges: knowledgeMapSummary.edges || 0, projects: knowledgeMapSummary.projects || 0, concepts: knowledgeMapSummary.concepts || 0, nextAction: knowledgeMapSummary.nextAction || "Bygg Knowledge Map fra kuratert materiale.", summary: "Knowledge Map synliggjør koblinger før Training Corpus, Personal AI og Chat." },
      knowledgeGraphIntelligence: { available: Boolean(window.AHAKnowledgeGraphIntelligence), href: DEFAULT_LINKS.knowledgeGraphIntelligenceHref, status: graphIntelligenceSummary.status || "empty", score: graphIntelligenceSummary.score || 0, insights: graphIntelligenceSummary.insightCount || 0, nextAction: graphIntelligenceSummary.nextAction || "Analyser Knowledge Map.", summary: "Graph Intelligence analyserer Knowledge Map før Training Corpus, Personal AI og Chat." },
      training: { available: modules.hasTraining, href: navigation.trainingHref, approvedCount, summary: "Training Corpus er datagodkjennings- og treningslaget." },
      syncHub: { available: modules.hasSyncHub, href: navigation.syncHubHref, summary: "Sync Hub henter/importerer materiale som senere kan godkjennes." },
      music: { available: modules.hasMusic, href: navigation.musicHref, summary: "AHA Music kobler musikkdata til innsikt, kanon og History Go." },
      historyGo: { available: modules.hasHistoryGo, href: navigation.historyGoHref, summary: "History Go er oppdagelses- og læringsuniverset koblet tilbake til AHA." },
      musicToHistoryGoBridge: { available: modules.hasMusic && modules.hasHistoryGo, summary: "Musikkdata kan bli History Go-oppdagelser via eksport-/brodata." },
      moduleStatus: modules
    };
    let score = 0;
    if (modules.modules.length) score += 15;
    if (status.chat.available) score += 15;
    if (status.knowledgeWorkbench.available) score += 10;
    if (status.sourceConnectors.available) score += 5;
    if (status.personalAI.controlAvailable) score += 20;
    if (status.dataIntake.available) score += 10;
    if ((status.dataIntake.reviewCount || 0) + (status.dataIntake.approvedCount || 0) > 0) score += 5;
    if (status.dataIntake.importedCount) score += 5;
    if (status.training.available) score += 15;
    if (status.syncHub.available) score += 10;
    if (status.music.available) score += 10;
    if (status.historyGo.available) score += 10;
    if (status.knowledgeGraphIntelligence.available) score += 5;
    status.nextActions = buildProductNextActions(status);
    status.primaryNextAction = getPrimaryNextAction(status);
    if (status.primaryNextAction?.href) score += 5;
    score = Math.min(100, score);
    status.overall = { status: statusFromScore(score), score, label: `${score}/100 · ${statusFromScore(score)}` };
    status.summary = `AHA er ${status.overall.status}: Kilder, Knowledge Workbench, Data Intake, Knowledge Curation, Knowledge Map, Graph Intelligence, Training Corpus, Personal AI og AHA Chat er samlet i én produktflyt.`;
    if (options.save !== false) saveProductStatus(status);
    return status;
  }

  function saveProductStatus(status) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(status)); } catch {}
    return status;
  }

  function loadProductStatus() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch { return null; }
  }

  window.AHAProductIntegration = { VERSION, STORAGE_KEY, buildProductStatus, collectNavigationStatus, collectModuleStatus, buildProductNextActions, getPrimaryNextAction, saveProductStatus, loadProductStatus };
})();
