// ahaChatCanonicalAnalysis.js
// Kanonisk analysesyntese og valgfri Python-engine-adapter.
//
// Presentasjon og kilde-/domenehjelpere injiseres av ahaChat.js. Modulen
// eksponerer window.AHAChatCanonicalAnalysis og lastes før ahaChat.js.

(function (global) {
  "use strict";

  function create(deps = {}) {
    const requiredFunctions = [
      "buildAhaSerCard", "detectTextType", "detectAutoAnalysisDomain",
      "normalizeSubjectMatches", "normalizeFagkoblinger", "normalizeHistoryGoLinks",
      "buildAcademicConceptCandidates"
    ];
    requiredFunctions.forEach((name) => {
      if (typeof deps[name] !== "function") throw new Error(`AHAChatCanonicalAnalysis mangler avhengighet: ${name}`);
    });
    if (!deps.AHA_RUNTIME_KNOWLEDGE_POLICY) {
      throw new Error("AHAChatCanonicalAnalysis mangler avhengighet: AHA_RUNTIME_KNOWLEDGE_POLICY");
    }

    const {
      buildAhaSerCard,
      AHA_RUNTIME_KNOWLEDGE_POLICY,
      detectTextType,
      detectAutoAnalysisDomain,
      normalizeSubjectMatches,
      normalizeFagkoblinger,
      normalizeHistoryGoLinks,
      buildAcademicConceptCandidates
    } = deps;

    function isPythonEngineFeatureEnabled() {
      try {
        return global.localStorage?.getItem("aha_python_engine_enabled") === "true";
      } catch {
        return false;
      }
    }

    function isValidCanonicalAnalysisShape(value) {
      return global.AHAChatAnalysis.isValidCanonicalAnalysisShape(value);
    }

    function buildPythonFallbackMeta(baseMeta, reason, details = {}) {
      return global.AHAChatAnalysis.buildPythonFallbackMeta(baseMeta, reason, details);
    }

    async function resolveCanonicalAnalysisWithOptionalPythonEngine({ message, assistantReply, historyGoContext, fallbackAnalysis }) {
      const featureFlagEnabled = isPythonEngineFeatureEnabled();
      const baseMeta = {
        featureFlagEnabled,
        resolvedAt: new Date().toISOString(),
        reason: ""
      };
      if (!featureFlagEnabled) {
        return {
          analysis: fallbackAnalysis,
          meta: Object.assign({}, baseMeta, { source: "javascript_default" })
        };
      }
      const client = global.AHAEngineClient;
      if (!client || typeof client.buildAnalyzePayload !== "function") {
        return {
          analysis: fallbackAnalysis,
          meta: buildPythonFallbackMeta(baseMeta, "client_missing")
        };
      }
      const hasDetailedClient = typeof client.analyzeWithPythonEngineDetailed === "function";
      if (!hasDetailedClient && typeof client.analyzeWithPythonEngine !== "function") {
        return {
          analysis: fallbackAnalysis,
          meta: buildPythonFallbackMeta(baseMeta, "client_missing")
        };
      }
      try {
        const payload = client.buildAnalyzePayload(message, assistantReply, historyGoContext || {});
        if (hasDetailedClient) {
          const detailed = await client.analyzeWithPythonEngineDetailed(payload);
          const pythonAnalysis = detailed?.analysis || null;
          if (detailed?.ok && isValidCanonicalAnalysisShape(pythonAnalysis)) {
            return {
              analysis: pythonAnalysis,
              meta: Object.assign({}, baseMeta, { source: "python", reason: "" })
            };
          }
          if (detailed?.ok && !isValidCanonicalAnalysisShape(pythonAnalysis)) {
            console.warn("Python AHA Engine returnerte ugyldig canonical analysis; bruker JavaScript-fallback.");
          }
          return {
            analysis: fallbackAnalysis,
            meta: buildPythonFallbackMeta(baseMeta, detailed?.reason || "python_error", detailed || {})
          };
        }

        const pythonAnalysis = await client.analyzeWithPythonEngine(payload);
        if (isValidCanonicalAnalysisShape(pythonAnalysis)) {
          return {
            analysis: pythonAnalysis,
            meta: Object.assign({}, baseMeta, { source: "python", reason: "" })
          };
        }
        if (pythonAnalysis == null) {
          return {
            analysis: fallbackAnalysis,
            meta: buildPythonFallbackMeta(baseMeta, "python_null")
          };
        }
        console.warn("Python AHA Engine returnerte ugyldig canonical analysis; bruker JavaScript-fallback.");
        return {
          analysis: fallbackAnalysis,
          meta: buildPythonFallbackMeta(baseMeta, "invalid_python_shape")
        };
      } catch (err) {
        console.warn("Python AHA Engine feilet; bruker JavaScript-fallback.", err);
        return {
          analysis: fallbackAnalysis,
          meta: buildPythonFallbackMeta(baseMeta, "python_error")
        };
      }
    }

    function buildCanonicalAnalysis(payload, sourceText = "") {
      const safePayload = payload && typeof payload === "object" ? payload : {};
      if (isValidCanonicalAnalysisShape(safePayload.canonicalAnalysis)) {
        return safePayload.canonicalAnalysis;
      }
      const canonicalSer = buildAhaSerCard(safePayload, sourceText);
      const policyAcademic = !AHA_RUNTIME_KNOWLEDGE_POLICY.legacyArticleTemplatesEnabled && detectTextType(sourceText || "") === "academic_article";
      const domain = detectAutoAnalysisDomain(sourceText || "", safePayload || {});
      const existingHistoryLinks = safePayload?.historyGoLinks || safePayload?.history_go_links || [];
      const subjectHistoryLinks = policyAcademic
        ? normalizeSubjectMatches(safePayload?.subjectMatches || []).slice(0, 5).map((match) => {
            const title = String(match?.title || match?.label || match?.subject_label || match?.subject_id || "Fagverk").trim();
            const id = String(match?.subject_id || match?.id || title).trim().toLowerCase().replace(/[^a-z0-9æøå]+/gi, "_").replace(/^_+|_+$/g, "");
            return { type: "subject", id, title, reason: "Kildebasert fagkobling fra AHA Fagverk-kalibrering." };
          }).filter((item) => item.id)
        : [];
      const derivedHistoryLinks = subjectHistoryLinks.length
        ? subjectHistoryLinks
        : buildHistoryGoLinksFromDomain(domain, sourceText || "", canonicalSer);
      return {
        contentType: String(safePayload?.textType || detectTextType(sourceText || "")),
        domain,
        theme: String(canonicalSer?.tema || "").trim(),
        mainTension: String(canonicalSer?.hovedspenning || "").trim(),
        keyInsight: String(canonicalSer?.viktigsteInnsikt || "").trim(),
        fieldConnections: normalizeFagkoblinger(canonicalSer?.fagkoblinger),
        historyGoLinks: normalizeHistoryGoLinks(existingHistoryLinks.length ? existingHistoryLinks : derivedHistoryLinks),
        suggestedActions: Array.isArray(safePayload?.path) ? safePayload.path.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6) : [],
        confidence: normalizeAnalysisConfidence(safePayload?.confidence),
        warnings: normalizeAnalysisWarnings(safePayload?.warnings),
        ahaSer: canonicalSer,
        reflection: String(safePayload?.reflection || canonicalSer?.viktigsteInnsikt || "").trim(),
        summary: String(safePayload?.day || "").trim(),
        sortItems: Array.isArray(safePayload?.sortItems) ? safePayload.sortItems : [],
        list: Array.isArray(safePayload?.list) ? safePayload.list : [],
        path: Array.isArray(safePayload?.path) ? safePayload.path : [],
        concepts: buildAcademicConceptCandidates(sourceText, safePayload)
      };
    }
    function normalizeAnalysisConfidence(value) {
      return global.AHAChatAnalysis.normalizeAnalysisConfidence(value);
    }

    function normalizeAnalysisWarnings(value) {
      return global.AHAChatAnalysis.normalizeAnalysisWarnings(value);
    }

    function buildHistoryGoLinksFromDomain(domain, sourceText, canonicalSer) {
      return global.AHAChatAnalysis.buildHistoryGoLinksFromDomain(domain, sourceText, canonicalSer);
    }

    return {
      isPythonEngineFeatureEnabled,
      isValidCanonicalAnalysisShape,
      buildPythonFallbackMeta,
      resolveCanonicalAnalysisWithOptionalPythonEngine,
      buildCanonicalAnalysis,
      normalizeAnalysisConfidence,
      normalizeAnalysisWarnings,
      buildHistoryGoLinksFromDomain
    };
  }

  global.AHAChatCanonicalAnalysis = Object.assign({}, global.AHAChatCanonicalAnalysis || {}, { create });
})(window);
