const assert = require("node:assert/strict");
const fs = require("node:fs");
const { webcrypto } = require("node:crypto");
const { TextEncoder } = require("node:util");

const {
  canonicalSyncStringify,
  canonicalSyncPayloadHash
} = require("../scripts/aha-canonical-sync-hash-node.cjs");

const e2e = fs.readFileSync("scripts/aha-canonical-sync-hosted-staging-e2e.cjs", "utf8");
assert.match(e2e, /require\("\.\/aha-canonical-sync-hash-node\.cjs"\)/);
assert.doesNotMatch(e2e, /require\("\.\.\/js\/ahaCanonicalSyncHash\.js"\)/);

assert.equal(typeof canonicalSyncStringify, "function");
assert.equal(typeof canonicalSyncPayloadHash, "function");
assert.equal(canonicalSyncStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');

(async () => {
  assert.equal(
    await canonicalSyncPayloadHash(null, { crypto: webcrypto, TextEncoder }),
    "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b"
  );
  assert.equal(
    await canonicalSyncPayloadHash({ b: 2, a: 1 }, { crypto: webcrypto, TextEncoder }),
    "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777"
  );
  console.log("aha-canonical-sync-hash-node-adapter.test.cjs passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
