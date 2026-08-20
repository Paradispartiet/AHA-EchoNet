const assert = require("assert");
const fs = require("fs");

const operator = fs.readFileSync("semantic-evaluation-shadow.html", "utf8");
const chat = fs.readFileSync("chat.html", "utf8");
const bootstrap = fs.readFileSync("js/ahaInsightSynthesisBootstrapV2.js", "utf8");

assert.match(operator, /ahaSemanticModelShadow=1&amp;ahaInsightSynthesisV2=1/);
assert.match(operator, /js\/ahaInsightQualityGateV2\.js/);
assert.match(operator, /js\/ahaInsightSynthesisRuntimeV2\.js/);
assert.match(operator, /js\/ahaInsightSynthesisBootstrapV2\.js/);
assert.match(operator, /aha:insight-quality-v2-shadow/);

const gateIndex = operator.indexOf('js/ahaInsightQualityGateV2.js');
const runtimeIndex = operator.indexOf('js/ahaInsightSynthesisRuntimeV2.js');
const bootstrapIndex = operator.indexOf('js/ahaInsightSynthesisBootstrapV2.js');
assert.ok(gateIndex >= 0 && runtimeIndex > gateIndex && bootstrapIndex > runtimeIndex, "V2 gate må lastes før runtime og bootstrap");

assert.doesNotMatch(chat, /ahaInsightQualityGateV2\.js/);
assert.doesNotMatch(chat, /ahaInsightSynthesisRuntimeV2\.js/);
assert.doesNotMatch(chat, /ahaInsightSynthesisBootstrapV2\.js/);
assert.doesNotMatch(chat, /ahaInsightSynthesisV2=1/);

assert.match(bootstrap, /if \(global\.AHAInsightSynthesisV2Runtime\) return;/);
assert.match(bootstrap, /global\.AHAInsightSynthesisV2Runtime = runtime;/);
assert.match(bootstrap, /runtime\.bind\(\)/);

console.log("aha-insight-synthesis-operator-v2 passed");
