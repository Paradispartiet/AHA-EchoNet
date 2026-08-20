const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let storageCalls = 0;
const context = {
  console,
  localStorage: {
    getItem() { storageCalls += 1; throw new Error("read model must not read localStorage"); },
    setItem() { storageCalls += 1; throw new Error("read model must not write localStorage"); },
    removeItem() { storageCalls += 1; throw new Error("read model must not remove localStorage"); }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

function load(path) {
  vm.runInContext(fs.readFileSync(path, "utf8"), context, { filename: path });
}

load("js/ahaProjectionProductContractV2.js");
load("js/ahaProjectionProductReadModelV2.js");

const contract = context.AHAProjectionProductContractV2;
const builder = context.AHAProjectionProductReadModelV2;
assert.ok(contract);
assert.ok(builder);

const integration = {
  schema: "aha_v2_product_integration_gate_v1",
  version: 1,
  mode: "shadow",
  status: "shadow_ready_with_exclusions",
  gate_id: "gate_1",
  trusted_source_ids: ["source_a", "source_b"],
  exclusions: [{ source_id: "weak", reason: "quality" }],
  deferred_reference_rewrites: [],
  projection: {
    projection_id: "projection_1",
    core: {
      equivalence_groups: [{ id: "eq_1", member_ids: ["source_a", "source_b"] }],
      resonance_edges: []
    },
    policy: {
      automatic_projection_authority: false,
      lists_write: false,
      paths_write: false,
      mindmap_write: false,
      persistent_write: false,
      remote_write: false
    }
  },
  adapters: {
    projection_id: "projection_1",
    insights: [{ id: "insight_1", title: "En innsikt" }],
    concepts: [{ id: "concept_1", label: "Begrep" }],
    lists: [{ id: "list_1", title: "Liste", items: [] }],
    paths: [{ id: "path_1", title: "Sti", steps: [] }],
    mindmap: { nodes: [{ id: "insight_1", title: "En innsikt" }], edges: [], read_only: true }
  },
  validation: { valid: true, errors: [] },
  policy: {
    product_surface_binding_authority: false,
    product_store_write_authority: false,
    normal_chat_persistence_authority: false
  }
};

const before = JSON.stringify(integration);
const model = builder.fromIntegration(integration);
assert.equal(model.schema, "aha_projection_product_read_model_v2");
assert.equal(model.status, "ready");
assert.equal(model.mode, "read_only");
assert.equal(model.gate_id, "gate_1");
assert.equal(model.projection_id, "projection_1");
assert.equal(model.validation.valid, true, JSON.stringify(model.validation));
assert.deepEqual(Array.from(model.trusted_source_ids), ["source_a", "source_b"]);
assert.deepEqual(builder.surface(model, "lists"), model.surfaces.lists);
assert.equal(builder.surface(model, "unknown"), null);
for (const key of contract.CLOSED_POLICY_KEYS) assert.equal(model.policy[key], false, `${key} must be closed`);
assert.equal(JSON.stringify(integration), before, "contract must not mutate integration input");
assert.equal(storageCalls, 0);

context.AHAV2ProductIntegrationGate = { preview(input) { return { ...integration, gate_id: input.gate_id || integration.gate_id }; } };
const built = builder.build({ gate_id: "gate_2" });
assert.equal(built.status, "ready");
assert.equal(built.gate_id, "gate_2");

const openPolicy = JSON.parse(JSON.stringify(integration));
openPolicy.policy.lists_write = true;
const blocked = builder.fromIntegration(openPolicy);
assert.equal(blocked.status, "blocked");
assert.ok(blocked.blocking_reasons.includes("integration_policy_open:lists_write"));
assert.equal(blocked.surfaces.lists.length, 0);

const invalidMindmap = JSON.parse(JSON.stringify(integration));
invalidMindmap.adapters.mindmap.read_only = false;
assert.equal(builder.fromIntegration(invalidMindmap).status, "blocked");

const missingGate = context.AHAV2ProductIntegrationGate;
context.AHAV2ProductIntegrationGate = null;
const unavailable = builder.build({});
assert.equal(unavailable.status, "blocked");
assert.ok(unavailable.blocking_reasons.includes("v2_product_integration_gate_unavailable"));
context.AHAV2ProductIntegrationGate = missingGate;

assert.equal(storageCalls, 0, "all read-model paths must remain store-free");
console.log("aha-projection-product-read-model-v2.test.cjs: OK");
