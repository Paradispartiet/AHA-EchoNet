const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "js/ahaSocialModeration.js"), "utf8");
const html = fs.readFileSync(path.join(root, "social-moderation.html"), "utf8");

test("staging moderation page is a separate opt-in tool with verified AHA session", () => {
  assert.match(html, /js\/ahaAuth\.js/);
  assert.match(html, /js\/ahaSocialModeration\.js/);
  assert.ok(script.includes("session.access_token"));
  assert.ok(script.includes("moderat"));
  assert.equal(script.includes("localStorage"), false);
  assert.equal(script.includes("innerHTML"), false);
});

test("no social moderation request or UI appears without explicit staging activation", () => {
  let calls = 0, DOM = 0;
  const win = {
    AHA_SOCIAL_STAGING_ENABLED: false,
    AHA_SOCIAL_API_ORIGIN: "https://staging.example",
    fetch() { calls++; },
    document: {
      readyState: "loading",
      addEventListener() { DOM++; }
    }
  };
  vm.runInNewContext(script, { window: win, URL, console });
  assert.equal(win.AHASocialModeration.isEnabled(), false);
  assert.equal(calls, 0);
  assert.equal(DOM, 1); // Listener may register, but never sends requests.
});

test("staging moderator refuses http and unconfigured API origin", () => {
  const win = { AHA_SOCIAL_STAGING_ENABLED: true, AHA_SOCIAL_API_ORIGIN: "http://localhost:3100", document: null };
  vm.runInNewContext(script, { window: win, URL, console });
  assert.equal(win.AHASocialModeration.isEnabled(), false);
  win.AHA_SOCIAL_API_ORIGIN = "https://staging.example";
  assert.equal(win.AHASocialModeration.isEnabled(), true);
});
