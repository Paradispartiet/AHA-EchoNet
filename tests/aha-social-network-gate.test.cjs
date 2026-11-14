const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const code = fs.readFileSync(path.resolve(__dirname, "../js/ahaSocialNetwork.js"), "utf8");

test("AHA social client is default-off and must not inspect local private posts or send requests", () => {
  let network = 0;
  let domReads = 0;
  const win = {
    AHA_SOCIAL_STAGING_ENABLED: false,
    AHA_SOCIAL_API_ORIGIN: "https://api.example",
    fetch: () => { network++; },
    document: { getElementById() { domReads++; } }
  };
  vm.runInNewContext(code, { window: win, URL, console });
  assert.equal(win.AHASocialNetwork.isEnabled(), false);
  assert.equal(network, 0);
  assert.equal(domReads, 0);
  assert.equal(code.includes("localStorage"), false);
});

test("staging UI requires explicit opt-in and valid HTTPS API origin", () => {
  const win = { AHA_SOCIAL_STAGING_ENABLED: true, AHA_SOCIAL_API_ORIGIN: "http://localhost:3100", document: null };
  vm.runInNewContext(code, { window: win, URL, console });
  assert.equal(win.AHASocialNetwork.isEnabled(), false);
  win.AHA_SOCIAL_API_ORIGIN = "https://staging.example";
  assert.equal(win.AHASocialNetwork.isEnabled(), true);
});

test("both local module pages include one separate social mount without replacing their existing modules", () => {
  for (const [page, kind] of [["feed.html", "feed"], ["insta.html", "insta"]]) {
    const html = fs.readFileSync(path.resolve(__dirname, "..", page), "utf8");
    assert.match(html, /js\/ahaSocialNetwork\.js/);
    assert.ok(html.includes('id="aha-social-mount" data-social-kind="' + kind + '"'));
    assert.match(html, new RegExp("js/aha" + (kind === "feed" ? "Feed" : "Insta") + "\\.js"));
  }
});
