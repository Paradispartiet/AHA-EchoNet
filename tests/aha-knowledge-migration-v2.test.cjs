const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let forbiddenRuntimeCalls = 0;
const forbidden = (label) => new Proxy({}, {
  get() {
    forbiddenRuntimeCalls += 1;
    throw new Error(`knowledge migration must not access ${label}`);
  }
});

const context = {
  console,
  localStorage: {
    getItem() { forbiddenRuntimeCalls += 1; throw new Error("knowledge migration must not read localStorage"); },
    setItem() { forbiddenRuntimeCalls += 1; throw new Error("knowledge migration must not write localStorage"); },
    removeItem() { forbiddenRuntimeCalls += 1; throw new Error("knowledge migration must not remove localStorage"); }
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

const api = context.AHAKnowledgeMigrationV2;
assert.ok(api);
assert.equal(api.MIGRATION_SCHEMA, "aha_knowledge_migration_v2");
assert.equal(api.ADAPTER_SCOPE, "v2_backfill_staging");
assert.deepEqual(Array.from(api.TARGET_KINDS), ["v2_backfill_candidate", "v2_reference_rewrite_candidate"]);

function makeInsight({
  id,
  insight,
  concepts = ["migrering", "kunnskap"],
  quality = 0.84,
  reviewed = true,
  causal_status = "not_causal",
  source = id,
  evidence = 2
}) {
  return {
    id,
    source_event_id: `source_${source}`,
    source_text_hash: "a".repeat(64),
    semantic_concepts: concepts,
    candidate: {
      insight,
      type: "principle",
      causal_status,
      evidence: Array.from({ length: evidence }, (_, index) => ({
        quote: `Dokumentert belegg ${index + 1} for ${source}.`,
        role: "supports"
      }))
    },
    gate_decision: {
      eligible_for_insight_review: reviewed,
      blocking_reasons: reviewed ? [] : ["quality_score_below_threshold"],
      metrics: { quality_score: quality }
    }
  };
}

function createAdapter(options = {}) {
  const store = new Map();
  const calls = { get: 0, put: 0, remove: 0 };
  let putAttempt = 0;
  return {
    scope: options.scope || api.ADAPTER_SCOPE,
    store,
    calls,
    async get(kind, id) {
      calls.get += 1;
      const key = `${kind}:${id}`;
      return store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : null;
    },
    async put(kind, id, value) {
      calls.put += 1;
      putAttempt += 1;
      if (options.failOnPutAttempt && putAttempt === options.failOnPutAttempt) {
        throw new Error("simulated_staging_write_failure");
      }
      store.set(`${kind}:${id}`, JSON.parse(JSON.stringify(value)));
    },
    async remove(kind, id) {
      calls.remove += 1;
      store.delete(`${kind}:${id}`);
    }
  };
}

const trusted = makeInsight({
  id: "legacy_trusted",
  insight: "Kvalitetsgodkjent semantisk kunnskap kan migreres til en staging-kandidat uten å åpne produktpersistens.",
  concepts: ["kvalitet", "migrering", "staging"],
  quality: 0.91,
  source: "trusted"
});
const needsEnrichment = makeInsight({
  id: "legacy_enrichment",
  insight: "Eldre innsikt med utilstrekkelig review-status må først gjennom semantisk enrichment.",
  concepts: ["legacy", "enrichment", "review"],
  quality: 0.43,
  reviewed: false,
  source: "enrichment"
});
const invalid = {
  id: "legacy_invalid",
  candidate: { causal_status: "not_causal", evidence: [{ quote: "Belegg A" }, { quote: "Belegg B" }] },
  gate_decision: { eligible_for_insight_review: true, metrics: { quality_score: 0.9 } }
};

const input = {
  legacy_insights: [trusted, needsEnrichment, invalid],
  legacy_lists: [{ id: "list_legacy", items: [{ refId: "legacy_trusted" }] }],
  legacy_paths: [{ id: "path_legacy", steps: [{ refId: "legacy_enrichment" }] }],
  legacy_mindmaps: [{ id: "mindmap_legacy", nodes: [{ refId: "legacy_trusted" }] }]
};
const beforeInput = JSON.stringify(input);
const migrationPlan = api.plan(input);

assert.equal(migrationPlan.schema, "aha_knowledge_migration_v2");
assert.equal(migrationPlan.version, 2);
assert.equal(migrationPlan.mode, "dry_run");
assert.equal(migrationPlan.status, "ready_with_skips", JSON.stringify(migrationPlan));
assert.equal(migrationPlan.validation.valid, true, JSON.stringify(migrationPlan.validation));
assert.equal(migrationPlan.counts.legacy_insight_count, 3);
assert.equal(migrationPlan.counts.trusted_candidate_count, 1);
assert.equal(migrationPlan.counts.enrichment_candidate_count, 1);
assert.equal(migrationPlan.counts.invalid_skip_count, 1);
assert.equal(migrationPlan.counts.conflict_count, 0);
assert.equal(migrationPlan.counts.already_staged_count, 0);
assert.equal(migrationPlan.counts.reference_candidate_count, 3);
assert.equal(migrationPlan.counts.planned_write_count, 5);
assert.equal(migrationPlan.operations.length, 5);
assert.equal(migrationPlan.rollback_manifest.length, 5);
assert.equal(migrationPlan.reference_map.legacy_trusted.startsWith("backfill_v2_"), true);
assert.equal(migrationPlan.reference_map.legacy_enrichment.startsWith("backfill_v2_"), true);
assert.equal(migrationPlan.reference_map.legacy_invalid, undefined);
assert.ok(migrationPlan.inventory.some((entry) => entry.source_id === "legacy_trusted" && entry.classification === "v2_ready"));
assert.ok(migrationPlan.inventory.some((entry) => entry.source_id === "legacy_enrichment" && entry.classification === "needs_semantic_enrichment"));
assert.ok(migrationPlan.inventory.some((entry) => entry.source_id === "legacy_invalid" && entry.classification === "invalid"));

for (const operation of migrationPlan.operations) {
  assert.ok(api.TARGET_KINDS.includes(operation.target_kind));
  assert.equal(operation.action, "put");
  assert.equal(operation.payload_hash, api.stableHash(operation.payload));
  if (operation.target_kind === "v2_backfill_candidate") {
    assert.equal(operation.payload.trust.authoritative_for_product, false);
    assert.equal(operation.payload.migration.staging_only, true);
    assert.equal(operation.payload.migration.product_write_authority, false);
  } else {
    assert.equal(operation.payload.authoritative_for_product, false);
    assert.equal(operation.payload.apply_to_product_store, false);
    assert.equal(operation.payload.migration.product_reference_rewrite_authority, false);
  }
}

for (const key of [
  "production_gate_authority", "production_adapter_wired", "product_store_write_authority",
  "chamber_write", "canonical_write", "lists_write", "paths_write", "mindmap_write",
  "meta_write", "normal_chat_persistence_open", "product_reference_rewrite_authority"
]) assert.equal(migrationPlan.policy[key], false, `${key} must stay false`);
assert.equal(migrationPlan.policy.staging_apply_requires_explicit_authorization, true);
assert.equal(migrationPlan.policy.staging_adapter_scope, "v2_backfill_staging");
assert.equal(migrationPlan.policy.dry_run_default, true);
assert.equal(JSON.stringify(input), beforeInput, "planning must not mutate legacy input");
assert.equal(forbiddenRuntimeCalls, 0, "planning must not touch product/runtime stores");

// Planning is deterministic and source ordering must not change the plan identity.
const reversedPlan = api.plan({ ...input, legacy_insights: [...input.legacy_insights].reverse() });
assert.equal(reversedPlan.migration_id, migrationPlan.migration_id);
assert.deepEqual(reversedPlan.operations, migrationPlan.operations);
assert.deepEqual(reversedPlan.reference_rewrites, migrationPlan.reference_rewrites);

// Dry-run is the default and must perform zero adapter reads/writes.
(async () => {
  const dryAdapter = createAdapter();
  const preview = await api.execute(migrationPlan, dryAdapter);
  assert.equal(preview.mode, "dry_run");
  assert.equal(preview.status, "previewed");
  assert.equal(preview.write_count, 0);
  assert.equal(preview.planned_write_count, 5);
  assert.equal(preview.rollback_token, null);
  assert.deepEqual(dryAdapter.calls, { get: 0, put: 0, remove: 0 });
  assert.equal(dryAdapter.store.size, 0);

  // Apply must fail closed without explicit staging authorization.
  const unauthorizedAdapter = createAdapter();
  const unauthorized = await api.execute(migrationPlan, unauthorizedAdapter, { mode: "apply" });
  assert.equal(unauthorized.status, "blocked");
  assert.ok(unauthorized.blocking_reasons.includes("explicit_staging_authorization_required"));
  assert.equal(unauthorized.write_count, 0);
  assert.deepEqual(unauthorizedAdapter.calls, { get: 0, put: 0, remove: 0 });

  // A correctly shaped adapter with the wrong scope is still forbidden.
  const wrongScope = createAdapter({ scope: "product_store" });
  const wrongScopeResult = await api.execute(migrationPlan, wrongScope, { mode: "apply", explicit_authorization: true });
  assert.equal(wrongScopeResult.status, "blocked");
  assert.ok(wrongScopeResult.blocking_reasons.includes("v2_backfill_staging_adapter_required"));
  assert.equal(wrongScope.store.size, 0);

  // First authorized apply writes exactly the planned staging records.
  const adapter = createAdapter();
  const applied = await api.execute(migrationPlan, adapter, { mode: "apply", explicit_authorization: true });
  assert.equal(applied.status, "applied", JSON.stringify(applied));
  assert.equal(applied.write_count, 5);
  assert.equal(applied.no_op_count, 0);
  assert.equal(applied.journal.length, 5);
  assert.ok(applied.journal.every((entry) => entry.status === "applied"));
  assert.ok(applied.rollback_token.startsWith("rollback_v2_"));
  assert.equal(adapter.store.size, 5);

  // Re-applying the same plan is idempotent: zero writes, all operations are no-ops.
  const putCallsBeforeSecondApply = adapter.calls.put;
  const secondApply = await api.execute(migrationPlan, adapter, { mode: "apply", explicit_authorization: true });
  assert.equal(secondApply.status, "applied");
  assert.equal(secondApply.write_count, 0);
  assert.equal(secondApply.no_op_count, 5);
  assert.ok(secondApply.journal.every((entry) => entry.status === "already_applied"));
  assert.equal(adapter.calls.put, putCallsBeforeSecondApply, "idempotent apply must not rewrite exact staged payloads");
  assert.equal(adapter.store.size, 5);

  // Rollback of the original execution removes only the exact payloads written by it.
  const rollback = await api.rollback(applied, adapter, { explicit_authorization: true });
  assert.equal(rollback.status, "rollback_complete", JSON.stringify(rollback));
  assert.equal(rollback.rolled_back_count, 5);
  assert.equal(rollback.no_op_count, 0);
  assert.equal(adapter.store.size, 0);

  // The same rollback is itself idempotent once all exact staging records are absent.
  const secondRollback = await api.rollback(applied, adapter, { explicit_authorization: true });
  assert.equal(secondRollback.status, "rollback_complete");
  assert.equal(secondRollback.rolled_back_count, 0);
  assert.equal(secondRollback.no_op_count, 5);
  assert.equal(adapter.store.size, 0);

  // If staged state changes after apply, rollback must stop before deleting anything.
  const changedAdapter = createAdapter();
  const changedExecution = await api.execute(migrationPlan, changedAdapter, { mode: "apply", explicit_authorization: true });
  assert.equal(changedExecution.status, "applied");
  const changedEntry = changedExecution.journal[0];
  const changedKey = `${changedEntry.target_kind}:${changedEntry.target_id}`;
  changedAdapter.store.set(changedKey, { externally_changed: true });
  const storeBeforeConflictRollback = JSON.stringify(Array.from(changedAdapter.store.entries()));
  const conflictRollback = await api.rollback(changedExecution, changedAdapter, { explicit_authorization: true });
  assert.equal(conflictRollback.status, "manual_review_required");
  assert.equal(conflictRollback.rolled_back_count, 0);
  assert.ok(conflictRollback.blocking_reasons.some((reason) => reason.startsWith("rollback_current_state_changed:")));
  assert.equal(JSON.stringify(Array.from(changedAdapter.store.entries())), storeBeforeConflictRollback, "conflicted rollback must not partially mutate staging");

  // A partial apply failure must automatically revert everything already written.
  const failingAdapter = createAdapter({ failOnPutAttempt: 2 });
  const failed = await api.execute(migrationPlan, failingAdapter, { mode: "apply", explicit_authorization: true });
  assert.equal(failed.status, "failed_rolled_back", JSON.stringify(failed));
  assert.equal(failed.write_count, 1);
  assert.equal(failed.auto_rollback.ok, true);
  assert.equal(failed.auto_rollback.rolled_back_count, 1);
  assert.equal(failingAdapter.store.size, 0, "partial staging failure must leave no applied residue");

  // An exact previously staged candidate is detected at plan time and not re-planned.
  const trustedOnlyPlan = api.plan({ legacy_insights: [trusted] });
  const trustedOperation = trustedOnlyPlan.operations.find((operation) => operation.target_kind === "v2_backfill_candidate");
  assert.ok(trustedOperation);
  const alreadyStagedPlan = api.plan({ legacy_insights: [trusted], existing_staged: [trustedOperation.payload] });
  assert.equal(alreadyStagedPlan.status, "ready");
  assert.equal(alreadyStagedPlan.counts.already_staged_count, 1);
  assert.equal(alreadyStagedPlan.counts.planned_write_count, 0);
  assert.equal(alreadyStagedPlan.operations.length, 0);

  // Same legacy id with another fingerprint is a hard migration conflict.
  const conflictingExisting = JSON.parse(JSON.stringify(trustedOperation.payload));
  conflictingExisting.legacy.fingerprint = "deadbeef";
  const conflictPlan = api.plan({ legacy_insights: [trusted], existing_staged: [conflictingExisting] });
  assert.equal(conflictPlan.status, "blocked");
  assert.equal(conflictPlan.counts.conflict_count, 1);
  assert.equal(conflictPlan.counts.planned_write_count, 0);
  assert.ok(conflictPlan.blocking_reasons.some((reason) => reason.includes("existing_backfill_candidate_has_different_legacy_fingerprint")));
  const blockedApplyAdapter = createAdapter();
  const blockedApply = await api.execute(conflictPlan, blockedApplyAdapter, { mode: "apply", explicit_authorization: true });
  assert.equal(blockedApply.status, "blocked");
  assert.ok(blockedApply.blocking_reasons.includes("migration_plan_blocked"));
  assert.equal(blockedApplyAdapter.store.size, 0);

  // Dependency loss fails closed instead of falling back to legacy/product stores.
  const saturationBackup = context.AHAInsightSaturationV2;
  context.AHAInsightSaturationV2 = null;
  const dependencyBlocked = api.plan({ legacy_insights: [trusted] });
  assert.equal(dependencyBlocked.status, "blocked");
  assert.ok(dependencyBlocked.blocking_reasons.includes("insight_saturation_v2_unavailable"));
  assert.equal(dependencyBlocked.counts.planned_write_count, 0);
  context.AHAInsightSaturationV2 = saturationBackup;

  assert.equal(forbiddenRuntimeCalls, 0, "migration execution must not touch product/runtime stores");

  const source = fs.readFileSync("js/ahaKnowledgeMigrationV2.js", "utf8");
  for (const [pattern, label] of [
    [/localStorage\s*\./, "localStorage"],
    [/AHARepository\s*\./, "AHARepository"],
    [/InsightsEngine\s*\./, "InsightsEngine"],
    [/AHALists\s*\./, "AHALists"],
    [/AHAPaths\s*\./, "AHAPaths"],
    [/MindmapStore\s*\./, "MindmapStore"],
    [/supabase\s*\./i, "supabase"],
    [/\bfetch\s*\(/, "fetch"],
    [/normal_chat_persistence_open:\s*true/, "normal Chat persistence authority"],
    [/product_store_write_authority:\s*true/, "product-store write authority"]
  ]) assert.equal(pattern.test(source), false, `migration module must not contain executable ${label} access`);

  console.log("aha-knowledge-migration-v2.test.cjs: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
