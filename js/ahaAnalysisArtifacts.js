// Compatibility entry point for explicit artifacts from the active analysis.
// V2 is the only builder/materializer; this wrapper contains no artifact logic.
(function (global) {
  "use strict";

  const VERSION = "aha_analysis_artifacts_v2_compatibility_wrapper";
  const V2_DEPENDENCIES = Object.freeze([
    ["js/ahaInsightRelationClassifierV2.js", "AHAInsightRelationClassifierV2"],
    ["js/ahaInsightSaturationV2.js", "AHAInsightSaturationV2"],
    ["js/ahaKnowledgeMigrationV2.js", "AHAKnowledgeMigrationV2"],
    ["js/ahaSemanticProjectionsV2.js", "AHASemanticProjectionsV2"],
    ["js/ahaV2ProductIntegrationGate.js", "AHAV2ProductIntegrationGate"],
    ["js/ahaProjectionProductContractV2.js", "AHAProjectionProductContractV2"],
    ["js/ahaProjectionArtifactQualityV2.js", "AHAProjectionArtifactQualityV2"],
    ["js/ahaProjectionProductReadModelV2.js", "AHAProjectionProductReadModelV2"],
    ["js/ahaProjectionRuntimeSourceV2.js", "AHAProjectionRuntimeSourceV2"]
  ]);
  function arr(value) { return Array.isArray(value) ? value : []; }

  function loadDependency(src, globalName) {
    if (global[globalName]) return Promise.resolve(true);
    if (!global.document?.head || !global.document.createElement) return Promise.resolve(false);
    const existing = global.document.querySelector?.(`script[data-aha-v2-artifact-dependency="${globalName}"]`);
    if (existing) return new Promise((resolve) => {
      existing.addEventListener?.("load", () => resolve(Boolean(global[globalName])), { once: true });
      existing.addEventListener?.("error", () => resolve(false), { once: true });
    });
    return new Promise((resolve) => {
      const script = global.document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.ahaV2ArtifactDependency = globalName;
      script.addEventListener("load", () => resolve(Boolean(global[globalName])), { once: true });
      script.addEventListener("error", () => resolve(false), { once: true });
      global.document.head.appendChild(script);
    });
  }

  async function ensureV2Dependencies() {
    for (const [src, globalName] of V2_DEPENDENCIES) {
      if (!await loadDependency(src, globalName)) return false;
    }
    return true;
  }

  function saveV2ProjectionArtifact(artifactType) {
    const normalizedType = artifactType === "path" ? "path" : artifactType === "list" ? "list" : "mindmap";
    const model = global.AHAProjectionRuntimeSourceV2?.build?.();
    return {
      ok: false,
      reason: "chat_projection_is_preview_only",
      artifact_type: normalizedType,
      preview_href: model?.product_states?.[normalizedType]?.href || null,
      blocking_reasons: arr(model?.blocking_reasons),
      fallback_allowed: false
    };
  }

  function saveMindmapFromActiveAnalysis() { return saveV2ProjectionArtifact("mindmap"); }
  function savePathFromActiveAnalysis() { return saveV2ProjectionArtifact("path"); }

  function setStatus(message) {
    global.document?.querySelectorAll?.("[data-analysis-artifact-status]")?.forEach?.((node) => { node.textContent = message; });
  }

  function feedbackLabel(response) {
    return {
      useful: "Takk – markert som nyttig.",
      too_generic: "Takk – AHA bør være mer konkret.",
      misinterpreted: "Takk – tolkningen er markert for ny vurdering.",
      missing_evidence: "Takk – manglende belegg er markert."
    }[response] || "Vurderingen ble lagret.";
  }

  async function handleClick(event) {
    const artifactButton = event.target?.closest?.("[data-analysis-artifact]");
    if (artifactButton) {
      const artifactType = artifactButton.dataset.analysisArtifact === "path" ? "path" : "mindmap";
      setStatus("Laster den kildeforankrede V2-projeksjonen …");
      if (!await ensureV2Dependencies()) {
        setStatus("Kunne ikke laste V2-projeksjonen. Ingen legacy-builder ble brukt.");
        return;
      }
      const model = global.AHAProjectionRuntimeSourceV2?.build?.();
      const href = model?.product_states?.[artifactType]?.href;
      if (href && global.location?.assign) {
        setStatus("Åpner skrivebeskyttet V2-forhåndsvisning …");
        global.location.assign(href);
      } else {
        setStatus("Forslaget trenger mer kildebelegg før det kan forhåndsvises.");
      }
      return;
    }
    const qualityButton = event.target?.closest?.("[data-analysis-quality]");
    if (!qualityButton) return;
    const response = qualityButton.dataset.analysisQuality;
    const result = global.AHAInsightQualityFeedback?.applyActiveAnalysisFeedback?.(response);
    setStatus(result?.ok ? feedbackLabel(response) : "Kunne ikke lagre vurderingen.");
  }

  function installStyles() {
    if (!global.document?.head || global.document.getElementById("aha-analysis-artifact-styles")) return;
    const style = global.document.createElement("style");
    style.id = "aha-analysis-artifact-styles";
    style.textContent = `
      .aha-analysis-artifact-actions,.aha-analysis-quality-actions{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:12px}
      .aha-analysis-artifact-actions button,.aha-analysis-artifact-actions a,.aha-analysis-quality-actions button{border:1px solid rgba(255,210,74,.34);border-radius:999px;background:rgba(255,210,74,.07);color:inherit;padding:7px 11px;font:inherit;font-size:.78rem;text-decoration:none;cursor:pointer}
      .aha-analysis-quality-actions{padding-top:10px;border-top:1px solid rgba(255,255,255,.1)}
      .aha-analysis-quality-actions>span,.aha-analysis-artifact-status{font-size:.78rem;opacity:.78}
      .aha-analysis-artifact-status{min-height:1.2em;margin:8px 0 0}
      .aha-claim-evidence{margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1)}
      .aha-claim-evidence summary{color:#ffd24a;font-size:.82rem;font-weight:750;cursor:pointer}
      .aha-claim-evidence-list{display:grid;gap:8px;margin-top:10px}
      .aha-claim-evidence-item{margin-top:8px;padding:9px 11px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:rgba(255,255,255,.025)}
      .aha-claim-evidence-item h5,.aha-claim-evidence-item p{margin:0 0 6px}
      .aha-claim-evidence-item p:last-child{margin-bottom:0}
    `;
    global.document.head.appendChild(style);
  }

  function init() {
    installStyles();
    global.document?.addEventListener?.("click", handleClick);
  }

  global.AHAAnalysisArtifacts = Object.freeze({ VERSION, V2_DEPENDENCIES, ensureV2Dependencies, saveV2ProjectionArtifact, saveMindmapFromActiveAnalysis, savePathFromActiveAnalysis, init });
  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init, { once: true });
  else if (global.document) init();
})(typeof window !== "undefined" ? window : globalThis);
