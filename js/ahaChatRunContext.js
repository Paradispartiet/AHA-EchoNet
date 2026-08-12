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

    if (typeof sourceHash !== "function" || typeof shortHash !== "function" || typeof takeKeywords !== "function") {
      throw new Error("AHAChatRunContext krever sourceHash, shortHash og takeKeywords.");
    }

    let activeAnalysisRun = null;

    function getActiveAnalysisRun() {
      return activeAnalysisRun;
    }

    function setActiveAnalysisRun(run) {
      activeAnalysisRun = run || null;
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
      return {
        analysisId: options.analysisId || `analysis_${shortHash(base)}`,
        analysisRunId,
        runId: analysisRunId,
        conversationId,
        sessionId: conversationId,
        turnId: options.turnId || `turn_${shortHash(`${conversationId}|${analysisRunId}|${createdAt}`)}`,
        sourceId: options.sourceId || `source_${fingerprint || shortHash(base)}`,
        sourceKind: options.sourceKind || "chat",
        createdAt,
        topicLabel,
        sourceHash: fingerprint,
        normalizedSourceHash: fingerprint,
        sourceTextHash: fingerprint,
        sourceFingerprint: fingerprint,
        sourcePreview: source.replace(/\s+/g, " ").slice(0, 180)
      };
    }

    function bindAnalysisArtifact(artifact, run = activeAnalysisRun) {
      if (!artifact || typeof artifact !== "object" || !run) return artifact;
      return Object.assign(artifact, {
        analysisId: run.analysisId,
        analysisRunId: run.analysisRunId || run.runId,
        runId: run.runId || run.analysisRunId,
        conversationId: run.conversationId || run.sessionId,
        turnId: run.turnId,
        sourceId: run.sourceId,
        sourceKind: run.sourceKind || artifact.sourceKind || "chat",
        topicLabel: run.topicLabel || artifact.topicLabel || "",
        sessionId: run.sessionId || run.conversationId,
        createdAt: artifact.createdAt || run.createdAt,
        sourceHash: run.sourceHash || artifact.sourceHash,
        normalizedSourceHash: run.normalizedSourceHash || run.sourceHash || artifact.normalizedSourceHash,
        sourceTextHash: run.sourceTextHash || run.sourceHash || artifact.sourceTextHash || artifact.sourceHash,
        sourceFingerprint: run.sourceFingerprint || run.sourceHash || artifact.sourceFingerprint,
        sourcePreview: run.sourcePreview || artifact.sourcePreview || artifact.sourceTextPreview || ""
      });
    }

    function artifactMatchesActiveRun(artifact, run = activeAnalysisRun) {
      if (!artifact || typeof artifact !== "object" || !run) return false;
      const artifactRunId = String(artifact.analysisRunId || artifact.runId || "");
      const activeRunId = String(run.analysisRunId || run.runId || "");
      if (artifactRunId || activeRunId) {
        if (!(artifactRunId && activeRunId && artifactRunId === activeRunId)) return false;
        const hash = String(artifact.sourceHash || artifact.sourceTextHash || artifact.normalizedSourceHash || artifact.sourceFingerprint || "");
        return !(hash && run.sourceHash && hash !== run.sourceHash);
      }
      const hasRunIds = artifact.analysisId || artifact.sourceId;
      if (hasRunIds) return String(artifact.analysisId || "") === run.analysisId && String(artifact.sourceId || "") === run.sourceId;
      const hash = String(artifact.sourceHash || artifact.sourceTextHash || artifact.sourceFingerprint || "");
      return Boolean(hash && hash === run.sourceHash);
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
      const stop = new Set(["det","den","der","som","for","med","til","fra","ikke","eller","og","i","på","av","en","et","å","er","har","kan","skal","vil","the","and","this","that","with","from"]);
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
            item.analysisId = run?.analysisId || item.analysisId;
            item.sourceIdForAnalysis = run?.sourceId || item.sourceIdForAnalysis;
            item.sourceHash = run?.sourceHash || item.sourceHash;
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
          insight.analysisId = run?.analysisId || insight.analysisId;
          insight.sourceIdForAnalysis = run?.sourceId || insight.sourceIdForAnalysis;
          insight.sourceHash = run?.sourceHash || insight.sourceHash;
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
      bindAnalysisArtifact,
      artifactMatchesActiveRun,
      isActiveAnalysisRun,
      analysisTopicMismatch,
      scoreRetrievalAgainstSource,
      filterRetrievalForActiveSource,
      filterMemoryContextForActiveSource
    });
  }

  global.AHAChatRunContext = Object.freeze({ create });
})(window);
