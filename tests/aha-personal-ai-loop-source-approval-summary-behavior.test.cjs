const assert = require("assert");
const fs = require("fs");

require("../js/ahaPersonalAiLoopAudit.js");

const api = globalThis.AHAPersonalAiLoopAudit;
const buildSummary = api.buildPersonalAiLoopSourceApprovalSummary;
const source = fs.readFileSync("js/ahaPersonalAiLoopAudit.js", "utf8");
const helperSource = source.slice(source.indexOf("function buildPersonalAiLoopSrcApprovalSummary"), source.indexOf("function buildRecommendations"));

assert.equal(typeof buildSummary, "function", "summary helper must be exported");

const missing = buildSummary(null);
assert.equal(missing.state, "unknown");
assert.equal(missing.manualReviewRequired, true);
assert.equal(missing.localOnly, true);
assert.equal(missing.explicitActionOnly, true);
assert.equal(missing.compactOnly, true);
assert.equal(missing.redacted, true);
assert.equal(missing.approvedCount, 0);
assert.match(missing.operatorNextStep, /Manual operator review/i);

for (const state of ["suggested", "review_needed", "approved", "rejected", "blocked", "unknown"]) {
  const summary = buildSummary({ state, label: `${state} source`, risk: "low" });
  assert.equal(summary.state, state, `must preserve/handle ${state}`);
  assert.equal(summary.localOnly, true);
  assert.equal(summary.explicitActionOnly, true);
  assert.equal(summary.compactOnly, true);
  assert.equal(summary.redacted, true);
}

const suggested = buildSummary({ sources: [{ state: "suggested", title: "Candidate source" }] });
assert.equal(suggested.state, "suggested");
assert.equal(suggested.approvedCount, 0, "suggested must not count as approved");
assert.equal(suggested.manualReviewRequired, true);

const blocked = buildSummary({ sources: [{ state: "blocked", title: "Blocked", blocker: "Missing consent" }] });
assert.equal(blocked.state, "blocked");
assert.equal(blocked.manualReviewRequired, true);
assert.deepEqual(blocked.topBlockers, ["Missing consent"]);

const reviewNeeded = buildSummary({ sources: [{ state: "review_needed", title: "Needs review" }] });
assert.equal(reviewNeeded.state, "review_needed");
assert.equal(reviewNeeded.manualReviewRequired, true);

const approved = buildSummary({ sources: [{ state: "approved", title: "Explicit safe label" }] });
assert.equal(approved.state, "approved");
assert.equal(approved.approvedCount, 1);
assert.equal(approved.manualReviewRequired, false);

const sensitive = buildSummary({
  state: "review_needed",
  label: "owner@example.com api_key=abc123456789",
  url: "https://private.example.test/raw/path",
  content: "private body must not appear"
});
const serialized = JSON.stringify(sensitive);
assert.equal(serialized.includes("owner@example.com"), false);
assert.equal(serialized.includes("api_key=abc123456789"), false);
assert.equal(serialized.includes("private.example.test"), false);
assert.equal(serialized.includes("private body must not appear"), false);
assert.equal(serialized.includes("[redacted-email]"), true);

const input = Object.freeze({ sources: Object.freeze([Object.freeze({ state: "approved", title: "Immutable" })]) });
assert.doesNotThrow(() => buildSummary(input));
assert.deepEqual(input, { sources: [{ state: "approved", title: "Immutable" }] });

for (const pattern of [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /sendBeacon/,
  /supabase/i,
  /\.(?:insert|update|upsert|delete)\s*\(/,
  /localStorage\.setItem/,
  /runAudit\s*\(/,
  /AHASyncHub|manualSync|autoSync|auto-sync/,
  /dispatchEvent[\s\S]{0,120}(?:publish|share|source)/i,
  /raw source payload/i
]) {
  assert.equal(pattern.test(helperSource), false, `forbidden pattern must stay absent from summary helper: ${pattern}`);
}

assert.equal(fs.existsSync("sync.html"), false, "sync.html must still not exist");

console.log("aha-personal-ai-loop-source-approval-summary-behavior.test.cjs passed");
