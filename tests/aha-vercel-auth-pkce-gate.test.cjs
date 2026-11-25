// Fail-closed PKCE origin preflight. Synthetic clients only; no email/network.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const configSrc = fs.readFileSync("js/ahaConfig.js", "utf8");
const authSrc = fs.readFileSync("js/ahaAuth.js", "utf8");
const GH = "https://paradispartiet.github.io";
const NEW_GH = "https://aha-echonet.github.io";
const NEW_GH_CALLBACK = NEW_GH + "/AHA-EchoNet/auth-callback.html";
const PREVIEW = "https://aha-preview.aha-echonet-preview.pages.dev";
const VERCEL = "https://aha-echo-net.vercel.app";
const GH_CALLBACK = GH + "/AHA-EchoNet/auth-callback.html";
const PREVIEW_CALLBACK = PREVIEW + "/auth-callback.html";
const VERCEL_CALLBACK = VERCEL + "/auth-callback.html";

function fixture(origin, { oldVercelOptIn = false, redirectOverride = "" } = {}) {
  const calls = { client: 0, otp: 0, oauth: 0, requests: [] };
  const client = { auth: {
    async signInWithOtp(request) {
      calls.otp++; calls.requests.push(request);
      return { data: { ok: true }, error: null };
    },
    async signInWithOAuth(request) {
      calls.oauth++; calls.requests.push(request);
      return { data: { ok: true }, error: null };
    }
  }};
  const window = {
    location: { origin, pathname: "/", search: "", hash: "" },
    AHA_CONFIG: {},
    AHA_VERCEL_AUTH_CALLBACK_ALLOWLIST_VERIFIED: oldVercelOptIn,
    AHADb: { getClient() { calls.client++; return client; } }
  };
  if (redirectOverride) window.AHA_AUTH_REDIRECT_URL = redirectOverride;
  const document = { readyState: "loading", addEventListener() {} };
  vm.runInNewContext(configSrc, { window }, { filename: "ahaConfig.js" });
  vm.runInNewContext(authSrc, {
    window, document, console,
    URLSearchParams, setTimeout, clearTimeout,
    localStorage: { getItem(){return null;}, setItem(){}, removeItem(){} },
    CustomEvent: class {}
  }, { filename: "ahaAuth.js" });
  return { window, calls };
}

async function run() {
  for (const [origin, callback] of [[GH, GH_CALLBACK], [NEW_GH, NEW_GH_CALLBACK], [PREVIEW, PREVIEW_CALLBACK], [VERCEL, VERCEL_CALLBACK]]) {
    const good = fixture(origin);
    assert.equal(good.window.AHA_AUTH_ORIGIN_BLOCKED, false);
    assert.equal(good.window.AHAAuth.getRedirectUrl(), callback);
    assert.equal((await good.window.AHAAuth.signInWithEmail("fixture@example.test")).ok, true);
    assert.equal((await good.window.AHAAuth.signInWithProvider("google")).ok, true);
    assert.equal(good.calls.otp, 1);
    assert.equal(good.calls.oauth, 1);
    assert.equal(good.calls.requests[0].options.emailRedirectTo, callback);
    assert.equal(good.calls.requests[1].options.redirectTo, callback);
  }

  const transferred = fixture(NEW_GH);
  assert.equal(transferred.window.AHA_APP_URL, NEW_GH + "/AHA-EchoNet/");
  assert.equal(transferred.window.AHA_CONFIG.musicProviders.spotify.redirectUri, NEW_GH + "/AHA-EchoNet/music.html");
  const crossOwner = fixture(NEW_GH, { redirectOverride: GH_CALLBACK });
  assert.equal((await crossOwner.window.AHAAuth.signInWithProvider("google")).reason, "auth_callback_not_verified");
  assert.equal(crossOwner.calls.client, 0);

  // Even on an approved origin, an inconsistent or remote redirect must fail.
  const wrongGH = fixture(GH, { redirectOverride: PREVIEW_CALLBACK });
  assert.equal(wrongGH.window.AHAAuth.getRedirectUrl(), "");
  assert.equal((await wrongGH.window.AHAAuth.signInWithEmail("fixture@example.test")).reason,
    "auth_callback_not_verified");
  assert.equal(wrongGH.calls.client, 0);

  const wrongVercel = fixture(VERCEL, { redirectOverride: GH_CALLBACK });
  assert.equal(wrongVercel.window.AHAAuth.getRedirectUrl(), "");
  assert.equal((await wrongVercel.window.AHAAuth.signInWithProvider("google")).reason,
    "auth_callback_not_verified");
  assert.equal(wrongVercel.calls.client, 0);

  // The formerly used flag cannot be used to authorize unverified origins.
  const approved = fixture(VERCEL, { oldVercelOptIn: false });
  assert.equal(approved.window.AHA_APP_URL, VERCEL + "/");
  assert.equal(approved.window.AHA_VERCEL_AUTH_LOGIN_BLOCKED, false);
  assert.equal(approved.window.AHAAuth.getRedirectUrl(), VERCEL_CALLBACK);

  // Only the exact production AHA Vercel origin is admitted; preview,
  // legacy and lookalike hosts remain blocked even with the old opt-in flag.
  const forbidden = [
    "https://aha-echo-net-preview.vercel.app",
    "https://aha-echo-net-git-main-mats-grans-projects.vercel.app",
    "https://aha-echonet.vercel.app",
    "https://aha-echonet-isolert.vercel.app",
    "https://different-preview.vercel.app",
    "http://aha-echonet.vercel.app",
    "https://aha-echonet.vercel.app.evil.example",
    "https://new-aha.example",
    "http://aha-echonet.github.io",
    "https://aha-echonet.github.io.evil.example",
    "https://paradispartiet.github.io.evil.example",
    "http://localhost:3000"
  ];
  for (const origin of forbidden) {
    for (const oldVercelOptIn of [false, true]) {
      const blocked = fixture(origin, { oldVercelOptIn, redirectOverride: GH_CALLBACK });
      assert.equal(blocked.window.AHA_AUTH_ORIGIN_BLOCKED, true, origin);
      assert.equal(blocked.window.AHAAuth.getRedirectUrl(), "", origin);
      assert.equal(blocked.window.AHA_AUTH_CALLBACK_URL, "", origin);
      assert.equal(blocked.window.AHA_AUTH_REDIRECT_URL, "", origin);
      assert.equal(blocked.window.AHA_APP_URL, origin + "/", "navigation must remain same-origin");
      const email = await blocked.window.AHAAuth.signInWithEmail("fixture@example.test");
      const google = await blocked.window.AHAAuth.signInWithProvider("google");
      assert.equal(email.reason, "auth_callback_not_verified");
      assert.equal(google.reason, "auth_callback_not_verified");
      assert.equal(blocked.calls.client, 0, "unverified origin cannot fetch auth client");
      assert.equal(blocked.calls.otp, 0, "no email may be sent");
      assert.equal(blocked.calls.oauth, 0, "no external login redirects");
    }
  }
  assert.match(authSrc, /auth_callback_not_verified/);
  assert.match(configSrc, /AHA_AUTH_ORIGIN_BLOCKED/);
  assert.match(configSrc, /const vercelOrigin\s*= "https:\/\/aha-echo-net\.vercel\.app"/);
  assert.doesNotMatch(configSrc, /AHA_VERCEL_AUTH_CALLBACK_ALLOWLIST_VERIFIED === true/);
  assert.doesNotMatch(configSrc, /service_role|secret_key/i);
  console.log("AHA PKCE exact-origin gate: GitHub Pages, Cloudflare preview and verified production Vercel admitted; all other Vercel origins blocked PASS");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
