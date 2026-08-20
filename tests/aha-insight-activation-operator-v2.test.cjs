const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("insight-activation-v2.html", "utf8");
const operator = fs.readFileSync("js/ahaInsightActivationOperatorV2.js", "utf8");
const chat = fs.readFileSync("chat.html", "utf8");

assert.match(html, /AHA Insight Activation V2/);
assert.match(html, /ahaSemanticModelShadow=1&amp;ahaInsightSynthesisV2=1/);
assert.match(html, /js\/ahaInsightActivationOperatorV2\.js/);
assert.match(html, /Godkjenn til review-kø/);
assert.match(html, /Godkjenn én Chamber-innsikt/);
assert.match(html, /Godkjenn rollback/);
assert.doesNotMatch(html, /localStorage\.(?:setItem|removeItem)/);
assert.doesNotMatch(html, /supabase/i);

const gateIndex = operator.indexOf('js/ahaInsightQualityGateV2.js');
const runtimeIndex = operator.indexOf('js/ahaInsightSynthesisRuntimeV2.js');
const bootstrapIndex = operator.indexOf('js/ahaInsightSynthesisBootstrapV2.js');
const activationIndex = operator.indexOf('js/ahaInsightActivationV2.js');
assert.ok(gateIndex >= 0 && runtimeIndex > gateIndex && bootstrapIndex > runtimeIndex && activationIndex > bootstrapIndex);
assert.match(operator, /post-stability-two-round-v1/);
assert.match(operator, /validateProof/);
assert.match(operator, /prepareReview/);
assert.match(operator, /approveReview/);
assert.match(operator, /prepareCanonical/);
assert.match(operator, /approveCanonical/);
assert.match(operator, /prepareRollback/);
assert.match(operator, /approveRollback/);
assert.doesNotMatch(operator, /supabase/i);

assert.doesNotMatch(chat, /ahaInsightActivationV2/);
assert.doesNotMatch(chat, /insight-activation-v2/);

console.log("aha-insight-activation-operator-v2 passed");
