const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const sha = "b".repeat(64);
const identity = {
  analysis_id: "analysis_livsarket",
  analysis_run_id: "run_livsarket",
  source_id: "source_livsarket",
  source_sha256: sha,
  topic_label: "Livsarket",
  created_at: "2026-08-22T06:00:00.000Z"
};
const evidence = [
  { excerpt: "Livsarket samler erfaringer og kilder.", start: 0, end: 41 },
  { excerpt: "Kildebelegget følger hvert analysefelt.", start: 42, end: 83 }
];
const bundle = {
  schema: "aha_analysis_bundle_v2",
  version: 2,
  bundle_id: "analysis_bundle_livsarket",
  identity,
  semantic_document: {
    candidate_insight_ids: ["insight_livsarket"],
    approved_insight_ids: ["insight_livsarket"],
    approved_insight_records: [{
      id: "insight_livsarket",
      insight: "Feltvis kildebelegg gjør analysen kontrollerbar.",
      type: "generalization",
      causal_status: "not_causal",
      quality_score: 0.91,
      evidence
    }]
  },
  surfaces: {
    concepts: [{
      schema: "aha_analysis_field_v2",
      item_id: "concept_livsarket",
      value: "feltvis kildebelegg",
      semantic_ids: ["concept_livsarket"],
      source_sha256: sha,
      analysis_run_id: identity.analysis_run_id,
      source_id: identity.source_id,
      topic: { status: "verified" },
      quality: { status: "passed" },
      provenance: { evidence }
    }]
  }
};
const cache = {
  analysisId: identity.analysis_id,
  analysisRunId: identity.analysis_run_id,
  sourceId: identity.source_id,
  sourceSha256: sha,
  payload: { analysisBundleV2: bundle }
};
const storage = new Map([["aha_chat_auto_outputs_v1", JSON.stringify(cache)]]);
const reads = [];
let writes = 0;
let capturedInput = null;
const context = {
  console,
  URLSearchParams,
  location: { search: "" },
  localStorage: {
    getItem(key) { reads.push(key); return storage.get(key) || null; },
    setItem() { writes += 1; },
    removeItem() { writes += 1; }
  },
  AHAAnalysisBundleV2: {
    hydrate(value) { return value?.schema === "aha_analysis_bundle_v2" ? JSON.parse(JSON.stringify(value)) : null; }
  },
  AHAProjectionProductReadModelV2: {
    build(input) {
      capturedInput = JSON.parse(JSON.stringify(input));
      return {
        schema: "aha_projection_product_read_model_v2",
        version: 2,
        mode: "read_only",
        status: "ready",
        projection_id: "projection_livsarket",
        surfaces: {
          insights: input.legacy_insights,
          concepts: [],
          lists: [{ id: "list_livsarket" }],
          paths: [{ id: "path_livsarket" }],
          mindmap: { nodes: [{ id: "root" }], edges: [], read_only: true }
        },
        validation: { valid: true, errors: [] },
        policy: { persistent_write: false, remote_write: false }
      };
    }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaProjectionRuntimeSourceV2.js", "utf8"), context, { filename: "js/ahaProjectionRuntimeSourceV2.js" });

const api = context.AHAProjectionRuntimeSourceV2;
const snapshot = api.snapshot();
assert.equal(snapshot.analysis_bundle_v2.bundle_id, bundle.bundle_id);
assert.deepEqual(Array.from(snapshot.approved_active_insights, (item) => item.id), ["insight_livsarket"]);
assert.deepEqual(Array.from(snapshot.legacy_insights, (item) => item.id), ["insight_livsarket"]);
assert.equal(snapshot.legacy_insights[0].source_text_hash, sha);
assert.equal(snapshot.legacy_insights[0].analysis_id, identity.analysis_id);
assert.equal(snapshot.legacy_insights[0].evidence.length, 2);
assert.deepEqual(Array.from(snapshot.legacy_lists), []);
assert.deepEqual(Array.from(snapshot.legacy_paths), []);

const model = api.build();
assert.equal(model.status, "ready");
assert.equal(model.projection_id, "projection_livsarket");
assert.equal(model.identity.source_sha256, sha);
assert.equal(capturedInput.analysis_bundle_v2.bundle_id, bundle.bundle_id);
assert.equal(capturedInput.legacy_insights.length, 1);
assert.equal(model.product_states.list.label, "Klar til forhåndsvisning");
assert.match(model.product_states.list.href, /^lists\.html\?/);
assert.match(model.product_states.list.href, /analysis_id=analysis_livsarket/);
assert.match(model.product_states.list.href, /projection_id=projection_livsarket/);
assert.equal(model.policy.product_store_write, false);
assert.equal(model.policy.chamber_write, false);
assert.deepEqual([...new Set(reads)], ["aha_chat_auto_outputs_v1"], "runtime may only read the authoritative active analysis cache");
assert.equal(writes, 0, "runtime source must never write storage");

context.location.search = "?product=list&analysis_id=analysis_livsarket&projection_id=projection_other&source_sha256=" + sha;
assert.equal(api.build().blocking_reasons[0], "deeplink_projection_id_mismatch");
context.location.search = "?product=list&analysis_id=analysis_stale&projection_id=projection_livsarket&source_sha256=" + sha;
assert.equal(api.build().blocking_reasons[0], "deeplink_analysis_id_mismatch");

context.location.search = "";
storage.set("aha_chat_auto_outputs_v1", JSON.stringify({ ...cache, sourceSha256: "c".repeat(64) }));
assert.equal(api.build().blocking_reasons[0], "active_analysis_bundle_identity_mismatch");
storage.delete("aha_chat_auto_outputs_v1");
assert.equal(api.build().blocking_reasons[0], "active_analysis_unavailable");
assert.equal(writes, 0);

const source = fs.readFileSync("js/ahaProjectionRuntimeSourceV2.js", "utf8");
assert.doesNotMatch(source, /aha_insight_chamber_v1|aha_lists_v1|aha_paths_v1/);
assert.doesNotMatch(source, /localStorage\?*\.setItem|fetch\s*\(/);

console.log("aha-projection-runtime-source-v2.test.cjs: OK");
