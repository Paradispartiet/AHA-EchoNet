// ahaProjectionProductReadModelV2.js
// Read-only coordinator. It accepts explicit input, calls the existing V2 gate,
// and returns one shared product model without touching runtime stores.
(function (global) {
  "use strict";

  const MODULE_SCHEMA = "aha_projection_product_read_model_builder_v2";
  const MODULE_VERSION = 2;

  function integrationApi() {
    return global.AHAV2ProductIntegrationGate || null;
  }

  function contractApi() {
    return global.AHAProjectionProductContractV2 || null;
  }

  function unavailable(reasons) {
    const contract = contractApi();
    if (contract?.blocked) return contract.blocked(reasons);
    return {
      schema: "aha_projection_product_read_model_v2",
      version: MODULE_VERSION,
      mode: "read_only",
      status: "blocked",
      blocking_reasons: Array.isArray(reasons) ? reasons : [String(reasons || "read_model_unavailable")],
      surfaces: { insights: [], concepts: [], lists: [], paths: [], mindmap: { nodes: [], edges: [], read_only: true } },
      validation: { valid: false, errors: ["read_model_dependencies_unavailable"] },
      policy: {}
    };
  }

  function fromIntegration(integration) {
    const contract = contractApi();
    if (!contract?.build) return unavailable(["projection_product_contract_v2_unavailable"]);
    return contract.build(integration);
  }

  function build(input = {}) {
    const integration = integrationApi();
    const contract = contractApi();
    const missing = [];
    if (!integration?.preview) missing.push("v2_product_integration_gate_unavailable");
    if (!contract?.build) missing.push("projection_product_contract_v2_unavailable");
    if (missing.length) return unavailable(missing);
    return contract.build(integration.preview(input));
  }

  function surface(model, name) {
    const contract = contractApi();
    return contract?.surface ? contract.surface(model, name) : null;
  }

  const api = Object.freeze({ MODULE_SCHEMA, MODULE_VERSION, build, fromIntegration, surface });
  global.AHAProjectionProductReadModelV2 = api;
  global.AHAModuleApi?.register?.("projectionProductReadModelV2", api, {
    version: MODULE_VERSION,
    legacyGlobal: "AHAProjectionProductReadModelV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
