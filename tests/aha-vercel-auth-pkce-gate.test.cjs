// Read-only PKCE origin preflight. No network and no real Supabase sessions.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const configSrc = fs.readFileSync("js/ahaConfig.js", "utf8");
const authSrc = fs.readFileSync("js/ahaAuth.js", "utf8");
const GH = "https://paradispartiet.github.io";
const VERCEL = "https://aha-echo-net.vercel.app";
const PREVIEW = "https://aha-preview.aha-echonet-preview.pages.dev";
const GH_CALLBACK = GH + "/AHA-EchoNet/auth-callback.html";
const VERCEL_CALLBACK = VERCEL + "/auth-callback.html";

function isolatedAuth(origin, { allowVercel = false, redirectOverride = "" } = {}) {
  const calls = { client: 0, otp: 0, oauth: 0, requests: [] };
  const client = {
    auth: {
      async signInWithOtp(request) {
        calls.otp++;
        calls.requests.push(request);
        return { data: { ok: true }, error: null };
      },
      async signInWithOAuth(request) {
        calls.oauth++;
        calls.requests.push(request);
        return { data: { ok: true }, error: null };
      }
    }
  };
  const window = {
    location: { origin, pathname: "/", search: "", hash: "" },
    AHA_CONFIG: {},
    AHA_VERCEL_AUTH_CALLBACK_ALLOWLIST_VERIFIED: allowVercel,
    AHADb: { getClient() { calls.client++; return client; } }
  };
  if (redirectOverride) window.AHA_AUTH_REDIRECT_URL = redirectOverride;
  const document = { readyState: "loading", addEventListener() {} };
  vm.runInNewContext(configSrc, { window }, { filename: "ahaConfig.js" });
  vm.runInNewContext(authSrc, {
    window, document, console,
    URLSearchParams, setTimeout, clearTimeout,
    localStorage: {getItem(){return null;},setItem(){},removeItem(){}},
    CustomEvent: class {}
  }, { filename: "ahaAuth.js" });
  return { window, calls };
}

async function run() {
  const gh = isolatedAuth(GH);
  assert.equal(gh.window.AHAAuth.getRedirectUrl(), GH_CALLBACK);
  assert.equal(gh.window.AHA_VERCEL_AUTH_LOGIN_BLOCKED, false);
  assert.equal((await gh.window.AHAAuth.signInWithEmail("fixture@example.test")).ok, true);
  assert.equal(gh.calls.requests[0].options.emailRedirectTo, GH_CALLBACK);

  const preview = isolatedAuth(PREVIEW);
  assert.equal(preview.window.AHAAuth.getRedirectUrl(), PREVIEW + "/auth-callback.html");

  const blocked = isolatedAuth(VERCEL);
  assert.equal(blocked.window.AHA_VERCEL_AUTH_LOGIN_BLOCKED, true);
  assert.equal(blocked.window.AHAAuth.getRedirectUrl(), "");
  assert.deepEqual(
    JSON.parse(JSON.stringify(await blocked.window.AHAAuth.signInWithEmail("fixture@example.test"))),
    { ok: false, reason: "auth_callback_not_verified" }
  );
  assert.equal((await blocked.window.AHAAuth.signInWithProvider("google")).reason,
    "auth_callback_not_verified");
  assert.equal(blocked.calls.client, 0, "Vercel must not request a client or start Auth before allowlisting");
  assert.equal(blocked.calls.otp, 0);
  assert.equal(blocked.calls.oauth, 0);

  const verified = isolatedAuth(VERCEL, {allowVercel:true});
  assert.equal(verified.window.AHA_VERCEL_AUTH_LOGIN_BLOCKED, false);
  assert.equal(verified.window.AHA_APP_URL, VERCEL + "/");
  assert.equal(verified.window.AHA_AUTH_CALLBACK_URL, VERCEL_CALLBACK);
  assert.equal(verified.window.AHAAuth.getRedirectUrl(), VERCEL_CALLBACK);
  assert.equal((await verified.window.AHAAuth.signInWithEmail("fixture@example.test")).ok, true);
  assert.equal((await verified.window.AHAAuth.signInWithProvider("google")).ok, true);
  assert.equal(verified.calls.requests[0].options.emailRedirectTo, VERCEL_CALLBACK);
  assert.equal(verified.calls.requests[1].options.redirectTo, VERCEL_CALLBACK);
  assert.equal(verified.calls.otp, 1);
  assert.equal(verified.calls.oauth, 1);

  const wrongOverride = isolatedAuth(VERCEL, {
    allowVercel:true, redirectOverride:GH_CALLBACK
  });
  assert.equal(wrongOverride.window.AHAAuth.getRedirectUrl(), "");
  assert.equal((await wrongOverride.window.AHAAuth.signInWithProvider("google")).reason,
    "auth_callback_not_verified");
  assert.equal(wrongOverride.calls.client, 0);

  const notApprovedEvenWithRedirect = isolatedAuth(VERCEL, {
    redirectOverride:VERCEL_CALLBACK
  });
  assert.equal(notApprovedEvenWithRedirect.window.AHAAuth.getRedirectUrl(), "");
  assert.equal(notApprovedEvenWithRedirect.calls.client, 0);

  for (const origin of [
    "http://aha-echo-net.vercel.app",
    "https://aha-echo-net.vercel.app.evil.example",
    "https://different-preview.vercel.app"
  ]) {
    const untrusted = isolatedAuth(origin, { allowVercel: true });
    assert.notEqual(untrusted.window.AHA_AUTH_CALLBACK_URL, VERCEL_CALLBACK,
      "Only exact approved Vercel origin may use the dedicated callback");
  }
  assert.match(configSrc, /AHA_VERCEL_AUTH_CALLBACK_ALLOWLIST_VERIFIED === true/);
  assert.match(authSrc, /auth_callback_not_verified/);
  assert.doesNotMatch(configSrc, /service_role|secret_key/i);
  console.log("AHA Vercel PKCE origin gate: PASS (offline; real Supabase allowlist and login remain unverified)");
}
run().catch(error => {console.error(error); process.exitCode = 1;});
