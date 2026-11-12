"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.join(__dirname, "..");
const dashboardSource = fs.readFileSync(path.join(root, "js/ahaDashboard.js"), "utf8");
const callbackSource = fs.readFileSync(path.join(root, "js/ahaAuthCallback.js"), "utf8");
const KEY = "aha_auth_return_to_v1";
const AHA_ROOT = "https://paradispartiet.github.io/AHA-EchoNet/";
const AVISA_ROOT = "https://paradispartiet.github.io/Paradisavisa/";
const HG_PROFILE = "https://paradispartiet.github.io/History-Go/profile.html";

function boot(source) {
  const local = new Map();
  const context = {
    URL, URLSearchParams, Promise, Date, console,
    location: { origin: "https://paradispartiet.github.io", pathname: "/AHA-EchoNet/", search: "", hash: "" },
    localStorage: {
      getItem: (key) => local.get(key) || null,
      setItem: (key, val) => local.set(key, val),
      removeItem: (key) => local.delete(key)
    },
    document: { readyState: "loading", addEventListener() {} },
    setTimeout() {},
    CustomEvent: function() {}
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return { context, local };
}

const dash = boot(dashboardSource);
const callback = boot(callbackSource);
function query(search) {
  dash.context.location.search = search;
  dash.context.AHADashboard.persistAuthReturnTargetFromUrl();
  return dash.local.get(KEY) || "";
}

assert.equal(query("?auth=login&source=paradisavisa&next=%2FParadisavisa%2Fartikler%2Fkultur.html"),
  AVISA_ROOT + "artikler/kultur.html");
assert.equal(query("?auth=login&source=paradisavisa&next=https%3A%2F%2Fevil.example%2F"),
  AVISA_ROOT);
assert.equal(query("?auth=login&source=paradisavisa&next=%2F%2Fevil.example%2F"),
  AVISA_ROOT);
assert.equal(query("?auth=login&source=paradisavisa&next=%2FParadisavisa%2F..%2FHistory-Go%2F"),
  AVISA_ROOT);
assert.equal(query("?auth=login&source=historygo&next=%2FParadisavisa%2F"),
  HG_PROFILE, "History GO's return target must not change");
assert.equal(query("?auth=login&source=other"), "", "Unknown origins must clear previous return targets");
assert.equal(query("?auth=login&source=paradisavisa"), AVISA_ROOT);

callback.local.set(KEY, AVISA_ROOT + "artikler/kultur.html");
assert.equal(callback.context.AHAAuthCallbackDebug.getStoredReturnTarget(), AVISA_ROOT + "artikler/kultur.html");
callback.local.set(KEY, "https://malicious.example/path");
assert.equal(callback.context.AHAAuthCallbackDebug.getStoredReturnTarget(), "");
callback.local.set(KEY, HG_PROFILE);
assert.equal(callback.context.AHAAuthCallbackDebug.getStoredReturnTarget(), HG_PROFILE);
callback.local.set(KEY, AHA_ROOT);
assert.equal(callback.context.AHAAuthCallbackDebug.getStoredReturnTarget(), "", "Only two known return routes are permitted");
assert.match(dashboardSource, /isParadisavisaLoginReturnRequest/);
assert.match(callbackSource, /returnDestinationLabel/);
console.log("PASS: verified Aha callbacks return only to approved History GO or Paradisavisa URLs");
