const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaSemanticEvaluationRuntime.js", "utf8");
const context = { window: null, console };
context.window = context;
vm.runInNewContext(source, context, { filename: "js/ahaSemanticEvaluationRuntime.js" });

const api = context.AHASemanticEvaluationRuntime;
assert.ok(api);
assert.equal(api.SCHEMA, "aha_semantic_evaluation_runtime_v1");
assert.equal(api.VERSION, 1);

function fixture() {
  const sourceText = "Politisk økologi undersøker hvordan makt og miljø henger sammen.";
  const hash = crypto.createHash("sha256").update(sourceText, "utf8").digest("hex");
  const deterministic = {
    id: "sem_eval_runtime",
    source_event_id: "src_eval_runtime",
    source_text_hash: hash,
    evidence_anchors: [{
      id: "ev_eval_runtime_001",
      index: 0,
      start_offset: 0,
      end_offset: sourceText.length,
      text: sourceText
    }]
  };
  const modelShadow = {
    schema: "aha_semantic_model_shadow_v1",
    source_event_id: deterministic.source_event_id,
    source_text_hash: hash,
    policy: {
      canonical_write: false,
      persistent_write: false,
      meta_write: false,
      visible_output_changed: false,
      synthesis_allowed: false,
      source_text_stored: false
    }
  };
  const evaluation = {
    schema: "aha_semantic_evaluation_v1",
    version: 1,
    mode: "shadow",
    source_event_id: deterministic.source_event_id,
    source_text_hash: hash,
    valid: true,
    input_errors: [],
    metrics: {
      evidence_fidelity_rate: 1,
      entity_agreement_rate: 0.5,
      synthesis_review_eligible_count: 1
    },
    proposition_decisions: [{
      proposition_index: 0,
      kind: "interpretation",
      confidence: "high",
      evidence_exact: true,
      eligible_for_synthesis_review: true,
      blocking_reasons: []
    }],
    gate: {
      schema: "aha_synthesized_insight_quality_gate_v1",
      authoritative: false,
      gold_evaluation_required: true,
      synthesis_review_available: true,
      synthesis_allowed: false,
      canonical_write: false,
      meta_write: false,
      persistent_write: false,
      blocking_reasons: ["shadow_gate_not_authoritative", "gold_evaluation_required"]
    }
  };
  return { sourceText, hash, deterministic, modelShadow, evaluation };
}

function makeRuntime(options = {}) {
  const data = fixture();
  const events = [];
  const gateCalls = [];
  const listeners = new Map();
  const semanticApi = {
    getLastShadowSemanticDocument: () => options.deterministic || data.deterministic,
    sha256Hex: (text) => options.hashOverride
      ? options.hashOverride(text)
      : crypto.createHash("sha256").update(text, "utf8").digest("hex")
  };
  const modelRuntime = {
    getLastModelShadow: () => options.modelShadow || data.modelShadow
  };
  const gateApi = {
    evaluateSemanticShadow(input) {
      gateCalls.push(input);
      return options.evaluation || data.evaluation;
    }
  };
  const runtime = api.create({
    getSourcesApi: () => ({
      loadSourceEvents: () => options.sourceEvents || [{
        id: data.deterministic.source_event_id,
        text: data.sourceText,
        source_type: "chat"
      }]
    }),
    getSemanticDocumentApi: () => semanticApi,
    getModelShadowRuntime: () => modelRuntime,
    getQualityGateApi: () => gateApi,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name, listener) => {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
    dispatchEvent: (event) => { events.push(event); return true; },
    CustomEventImpl: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; }
  });
  return { runtime, data, events, gateCalls, listeners };
}

