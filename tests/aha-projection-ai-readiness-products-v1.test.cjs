const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js/ahaProjectionRuntimeSourceV2.js"), "utf8");
const id = {
  analysis_id: "analysis_ai_readiness",
  analysis_run_id: "run_ai_readiness",
  source_id: "source_ai_readiness",
  source_sha256: "f".repeat(64)
};

function projectionState(semanticDocument, runtime = {}) {
  const store = new Map();
  let writes = 0;
  const bundle = {
    schema: "aha_analysis_bundle_v2",
    identity: id,
    semantic_document: semanticDocument,
    runtime
  };
  store.set("aha_chat_auto_outputs_v1", JSON.stringify({
    analysisId: id.analysis_id,
    analysisRunId: id.analysis_run_id,
    sourceId: id.source_id,
    sourceSha256: id.source_sha256,
    payload: { analysisBundleV2: bundle }
  }));
  const ctx = {
    console, URLSearchParams,
    location: { search: "" },
    localStorage: {
      getItem(key) { return store.get(key) || null; },
      setItem() { writes += 1; },
      removeItem() { writes += 1; }
    },
    AHAAnalysisBundleV2: { hydrate(value) { return value?.schema === "aha_analysis_bundle_v2" ? value : null; } },
    AHAProjectionProductReadModelV2: {
      build() { throw Error("No model should be built without approved semantic insight"); }
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  const api = ctx.AHAProjectionRuntimeSourceV2;
  const model = api.build();
  assert.equal(model.status, "blocked");
  assert.equal(model.blocking_reasons[0], "active_analysis_has_no_projection_ready_insights");
  assert.equal(writes, 0);
  return model.product_states;
}

function checkStates(states, expectedStatus, title, pattern) {
  for (const product of ["list", "path", "mindmap"]) {
    const state = states[product];
    assert.equal(state.status, expectedStatus, product);
    assert.equal(state.label, title, product);
    assert.match(state.reason, pattern, product);
    assert.equal(state.href, null, "No link to a product without an approved projection");
    assert.equal(state.candidate_count, 0);
  }
}

checkStates(
  projectionState({ candidate_insight_ids: [], synthesis_gate: { authoritative: true, status: "not_run" } }),
  "needs_evidence", "AI-analyse ikke fullført", /ikke fullført/
);
checkStates(
  projectionState({ candidate_insight_ids: [], synthesis_gate: { authoritative: true, status: "not_run" } }, { status: "blocked_synthesis_http" }),
  "needs_evidence", "AI-analyse utilgjengelig", /blokkert eller var utilgjengelig/
);
checkStates(
  projectionState({ candidate_insight_ids: [] }),
  "needs_evidence", "AI-analyse ikke fullført", /ikke fullført/
);
checkStates(
  projectionState({ candidate_insight_ids: [], synthesis_gate: { authoritative: true, status: "blocked" } }),
  "needs_evidence", "Ingen godkjent AI-innsikt", /ingen innsikt bestod kvalitetssperren/i
);
checkStates(
  projectionState({ candidate_insight_ids: [], synthesis_gate: { authoritative: true, status: "ready" } }),
  "not_relevant", "Ikke relevant for denne teksten", /ingen semantisk kandidat/
);
assert.ok(fs.readFileSync(path.join(__dirname, "..", "js/ahaLists.js"), "utf8").includes("model?.product_states?.list"));
assert.ok(fs.readFileSync(path.join(__dirname, "..", "js/ahaPaths.js"), "utf8").includes("model?.product_states?.path"));
console.log("V2 Lists and Paths never confuse unrun AI with irrelevant products.");
