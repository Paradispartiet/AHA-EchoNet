const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("insight-activation-v2.html", "utf8");
const operator = fs.readFileSync("js/ahaInsightActivationOperatorV2.js", "utf8");
const chat = fs.readFileSync("chat.html", "utf8");

assert.match(html, /AHA Insight Activation V2/);
assert.match(html, /kontrollert én-record-pilot/);
assert.match(html, /\?pilot=single_local_chamber_insight_v1/);
assert.match(html, /12\/12 grønn/);
assert.match(html, /Rollback åpner ikke record-budsjettet igjen/);
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
const productionGateIndex = operator.indexOf('js/ahaV2ProductionWriteGate.js');
const rollbackIndex = operator.indexOf('js/ahaV2ControlledWritePilotRollback.js');
const pilotActivationIndex = operator.indexOf('js/ahaV2ControlledWritePilotActivation.js');
assert.ok(
  gateIndex >= 0 &&
  runtimeIndex > gateIndex &&
  bootstrapIndex > runtimeIndex &&
  activationIndex > bootstrapIndex &&
  productionGateIndex > activationIndex &&
  rollbackIndex > productionGateIndex &&
  pilotActivationIndex > rollbackIndex
);
assert.match(operator, /post-stability-two-round-v1/);
assert.match(operator, /controlled-activation-production-v1/);
assert.match(operator, /ops\/evidence\/aha-v2-production-write-gate-current-v1\.json/);
assert.match(operator, /single_local_chamber_insight_v1/);
assert.match(operator, /URLSearchParams/);
assert.match(operator, /AHAInsightActivationV2\.validateProof/);
assert.match(operator, /AHAV2ControlledWritePilotActivation\.create/);
assert.match(operator, /prepareReview/);
assert.match(operator, /approveReview/);
assert.match(operator, /prepareCanonical/);
assert.match(operator, /approveCanonical/);
assert.match(operator, /prepareRollback/);
assert.match(operator, /approveRollback/);
assert.match(operator, /created_record_count/);
assert.doesNotMatch(operator, /AHAInsightActivationV2Controller\s*=/, "raw activation controller must not be exported by the operator page");
assert.doesNotMatch(operator, /localStorage\.(?:setItem|removeItem)/);
assert.doesNotMatch(operator, /supabase/i);

assert.doesNotMatch(chat, /ahaInsightActivationV2/);
assert.doesNotMatch(chat, /insight-activation-v2/);
assert.doesNotMatch(chat, /ahaV2ControlledWritePilotActivation/);

console.log("aha-insight-activation-operator-v2 passed");
