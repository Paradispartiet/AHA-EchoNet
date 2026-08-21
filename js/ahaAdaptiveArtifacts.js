// Deprecated compatibility shim. Adaptive artifact generation was replaced by
// the source-bound V2 projection read model and controlled materializer.
(function (global) {
  "use strict";

  const VERSION = "aha_adaptive_artifacts_v2_compatibility_shim";
  function artifacts() { return global.AHAAnalysisArtifacts || null; }
  function unavailable() { return { ok: false, reason: "v2_unavailable", fallback_allowed: false }; }
  function saveMindmapFromActiveAnalysis() { return artifacts()?.saveV2ProjectionArtifact?.("mindmap") || unavailable(); }
  function savePathFromActiveAnalysis() { return artifacts()?.saveV2ProjectionArtifact?.("path") || unavailable(); }
  function install() { return Boolean(artifacts()?.saveV2ProjectionArtifact); }

  const api = Object.freeze({
    VERSION,
    deprecated: true,
    replacement: "AHAAnalysisArtifacts.saveV2ProjectionArtifact",
    saveMindmapFromActiveAnalysis,
    savePathFromActiveAnalysis,
    install
  });
  global.AHAAdaptiveArtifacts = api;
  global.AHAModuleApi?.register?.("analysis.adaptiveArtifacts", api, { version: 2, legacyGlobal: "AHAAdaptiveArtifacts", exports: Object.keys(api) });
})(typeof window !== "undefined" ? window : globalThis);
