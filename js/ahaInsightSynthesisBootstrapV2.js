// ahaInsightSynthesisBootstrapV2.js
// Idempotent bootstrap for the explicit semantic evaluation operator flow.

(function (global) {
  "use strict";

  if (global.AHAInsightSynthesisV2Runtime) return;
  const api = global.AHAInsightSynthesisRuntimeV2;
  if (!api?.create) return;

  const runtime = api.create();
  global.AHAInsightSynthesisV2Runtime = runtime;
  if (global.document && typeof global.addEventListener === "function") runtime.bind();
})(typeof window !== "undefined" ? window : globalThis);
