// Offline-only regression guard for Supabase Auth PKCE redirect routing.
// No network requests, account changes, or authenticated data access.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "ahaConfig.js"), "utf8");
const githubApp = "https://paradispartiet.github.io/AHA-EchoNet/";
const githubCallback = "https://paradispartiet.github.io/AHA-EchoNet/auth-callback.html";
const previewOrigin = "https://aha-preview.aha-echonet-preview.pages.dev";
const previewCallback = previewOrigin + "/auth-callback.html";

function config(origin, overrides = {}) {
  const window = {location: {origin}, AHA_CONFIG: {}, ...overrides};
  vm.runInNewContext(source, {window}, {filename: "ahaConfig.js"});
  return window;
}
const gh = config("https://paradispartiet.github.io");
assert.equal(gh.AHA_APP_URL, githubApp);
assert.equal(gh.AHA_AUTH_CALLBACK_URL, githubCallback);
assert.equal(gh.AHA_AUTH_REDIRECT_URL, githubCallback);

const cf = config(previewOrigin);
assert.equal(cf.AHA_APP_URL, previewOrigin + "/");
assert.equal(cf.AHA_AUTH_CALLBACK_URL, previewCallback);
assert.equal(cf.AHA_AUTH_REDIRECT_URL, previewCallback);

for (const origin of [
  "http://aha-preview.aha-echonet-preview.pages.dev",
  "https://aha-preview.aha-echonet-preview.pages.dev.evil.example",
  "https://aha-echonet-preview.pages.dev",
  "https://aha-preview-other.aha-echonet-preview.pages.dev",
  "https://example.invalid"
]) {
  const c = config(origin);
  assert.equal(c.AHA_AUTH_CALLBACK_URL, githubCallback, "Unexpected preview callback for " + origin);
}
const alreadyConfigured = config(previewOrigin, {
  AHA_APP_URL: "https://example.test/",
  AHA_AUTH_CALLBACK_URL: "https://example.test/callback",
  AHA_AUTH_REDIRECT_URL: "https://example.test/redirect"
});
assert.equal(alreadyConfigured.AHA_APP_URL, "https://example.test/");
assert.equal(alreadyConfigured.AHA_AUTH_CALLBACK_URL, "https://example.test/callback");
assert.equal(alreadyConfigured.AHA_AUTH_REDIRECT_URL, "https://example.test/redirect");

// Legacy ChamberSync must not make network calls or overwrite local data
// when AHA Auth is tested on the Cloudflare preview.
const chamberSource = fs.readFileSync(path.join(__dirname, "..", "js", "ahaChamberSync.js"), "utf8");
function chamberContext(origin) {
  const events = new Map();
  let remoteCalls = 0;
  const window = {
    location: {origin},
    AHARepository: {
      saveChamber: async () => { remoteCalls++; return {ok: true}; },
      loadChamber: async () => { remoteCalls++; return {ok: true, data: {chamber: {insights: []}}}; }
    },
    addEventListener(name, listener) { events.set(name, listener); },
    dispatchEvent() {}
  };
  const localStorage = {getItem: () => '{"insights":[{"id":"demo"}]}', setItem() {throw Error("Unexpected local overwrite");}};
  vm.runInNewContext(chamberSource, {window, localStorage, setTimeout, clearTimeout, console, Date, CustomEvent: class {}}, {filename:"ahaChamberSync.js"});
  return {window, events, getRemoteCalls: () => remoteCalls};
}
(async () => {
  const preview = chamberContext(previewOrigin);
  assert.equal(preview.window.AHAChamberSync.isReady(), false);
  assert.equal((await preview.window.AHAChamberSync.pull()).ok, false);
  assert.equal((await preview.window.AHAChamberSync.push()).ok, false);
  preview.events.get("aha:auth-ready")({detail: {user: {id: "synthetic"}}});
  preview.events.get("aha:chamber-saved")();
  await Promise.resolve();
  assert.equal(preview.getRemoteCalls(), 0, "Preview must never read/write chamber remotely");
  const ghChamber = chamberContext("https://paradispartiet.github.io");
  assert.equal(ghChamber.window.AHAChamberSync.isReady(), true, "GitHub Pages legacy behavior unchanged");
  console.log("AHA Auth Cloudflare preview origin preflight: PASS (offline; Supabase redirect allowlist must be checked separately).");
})().catch(err => {console.error(err); process.exitCode = 1;});
