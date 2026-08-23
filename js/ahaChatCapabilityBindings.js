// Versjonerte capability-grupper for provider-instansene som AHA Chat bruker.

(function (global) {
  "use strict";

  function capability(source, target = source, type = "function") {
    return Object.freeze({ source, target, type });
  }

  function functions(...names) {
    return names.map((name) => capability(name));
  }

  function group(entries) {
    return Object.freeze(entries.slice());
  }

  const CHAT_CAPABILITY_GROUPS = Object.freeze({
    textUtils: group(functions(
      "shortHash", "takeKeywords", "sourceHash", "cleanArticleText", "toSentences",
      "collectOpinionArticleEvidence"
    )),
    signals: group(functions(
      "detectTextType", "detectPublicAdministrationReformSignal",
      "detectPublicAdministrationSignal", "inferReligiousLexiconEvidence",
      "detectCanonicalAnalysisDomain", "detectInstitutionalMediaHistorySignal",
      "detectLiteraryAttachmentSignal"
    )),
    subjects: group(functions(
      "normalizeSubjectLinks", "enrichSubjectMatchesForClimateConflict",
      "enrichSubjectMatchesForPublicAdministration", "normalizeFagkoblinger", "isAcademicLikeType"
    )),
    analysis: group(functions("buildOpinionArticleQualityAnalysis")),
    replyFormat: group(functions("normalizeAhaVisibleReply", "createSubjectPolicy")),
    chamberStore: group([
      capability("load", "loadChamberFromStorage"),
      capability("save", "saveChamberToStorage"),
      capability("clear", "clearChamberStorage")
    ]),
    autoOutputStore: group([
      capability("load", "loadAutoOutputs"),
      capability("save", "saveAutoOutputs"),
      capability("clear", "clearAutoOutputs")
    ]),
    shellRuntime: group([
      ...functions(
        "getThemeId", "getFieldId", "out", "setStatusNote", "escHtml", "renderAuxPanel",
        "renderPanel", "currentInsights", "normalizeDisplayText", "resolveConceptTerm",
        "suggestCategoryChips", "refreshAhaExplorer"
      ),
      capability("renderChatMemoryStatus", "renderAhaChatMemoryStatus")
    ]),
    analysisPolicy: group(functions(
      "normalizeConceptSurface", "normalizeVisibleAcademicLabel", "detectLiteraryAttachmentSignal",
      "detectInstitutionalMediaHistorySignal", "extractMainInstitutionName", "subjectMatchesFromCalibration",
      "detectAutoAnalysisDomain", "getSongLyricChildCultureSubjectMatches", "enforceCanonicalSourceGrounding",
      "normalizeSubjectMatches", "getLiterarySubjectMatches", "getInstitutionalMediaHistorySubjectMatches",
      "getLiteraryAttachmentLearningPath", "short", "hasAcademicSignals", "filterDomainInsightCards",
      "normalizeAcademicAfterworkPayload", "isGenericDisplayConcept", "extractAcademicPhraseConcepts",
      "normalizeSimpleStringList", "normalizeTheoreticalLinks", "extractAcademicTheoryLinks",
      "mergeTheoryLinks", "buildAcademicConceptCandidates"
    )),
    conceptPolicy: group(functions(
      "normalizeConceptKey", "getCanonicalConceptLabel", "getCanonicalConceptKey",
      "isBlockedStandaloneConcept", "prioritizeVisibleConceptEdges", "applyPhraseConceptDisplayPreference",
      "filterConceptLabels", "canonicalizeDisplayConcept", "isWeakConceptWord"
    )),
    memoryControls: group(functions(
      "bindView", "normalizeAhaMemoryControls", "loadAhaMemoryControls", "saveAhaMemoryControls",
      "setAhaMemoryControl", "resetAhaMemoryControls", "isAhaSavingEnabled", "isAhaMemoryUseEnabled",
      "buildAhaMemoryOffContext", "loadAhaMemoryExclusions", "saveAhaMemoryExclusions",
      "getAhaMemoryInsightStableKey", "getAhaMemoryInsightKey", "isAhaMemoryInsightExcluded",
      "excludeAhaMemoryInsight", "includeAhaMemoryInsight", "resetAhaMemoryExclusions",
      "getAhaExcludedMemoryItems"
    )),
    afterwork: group(functions(
      "loadAfterworkEntries", "saveAfterworkEntries", "showSavedAfterwork",
      "buildFromAfterworkEntry", "deleteAfterworkEntry"
    )),
    memoryRuntime: group(functions(
      "memoryConceptLabel", "isAhaMemoryQuestion", "findRelevantLocalMemory", "shouldUseAhaMemory",
      "formatAhaMemoryContextForAgent", "buildAhaMemoryContext", "isAhaMemoryDebugEnabled",
      "buildAhaMemoryTransparency", "formatAhaMemoryTransparencyDetails", "formatAhaMemoryTimestamp",
      "buildAhaMemoryStatus", "buildAhaLearningContractReply"
    )),
    runContext: group(functions(
      "getActiveAnalysisRun", "setActiveAnalysisRun", "createAnalysisRun", "updateAnalysisRun",
      "bindAnalysisArtifact", "artifactMatchesActiveRun", "isActiveAnalysisRun",
      "scoreRetrievalAgainstSource", "filterRetrievalForActiveSource",
      "filterMemoryContextForActiveSource", "analysisTopicMismatch"
    )),
    afterworkAutoAdapter: group(functions(
      "normalizeAfterworkConcept", "saveAutoOutputAsAfterwork", "ensureAfterworkForLatestAnalysis"
    )),
    insightPipeline: group(functions("generateAIInsightCandidates", "buildSemanticInsightCandidates")),
    agentRuntime: group(functions("buildAIState", "askAhaAgent")),
    ingestRuntime: group(functions(
      "handleUserMessage", "ingestUserMessageWithCandidates", "generateAnalysisInsightCandidates",
      "handleUserMessageInsightCandidatesInBackground"
    )),
    academicInsightView: group(functions(
      "parseLabeledInsightCards", "readLatestAcademicContext", "buildAcademicSyntheticInsightCards"
    )),
    insightView: group(functions("isFragmentaryInsightCard", "bindPanelActionHandler", "showInsights")),
    personalUi: group(functions(
      "buildAhaPersonalMessageContext", "buildAhaAnswerPackage", "renderAhaAnswerComposer",
      "renderAhaAnswerEvaluation", "evaluateAhaAnswerForChat", "renderAhaPersonalContextStatus",
      "renderAhaPersonalRetrieval", "buildAhaPersonalAiLoopChatReadinessStatus",
      "renderAhaPersonalAiLoopStatus", "renderAhaMemoryTransparency", "renderAhaMemoryStatus",
      "renderAhaMemoryControls", "bindAhaMemoryControls", "updateAhaMemoryStatus"
    )),
    conversationView: group(functions(
      "appendChat", "renderHighlightsRail", "updateEmptyState", "updateAnswerActionsVisibility"
    )),
    analysisStateView: group([
      ...functions("renderAnalysisDebugPanel", "setExportButtonsEnabled", "clearActiveAnalysisState"),
      capability("setProcessing", "setAhaProcessing"),
      capability("resetView", "resetAnalysisStateView")
    ]),
    autoAnalysis: group([
      ...functions(
        "getUrlDominanceInfo", "isSportsArticleAnalysis", "buildArticleSourceTextFromAnalysis",
        "buildSourceGroundedAcademicPayload", "applyRuntimeKnowledgePolicy", "isTransientAnalysisDocument",
        "buildAutoOutputs", "buildAutoOutputFallbackPayload"
      ),
      capability("AHA_RUNTIME_KNOWLEDGE_POLICY", "AHA_RUNTIME_KNOWLEDGE_POLICY", "value")
    ]),
    autoOutputView: group(functions(
      "buildAhaSerCard", "renderAutoOutputPayload", "filterCrossDomainAutoPayload"
    )),
    canonicalAnalysis: group(functions(
      "resolveCanonicalAnalysisWithOptionalPythonEngine", "buildCanonicalAnalysis"
    ))
  });

  function bind(groupName, source) {
    const definition = CHAT_CAPABILITY_GROUPS[groupName];
    if (!definition) throw new Error(`Ukjent AHA Chat-capability-gruppe: ${groupName}`);
    if (!source || typeof source !== "object") {
      throw new Error(`AHA Chat-capability-gruppen ${groupName} mangler kilde.`);
    }

    const bindings = {};
    const missing = [];
    definition.forEach((entry) => {
      const value = source[entry.source];
      const valid = entry.type === "value" ? value !== undefined : typeof value === "function";
      if (!valid) missing.push(entry.source);
      else bindings[entry.target] = value;
    });
    if (missing.length) {
      throw new Error(`AHA Chat-capability-gruppen ${groupName} må eksponere: ${missing.join(", ")}.`);
    }
    return Object.freeze(bindings);
  }

  const publicApi = Object.freeze({ bind, CHAT_CAPABILITY_GROUPS });
  global.AHAChatCapabilityBindings = publicApi;
  global.AHAModuleApi?.register?.("chat.capabilityBindings", publicApi, {
    version: 1,
    legacyGlobal: "AHAChatCapabilityBindings",
    exports: Object.keys(publicApi)
  });
})(window);
