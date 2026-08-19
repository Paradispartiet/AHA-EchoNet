const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("semantic-evaluation-shadow.html", "utf8");
const bootstrap = fs.readFileSync("js/ahaSemanticEvaluationBootstrap.js", "utf8");

assert.match(html, /src="chat\.html\?ahaSemanticModelShadow=1"/);
assert.match(html, /AHA Semantic Evaluation Shadow/);
assert.match(html, /Normal AHA Chat endres ikke/);

const gate = html.indexOf('js/ahaSemanticInsightQualityGate.js');
const runtime = html.indexOf('js/ahaSemanticEvaluationRuntime.js');
const boot = html.indexOf('js/ahaSemanticEvaluationBootstrap.js');
assert.ok(gate >= 0 && runtime >= 0 && boot >= 0);
assert.ok(gate < runtime, "quality gate må injiseres før evaluation runtime");
assert.ok(runtime < boot, "runtime må injiseres før bootstrap binder listeneren");

assert.match(html, /aha:semantic-evaluation-shadow/);
assert.match(html, /synthesis_allowed/);
assert.doesNotMatch(html, /localStorage\.(?:setItem|removeItem)/);
assert.doesNotMatch(html, /supabase/i);
assert.doesNotMatch(html, /canonical_write\s*=\s*true/i);

assert.match(bootstrap, /semanticEvaluationRuntime/);
assert.match(bootstrap, /AHASemanticEvaluationShadowRuntime/);
assert.match(bootstrap, /runtime\.bind\?\.\(\)/);
assert.doesNotMatch(bootstrap, /fetch\s*\(/);
assert.doesNotMatch(bootstrap, /localStorage/);

console.log("aha-semantic-evaluation-shadow-operator-v1 passed");
