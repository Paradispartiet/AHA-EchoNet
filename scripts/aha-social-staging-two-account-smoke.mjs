// Manual nonproduction smoke only. Never called by CI or on server boot.
// Secrets are supplied from protected environment variables and never logged.
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function validateStagingSmokeConfig(env) {
  if (env.AHA_SOCIAL_SMOKE_ACK !== "RUN_SOCIAL_STAGING_2_ACCOUNTS") {
    throw new Error("Explicit staging smoke acknowledgement required");
  }
  const value = String(env.AHA_SOCIAL_STAGING_API_ORIGIN || "");
  let url;
  try { url = new URL(value); }
  catch { throw new Error("Valid staging API origin required"); }
  if (url.protocol !== "https:" || url.origin !== value || url.username || url.password || url.pathname !== "/") {
    throw new Error("Only an exact staging HTTPS origin is allowed");
  }
  if (!/(^|[.-])(staging|stage|preview|test|dev)([.-]|$)/i.test(url.hostname)) {
    throw new Error("Staging hostname must explicitly identify a nonproduction environment");
  }
  if (String(env.AHA_SOCIAL_STAGING_EXPECTED_HOST || "") !== url.host) {
    throw new Error("Staging hostname must match independently confirmed expected host");
  }
  const a = String(env.AHA_SOCIAL_STAGING_TOKEN_A || "");
  const b = String(env.AHA_SOCIAL_STAGING_TOKEN_B || "");
  if (a.length < 20 || b.length < 20 || a === b) {
    throw new Error("Two different staging account JWTs are required");
  }
  return Object.freeze({ origin: url.origin, a, b });
}

export async function runStagingSmoke(config, send = fetch) {
  let postId = null;
  let deleted = false;
  async function call(token, route, method = "GET", payload) {
    const response = await send(config.origin + route, {
      method,
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000)
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, data: body?.data };
  }
  const feed = token => call(token, "/v1/social/posts?kind=feed&limit=40");
  try {
    const ready = await feed(config.a);
    if (ready.status !== 200 || !Array.isArray(ready.data)) throw new Error("Staging social API is not ready");
    const text = "AHA two-account staging test " + randomUUID();
    const created = await call(config.a, "/v1/social/posts", "POST", {
      kind: "feed", text, requestKey: "smoke-" + randomUUID(), publish: true
    });
    if (created.status !== 201 || !/^[0-9a-f-]{36}$/i.test(String(created.data?.id || ""))) {
      throw new Error("Account A publication failed");
    }
    postId = created.data.id;
    const seen = await feed(config.b);
    if (seen.status !== 200 || !Array.isArray(seen.data) ||
        !seen.data.some(p => p.id === postId && p.text === text && p.ownPost === false)) {
      throw new Error("Account B did not see account A publication");
    }
    const denied = await call(config.b, "/v1/social/posts/" + postId, "DELETE");
    if (![403, 404].includes(denied.status)) throw new Error("Account B could delete another account's post");
    const removed = await call(config.a, "/v1/social/posts/" + postId, "DELETE");
    if (removed.status !== 200 || removed.data?.deleted !== true) throw new Error("Owner deletion failed");
    deleted = true;
    const after = await feed(config.b);
    if (after.status !== 200 || !Array.isArray(after.data) ||
        after.data.some(p => p.id === postId)) throw new Error("Deleted post remains public");
    return true;
  } finally {
    // Best-effort cleanup if any check after publication failed.
    if (postId && !deleted) {
      try { await call(config.a, "/v1/social/posts/" + postId, "DELETE"); }
      catch { /* No secret-bearing error output */ }
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await runStagingSmoke(validateStagingSmokeConfig(process.env));
    process.stdout.write("AHA two-account staging smoke PASS\n");
  } catch (error) {
    process.stderr.write("AHA two-account staging smoke FAIL: " +
      (error instanceof Error ? error.message : "unknown error") + "\n");
    process.exitCode = 1;
  }
}
