const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let forbiddenCalls = 0;
const forbidden = (name) => new Proxy({}, {
  get() {
    forbiddenCalls += 1;
    throw new Error(`production migration rehearsal must not access ${name}`);
  }
});

const context = {
  console,
  localStorage: forbidden("localStorage"),
  AHARepository: forbidden("AHARepository"),
  InsightsEngine: forbidden("InsightsEngine"),
  AHALists: forbidden("AHALists"),
  AHAPaths: forbidden("AHAPaths"),
  MindmapStore: forbidden("MindmapStore"),
  MetaInsightsEngine: forbidden("MetaInsightsEngine"),
  supabase: forbidden("supabase"),
  fetch() {
    forbiddenCalls += 1;
    throw new Error("production migration rehearsal must not fetch");
  }
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
load("js/ahaV2BackfillStagingStore.js");
load("js/ahaV2ProductionMigrationRehearsal.js");

const migration = context.AHAKnowledgeMigrationV2;
const staging = context.AHAV2BackfillStagingStore;
const rehearsal = context.AHAV2ProductionMigrationRehearsal;
assert.ok(migration && staging && rehearsal);
assert.equal(staging.ADAPTER_SCOPE, "v2_backfill_staging");
assert.equal(staging.DB_NAME, "aha_v2_backfill_staging_v1");
assert.equal(rehearsal.EVIDENCE_SCHEMA, "aha_v2_production_migration_rehearsal_evidence_v1");

function makeInsight({ id, insight, quality = 0.9, reviewed = true, source = id }) {
  return {
    id,
    source_event_id: `source_${source}`,
    source_text_hash: "b".repeat(64),
    semantic_concepts: ["migrering", "staging", source],
    candidate: {
      insight,
      type: "principle",
      causal_status: "not_causal",
      evidence: [
        { quote: `Første dokumenterte belegg for ${source}.`, role: "supports" },
        { quote: `Andre dokumenterte belegg for ${source}.`, role: "supports" }
      ]
    },
    gate_decision: {
      eligible_for_insight_review: reviewed,
      metrics: { quality_score: quality },
      blocking_reasons: reviewed ? [] : ["not_reviewed"]
    }
  };
}

function createBackend(driver = "indexeddb") {
  const map = new Map();
  const calls = { get: 0, put: 0, remove: 0, all: 0 };
  return {
    driver,
    map,
    calls,
    async get(key) {
      calls.get += 1;
      return map.has(key) ? JSON.parse(JSON.stringify(map.get(key))) : null;
    },
    async put(record) {
      calls.put += 1;
      map.set(record.key, JSON.parse(JSON.stringify(record)));
      return record.key;
    },
    async remove(key) {
      calls.remove += 1;
      map.delete(key);
      return true;
    },
    async all() {
      calls.all += 1;
      return JSON.parse(JSON.stringify(Array.from(map.values())));
    }
  };
}

const trustedA = makeInsight({
  id: "legacy_a",
  insight: "En isolert staging-rehearsal kan bevise migreringsmekanikk uten å gi produktlagrene skriveautoritet.",
  source: "a"
});
const trustedB = makeInsight({
  id: "legacy_b",
  insight: "Eksakt rollback skal fjerne bare payloadene som den kontrollerte staging-kjøringen faktisk skrev.",
  source: "b"
});
const enrichment = makeInsight({
  id: "legacy_enrichment",
  insight: "Eldre lavkvalitetsinnhold skal bli enrichment-kandidat og ikke trusted V2-kunnskap.",
  quality: 0.4,
  reviewed: false,
  source: "enrichment"
});
const invalid = { id: "legacy_invalid", candidate: { causal_status: "not_causal" } };
const input = {
  legacy_insights: [trustedA, trustedB, enrichment, invalid],
  legacy_lists: [{ id: "legacy_list", items: [{ refId: "legacy_a" }, { refId: "legacy_enrichment" }] }],
  legacy_paths: [{ id: "legacy_path", steps: [{ refId: "legacy_b" }] }]
};
const inputBefore = JSON.stringify(input);

(async () => {
  const backend = createBackend();
  const adapter = staging.create({ namespace: "prod-rehearsal-test", backend });
  assert.equal(adapter.scope, "v2_backfill_staging");
  assert.equal(adapter.driver, "indexeddb");
  assert.equal(await adapter.count(), 0);

  const preview = await rehearsal.preview(input, adapter);
  assert.equal(preview.status, "review_required", JSON.stringify(preview));
  assert.equal(preview.dry_run.status, "previewed");
  assert.equal(preview.dry_run.write_count, 0);
  assert.equal(preview.plan.trusted_candidate_count, 2);
  assert.equal(preview.plan.enrichment_candidate_count, 1);
  assert.equal(preview.plan.invalid_skip_count, 1);
  assert.equal(preview.plan.conflict_count, 0);
  assert.equal(preview.operator_review_required, true);
  assert.equal(await adapter.count(), 0, "dry-run must leave isolated staging empty");

  const notReviewed = await rehearsal.rehearse(input, adapter, { explicit_authorization: true });
  assert.equal(notReviewed.status, "blocked");
  assert.ok(notReviewed.blocking_reasons.includes("operator_dry_run_review_required"));
  assert.equal(await adapter.count(), 0);

  const unauthorized = await rehearsal.rehearse(input, adapter, { dry_run_reviewed: true });
  assert.equal(unauthorized.status, "blocked");
  assert.ok(unauthorized.blocking_reasons.includes("explicit_rehearsal_authorization_required"));
  assert.equal(await adapter.count(), 0);

  const evidence = await rehearsal.rehearse(input, adapter, {
    dry_run_reviewed: true,
    explicit_authorization: true
  });
  assert.equal(evidence.status, "verified", JSON.stringify(evidence));
  assert.equal(evidence.production_like_target, true);
  assert.equal(evidence.migration_dry_run_reviewed, true);
  assert.equal(evidence.staging_apply_rollback_production_proof, true);
  assert.equal(evidence.no_product_write_authority, true);
  assert.equal(evidence.no_remote_write_authority, true);
  assert.equal(evidence.dry_run.write_count, 0);
  assert.equal(evidence.first_apply.write_count, evidence.plan.planned_write_count);
  assert.equal(evidence.first_apply.staged_count_after, evidence.plan.planned_write_count);
  assert.equal(evidence.second_apply.write_count, 0);
  assert.equal(evidence.second_apply.no_op_count, evidence.plan.planned_write_count);
  assert.equal(evidence.second_apply.idempotent, true);
  assert.equal(evidence.rollback.rolled_back_count, evidence.plan.planned_write_count);
  assert.equal(evidence.rollback.staging_count_after, 0);
  assert.equal(evidence.rollback.exact, true);
  assert.equal(evidence.input_unchanged, true);
  assert.equal(await adapter.count(), 0);
  assert.equal(JSON.stringify(input), inputBefore);

  for (const [key, value] of Object.entries(evidence.policy)) {
    if (["operator_only", "staging_scope_only", "live_gate_evidence_requires_indexeddb_staging"].includes(key)) continue;
    assert.equal(value, false, `${key} must remain false`);
  }

  // Existing staging state must block the rehearsal before migration apply.
  await adapter.put("v2_backfill_candidate", "occupied", { occupied: true });
  const occupied = await rehearsal.rehearse(input, adapter, {
    dry_run_reviewed: true,
    explicit_authorization: true
  });
  assert.equal(occupied.status, "blocked");
  assert.ok(occupied.blocking_reasons.includes("staging_namespace_not_empty"));
  assert.equal(await adapter.count(), 1);
  await adapter.clear();
  assert.equal(await adapter.count(), 0);

  // A non-IndexedDB adapter may exercise mechanics but cannot become gate evidence.
  const memoryBackend = createBackend("memory");
  const memoryAdapter = staging.create({ namespace: "memory-test", backend: memoryBackend });
  assert.equal(memoryAdapter.driver, "memory");
  const memoryEvidence = await rehearsal.rehearse(input, memoryAdapter, {
    dry_run_reviewed: true,
    explicit_authorization: true
  });
  assert.equal(memoryEvidence.status, "failed");
  assert.equal(memoryEvidence.production_like_target, false);
  assert.equal(memoryEvidence.staging_apply_rollback_production_proof, false);
  assert.ok(memoryEvidence.blocking_reasons.includes("production_like_indexeddb_target_not_used"));
  assert.equal(await memoryAdapter.count(), 0);

  // Wrong adapter scope is rejected before any mutation.
  const wrongAdapter = {
    scope: "product_store",
    driver: "indexeddb",
    get() { throw new Error("must not call"); },
    put() { throw new Error("must not call"); },
    remove() { throw new Error("must not call"); },
    count() { throw new Error("must not call"); }
  };
  const wrong = await rehearsal.rehearse(input, wrongAdapter, {
    dry_run_reviewed: true,
    explicit_authorization: true
  });
  assert.equal(wrong.status, "blocked");
  assert.ok(wrong.blocking_reasons.includes("isolated_staging_adapter_required"));

  assert.equal(forbiddenCalls, 0, "rehearsal modules must not touch product/runtime stores or network");
  console.log("aha-v2-production-migration-rehearsal.test.cjs: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
