const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const script = path.resolve(__dirname, "../scripts/aha-five-article-live-comparison.cjs");
for (const badAcknowledgement of ["", "RUN_AHA_LIVE_SMOKE", "RUN_AHA_FIVE_ARTICLE"]) {
  const child = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: { ...process.env, AHA_FIVE_ARTICLES_COST_ACK: badAcknowledgement },
    timeout: 10_000
  });
  assert.notEqual(child.status, 0, "five-article live mode must require its exact consent token");
  assert.match(child.stderr, /Explicit acknowledgement RUN_AHA_FIVE_ARTICLES is required/);
  assert.doesNotMatch(child.stdout || "", /AHA_FIVE_ARTICLE_LIVE_RESULT/);
}
console.log("AHA five-article paid model budget defaults fail closed; no network call made.");
