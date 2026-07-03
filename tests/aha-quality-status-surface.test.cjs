const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");
const helperPath = path.join(repoRoot, "js/ahaQualityStatusSurface.js");

assert.equal(fs.existsSync(helperPath), true, "js/ahaQualityStatusSurface.js must exist");

const code = fs.readFileSync(helperPath, "utf8");
const sandbox = { window: {}, console };
vm.runInNewContext(code, sandbox, { filename: "js/ahaQualityStatusSurface.js" });

const api = sandbox.window.AHAQualityStatusSurface;
assert.equal(typeof api, "object");
for (const name of [
  "buildQualityStatusSurface",
  "normalizeQualityStatusInput",
  "buildQualityChecks",
  "deriveOverallQualityStatus",
  "buildQualitySafeSummary",
  "buildQualityStatusSafety"
]) {
  assert.equal(typeof api[name], "function", `${name} must be exported`);
}

const emptySurface = api.buildQualityStatusSurface();
assert.equal(emptySurface.version, "aha_quality_status_surface_v1");
assert.equal(emptySurface.localOnly, true);
assert.equal(emptySurface.readOnly, true);
assert.equal(emptySurface.noSync, true);
assert.equal(emptySurface.sourceScope, "current_conversation_or_analysis");
assert.ok(emptySurface.status);
assert.ok(emptySurface.checks);
assert.ok(emptySurface.safeSummary);
assert.ok(emptySurface.safety);
assert.equal(emptySurface.status, "unknown");
assert.notEqual(emptySurface.status, "ok");

for (const [key, value] of Object.entries({
  rawUserTextIncluded: false,
  privateUrlsIncluded: false,
  userIdentifiersIncluded: false,
  approvalActionAvailable: false,
  syncAvailable: false,
  echoNetAvailable: false
})) {
  assert.equal(emptySurface.safety[key], value, `${key} must be ${value}`);
}

const okSurface = api.buildQualityStatusSurface({
  sourceBinding: { sourceBound: true },
  topicConsistency: { topicConsistent: true },
  staleDataGuarded: true,
  isolated: true
});
assert.equal(okSurface.status, "ok");

assert.equal(api.buildQualityStatusSurface({ sourceBinding: { sourceBound: false } }).status, "blocked");
assert.equal(api.buildQualityStatusSurface({ topicConsistency: { topicConsistent: false } }).status, "blocked");
assert.equal(api.buildQualityStatusSurface({ staleDataGuarded: false }).status, "blocked");
assert.equal(api.buildQualityStatusSurface({ isolated: false }).status, "blocked");
assert.equal(api.buildQualityStatusSurface({ sourceBinding: { sourceBound: true } }).status, "warning");
assert.notEqual(api.buildQualityStatusSurface({ sourceBinding: { sourceBound: true } }).status, "ok");

const rawValues = [
  "RAW_TEXT_SECRET_001",
  "FULL_TEXT_SECRET_002",
  "TRANSCRIPT_SECRET_003",
  "MESSAGE_TEXT_SECRET_004",
  "PROMPT_SECRET_005",
  "SOURCE_EVENT_TEXT_SECRET_006",
  "EVENT_TEXT_SECRET_007",
  "CANDIDATE_TEXT_SECRET_008",
  "PRIVATE_PAYLOAD_SECRET_009",
  "RAW_PAYLOAD_SECRET_010",
  "PRIVATE_METADATA_SECRET_011",
  "https://private.example.test/secret-url",
  "SOURCE_EXCERPT_SECRET_012",
  "SOURCE_EXCERPTS_SECRET_013",
  "RAW_INVALID_FIELDS_SECRET_014",
  "INVALID_FIELD_DETAILS_SECRET_015",
  "user-123-secret",
  "person@example.test"
];
const rawInput = {
  rawText: rawValues[0],
  fullText: rawValues[1],
  transcript: rawValues[2],
  messageText: rawValues[3],
  prompt: rawValues[4],
  sourceEvent: { text: rawValues[5], url: rawValues[11] },
  event: { text: rawValues[6] },
  candidate: { text: rawValues[7], previewLabel: "CANDIDATE_PREVIEW_SECRET_016" },
  privatePayload: rawValues[8],
  rawPayload: rawValues[9],
  privateMetadata: rawValues[10],
  source: { url: rawValues[11] },
  sourceExcerpt: rawValues[12],
  sourceExcerpts: [rawValues[13]],
  rawInvalidFields: [rawValues[14]],
  invalidFieldDetails: { detail: rawValues[15] },
  userId: rawValues[16],
  email: rawValues[17],
  quality: { sourceBound: true, topicConsistent: true, staleDataGuarded: true },
  isolated: true
};
const rawSurface = api.buildQualityStatusSurface(rawInput);
const serialized = JSON.stringify(rawSurface);
for (const secret of rawValues.concat(["CANDIDATE_PREVIEW_SECRET_016"])) {
  assert.equal(serialized.includes(secret), false, `surface must not leak ${secret}`);
  assert.equal(JSON.stringify(rawSurface.safeSummary).includes(secret), false, `summary must not leak ${secret}`);
}
assert.equal(/https?:\/\//.test(JSON.stringify(rawSurface.safeSummary)), false, "summary must not include URLs");
assert.equal(/person@example\.test/.test(JSON.stringify(rawSurface.safeSummary)), false, "summary must not include email");
assert.equal(/user-123-secret/.test(JSON.stringify(rawSurface.safeSummary)), false, "summary must not include user id");

const stripped = code.replace(/forbidden[A-Za-z]*\s*=\s*\[[\s\S]*?\];/g, "");
for (const pattern of [
  /localStorage\.setItem/,
  /localStorage\.removeItem/,
  /localStorage\.getItem/,
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /sendBeacon/,
  /supabase\./,
  /\binsert\s*\(/,
  /\bupdate\s*\(/,
  /\bupsert\s*\(/,
  /\bdelete\s*\(/,
  /executeSync/,
  /runSync/,
  /performSync/,
  /startSync/,
  /manualSync/,
  /autoSync/,
  /backgroundSync/,
  /publish/,
  /share/,
  /approveCandidate/,
  /rejectCandidate/,
  /approvalAction/
]) {
  assert.equal(pattern.test(stripped), false, `helper must not match ${pattern}`);
}
for (const pattern of [/\bphase\b/, /\bpriority\b/, /\bhealth\b/, /\bnextPr\b/, /\brepoStatus\b/, /\bbuildStage\b/, /\bprojectRoadmap\b/]) {
  assert.equal(pattern.test(stripped), false, `helper must not include project field ${pattern}`);
}
assert.equal(fs.existsSync(path.join(repoRoot, "js/ahaSyncConfirmationGate.js")), false);

console.log("aha-quality-status-surface.test.cjs passed");
