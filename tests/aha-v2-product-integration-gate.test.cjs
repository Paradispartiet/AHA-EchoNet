const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let forbiddenCalls = 0;
const forbidden = (label) => new Proxy({}, {
  get() {
    forbiddenCalls += 1;
    throw new Error(`integration gate must not access ${label}`);
  }
});

const context = {
  console,
  localStorage: {
    getItem() { forbiddenCalls += 1; throw new Error("integration gate must not read localStorage"); },
    setItem() { forbiddenCalls += 1; throw new Error("integration gate must not write localStorage"); },
    removeItem() { forbiddenCalls += 1; throw new Error("integration gate must not remove localStorage"); }
  },
  AHARepository: forbidden("AHARepository"),
  InsightsEngine: forbidden("InsightsEngine"),
  AHALists: forbidden("AHALists"),
  AHAPaths: forbidden("AHAPaths"),
  MindmapStore: forbidden("MindmapStore"),
  supabase: forbidden("supabase")
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

function load(path) {
  vm.runInContext(fs.readFileSync(path, "utf8"), context, { filename: path });
}

load("js/ahaInsightRelationClassifierV2.js");
load("js/ahaInsightSaturationV2.js");
load("js/ahaKnowledgeMigrationV2.js");
load("js/ahaSemanticProjectionsV2.js");
load("js/ahaV2ProductIntegrationGate.js");

const api = context.AHAV2ProductIntegrationGate;
assert.ok(api);
assert.equal(api.GATE_SCHEMA, "aha_v2_product_integration_gate_v1");
assert.deepEqual(Array.from(api.READY_CLASSIFICATIONS), ["v2_ready", "already_staged"]);

function makeInsight({ id, insight, concepts, quality = 0.86, reviewed = true, causal_status = "not_causal", source = id }) {
  return {
    id,
    source_event_id: `source_${source}`,
    source_text_hash: "b".repeat(64),
    semantic_concepts: concepts,
    candidate: {
      insight,
      type: "principle",
      causal_status,
      evidence: [
        { quote: `Første dokumenterte belegg for ${source}.`, role: "supports" },
        { quote: `Andre dokumenterte belegg for ${source}.`, role: "supports" }
      ]
    },
    gate_decision: {
      eligible_for_insight_review: reviewed,
      blocking_reasons: reviewed ? [] : ["quality_score_below_threshold"],
      metrics: { quality_score: quality }
    }
  };
}

const trustedA = makeInsight({
  id: "legacy_a",
  insight: "Delvis standardisering bevarer sammenlignbarhet samtidig som valgfrie felt gir nødvendig fleksibilitet.",
  concepts: ["standardisering", "sammenlignbarhet", "fleksibilitet"],
  quality: 0.92,
  source: "a"
});
const trustedB = makeInsight({
  id: "legacy_b",
  insight: "Fleksibilitet gjennom valgfrie felt kan gjøre lokal kvalitetssikring mer krevende.",
  concepts: ["standardisering", "fleksibilitet", "kvalitetssikring"],
  quality: 0.88,
  source: "b"
});
const needsEnrichment = makeInsight({
  id: "legacy_enrichment",
  insight: "Eldre innsikt uten godkjent review må ikke lekke inn i produktprojections.",
  concepts: ["legacy", "review"],
  quality: 0.44,
  reviewed: false,
  source: "enrichment"
});
const invalid = {
  id: "legacy_invalid",
  candidate: { causal_status: "not_causal", evidence: [{ quote: "Belegg 1" }, { quote: "Belegg 2" }] },
  gate_decision: { eligible_for_insight_review: true, metrics: { quality_score: 0.9 } }
};

const input = {
  legacy_insights: [trustedA, trustedB, needsEnrichment, invalid],
  legacy_lists: [{
    id: "legacy_list",
    items: [{ refId: "legacy_a" }, { refId: "legacy_enrichment" }]
  }],
  legacy_paths: [{
    id: "legacy_path",
    steps: [{ refId: "legacy_b" }, { refId: "legacy_enrichment" }]
  }],
  legacy_mindmaps: [{
    id: "legacy_map",
    nodes: [{ refId: "legacy_a" }, { refId: "legacy_invalid" }]
  }]
};
const inputBefore = JSON.stringify(input);
const result = api.preview(input);

assert.equal(result.schema, "aha_v2_product_integration_gate_v1");
assert.equal(result.mode, "shadow");
assert.equal(result.status, "shadow_ready_with_exclusions", JSON.stringify(result));
assert.ok(result.gate_id.startsWith("v2_integration_gate_"));
assert.equal(result.validation.valid, true, JSON.stringify(result.validation));
assert.deepEqual(Array.from(result.trusted_source_ids), ["legacy_a", "legacy_b"]);
assert.equal(result.exclusions.length, 2);
assert.ok(result.exclusions.some((entry) => entry.source_id === "legacy_enrichment" && entry.classification === "needs_semantic_enrichment"));
assert.ok(result.exclusions.some((entry) => entry.source_id === "legacy_invalid" && entry.classification === "invalid"));

assert.equal(result.migration.status, "ready_with_skips");
assert.equal(result.migration.validation.valid, true);
assert.equal(result.migration.counts.trusted_candidate_count, 2);
assert.equal(result.migration.counts.enrichment_candidate_count, 1);
assert.equal(result.migration.counts.invalid_skip_count, 1);
assert.equal(result.migration.counts.reference_candidate_count, 4);
assert.equal(result.trusted_reference_rewrites.length, 2);
assert.equal(result.deferred_reference_rewrites.length, 2);
assert.ok(result.trusted_reference_rewrites.every((entry) => ["legacy_a", "legacy_b"].includes(entry.legacy_ref_id)));
assert.ok(result.deferred_reference_rewrites.every((entry) => entry.legacy_ref_id === "legacy_enrichment"));

assert.equal(result.projection.status, "ready");
assert.equal(result.projection.input_count, 2);
assert.equal(result.projection.trusted_input_count, 2);
assert.equal(result.projection.excluded_input_count, 0);
assert.equal(result.projection.validation.valid, true);
const projectionDump = JSON.stringify(result.projection.projections);
assert.match(projectionDump, /legacy_a/);
assert.match(projectionDump, /legacy_b/);
assert.doesNotMatch(projectionDump, /legacy_enrichment/);
assert.doesNotMatch(projectionDump, /legacy_invalid/);
assert.ok(result.projection.projections.insights.length >= 2);
assert.ok(result.projection.projections.concepts.length >= 1);
assert.ok(result.projection.projections.lists.length >= 1);
assert.ok(result.projection.projections.paths.length >= 1);
assert.equal(result.projection.projections.mindmap.read_only, true);

const trustedSet = new Set(result.trusted_source_ids);
result.projection.projections.insights.forEach((insight) => {
  insight.member_ids.forEach((id) => assert.ok(trustedSet.has(id), `projection leaked non-trusted source ${id}`));
});
assert.equal(result.adapters.projection_id, result.projection.projection_id);
assert.deepEqual(result.adapters.insights, result.projection.projections.insights);
assert.deepEqual(result.adapters.concepts, result.projection.projections.concepts);
assert.deepEqual(result.adapters.lists, result.projection.projections.lists);
assert.deepEqual(result.adapters.paths, result.projection.projections.paths);
assert.deepEqual(result.adapters.mindmap, result.projection.projections.mindmap);
assert.deepEqual(api.surface(result, "concepts"), result.projection.projections.concepts);
assert.equal(api.surface(result, "unknown"), null);

for (const value of Object.values(result.checks)) assert.equal(value, true);
for (const [key, value] of Object.entries(result.policy)) {
  assert.equal(value, false, `${key} must remain false`);
}
for (const key of [
  "product_store_write_authority", "chamber_write", "canonical_write", "lists_write", "paths_write", "mindmap_write", "meta_write",
  "normal_chat_persistence_open"
]) assert.equal(result.migration.policy[key], false, `migration ${key} must remain false`);
for (const key of [
  "automatic_projection_authority", "chamber_write", "canonical_write", "insights_write", "concepts_write", "lists_write", "paths_write",
  "mindmap_write", "meta_write", "persistent_write", "remote_write"
]) assert.equal(result.projection.policy[key], false, `projection ${key} must remain false`);

assert.equal(JSON.stringify(input), inputBefore, "integration preview must not mutate legacy input");
assert.equal(forbiddenCalls, 0, "integration gate must not touch product/runtime stores");

// Input order must not alter the semantic gate identity or product adapters.
const reversed = api.preview({ ...input, legacy_insights: [...input.legacy_insights].reverse() });
assert.equal(reversed.gate_id, result.gate_id);
assert.deepEqual(reversed.trusted_source_ids, result.trusted_source_ids);
assert.deepEqual(reversed.adapters, result.adapters);
assert.deepEqual(reversed.trusted_reference_rewrites, result.trusted_reference_rewrites);
assert.deepEqual(reversed.deferred_reference_rewrites, result.deferred_reference_rewrites);

// Exact already-staged trusted knowledge remains projection-eligible without a new migration write.
const initialTrustedPlan = context.AHAKnowledgeMigrationV2.plan({ legacy_insights: [trustedA] });
const stagedCandidate = initialTrustedPlan.operations.find((operation) => operation.target_kind === "v2_backfill_candidate").payload;
const alreadyStaged = api.preview({ legacy_insights: [trustedA], existing_staged: [stagedCandidate] });
assert.equal(alreadyStaged.status, "shadow_ready");
assert.deepEqual(Array.from(alreadyStaged.trusted_source_ids), ["legacy_a"]);
assert.equal(alreadyStaged.migration.counts.already_staged_count, 1);
assert.equal(alreadyStaged.migration.counts.planned_write_count, 0);
assert.equal(alreadyStaged.projection.trusted_input_count, 1);

// If nothing is V2 trust-ready, the gate blocks instead of projecting weak legacy knowledge.
const weakOnly = api.preview({ legacy_insights: [needsEnrichment, invalid] });
assert.equal(weakOnly.status, "blocked");
assert.ok(weakOnly.blocking_reasons.includes("no_v2_ready_legacy_insights"));
assert.equal(weakOnly.projection, null);
assert.equal(weakOnly.adapters, null);
assert.equal(weakOnly.policy.normal_chat_persistence_authority, false);

// A legacy fingerprint conflict blocks the whole integration preview.
const conflictPayload = JSON.parse(JSON.stringify(stagedCandidate));
conflictPayload.legacy.fingerprint = "deadbeef";
const conflict = api.preview({ legacy_insights: [trustedA], existing_staged: [conflictPayload] });
assert.equal(conflict.status, "blocked");
assert.ok(conflict.blocking_reasons.includes("migration_plan_not_ready"));
assert.ok(conflict.blocking_reasons.some((reason) => reason.includes("existing_backfill_candidate_has_different_legacy_fingerprint")));
assert.equal(conflict.projection, null);

// Dependency loss must fail closed; no fallback to legacy stores is allowed.
const projectionBackup = context.AHASemanticProjectionsV2;
context.AHASemanticProjectionsV2 = null;
const noProjectionDependency = api.preview({ legacy_insights: [trustedA] });
assert.equal(noProjectionDependency.status, "blocked");
assert.ok(noProjectionDependency.blocking_reasons.includes("semantic_projections_v2_unavailable"));
context.AHASemanticProjectionsV2 = projectionBackup;

const migrationBackup = context.AHAKnowledgeMigrationV2;
context.AHAKnowledgeMigrationV2 = null;
const noMigrationDependency = api.preview({ legacy_insights: [trustedA] });
assert.equal(noMigrationDependency.status, "blocked");
assert.ok(noMigrationDependency.blocking_reasons.includes("knowledge_migration_v2_unavailable"));
context.AHAKnowledgeMigrationV2 = migrationBackup;

assert.equal(forbiddenCalls, 0, "all gate paths must remain isolated from product/runtime stores");

const source = fs.readFileSync("js/ahaV2ProductIntegrationGate.js", "utf8");
for (const [pattern, label] of [
  [/localStorage\s*\./, "localStorage"],
  [/AHARepository\s*\./, "AHARepository"],
  [/InsightsEngine\s*\./, "InsightsEngine"],
  [/AHALists\s*\./, "AHALists"],
  [/AHAPaths\s*\./, "AHAPaths"],
  [/MindmapStore\s*\./, "MindmapStore"],
  [/supabase\s*\./i, "supabase"],
  [/\bfetch\s*\(/, "fetch"],
  [/\.execute\s*\(/, "migration execute"],
  [/\.rollback\s*\(/, "migration rollback"],
  [/normal_chat_persistence_authority:\s*true/, "normal Chat persistence authority"],
  [/product_surface_binding_authority:\s*true/, "product surface binding authority"]
]) assert.equal(pattern.test(source), false, `integration gate must not contain executable ${label} access`);

console.log("aha-v2-product-integration-gate.test.cjs: OK");
