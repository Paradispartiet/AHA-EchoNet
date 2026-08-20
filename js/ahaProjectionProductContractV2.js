// ahaProjectionProductContractV2.js
// Immutable contract between the V2 semantic projection gate and product UI.
(function (global) {
  "use strict";

  const CONTRACT_SCHEMA = "aha_projection_product_contract_v2";
  const READ_MODEL_SCHEMA = "aha_projection_product_read_model_v2";
  const CONTRACT_VERSION = 2;
  const SURFACES = Object.freeze(["insights", "concepts", "lists", "paths", "mindmap"]);
  const CLOSED_POLICY_KEYS = Object.freeze([
    "product_surface_binding_authority",
    "product_store_write_authority",
    "automatic_projection_authority",
    "chamber_write",
    "canonical_write",
    "insights_write",
    "concepts_write",
    "lists_write",
    "paths_write",
    "mindmap_write",
    "meta_write",
    "persistent_write",
    "remote_write",
    "normal_chat_persistence_authority"
  ]);

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function arr(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function policy() {
    return Object.fromEntries(CLOSED_POLICY_KEYS.map((key) => [key, false]));
  }

  function blocked(reasons, integration = null) {
    return clone({
      schema: READ_MODEL_SCHEMA,
      version: CONTRACT_VERSION,
      mode: "read_only",
      status: "blocked",
      gate_id: text(integration?.gate_id) || null,
      projection_id: text(integration?.projection?.projection_id || integration?.adapters?.projection_id) || null,
      blocking_reasons: [...new Set(arr(reasons).map(text).filter(Boolean))].sort(),
      exclusions: clone(arr(integration?.exclusions)),
      surfaces: { insights: [], concepts: [], lists: [], paths: [], mindmap: { nodes: [], edges: [], read_only: true } },
      validation: { valid: false, errors: ["read_model_blocked"] },
      policy: policy()
    });
  }

  function validateIntegration(integration) {
    const errors = [];
    if (!integration || typeof integration !== "object") return { valid: false, errors: ["integration_missing"] };
    if (integration.schema !== "aha_v2_product_integration_gate_v1") errors.push("integration_schema_invalid");
    if (!["shadow_ready", "shadow_ready_with_exclusions"].includes(integration.status)) errors.push("integration_not_ready");
    if (integration.validation?.valid !== true) errors.push("integration_validation_failed");
    if (!text(integration.gate_id)) errors.push("gate_id_missing");
    if (!text(integration?.projection?.projection_id || integration?.adapters?.projection_id)) errors.push("projection_id_missing");

    const adapters = integration.adapters || {};
    for (const surface of ["insights", "concepts", "lists", "paths"]) {
      if (!Array.isArray(adapters[surface])) errors.push(`surface_invalid:${surface}`);
    }
    if (!adapters.mindmap || !Array.isArray(adapters.mindmap.nodes) || !Array.isArray(adapters.mindmap.edges)) {
      errors.push("surface_invalid:mindmap");
    }
    if (adapters.mindmap?.read_only !== true) errors.push("mindmap_not_read_only");

    for (const key of CLOSED_POLICY_KEYS) {
      if (integration.policy?.[key] === true) errors.push(`integration_policy_open:${key}`);
    }
    for (const [key, value] of Object.entries(integration.projection?.policy || {})) {
      if (value === true) errors.push(`projection_policy_open:${key}`);
    }

    return clone({ valid: errors.length === 0, errors: [...new Set(errors)].sort() });
  }

  function validateReadModel(model) {
    const errors = [];
    if (model?.schema !== READ_MODEL_SCHEMA) errors.push("read_model_schema_invalid");
    if (model?.mode !== "read_only") errors.push("read_model_mode_invalid");
    if (model?.status !== "ready") errors.push("read_model_not_ready");
    if (!text(model?.gate_id)) errors.push("read_model_gate_id_missing");
    if (!text(model?.projection_id)) errors.push("read_model_projection_id_missing");
    for (const surface of ["insights", "concepts", "lists", "paths"]) {
      if (!Array.isArray(model?.surfaces?.[surface])) errors.push(`read_model_surface_invalid:${surface}`);
    }
    if (!Array.isArray(model?.surfaces?.mindmap?.nodes) || !Array.isArray(model?.surfaces?.mindmap?.edges)) {
      errors.push("read_model_surface_invalid:mindmap");
    }
    for (const key of CLOSED_POLICY_KEYS) {
      if (model?.policy?.[key] !== false) errors.push(`read_model_policy_not_closed:${key}`);
    }
    return clone({ valid: errors.length === 0, errors: [...new Set(errors)].sort() });
  }

  function build(integration) {
    const integrationValidation = validateIntegration(integration);
    if (!integrationValidation.valid) return blocked(integrationValidation.errors, integration);

    const model = {
      schema: READ_MODEL_SCHEMA,
      contract_schema: CONTRACT_SCHEMA,
      version: CONTRACT_VERSION,
      mode: "read_only",
      status: "ready",
      gate_id: integration.gate_id,
      projection_id: integration.projection?.projection_id || integration.adapters.projection_id,
      source_status: integration.status,
      trusted_source_ids: clone(arr(integration.trusted_source_ids)),
      exclusions: clone(arr(integration.exclusions)),
      deferred_reference_rewrites: clone(arr(integration.deferred_reference_rewrites)),
      surfaces: {
        insights: clone(integration.adapters.insights),
        concepts: clone(integration.adapters.concepts),
        lists: clone(integration.adapters.lists),
        paths: clone(integration.adapters.paths),
        mindmap: clone(integration.adapters.mindmap)
      },
      semantic_context: {
        equivalence_groups: clone(arr(integration.projection?.core?.equivalence_groups)),
        resonance_edges: clone(arr(integration.projection?.core?.resonance_edges))
      },
      validation: { valid: false, errors: [] },
      policy: policy()
    };
    model.validation = validateReadModel(model);
    if (!model.validation.valid) return blocked(model.validation.errors, integration);
    return clone(model);
  }

  function surface(model, name) {
    if (!SURFACES.includes(name) || model?.status !== "ready" || model?.validation?.valid !== true) return null;
    return clone(model?.surfaces?.[name] ?? null);
  }

  const api = Object.freeze({
    CONTRACT_SCHEMA,
    READ_MODEL_SCHEMA,
    CONTRACT_VERSION,
    SURFACES,
    CLOSED_POLICY_KEYS,
    policy,
    blocked,
    validateIntegration,
    validateReadModel,
    build,
    surface
  });
  global.AHAProjectionProductContractV2 = api;
  global.AHAModuleApi?.register?.("projectionProductContractV2", api, {
    version: CONTRACT_VERSION,
    legacyGlobal: "AHAProjectionProductContractV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
