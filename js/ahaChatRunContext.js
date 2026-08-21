// ahaChatRunContext.js
// Eier aktiv analyserun og beskytter analyseartefakter, retrieval og minne mot
// å lekke mellom kilder. DOM-fri og lastes før ahaChat.js.

(function (global) {
  "use strict";

  function create(dependencies = {}) {
    const sourceHash = dependencies.sourceHash;
    const shortHash = dependencies.shortHash;
    const takeKeywords = dependencies.takeKeywords;
    const formatMemoryContextForAgent = dependencies.formatMemoryContextForAgent;
    const buildMemoryOffContext = dependencies.buildMemoryOffContext;
    const defaultConversationId = dependencies.defaultConversationId || "default_thread";
    const analysisRunContract = dependencies.analysisRunContract || global.AHAChatAnalysisRunContract;

    if (typeof sourceHash !== "function" || typeof shortHash !== "function" || typeof takeKeywords !== "function" || !analysisRunContract?.create) {
      throw new Error("AHAChatRunContext krever sourceHash, shortHash, takeKeywords og AHAAnalysisRun-kontrakten.");
    }

    let activeAnalysisRun = null;

    function getActiveAnalysisRun() {
      return activeAnalysisRun;
    }

    function setActiveAnalysisRun(run) {
      activeAnalysisRun = run ? analysisRunContract.update(run, {}) : null;
      return activeAnalysisRun;
    }

    function createAnalysisRun(sourceText, options = {}) {
      const source = String(sourceText || "").trim();
      const fingerprint = sourceHash(source);
      const createdAt = new Date().toISOString();
      const base = `${fingerprint}|${createdAt}|${Math.random().toString(36).slice(2)}`;
      const analysisRunId = options.analysisRunId || options.runId || `run_${shortHash(`${base}|run`)}`;
      const conversationId = options.conversationId || options.sessionId || defaultConversationId;
      const topicLabel = options.topicLabel || takeKeywords(source, 4).join(" · ") || "ukjent tema";
      return analysisRunContract.create({
        analysisId: options.analysisId || `analysis_${shortHash(base)}`,
        analysisRunId,
        runId: analysisRunId,
        conversationId,
        sessionId: conversationId,
        turnId: options.turnId || `turn_${shortHash(`${conversationId}|${analysisRunId}|${createdAt}`)}`,
        sourceId: options.sourceId || `source_${fingerprint || shortHash(base)}`,
        sourceKind: options.sourceKind || "chat",
        sourceType: options.sourceType || options.sourceKind || "chat",
        sourceText: source,
        memoryAllowed: options.memoryAllowed === true,
        memoryMode: options.memoryMode || (options.memoryAllowed === true ? "allowed" : "off"),
        createdAt,
        topicLabel,
        sourceHash: fingerprint,
        normalizedSourceHash: fingerprint,
        sourceTextHash: fingerprint,
        sourceFingerprint: fingerprint,
        sourcePreview: source.replace(/\s+/g, " ").slice(0, 180)
      });
    }

    function updateAnalysisRun(patch, run = activeAnalysisRun) {
      return analysisRunContract.update(run, patch);
    }

    function bindAnalysisArtifact(artifact, run = activeAnalysisRun, field = "", options = {}) {
      if (!artifact || typeof artifact !== "object" || !run) return artifact;
      analysisRunContract.bindArtifact(artifact, run, field, options);
      if (options.producer === "current_analysis_run") artifact.topicLabel = run.topicLabel || artifact.topicLabel || "";
      return artifact;
    }

    function artifactMatchesActiveRun(artifact, run = activeAnalysisRun) {
      if (!artifact || typeof artifact !== "object" || !run) return false;
      const artifactRunId = String(artifact.analysisRunId || artifact.runId || "");
      const activeRunId = String(run.analysisRunId || run.runId || "");
      if (!(artifactRunId && activeRunId && artifactRunId === activeRunId)) return false;
      const hash = String(artifact.source_sha256 || artifact.sourceSha256 || artifact.sourceHash || artifact.sourceTextHash || artifact.normalizedSourceHash || artifact.sourceFingerprint || "");
      return Boolean(/^[a-f0-9]{64}$/i.test(hash) && hash === run.sourceHash);
    }

    function isActiveAnalysisRun(run) {
      return Boolean(
        run &&
        activeAnalysisRun &&
        String(run.analysisRunId || run.runId || "") === String(activeAnalysisRun.analysisRunId || activeAnalysisRun.runId || "") &&
        String(run.sourceId || "") === String(activeAnalysisRun.sourceId || "")
      );
    }

    function topKeywordOverlap(sourceText, artifact) {
      const sourceTerms = new Set(takeKeywords(String(sourceText || ""), 12).map((item) => item.toLowerCase()));
      const artifactText = [artifact?.topicLabel, artifact?.theme, artifact?.keyInsight, artifact?.reflection, artifact?.summary, artifact?.ahaSer?.tema, artifact?.ahaSer?.viktigsteInnsikt, ...(Array.isArray(artifact?.sortItems) ? artifact.sortItems.map((item) => `${item?.label || ""} ${item?.text || ""}`) : [])].join(" ").toLowerCase();
      if (!sourceTerms.size || !artifactText.trim()) return true;
      return Array.from(sourceTerms).some((term) => term.length > 3 && artifactText.includes(term));
    }

    function analysisTopicMismatch(payload, run = activeAnalysisRun, sourceText = "") {
      if (!payload || !run) return false;
      if (!artifactMatchesActiveRun(payload, run)) return true;
      const canonical = payload.canonicalAnalysis && typeof payload.canonicalAnalysis === "object" ? payload.canonicalAnalysis : payload;
      if (canonical && !artifactMatchesActiveRun(canonical, run)) return true;
      const artifactHash = String(canonical?.sourceHash || canonical?.sourceTextHash || payload.sourceHash || payload.sourceTextHash || "");
      if (artifactHash && run.sourceHash && artifactHash !== run.sourceHash) return true;
      const canonicalLabel = String(canonical?.topicLabel || payload.topicLabel || "").toLowerCase();
      const activeLabel = String(run.topicLabel || "").toLowerCase();
      if (canonicalLabel && activeLabel && canonicalLabel !== activeLabel && !canonicalLabel.includes(activeLabel.split(" · ")[0] || "") && !activeLabel.includes(canonicalLabel.split(" · ")[0] || "")) return true;
      return !topKeywordOverlap(sourceText, canonical);
    }

    function tokenizeAnalysisRelevance(text) {
      const stop = new Set([
        "det","den","der","som","for","med","til","fra","ikke","eller","og","i","på","av","en","et","å","er","har","kan","skal","vil",
        "the","and","this","that","with","from",
        "sammendrag","artikkelen","undersøker","undersøkelse","undersøkelsen","studien","analyse","analysen","analyseres","metode","metoden",
        "resultat","resultatet","resultater","resultatene","hovedfunnet","hovedpoenget","forskerne","sammenligner","hvordan","viser","dokumentasjon"
      ]);
      return String(text || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").match(/[a-zæøå0-9]{4,}/g)?.filter((token) => !stop.has(token)).slice(0, 240) || [];
    }

    function retrievalItemText(item) {
      return [item?.title, item?.summary, item?.excerpt, item?.text, item?.sourceType, ...(Array.isArray(item?.concepts) ? item.concepts : []), ...(Array.isArray(item?.reasons) ? item.reasons : [])].filter(Boolean).join(" ");
    }

    function scoreRetrievalAgainstSource(item, sourceText) {
      const sourceTokens = new Set(tokenizeAnalysisRelevance(sourceText));
      const itemTokens = tokenizeAnalysisRelevance(retrievalItemText(item));
      if (!sourceTokens.size || !itemTokens.length) return 0;
      let overlap = 0;
      itemTokens.forEach((token) => { if (sourceTokens.has(token)) overlap += 1; });
      return overlap / Math.max(8, Math.min(itemTokens.length, sourceTokens.size));
    }

    function filterRetrievalForActiveSource(container, sourceText, run = activeAnalysisRun) {
      if (!container || typeof container !== "object") return container;
      const filterResults = (results) => {
        const rejected = [];
        const kept = (Array.isArray(results) ? results : []).filter((item) => {
          const score = scoreRetrievalAgainstSource(item, sourceText);
          const keep = score >= 0.08;
          if (!keep) rejected.push({ title: item?.title || item?.sourceId || "retrieval", score });
          else {
            item.relatedToAnalysisId = run?.analysisId || item.relatedToAnalysisId;
            item.relatedToSourceId = run?.sourceId || item.relatedToSourceId;
            item.relevanceToActiveSource = score;
          }
          return keep;
        });
        if (rejected.length) console.warn("AHA irrelevant retrieval forkastet for aktiv kilde", { analysisId: run?.analysisId, sourceId: run?.sourceId, rejected });
        return kept;
      };
      if (Array.isArray(container.results)) container.results = filterResults(container.results);
      if (container.retrieval && typeof container.retrieval === "object") filterRetrievalForActiveSource(container.retrieval, sourceText, run);
      if (container.semanticRetrieval && typeof container.semanticRetrieval === "object") filterRetrievalForActiveSource(container.semanticRetrieval, sourceText, run);
      if (container.context && typeof container.context === "object") filterRetrievalForActiveSource(container.context, sourceText, run);
      if (Array.isArray(container.selectedSources)) container.selectedSources = filterResults(container.selectedSources);
      return container;
    }

    function filterMemoryContextForActiveSource(memoryContext, sourceText, run = activeAnalysisRun) {
      const src = memoryContext && typeof memoryContext === "object" ? memoryContext : buildMemoryOffContext?.("Minne mangler.");
      if (!src?.used) return src;
      const rejected = [];
      const keepInsight = (item) => {
        const insight = item?.insight && typeof item.insight === "object" ? item.insight : item;
        const score = scoreRetrievalAgainstSource(insight, sourceText);
        const keep = score >= 0.08;
        if (!keep) rejected.push({ title: insight?.title || insight?.id || "memory", score });
        else if (insight && typeof insight === "object") {
          insight.relatedToAnalysisId = run?.analysisId || insight.relatedToAnalysisId;
          insight.relatedToSourceId = run?.sourceId || insight.relatedToSourceId;
          insight.relevanceToActiveSource = score;
        }
        return keep;
      };
      const selectedInsights = (Array.isArray(src.selectedInsights) ? src.selectedInsights : []).filter(keepInsight);
      const localMatches = (Array.isArray(src.localMatches) ? src.localMatches : []).filter(keepInsight);
      const semanticMatches = (Array.isArray(src.semanticMatches) ? src.semanticMatches : []).filter(keepInsight);
      if (rejected.length) console.warn("AHA irrelevant memoryContext forkastet for aktiv kilde", { analysisId: run?.analysisId, sourceId: run?.sourceId, rejected });
      if (!selectedInsights.length) {
        return Object.assign({}, src, {
          used: false,
          reason: "Tidligere minne ble forkastet: ikke relevant for aktiv kildetekst.",
          confidence: 0,
          mode: "filtered_irrelevant",
          localMatches,
          semanticMatches,
          selectedInsights: [],
          summaryForAgent: ""
        });
      }
      const next = Object.assign({}, src, {
        used: true,
        reason: src.reason || "Relevant minne matcher aktiv kildetekst.",
        localMatches,
        semanticMatches,
        selectedInsights
      });
      next.summaryForAgent = typeof formatMemoryContextForAgent === "function" ? formatMemoryContextForAgent(next) : "";
      next.used = Boolean(next.summaryForAgent);
      if (!next.used) next.reason = "Tidligere minne ble forkastet: ingen relevant agent-oppsummering.";
      return next;
    }

    return Object.freeze({
      getActiveAnalysisRun,
      setActiveAnalysisRun,
      createAnalysisRun,
      updateAnalysisRun,
      bindAnalysisArtifact,
      artifactMatchesActiveRun,
      isActiveAnalysisRun,
      analysisTopicMismatch,
      scoreRetrievalAgainstSource,
      filterRetrievalForActiveSource,
      filterMemoryContextForActiveSource
    });
  }

  function createSubmissionRuntime(dependencies = {}) {
    const config = dependencies.config || {};
    const input = dependencies.input || {};
    const memory = dependencies.memory || {};
    const retrieval = dependencies.retrieval || {};
    const analysis = dependencies.analysis || {};
    const ui = dependencies.ui || {};

    function prepareSubmission(text) {
      const cleanText = String(text || "").trim();
      if (!cleanText) return null;
      const urlInfo = input.getUrlDominanceInfo(cleanText);
      const transientAnalysisDocument = input.isTransientAnalysisDocument(cleanText, urlInfo);
      const savingEnabled = input.isAhaSavingEnabled();
      const persistedUserMessage = savingEnabled
        ? global.AHAChatPersistence?.appendUserMessage?.(cleanText, {
          source: "aha_chat",
          threadId: config.threadId,
          skip_insight: urlInfo.isSourceAction || transientAnalysisDocument,
          sourceRole: transientAnalysisDocument ? "analysis_source" : "user_memory",
          knowledgeEligible: !transientAnalysisDocument,
          memoryEligible: !transientAnalysisDocument,
          curationRequired: transientAnalysisDocument
        })
        : null;
      ui.renderChatMemoryStatus();
      ui.appendChat("user", cleanText);
      let linkReadPromise = null;
      if (global.AHALinkReader?.hasUrls?.(cleanText)) {
        linkReadPromise = global.AHALinkReader.processUrlsFromMessage(cleanText, {
          subject_id: config.subjectId,
          theme_id: input.getThemeId(),
          field_id: input.getFieldId(),
          reference_only: !urlInfo.isSourceAction,
          primary_source_kind: urlInfo.isSourceAction ? "url" : "pasted_text"
        }).catch((err) => {
          global.console.warn("AHA Link Reader feilet", err?.message || err);
        });
      }
      if (urlInfo.isSourceAction) {
        const ingest = global.AHAModuleApi?.resolve?.("ingest", "AHAIngest", { version: 1 }) || global.AHAIngest;
        ingest?.ingest?.({
          source_type: "chat_source_action",
          source_app: "aha_chat",
          content_type: "url",
          title: "AHA Chat-lenke",
          text: cleanText,
          user_created: true,
          imported: false,
          skip_insight: true,
          created_at: new Date().toISOString(),
          meta: { skip_insight: true, url_only: urlInfo.urlOnly, url_dominated: urlInfo.urlDominated }
        });
      }
      return { cleanText, urlInfo, transientAnalysisDocument, savingEnabled, persistedUserMessage, linkReadPromise };
    }

    async function handleMemoryQuestion(submission, textarea) {
      if (textarea) textarea.value = "";
      ui.setProcessing(true, "AHA leser minnestatus …");
      try {
        const memoryStatus = await memory.buildMemoryStatus();
        memory.renderMemoryStatus(memoryStatus);
        const learningReply = memory.buildLearningContractReply(memoryStatus);
        if (submission.savingEnabled) {
          global.AHAChatPersistence?.appendAssistantMessage?.(learningReply, {
            source: "aha_chat",
            threadId: config.threadId,
            tags: ["minne", "læring", "innsiktskammer"]
          });
        }
        ui.renderChatMemoryStatus();
        ui.appendChat("aha", learningReply, { categoryChips: ["minne", "læring", "innsiktskammer"] });
        return { type: "learning_contract", memoryStatus };
      } catch (err) {
        global.console.warn("AHA Learning Contract kunne ikke lese status", err);
        if (submission.savingEnabled) {
          global.AHAChatPersistence?.appendAssistantMessage?.("Minnestatus kunne ikke leses akkurat nå.", {
            source: "aha_chat",
            threadId: config.threadId,
            tags: ["status"]
          });
        }
        ui.renderChatMemoryStatus();
        ui.appendChat("aha", "Minnestatus kunne ikke leses akkurat nå.");
        return { type: "learning_contract", error: err };
      } finally {
        ui.setProcessing(false);
        void memory.updateMemoryStatus();
      }
    }

    async function prepareRetrieval(submission, textarea) {
      const { cleanText, urlInfo, transientAnalysisDocument, savingEnabled, persistedUserMessage, linkReadPromise } = submission;
      const sourceKind = urlInfo.isSourceAction ? "url" : "pasted_text";
      const analysisRun = analysis.createAnalysisRun(cleanText, {
        sourceId: persistedUserMessage?.id ? `chat_message_${persistedUserMessage.id}` : undefined,
        sourceKind
      });
      analysis.setActiveAnalysisRun(analysisRun);
      analysis.clearActiveAnalysisState(analysisRun);
      const memoryUseEnabled = memory.isMemoryUseEnabled();
      analysis.updateAnalysisRun?.({
        sourceText: cleanText,
        sourceType: sourceKind,
        memoryAllowed: memoryUseEnabled,
        memoryMode: memoryUseEnabled ? "allowed" : "off"
      }, analysisRun);
      ui.setProcessing(true, memoryUseEnabled ? "AHA vurderer relevant minne …" : "AHA svarer uten tidligere minne …");
      if (urlInfo.isSourceAction && linkReadPromise) {
        ui.setProcessing(true, "AHA leser artikkelen …");
        await linkReadPromise;
      }
      const analysisInputText = urlInfo.isSourceAction
        ? (analysis.buildArticleSourceTextFromAnalysis(global.AHALinkReader?.getLatestArticleAnalysis?.() || {}) || cleanText)
        : cleanText;
      const rawMemoryContext = memoryUseEnabled
        ? await memory.buildMemoryContext(analysisInputText)
        : memory.buildMemoryOffContext();
      if (!analysis.isActiveAnalysisRun(analysisRun)) return null;
      const memoryContext = memory.filterMemoryContextForActiveSource(rawMemoryContext, analysisInputText, analysisRun);
      const personalContext = retrieval.filterForActiveSource(retrieval.buildPersonalMessageContext(analysisInputText), analysisInputText, analysisRun);
      const answerPackage = retrieval.filterForActiveSource(retrieval.buildAnswerPackage(analysisInputText), analysisInputText, analysisRun);
      if (!analysis.isActiveAnalysisRun(analysisRun)) return null;
      if (personalContext && answerPackage) personalContext.answerPackage = answerPackage;
      retrieval.renderPersonalRetrieval(personalContext?.retrieval);
      retrieval.renderAnswerComposer(answerPackage);
      if (personalContext?.retrieval?.results?.length) {
        ui.setStatusNote(`Personlig kontekst aktiv · Personlig søk aktiv · ${personalContext.retrieval.results.length} relevante treff.`);
      } else if (personalContext?.prompt) {
        ui.setStatusNote("Personlig kontekst aktiv.");
      }
      if (answerPackage?.status?.ready) {
        ui.setStatusNote(`AHA Answer Composer aktiv · ${answerPackage.status.intent} · ${answerPackage.status.selectedSourceCount} kilder.`);
      }
      retrieval.renderPersonalContextStatus();
      retrieval.renderPersonalAiLoopStatus();
      let count = 0;
      if (savingEnabled && !urlInfo.isSourceAction && !transientAnalysisDocument) {
        count = input.handleUserMessage(cleanText);
        void input.handleUserMessageInsightCandidatesInBackground(cleanText)
          .then((aiCount) => {
            if (aiCount > 0) ui.setStatusNote(`Beriket med ${aiCount} AI-signal${aiCount === 1 ? "" : "er"} i bakgrunnen.`);
          })
          .catch((err) => {
            global.console.warn("AI insight-candidates bakgrunnsjobb feilet", err);
          });
      }
      if (textarea) textarea.value = "";
      if (savingEnabled && count > 0) ui.setStatusNote(`Lagret ${count} signal${count === 1 ? "" : "er"} i bakgrunnen.`);
      if (!savingEnabled) ui.setStatusNote("Lagring av nye innsikter er slått av.");
      if (memoryContext.used) ui.setStatusNote("Bruker relevant AHA-minne.");
      void memory.updateMemoryStatus();
      ui.setProcessing(true, "AHA analyserer teksten …");
      return { ...submission, analysisRun, analysisInputText, memoryContext, personalContext, answerPackage, memoryUseEnabled };
    }

    async function executeAnalysis(context) {
      const { cleanText, urlInfo, savingEnabled, analysisRun, analysisInputText, memoryContext, personalContext, answerPackage, memoryUseEnabled } = context;
      try {
        ui.setProcessing(true, savingEnabled ? "AHA lager svar og etterarbeid …" : "AHA lager svar uten å lagre nye innsikter …");
        const agent = await analysis.askAgent(analysisInputText, { memoryContext, personalContext });
        if (!analysis.isActiveAnalysisRun(analysisRun)) return null;
        const reply = String(agent?.reply || "").trim() || "AHA-agenten returnerte tomt svar.";
        const analysisText = analysis.cleanArticleText(analysisInputText);
        const rawSubjectMatches = global.AHASubjectEngine?.matchText
          ? await global.AHASubjectEngine.matchText(analysisText, { source: "chat", textType: analysis.detectTextType(cleanText) })
          : [];
        if (!analysis.isActiveAnalysisRun(analysisRun)) return null;
        const climateEnriched = analysis.enrichSubjectMatchesForClimateConflict(analysisText, rawSubjectMatches);
        const publicAdminEnriched = analysis.enrichSubjectMatchesForPublicAdministration(analysisText, climateEnriched);
        const domain = analysis.detectAutoAnalysisDomain(analysisText, { reflection: reply, subjectMatches: publicAdminEnriched });
        const subjectMatches = domain === "literary_attachment"
          ? analysis.getLiterarySubjectMatches()
          : domain === "institutional_media_history"
            ? analysis.getInstitutionalMediaHistorySubjectMatches(analysisText)
            : publicAdminEnriched;
        let safeReply = reply;
        if (domain === "literary_attachment" || domain === "institutional_media_history") {
          safeReply = analysis.stripFagkoblingerSections(safeReply);
        } else {
          safeReply = analysis.forceLiteraryFagkoblingerInReply(safeReply, analysisText, { subjectMatches });
          safeReply = analysis.forceInstitutionalMediaHistoryFagkoblingerInReply(safeReply, analysisText, { subjectMatches });
        }
        const visibleReply = analysis.normalizeVisibleReply(safeReply, cleanText) || safeReply;
        if (!analysis.isActiveAnalysisRun(analysisRun)) return null;
        analysis.updateAnalysisRun?.({ ahaReply: visibleReply, subjectMatches }, analysisRun);
        const categoryChips = memoryUseEnabled ? memory.suggestCategoryChips() : [];
        const persistedAssistantMessage = savingEnabled
          ? global.AHAChatPersistence?.appendAssistantMessage?.(visibleReply, {
            source: "aha_chat",
            threadId: config.threadId,
            answerPackageId: answerPackage?.id,
            intent: answerPackage?.status?.intent,
            retrievalSummary: personalContext?.retrieval?.summary || memoryContext?.reason || "",
            tags: categoryChips,
            concepts: subjectMatches?.map?.((match) => match.label || match.title || match.id).filter(Boolean)
          })
          : null;
        if (persistedAssistantMessage?.id && answerPackage) {
          global.AHAChatPersistence?.attachAnswerPackage?.(persistedAssistantMessage.id, answerPackage);
        }
        ui.renderChatMemoryStatus();
        const ahaRow = ui.appendChat("aha", visibleReply, { categoryChips, subjectMatches, memoryContext });
        const answerEvaluation = analysis.evaluateAnswerForChat(cleanText, visibleReply, answerPackage, ahaRow);
        if (persistedAssistantMessage?.id && answerEvaluation) {
          global.AHAChatPersistence?.attachAnswerEvaluation?.(persistedAssistantMessage.id, answerEvaluation);
        }
        ui.renderChatMemoryStatus();
        try {
          analysis.maybeHandleMetaAiAgentReply(reply);
        } catch (metaErr) {
          global.console.warn("Meta Insights AI-claims feilet", metaErr);
        }
        if (!analysis.isActiveAnalysisRun(analysisRun)) return null;
        try {
          await analysis.renderAutoOutputs(cleanText, safeReply, {
            subjectMatches: urlInfo.isSourceAction ? [] : subjectMatches,
            persist: savingEnabled,
            analysisRun
          });
        } catch (autoErr) {
          global.console.warn("Auto-output feilet", autoErr);
        }
        if (!analysis.isActiveAnalysisRun(analysisRun)) return null;
        if (savingEnabled) {
          try {
            const afterworkResult = analysis.ensureAfterworkForLatestAnalysis(cleanText, {
              subjectMatches: urlInfo.isSourceAction ? [] : subjectMatches,
              ...analysisRun
            });
            if (afterworkResult?.entry) analysis.updateAnalysisRun?.({ afterwork: afterworkResult.entry }, analysisRun);
          } catch (afterErr) {
            global.console.warn("Auto-etterarbeid feilet", afterErr);
          }
          const ingest = global.AHAModuleApi?.resolve?.("ingest", "AHAIngest", { version: 1 }) || global.AHAIngest;
          ingest?.ingest?.({
            source_type: "aha_agent",
            source_app: "aha_chat",
            content_type: "text",
            title: "AHA-agent svar",
            text: visibleReply,
            user_created: false,
            imported: false,
            skip_insight: true,
            created_at: new Date().toISOString(),
            meta: {
              response_id: agent?.response_id || null,
              model: agent?.model || null,
              raw_reply: visibleReply === safeReply ? null : safeReply,
              memory_context_used: Boolean(memoryContext.used),
              memory_context_reason: memoryContext.used ? memoryContext.reason : null,
              personal_context_used: Boolean(personalContext?.prompt),
              personal_context_evidence: personalContext?.context?.evidence || null,
              answer_composer_status: answerPackage?.status || null,
              answer_evaluation: answerEvaluation ? { status: answerEvaluation.status, score: answerEvaluation.score } : null
            }
          });
        }
        return { type: "agent_reply", agent, memoryContext, personalContext, answerPackage, savingEnabled, memoryUseEnabled };
      } catch (err) {
        global.console.warn("AHA-agent utilgjengelig", err);
        if (!analysis.isActiveAnalysisRun(analysisRun)) return null;
        if (savingEnabled) {
          global.AHAChatPersistence?.appendAssistantMessage?.("AHA-agenten er ikke tilgjengelig akkurat nå.", {
            source: "aha_chat",
            threadId: config.threadId,
            tags: ["status"]
          });
        }
        ui.renderChatMemoryStatus();
        ui.appendChat("aha", "AHA-agenten er ikke tilgjengelig akkurat nå.");
        try {
          await analysis.renderAutoOutputs(cleanText, "", { subjectMatches: [], persist: savingEnabled, analysisRun });
        } catch (autoErr) {
          global.console.warn("Auto-output feilet", autoErr);
        }
        if (savingEnabled && analysis.isActiveAnalysisRun(analysisRun)) {
          try {
            const afterworkResult = analysis.ensureAfterworkForLatestAnalysis(cleanText, { subjectMatches: [], ...analysisRun });
            if (afterworkResult?.entry) analysis.updateAnalysisRun?.({ afterwork: afterworkResult.entry }, analysisRun);
          } catch (afterErr) {
            global.console.warn("Auto-etterarbeid feilet", afterErr);
          }
        }
        return { type: "agent_error", error: err, memoryContext, personalContext, answerPackage, savingEnabled, memoryUseEnabled };
      } finally {
        if (analysis.isActiveAnalysisRun(analysisRun)) {
          ui.setProcessing(false);
          void memory.updateMemoryStatus();
        }
      }
    }

    async function submitAhaChatMessage(text, textarea = null) {
      const submission = prepareSubmission(text);
      if (!submission) return null;
      if (memory.isMemoryQuestion(submission.cleanText)) return handleMemoryQuestion(submission, textarea);
      const context = await prepareRetrieval(submission, textarea);
      return context ? executeAnalysis(context) : null;
    }

    return Object.freeze({
      prepareSubmission,
      handleMemoryQuestion,
      prepareRetrieval,
      executeAnalysis,
      submitAhaChatMessage
    });
  }

  const publicApi = Object.freeze({ create, createSubmissionRuntime });
  global.AHAChatRunContext = publicApi;
  global.AHAModuleApi?.register?.("chat.runContext", publicApi, { version: 1, legacyGlobal: "AHAChatRunContext", exports: ["create", "createSubmissionRuntime"] });
})(window);
