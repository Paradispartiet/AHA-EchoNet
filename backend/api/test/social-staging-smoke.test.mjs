import assert from "node:assert/strict";
import test from "node:test";
import { validateStagingSmokeConfig, runStagingSmoke } from "../../../scripts/aha-social-staging-two-account-smoke.mjs";

const base = {
  AHA_SOCIAL_SMOKE_ACK: "RUN_SOCIAL_STAGING_2_ACCOUNTS",
  AHA_SOCIAL_STAGING_API_ORIGIN: "https://api.staging.example",
  AHA_SOCIAL_STAGING_EXPECTED_HOST: "api.staging.example",
  AHA_SOCIAL_STAGING_TOKEN_A: "test-account-a-token-long-enough",
  AHA_SOCIAL_STAGING_TOKEN_B: "test-account-b-token-long-enough"
};

test("manual staging smoke rejects missing consent, production origins and duplicate users", () => {
  assert.equal(validateStagingSmokeConfig(base).origin, "https://api.staging.example");
  for (const override of [
    { AHA_SOCIAL_SMOKE_ACK: "" },
    { AHA_SOCIAL_STAGING_API_ORIGIN: "https://api.production.example" },
    { AHA_SOCIAL_STAGING_API_ORIGIN: "https://api.example" },
    { AHA_SOCIAL_STAGING_API_ORIGIN: "http://api.staging.example" },
    { AHA_SOCIAL_STAGING_EXPECTED_HOST: "different.staging.example" },
    { AHA_SOCIAL_STAGING_TOKEN_B: base.AHA_SOCIAL_STAGING_TOKEN_A }
  ]) {
    assert.throws(() => validateStagingSmokeConfig({ ...base, ...override }));
  }
});

test("manual staging smoke publishes once, checks isolation, and cleans up", async () => {
  const config = validateStagingSmokeConfig(base);
  let row = null;
  const actions = [];
  const id = "55555555-5555-4555-8555-555555555555";
  const fake = async (url, options) => {
    assert.ok(url.startsWith(config.origin + "/v1/social/"));
    assert.equal(options.redirect, "error");
    const owner = options.headers.Authorization.slice(7);
    const pathname = new URL(url).pathname;
    actions.push([owner, options.method]);
    let status = 200, data;
    if (pathname === "/v1/social/posts" && options.method === "GET") {
      data = row ? [{ id: row.id, text: row.text, ownPost: owner === config.a }] : [];
    } else if (pathname === "/v1/social/posts" && options.method === "POST") {
      const obj = JSON.parse(options.body);
      assert.equal(obj.publish, true);
      assert.equal(obj.kind, "feed");
      assert.equal(owner, config.a);
      row = { id, text: obj.text };
      status = 201; data = { id };
    } else if (pathname === "/v1/social/posts/" + id && options.method === "DELETE") {
      if (owner === config.b) { status = 404; data = {}; }
      else { row = null; data = { deleted: true }; }
    } else throw new Error("Unexpected staging API call");
    return { status, async json() { return { data }; } };
  };
  assert.equal(await runStagingSmoke(config, fake), true);
  assert.equal(row, null);
  assert.ok(actions.some(([token, method]) => token === config.b && method === "DELETE"));
  assert.ok(actions.some(([token, method]) => token === config.a && method === "DELETE"));
});

test("manual staging smoke tries owner cleanup after read failure", async () => {
  const config = validateStagingSmokeConfig(base);
  let cleanup = 0;
  const fake = async (_url, options) => {
    if (options.method === "POST") return {
      status: 201, async json() { return { data: { id: "55555555-5555-4555-8555-555555555555" } }; }
    };
    if (options.method === "DELETE") {
      cleanup++;
      return { status: 200, async json() { return { data: { deleted: true } }; } };
    }
    return { status: 200, async json() { return { data: [] }; } };
  };
  await assert.rejects(runStagingSmoke(config, fake), /did not see/);
  assert.equal(cleanup, 1);
});
