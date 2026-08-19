// ahaSemanticEvaluationBootstrap.js
// Minimal opt-in bootstrap for the memory-only semantic evaluation runtime.

(function (global) {
  "use strict";

  const existing = global.AHASemanticEvaluationShadowRuntime;
  if (existing?.getStatus) return;

  const api = global.AHAModuleApi?.resolve?.(
    "semanticEvaluationRuntime",
    "AHASemanticEvaluationRuntime",
    { version: 1 }
  ) || global.AHASemanticEvaluationRuntime;

  if (!api?.create) return;
  const runtime = api.create();
  global.AHASemanticEvaluationShadowRuntime = runtime;
  runtime.bind?.();
})(typeof window !== "undefined" ? window : globalThis);
