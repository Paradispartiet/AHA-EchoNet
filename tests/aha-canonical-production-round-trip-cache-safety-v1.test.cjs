const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const pagePath = path.join(root, "canonical-sync-production-roundtrip.html");
const page = fs.readFileSync(pagePath, "utf8");

assert.match(page, /http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate"/);
assert.match(page, /Verifier build:<\/strong> <code>hash-domains-v2<\/code>/);
assert.match(page, /ahaCanonicalProductionRoundTripVerifier\.js\?v=hash-domains-v2/);
assert.doesNotMatch(page, /<script src="js\/ahaCanonicalProductionRoundTripVerifier\.js"><\/script>/);

console.log("aha-canonical-production-round-trip-cache-safety-v1.test.cjs passed");
