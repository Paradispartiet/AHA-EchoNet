const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("insight-expansion-v2.html", "utf8");
const operator = fs.readFileSync("js/ahaInsightExpansionOperatorV2.js", "utf8");
const chat = fs.readFileSync("chat.html", "utf8");

assert.match(html, /kontrollert to-record-utvidelse/);
assert.match(html, /bounded_local_chamber_two_record_candidate_v1/);
assert.match(html, /Maksimalt to lokale Chamber-records/);
assert.match(html, /Rollback åpner aldri lifetime-budsjettet igjen/);
assert.match(html, /src="about:blank"/);
assert.doesNotMatch(html, /src="chat\.html/u, "operator iframe must not boot Chat before exact intent");
assert.match(html, /js\/ahaInsightExpansionOperatorV2\.js/);
assert.match(html, /Godkjenn review/);
assert.match(html, /Godkjenn Chamber-write/);
assert.match(html, /Godkjenn rollback/);
assert.doesNotMatch(html, /localStorage\.(?:setItem|removeItem)/u);
assert.doesNotMatch(html, /supabase/iu);

const gateIndex = operator.indexOf('js/ahaV2ControlledWriteExpansionGate.js');
const activationIndex = operator.indexOf('js/ahaV2ControlledWriteExpansionActivation.js');
const rawActivationIndex = operator.indexOf('js/ahaInsightActivationV2.js');
assert.ok(rawActivationIndex >= 0 && gateIndex > rawActivationIndex && activationIndex > gateIndex);

assert.match(operator, /ops\/evidence\/aha-v2-controlled-write-expansion-gate-current-v1\.json/);
assert.match(operator, /ops\/evidence\/aha-v2-controlled-write-pilot-live-proof-v1\.json/);
assert.match(operator, /ops\/evidence\/aha-v2-two-record-expansion-live-proof-v1\.json/);
assert.match(operator, /ops\/contracts\/aha-v2-controlled-write-expansion-scope-two-record-v1\.json/);
assert.match(operator, /post-stability-two-round-v1/);
assert.match(operator, /bounded_local_chamber_two_record_candidate_v1/);
assert.match(operator, /AHAInsightActivationV2\.validateProof/);
assert.match(operator, /AHAV2ControlledWriteExpansionActivation\.create/);
assert.match(operator, /prepareReview/);
assert.match(operator, /approveReview/);
assert.match(operator, /prepareCanonical/);
assert.match(operator, /approveCanonical/);
assert.match(operator, /prepareRollback/);
assert.match(operator, /approveRollback/);
assert.match(operator, /created_record_count/);
assert.match(operator, /remaining_record_budget/);
assert.match(operator, /promoted_review_ids/);
assert.doesNotMatch(operator, /AHAInsightActivationV2Controller\s*=/u, "raw activation controller must not be exported");
assert.doesNotMatch(operator, /AHAV2ControlledWriteExpansionController\s*=/u, "expansion controller must stay closure-local");
assert.doesNotMatch(operator, /localStorage\.(?:setItem|removeItem)/u);
assert.doesNotMatch(operator, /supabase/iu);

const intentGuard = operator.indexOf("operatorIntent !== OPERATOR_INTENT");
const loadHandler = operator.indexOf('frame.addEventListener("load"');
const navigate = operator.indexOf("frame.src = FRAME_URL");
assert.ok(intentGuard >= 0 && loadHandler > intentGuard && navigate > loadHandler, "exact intent guard and load handler must precede Chat navigation");

assert.doesNotMatch(chat, /ahaV2ControlledWriteExpansionActivation/u);
assert.doesNotMatch(chat, /ahaInsightExpansionOperatorV2/u);
assert.doesNotMatch(chat, /insight-expansion-v2/u);

console.log("aha-insight-expansion-operator-v2.test.cjs: OK");
