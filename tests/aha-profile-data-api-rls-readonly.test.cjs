// Offline AHA two-account preparation: HEAD/count-only Data API probe.
// No Supabase network, secrets, user identifiers, localStorage or writes.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("js/ahaProfileDataApiRlsCheck.js", "utf8");
const html = fs.readFileSync("profile.html", "utf8");
assert.ok(html.includes('id="aha-check-data-api-rls"'));
assert.ok(html.includes('id="aha-data-api-rls-result"'));
assert.ok(html.includes('js/ahaProfileDataApiRlsCheck.js'));

const tables = ["aha_profiles", "aha_source_events", "aha_imports",
  "aha_insight_embeddings", "aha_feed_posts", "aha_insta_posts"];

function fakeCase({ url = "https://wshmybqyksrwkawqleiz.supabase.co",
  user = { id: "fake-profile-A" }, authError = null, ownCount = 1,
  foreignTable = null, unownedTable = null, failingTable = null } = {}) {
  const calls = [];
  const actions = {};
  const result = { textContent: "", dataset: {} };
  const button = { disabled: false, addEventListener(type, callback) { actions[type] = callback; } };
  const doc = { readyState: "complete", getElementById(id) {
    if (id === "aha-check-data-api-rls") return button;
    if (id === "aha-data-api-rls-result") return result;
    return null;
  }};
  const client = {
    auth: { async getUser() { calls.push({ type: "getUser" }); return { data: {user}, error: authError }; } },
    from(table) {
      assert.ok(tables.includes(table));
      return {
        select(columns, opts) {
          assert.equal(columns, "id", "Do not fetch content columns");
          assert.equal(opts?.head, true, "HEAD response only, no rows");
          assert.equal(opts?.count, "exact");
          const builder = {
            eq(field, value) {
              calls.push({ type: "read", table, mode: "own", field, value });
              assert.equal(table, "aha_profiles");
              assert.equal(field, "id");
              return Promise.resolve({ count: ownCount, error: table === failingTable ? {code:"42501"} : null });
            },
            neq(field, value) {
              calls.push({ type: "read", table, mode: "other", field, value });
              assert.equal(field, table === "aha_profiles" ? "id" : "profile_id");
              return Promise.resolve({ count: table === foreignTable ? 1 : 0, error: table === failingTable ? {code:"42501"} : null });
            },
            is(field, value) {
              calls.push({ type: "read", table, mode: "unowned", field, value });
              assert.equal(field, "profile_id");
              assert.equal(value, null);
              return Promise.resolve({ count: table === unownedTable ? 1 : 0, error: table === failingTable ? {code:"42501"} : null });
            }
          };
          return builder;
        },
        insert() { throw Error("Write was forbidden"); },
        upsert() { throw Error("Write was forbidden"); },
        update() { throw Error("Write was forbidden"); },
        delete() { throw Error("Write was forbidden"); },
        rpc() { throw Error("RPC was forbidden"); }
      };
    }
  };
  const window = { document: doc, AHADb: { getConfig: () => ({url}), getClient: () => client } };
  vm.runInNewContext(source, { window }, {filename:"ahaProfileDataApiRlsCheck.js"});
  return { api: window.AHAProfileDataApiRlsCheck, calls, result, button, click: () => actions.click() };
}

(async () => {
  const good = fakeCase();
  assert.equal(good.calls.length, 0, "No automatic fetch at load");
  await good.click();
  assert.equal(good.result.dataset.status, "no_foreign_rows");
  assert.equal(good.calls.filter(x => x.type === "read").length, 12,
    "one own positive, six foreign and five null-owner probes");
  assert.equal(good.button.disabled, false);
  assert.ok(!good.result.textContent.includes("fake-profile-A"), "Never display user IDs");

  const breach = fakeCase({foreignTable:"aha_source_events"});
  await breach.click();
  assert.equal(breach.result.dataset.status, "possible_exposure");
  assert.equal(breach.calls.some(c => c.table === "aha_feed_posts"), false, "Stop at first exposure");

  const unowned = fakeCase({unownedTable:"aha_feed_posts"});
  await unowned.click();
  assert.equal(unowned.result.dataset.status, "possible_exposure", "visible unowned rows must fail");

  const permission = fakeCase({failingTable:"aha_imports"});
  await permission.click();
  assert.equal(permission.result.dataset.status, "read_error");

  const signedOut = fakeCase({user:null});
  await signedOut.click();
  assert.equal(signedOut.result.dataset.status, "signed_out");
  assert.equal(signedOut.calls.filter(c=>c.type==="read").length, 0);

  const foreignProject = fakeCase({url:"https://voglczxxtbwcxjrbffbt.supabase.co"});
  await foreignProject.click();
  assert.equal(foreignProject.result.dataset.status, "wrong_project");
  assert.equal(foreignProject.calls.length, 0);

  const missing = fakeCase({ownCount:0});
  await missing.click();
  assert.equal(missing.result.dataset.status, "profile_missing");

  const badAuth = fakeCase({authError:{message:"unauthorized"}});
  await badAuth.click();
  assert.equal(badAuth.result.dataset.status, "auth_error");

  assert.ok(!source.includes("localStorage"), "Never cache data or results");
  assert.ok(!source.includes("console."), "Never log IDs");
  console.log("AHA browser Data API RLS read-only probe tests: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
