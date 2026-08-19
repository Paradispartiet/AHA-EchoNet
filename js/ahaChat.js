// Minimal bootstrap for AHA Chat.

(function (global) {
  "use strict";

  // Compatibility bridge for the export composition. Meta-profilen belongs to
  // MetaInsightsEngine, not InsightsEngine. RuntimeComposition still asks the
  // canonical insights API for buildMetaProfile(), so expose only this thin
  // read-only delegation until that composition seam is migrated directly.
  // No meta data is written back to the insight chamber here.
  if (
    global.InsightsEngine &&
    typeof global.InsightsEngine.buildMetaProfile !== "function" &&
    typeof global.MetaInsightsEngine?.buildUserMetaProfile === "function"
  ) {
    Object.defineProperty(global.InsightsEngine, "buildMetaProfile", {
      configurable: true,
      enumerable: false,
      value(chamber) {
        return global.MetaInsightsEngine.buildUserMetaProfile(chamber, "sub_laring") || {};
      }
    });
  }

  const providerLoaderApi = global.AHAModuleApi?.resolve?.(
    "chat.providerLoader", "AHAChatProviderLoader", { version: 1 }
  ) || global.AHAChatProviderLoader;
  if (!providerLoaderApi) throw new Error("AHAChatProviderLoader må lastes før ahaChat.js.");

  const providerLoader = providerLoaderApi.create({
    moduleApi: global.AHAModuleApi,
    legacyRoot: global
  });
  const applicationComposition = providerLoader.instantiate("applicationComposition", {
    providerLoader,
    environment: Object.freeze({
      getAgentApiBase: () => global.AHA_AGENT_API,
      fetchImpl: (...args) => global.fetch(...args),
      buildUserMetaProfile: (chamber, subjectId) =>
        global.MetaInsightsEngine?.buildUserMetaProfile?.(chamber, subjectId) || {},
      getMetaInsightsAgent: () => global.AHAMetaInsightsAgent,
      getExportBundleBuilder: () =>
        global.AHAChat?.buildAhaAnalysisExportBundle ||
        global.AHATestHooks?.buildAhaAnalysisExportBundle ||
        global.buildAhaAnalysisExportBundle
    })
  });
  applicationComposition.install();
})(window);