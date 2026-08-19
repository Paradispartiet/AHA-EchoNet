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

  // Semantic quality bridge v1
  // --------------------------
  // The normal AHA reply already comes from the AI agent and is bound to the
  // current run. The legacy afterwork path was still able to ignore that
  // semantic signal and fall back to keyword/sub-string heuristics. Keep the
  // provider API stable, but make the same-run reply a source-bound semantic
  // fallback for substantive general text. This is deliberately generic: it
  // contains no person-, place- or fixture-specific rules.

  function semanticNormalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function semanticSentences(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function semanticWords(value) {
    const stop = new Set([
      "dette", "disse", "teksten", "artikkelen", "viser", "hvordan", "som", "med", "fra", "til", "for",
      "det", "den", "der", "har", "var", "blir", "ble", "kan", "skal", "vil", "og", "eller", "men", "seg",
      "sin", "sitt", "sine", "ikke", "etter", "under", "over", "også", "ogsa"
    ]);
    return semanticNormalize(value).match(/[a-zæøå0-9]{4,}/g)?.filter((word) => !stop.has(word)) || [];
  }

  function semanticOverlap(left, right) {
    const a = new Set(semanticWords(left));
    const b = new Set(semanticWords(right));
    if (!a.size || !b.size) return 0;
    let shared = 0;
    a.forEach((word) => { if (b.has(word)) shared += 1; });
    return shared / Math.max(1, Math.min(a.size, b.size));
  }

  function substantiveSource(sourceText) {
    const source = String(sourceText || "").trim();
    return source.length >= 320 && semanticWords(source).length >= 45 && semanticSentences(source).length >= 4;
  }

  function genericLowInformationText(value) {
    return /usikker årsaksforståelse|manglende spesifisitet|for få konkrete holdepunkter|lav informasjonsdensitet|etterspør kontekst|mønster:\s*\S+\s+går igjen og bærer teksten/i.test(String(value || ""));
  }

  function cleanSemanticSignal(value) {
    const text = String(value || "")
      .replace(/^AHA-responsen peker videre på:\s*/i, "")
      .replace(/^Kildepunkt:\s*/i, "")
      .trim();
    if (!text || genericLowInformationText(text)) return "";
    if (/^(Spenning bygges fra flere meldinger|Tema identifiseres fortløpende)/i.test(text)) return "";
    return text;
  }

  function sourceInterpretiveSentence(sourceText) {
    const sentences = semanticSentences(sourceText);
    if (!sentences.length) return "";
    return sentences
      .map((sentence, index) => {
        const normalized = semanticNormalize(sentence);
        let score = 0;
        if (/forholdet mellom|spenning|kontrast|balanse|versus|kontra/.test(normalized)) score += 6;
        if (/form og innhold|frihet|ramme|forutsetning|sammenheng/.test(normalized)) score += 4;
        if (/men|samtidig|likevel|derimot/.test(normalized)) score += 2;
        if (/viser|vitner|viktig|slår|betydning/.test(normalized)) score += 1;
        score += Math.min(1.5, semanticWords(sentence).length / 12);
        return { sentence, score, index };
      })
      .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.sentence || sentences[0];
  }

  function sourceConclusionSentence(sourceText) {
    const sentences = semanticSentences(sourceText);
    return [...sentences].reverse().find((sentence) =>
      /\b(i det hele tatt|viser|vitner|viktig|derfor|samlet|poeng|konklus)/i.test(sentence)
    ) || sentences[sentences.length - 1] || sentences[0] || "";
  }

  function bestReplySemanticSentence(reply, sourceText) {
    const candidates = semanticSentences(reply)
      .filter((sentence) => !/^(hvis du|du kan|vil du|det kan være verdt)/i.test(sentence));
    if (!candidates.length) return "";
    return candidates
      .map((sentence, index) => {
        const normalized = semanticNormalize(sentence);
        const conceptualHits = [
          "viser", "illustrerer", "forhold", "betydning", "kombiner", "frihet", "form", "innhold", "teknikk",
          "sammenheng", "metode", "historisk", "politisk", "konflikt", "rolle", "virkning", "endring"
        ].filter((term) => normalized.includes(term)).length;
        const score = (semanticOverlap(sourceText, sentence) * 5)
          + Math.min(2.5, conceptualHits * 0.45)
          + Math.min(1, semanticWords(sentence).length / 24);
        return { sentence, score, index };
      })
      .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.sentence || "";
  }

  function uniqueSemantic(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter((value) => {
      const key = semanticNormalize(value).replace(/[.!?;,:]+$/u, "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function buildGenericSemanticFields(sourceText, reply, base = {}) {
    if (!substantiveSource(sourceText)) return null;
    const replySentences = semanticSentences(reply);
    const sourceSentences = semanticSentences(sourceText);
    const theme = cleanSemanticSignal(replySentences[0])
      || cleanSemanticSignal(base?.theme)
      || cleanSemanticSignal(sourceConclusionSentence(sourceText))
      || sourceSentences[0]
      || "";
    const mainTension = cleanSemanticSignal(sourceInterpretiveSentence(sourceText))
      || cleanSemanticSignal(base?.mainTension)
      || "Ingen sikker hovedspenning er fastslått; behold analysen kildebundet.";
    const keyInsight = cleanSemanticSignal(bestReplySemanticSentence(reply, sourceText))
      || cleanSemanticSignal(base?.keyInsight)
      || cleanSemanticSignal(sourceConclusionSentence(sourceText))
      || mainTension
      || theme;
    return {
      theme: String(theme).slice(0, 320),
      mainTension: String(mainTension).slice(0, 320),
      keyInsight: String(keyInsight).slice(0, 420)
    };
  }

  function installSemanticQualityBridge() {
    const signals = global.AHAChatSignals;
    if (signals && typeof signals.detectTextType === "function" && !signals.__semanticQualityV1) {
      const originalDetectTextType = signals.detectTextType.bind(signals);
      signals.detectTextType = function detectTextTypeWithLexicalBoundaries(raw) {
        const source = String(raw || "");
        const result = originalDetectTextType(source);
        const normalized = semanticNormalize(source);
        if (result === "theory_idea") {
          const explicitTheory = /\b(?:teori|modell|bevissthet|hypotese|begrep|premiss|epistem(?:ologi|isk)?)\b/i.test(normalized);
          if (!explicitTheory) return "general";
        }
        if (result === "literary_fragment") {
          const explicitLiterary = /\b(?:scene|stemning|rytme|lys|mørke|rommet|gaten|kropp|språk|vind|lukt|hud|sans)\b/i.test(normalized);
          if (!explicitLiterary) return "general";
        }
        return result;
      };
      Object.defineProperty(signals, "__semanticQualityV1", { value: true, enumerable: false });
    }

    const autoAnalysis = global.AHAChatAutoAnalysis;
    if (autoAnalysis && typeof autoAnalysis.create === "function" && !autoAnalysis.__semanticQualityV1) {
      const originalCreate = autoAnalysis.create.bind(autoAnalysis);
      autoAnalysis.create = function createSemanticAutoAnalysis(deps = {}) {
        const instance = originalCreate(deps);
        if (!instance || typeof instance.buildAutoOutputs !== "function") return instance;
        const originalBuild = instance.buildAutoOutputs.bind(instance);
        return Object.freeze({
          ...instance,
          buildAutoOutputs(userText, ahaReply) {
            const payload = originalBuild(userText, ahaReply);
            const sourceText = String(userText || "");
            const reply = String(ahaReply || "");
            if (!payload || typeof payload !== "object") return payload;
            payload.assistantReply = reply;
            const textType = global.AHAChatSignals?.detectTextType?.(sourceText) || payload.textType;
            if (!substantiveSource(sourceText) || !["general", "theory_idea", "literary_fragment"].includes(String(textType || ""))) return payload;
            const semantic = buildGenericSemanticFields(sourceText, reply, payload?.ahaSer || {});
            if (!semantic) return payload;
            const sourceFocus = sourceInterpretiveSentence(sourceText);
            const sourceConclusion = sourceConclusionSentence(sourceText);
            const bestReply = bestReplySemanticSentence(reply, sourceText);
            const cleanedExisting = (Array.isArray(payload.insightCards) ? payload.insightCards : [])
              .filter((item) => !genericLowInformationText(item));
            payload.insightCards = uniqueSemantic([bestReply, sourceFocus, sourceConclusion, ...cleanedExisting]).slice(0, 4);
            payload.reflection = `Kilden samler seg særlig rundt «${String(sourceFocus || semantic.mainTension).slice(0, 240)}». ${bestReply || semantic.keyInsight}`.trim();
            payload.path = uniqueSemantic([
              `Avgrens hovedtemaet: ${semantic.theme}.`,
              `Undersøk hovedspenningen: ${semantic.mainTension}.`,
              sourceFocus ? `Knytt hovedinnsikten til kildepassasjen «${String(sourceFocus).slice(0, 180)}».` : "Knytt hovedinnsikten til ett konkret kildebelegg.",
              "Test hovedtolkningen mot en alternativ lesning av det samme materialet."
            ]).slice(0, 4);
            payload.thoughts = {
              ...(payload.thoughts && typeof payload.thoughts === "object" ? payload.thoughts : {}),
              hovedspor: semantic.theme,
              lose_tanker: semantic.mainTension,
              neste_steg: payload.path[2] || payload.path[0]
            };
            payload.ahaSer = {
              ...(payload.ahaSer && typeof payload.ahaSer === "object" ? payload.ahaSer : {}),
              innholdstype: textType,
              tema: semantic.theme,
              hovedspenning: semantic.mainTension,
              viktigsteInnsikt: semantic.keyInsight,
              nesteSteg: payload.path[2] || payload.path[0],
              kortSvar: semantic.keyInsight
            };
            return payload;
          }
        });
      };
      Object.defineProperty(autoAnalysis, "__semanticQualityV1", { value: true, enumerable: false });
    }

    const canonicalAnalysis = global.AHAChatCanonicalAnalysis;
    if (canonicalAnalysis && typeof canonicalAnalysis.create === "function" && !canonicalAnalysis.__semanticQualityV1) {
      const originalCreate = canonicalAnalysis.create.bind(canonicalAnalysis);
      canonicalAnalysis.create = function createSemanticCanonicalAnalysis(deps = {}) {
        const instance = originalCreate(deps);
        if (!instance || typeof instance.buildCanonicalAnalysis !== "function") return instance;
        const originalBuild = instance.buildCanonicalAnalysis.bind(instance);
        return Object.freeze({
          ...instance,
          buildCanonicalAnalysis(payload, sourceText = "") {
            const canonical = originalBuild(payload, sourceText);
            const source = String(sourceText || "");
            const contentType = String(payload?.textType || canonical?.contentType || global.AHAChatSignals?.detectTextType?.(source) || "");
            const shouldRefine = substantiveSource(source)
              && (["general", "theory_idea", "literary_fragment"].includes(contentType) || genericLowInformationText(JSON.stringify(canonical || {})));
            if (!shouldRefine) return canonical;
            const semantic = buildGenericSemanticFields(source, payload?.assistantReply || "", canonical || {});
            if (!semantic) return canonical;
            const subjectLabels = (Array.isArray(payload?.subjectMatches) ? payload.subjectMatches : [])
              .map((item) => String(item?.title || item?.label || item?.subject_label || item?.subject_id || "").trim())
              .filter(Boolean);
            const focus = sourceInterpretiveSentence(source);
            return {
              ...(canonical && typeof canonical === "object" ? canonical : {}),
              contentType,
              domain: canonical?.domain && !/generic|unknown/i.test(String(canonical.domain)) ? canonical.domain : "source_bound_general",
              theme: semantic.theme,
              mainTension: semantic.mainTension,
              keyInsight: semantic.keyInsight,
              fieldConnections: uniqueSemantic([...(Array.isArray(canonical?.fieldConnections) ? canonical.fieldConnections : []), ...subjectLabels]).slice(0, 6),
              suggestedActions: uniqueSemantic([
                focus ? `Knytt hovedinnsikten eksplisitt til kildepassasjen «${String(focus).slice(0, 180)}».` : "Knytt hovedinnsikten til ett konkret kildebelegg.",
                "Test hovedtolkningen mot en alternativ lesning av det samme materialet."
              ]).slice(0, 3),
              confidence: {
                ...(canonical?.confidence && typeof canonical.confidence === "object" ? canonical.confidence : {}),
                contentType: Math.max(0.65, Number(canonical?.confidence?.contentType) || 0),
                domain: Math.max(0.5, Number(canonical?.confidence?.domain) || 0),
                theme: Math.max(0.68, Number(canonical?.confidence?.theme) || 0),
                mainTension: Math.max(0.62, Number(canonical?.confidence?.mainTension) || 0)
              },
              warnings: uniqueSemantic([
                ...(Array.isArray(canonical?.warnings) ? canonical.warnings.filter((item) => !/lav informasjonsdensitet|for få konkrete/i.test(String(item))) : []),
                "Semantisk syntese bygger på aktiv kildetekst og samme-run AHA-svar; særskilt fagdomene er ikke fastslått."
              ]).slice(0, 6),
              semanticSynthesis: {
                version: "aha_same_run_semantic_synthesis_v1",
                source: "active_source_plus_same_run_ai_reply",
                sourceBound: true
              }
            };
          }
        });
      };
      Object.defineProperty(canonicalAnalysis, "__semanticQualityV1", { value: true, enumerable: false });
    }

    const evaluator = global.AHAAnalysisQualityEvaluator;
    if (evaluator && typeof evaluator.evaluateAnalysis === "function" && !evaluator.__semanticQualityV1) {
      const originalEvaluate = evaluator.evaluateAnalysis.bind(evaluator);
      const wrappedEvaluator = Object.freeze({
        ...evaluator,
        __semanticQualityV1: true,
        evaluateAnalysis(payload, sourceText, options = {}) {
          const report = originalEvaluate(payload, sourceText, options);
          if (!substantiveSource(sourceText)) return report;
          const canonical = payload?.canonicalAnalysis && typeof payload.canonicalAnalysis === "object" ? payload.canonicalAnalysis : payload || {};
          const semanticCore = [
            canonical?.theme,
            canonical?.mainTension,
            canonical?.keyInsight,
            ...(Array.isArray(canonical?.warnings) ? canonical.warnings : []),
            ...(Array.isArray(canonical?.suggestedActions) ? canonical.suggestedActions : [])
          ].join(" ");
          const interpretationClaims = (Array.isArray(report?.claims) ? report.claims : []).filter((claim) => claim?.kind === "interpretation");
          const unanchored = interpretationClaims.length > 0
            && interpretationClaims.every((claim) => Number(claim?.sourceOverlap || 0) < 0.12);
          const lowInformationFallback = genericLowInformationText(semanticCore);
          if (!lowInformationFallback && !unanchored) return report;
          const critical = uniqueSemantic([
            ...(Array.isArray(report?.critical) ? report.critical : []),
            ...(lowInformationFallback ? ["generic_low_information_fallback_on_substantive_source"] : []),
            ...(unanchored ? ["unanchored_core_interpretation"] : [])
          ]);
          return {
            ...report,
            status: "blocked",
            critical,
            summary: "Analysen er kildebundet teknisk, men den semantiske hovedtolkningen må rettes før den kan behandles som kvalitetssikret."
          };
        }
      });
      global.AHAAnalysisQualityEvaluator = wrappedEvaluator;
    }
  }

  installSemanticQualityBridge();

  function create(deps = {}) {
    const moduleApi = deps.moduleApi || global.AHAModuleApi;
    const legacyRoot = deps.legacyRoot || global;

    function resolve(name, legacyGlobal) {
      return moduleApi?.resolve?.(name, legacyGlobal, { version: 1 }) || legacyRoot[legacyGlobal] || null;
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