{
  const { runtime, data, events, gateCalls } = makeRuntime();
  const result = runtime.handleModelShadow({
    detail: {
      source_event_id: data.deterministic.source_event_id,
      source_text_hash: data.hash
    }
  });
  assert.ok(result);
  assert.equal(gateCalls.length, 1);
  assert.equal(gateCalls[0].source_text, data.sourceText);
  assert.equal(gateCalls[0].deterministic_document.source_event_id, data.deterministic.source_event_id);
  assert.equal(gateCalls[0].model_shadow.source_event_id, data.modelShadow.source_event_id);
  assert.equal(result.valid, true);
  assert.equal(result.gate.synthesis_allowed, false);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, "aha:semantic-evaluation-shadow");
  assert.equal(events[0].detail.valid, true);
  assert.equal(events[0].detail.metrics.evidence_fidelity_rate, 1);
  assert.equal(events[0].detail.gate.synthesis_allowed, false);
  assert.equal(Object.prototype.hasOwnProperty.call(events[0].detail, "source_text"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(events[0].detail, "proposition_decisions"), false);
  assert.equal(JSON.stringify(events[0].detail).includes(data.sourceText), false);

  const readBack = runtime.getLastEvaluation();
  readBack.metrics.evidence_fidelity_rate = 0;
  assert.equal(runtime.getLastEvaluation().metrics.evidence_fidelity_rate, 1, "runtime skal returnere defensive kopier");

  const status = runtime.getStatus();
  assert.equal(status.has_evaluation, true);
  assert.equal(status.evaluation_valid, true);
  assert.equal(status.synthesis_allowed, false);
  assert.equal(status.canonical_write, false);
  assert.equal(status.meta_write, false);
  assert.equal(status.persistent_write, false);

  runtime.clearLastEvaluation();
  assert.equal(runtime.getLastEvaluation(), null);
}

{
  const { runtime, data, gateCalls } = makeRuntime();
  const result = runtime.handleModelShadow({
    source_event_id: "wrong_source",
    source_text_hash: data.hash
  });
  assert.equal(result, null);
  assert.equal(gateCalls.length, 0, "identity mismatch skal stoppe før evaluator-kall");
}

{
  const { runtime, data, gateCalls } = makeRuntime({ hashOverride: () => "0".repeat(64) });
  const result = runtime.handleModelShadow({
    source_event_id: data.deterministic.source_event_id,
    source_text_hash: data.hash
  });
  assert.equal(result, null);
  assert.equal(gateCalls.length, 0, "recomputed source hash mismatch skal stoppe før evaluator-kall");
}

{
  const { runtime, data, gateCalls } = makeRuntime({ sourceEvents: [] });
  const result = runtime.handleModelShadow({
    source_event_id: data.deterministic.source_event_id,
    source_text_hash: data.hash
  });
  assert.equal(result, null);
  assert.equal(gateCalls.length, 0);
}

{
  const { runtime, data, events } = makeRuntime({
    evaluation: {
      schema: "aha_semantic_evaluation_v1",
      version: 1,
      source_event_id: "src_eval_runtime",
      source_text_hash: data?.hash,
      valid: false,
      input_errors: ["evidence_invalid"],
      metrics: { evidence_fidelity_rate: 0.8 },
      gate: {
        authoritative: false,
        synthesis_review_available: false,
        synthesis_allowed: false,
        canonical_write: false,
        meta_write: false,
        persistent_write: false
      }
    }
  });
  // Replace the undefined test-only hash without changing the runtime contract.
  const invalid = runtime.handleModelShadow({
    source_event_id: "src_eval_runtime",
    source_text_hash: fixture().hash
  });
  assert.ok(invalid);
  assert.equal(invalid.valid, false, "invalid semantic evaluation skal fortsatt være observerbar i shadow runtime");
  assert.equal(invalid.gate.synthesis_allowed, false);
  assert.equal(events[0].detail.valid, false);
}

{
  const { runtime, listeners } = makeRuntime();
  assert.equal(runtime.bind(), true);
  assert.equal(runtime.bind(), false, "bind skal være idempotent");
  assert.equal(typeof listeners.get("aha:semantic-model-shadow"), "function");
  assert.equal(runtime.getStatus().bound, true);
  assert.equal(runtime.unbind(), true);
  assert.equal(runtime.unbind(), false);
  assert.equal(listeners.has("aha:semantic-model-shadow"), false);
}

console.log("aha-semantic-evaluation-runtime-v1 passed");
