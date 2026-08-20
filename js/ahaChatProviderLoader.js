// Versjonert provider-manifest og lastesøm for AHA Chat.

(function (global) {
  "use strict";

  function spec(legacyGlobal, functions = [], factory = null) {
    return Object.freeze({
      legacyGlobal,
      label: legacyGlobal,
      functions: Object.freeze(functions.slice()),
      factory
    });
  }

  const CHAT_PROVIDERS = Object.freeze({
    textUtils: spec("AHAChatTextUtils", ["shortHash", "takeKeywords", "sourceHash", "cleanArticleText", "toSentences", "collectOpinionArticleEvidence"]),
    signals: spec("AHAChatSignals", [
      "detectTextType", "detectPublicAdministrationReformSignal", "detectPublicAdministrationSignal",
      "inferReligiousLexiconEvidence", "detectCanonicalAnalysisDomain",
      "detectInstitutionalMediaHistorySignal", "detectLiteraryAttachmentSignal"
    ]),
    subjects: spec("AHAChatSubjects", ["normalizeSubjectLinks", "enrichSubjectMatchesForClimateConflict", "enrichSubjectMatchesForPublicAdministration", "normalizeFagkoblinger", "isAcademicLikeType"]),
    analysis: spec("AHAChatAnalysis", ["buildOpinionArticleQualityAnalysis"]),
    replyFormat: spec("AHAChatReplyFormat", ["normalizeAhaVisibleReply", "createSubjectPolicy"]),
    chamberStore: spec("AHAChatChamberStore", ["create"], "create"),
    autoOutputStore: spec("AHAChatAutoOutputStore", ["create"], "create"),
    uiRuntime: spec("AHAChatUiRuntime", ["createShell", "create"]),
    analysisPolicy: spec("AHAChatAnalysisPolicy", ["create"], "create"),
    conceptPolicy: spec("AHAChatConceptPolicy", ["create"], "create"),
    analysisRunContract: spec("AHAChatAnalysisRunContract"),
    memoryControls: spec("AHAChatMemoryControls", ["create"], "create"),
    afterwork: spec("AHAChatAfterwork", ["create", "createAutoOutputAdapter"], "create"),
    memoryRuntime: spec("AHAChatMemoryRuntime", ["create"], "create"),
    runContext: spec("AHAChatRunContext", ["create", "createSubmissionRuntime"], "create"),
    insightPipeline: spec("AHAChatInsightPipeline", ["create"], "create"),
    agentRuntime: spec("AHAChatAgentRuntime", ["create"], "create"),
    ingestRuntime: spec("AHAChatIngestRuntime", ["create"], "create"),
    academicInsightView: spec("AHAChatAcademicInsightView", ["create"], "create"),
    insightView: spec("AHAChatInsightView", ["create"], "create"),
    personalUi: spec("AHAChatPersonalUi", ["create"], "create"),
    conversationView: spec("AHAChatConversationView", ["create"], "create"),
    analysisStateView: spec("AHAChatAnalysisStateView", ["create"], "create"),
    autoAnalysis: spec("AHAChatAutoAnalysis", ["create"], "create"),
    autoOutputView: spec("AHAChatAutoOutputView", ["create", "createRuntime"], "create"),
    canonicalAnalysis: spec("AHAChatCanonicalAnalysis", ["create"], "create"),
    capabilityBindings: spec("AHAChatCapabilityBindings", ["bind"]),
    export: spec("AHAChatExport", ["createRuntime"]),
    knowledgeView: spec("AHAChatKnowledgeView", ["create"]),
    runtimeFacade: spec("AHAChatRuntimeFacade", ["create"]),
    runtimeComposition: spec("AHAChatRuntimeComposition", ["create"], "create"),
    applicationComposition: spec("AHAChatApplicationComposition", ["create"], "create")
  });

  function create(deps = {}) {
    const moduleApi = deps.moduleApi || global.AHAModuleApi;
    const legacyRoot = deps.legacyRoot || global;
    let insightsCompatBase = null;
    let insightsCompatMeta = null;
    let insightsCompatView = null;

    function resolveBase(name, legacyGlobal) {
      return moduleApi?.resolve?.(name, legacyGlobal, { version: 1 }) || legacyRoot[legacyGlobal] || null;
    }

    function buildInsightsCompatibilityView(insights) {
      if (!insights || typeof insights.buildMetaProfile === "function") return insights;
      const metaInsights = resolveBase("meta", "MetaInsightsEngine");
      if (typeof metaInsights?.buildUserMetaProfile !== "function") return insights;
      if (insightsCompatView && insightsCompatBase === insights && insightsCompatMeta === metaInsights) {
        return insightsCompatView;
      }

      // RuntimeComposition har fortsatt en legacy export-seam som spør
      // InsightsEngine etter buildMetaProfile(), mens eierskapet ligger i
      // MetaInsightsEngine. Provider-objektene kan være Object.freeze()-låst i
      // produksjon, så denne kompatibiliteten må være en read-only view og må
      // aldri mutere den faktiske InsightsEngine-provideren.
      const view = Object.create(insights);
      Object.defineProperty(view, "buildMetaProfile", {
        configurable: false,
        enumerable: false,
        writable: false,
        value(chamber) {
          return metaInsights.buildUserMetaProfile(chamber, "sub_laring") || {};
        }
      });
      insightsCompatBase = insights;
      insightsCompatMeta = metaInsights;
      insightsCompatView = Object.freeze(view);
      return insightsCompatView;
    }

    function resolve(name, legacyGlobal) {
      const provider = resolveBase(name, legacyGlobal);
      if (name === "insights" || legacyGlobal === "InsightsEngine") {
        return buildInsightsCompatibilityView(provider);
      }
      return provider;
    }

    function getSpec(key) {
      const providerSpec = CHAT_PROVIDERS[key];
      if (!providerSpec) throw new Error(`Ukjent AHA Chat-provider: ${key}`);
      return providerSpec;
    }

    function validateFunctions(provider, providerSpec, label) {
      const missing = providerSpec.functions.filter((name) => typeof provider?.[name] !== "function");
      if (missing.length) {
        throw new Error(`${label} må eksponere: ${missing.join(", ")}.`);
      }
      return provider;
    }

    function requireProvider(key) {
      const providerSpec = getSpec(key);
      const provider = resolve(`chat.${key}`, providerSpec.legacyGlobal);
      if (!provider) throw new Error(`${providerSpec.label} må lastes før ahaChat.js.`);
      return validateFunctions(provider, providerSpec, providerSpec.label);
    }

    function instantiate(key, factoryDeps, options = {}) {
      const providerSpec = getSpec(key);
      const label = options.label || providerSpec.label;
      const factoryName = options.factory || providerSpec.factory || "create";
      const provider = resolve(`chat.${key}`, providerSpec.legacyGlobal);
      if (!provider) throw new Error(`${label} må lastes før ahaChat.js.`);
      validateFunctions(provider, providerSpec, providerSpec.label);
      if (typeof provider[factoryName] !== "function") {
        throw new Error(`${label} må eksponere: ${factoryName}.`);
      }
      const instance = provider[factoryName](factoryDeps);
      if (!instance) throw new Error(`${label} må lastes før ahaChat.js.`);
      return instance;
    }

    return Object.freeze({ resolve, require: requireProvider, instantiate });
  }

  const publicApi = Object.freeze({ create, CHAT_PROVIDERS });
  global.AHAChatProviderLoader = publicApi;
  global.AHAModuleApi?.register?.("chat.providerLoader", publicApi, {
    version: 1,
    legacyGlobal: "AHAChatProviderLoader",
    exports: Object.keys(publicApi)
  });
})(window);
