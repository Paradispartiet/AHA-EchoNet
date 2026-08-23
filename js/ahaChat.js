// Minimal bootstrap for AHA Chat.

(function (global) {
  "use strict";

  const providerLoaderApi = global.AHAModuleApi?.resolve?.(
    "chat.providerLoader", "AHAChatProviderLoader", { version: 1 }
  ) || global.AHAChatProviderLoader;
  if (!providerLoaderApi) throw new Error("AHAChatProviderLoader må lastes før ahaChat.js.");

  const baseProviderLoader = providerLoaderApi.create({
    moduleApi: global.AHAModuleApi,
    legacyRoot: global
  });
  const providerLoader = global.AHAV2ReleaseQualityGuard?.wrapProviderLoader?.(baseProviderLoader) || baseProviderLoader;
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
