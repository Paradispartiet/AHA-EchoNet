// Offline AHA profile status tests: auth-only and read-only own-profile lookup.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/ahaProfileSupabaseStatus.js"), "utf8");
const html = fs.readFileSync(path.join(root, "profile.html"), "utf8");
assert.ok(html.includes('id="aha-check-supabase-profile"'));
assert.ok(html.includes('id="aha-supabase-profile-result"'));
assert.ok(html.includes('js/ahaProfileSupabaseStatus.js'));
assert.ok(!html.includes("Ingen EchoNet-identitet er aktivert"), "Local profile must not misstate auth status");

function makeCase({url = "https://wshmybqyksrwkawqleiz.supabase.co", user = {id: "test-user-1"}, authError = null, profile = {id: "test-user-1"}, profileError = null, nextUser = null, eventDuringRead = null} = {}) {
  const events = {};
  let authListener = null;
  let currentUser = user;
  let eventDispatched = false;
  const calls = {getUser: 0, select: 0, eq: 0, maybeSingle: 0, upsert: 0, insert: 0, delete: 0, table: null, column: null, value: null};
  const output = {textContent: "Ikke kontrollert", dataset: {}};
  const button = {disabled: false, addEventListener(name, handler) {events[name] = handler;}};
  const document = {readyState: "complete", getElementById(id) {
    if (id === "aha-check-supabase-profile") return button;
    if (id === "aha-supabase-profile-result") return output;
    return null;
  }};
  const client = {
    auth: {
      async getUser() {
        calls.getUser++;
        return {data: {user: calls.getUser === 2 && nextUser ? nextUser : currentUser}, error: authError};
      },
      onAuthStateChange(callback) {
        authListener = callback;
        return {data: {subscription: {unsubscribe() {}}}};
      }
    },
    from(table) {
      calls.table = table;
      return {
        select(column) {
          calls.select++; calls.column = column;
          return {
            eq(field, value) {
              calls.eq++; calls.field = field; calls.value = value;
              return {async maybeSingle() {
                calls.maybeSingle++;
                if (eventDuringRead && !eventDispatched) {
                  eventDispatched = true;
                  authListener?.(eventDuringRead, null);
                }
                return {data: profile, error: profileError};
              }};
            }
          };
        },
        upsert() {calls.upsert++; throw Error("Unexpected upsert");},
        insert() {calls.insert++; throw Error("Unexpected insert");},
        delete() {calls.delete++; throw Error("Unexpected delete");}
      };
    }
  };
  const window = {
    document,
    AHADb: {getConfig: () => ({url}), getClient: () => client}
  };
  vm.runInNewContext(source, {window}, {filename:"ahaProfileSupabaseStatus.js"});
  return {
    window, button, output, calls,
    click: async () => events.click?.(),
    emitAuth(event, newUser = currentUser) {
      currentUser = newUser;
      authListener?.(event, newUser ? {user: newUser} : null);
    }
  };
}

(async () => {
  const found = makeCase();
  assert.equal(found.calls.getUser, 0, "No automatic Auth calls on page load");
  assert.equal(found.calls.select, 0, "No automatic DB calls on page load");
  await found.click();
  assert.equal(found.output.dataset.status, "profile_found");
  assert.equal(found.calls.getUser, 2, "Recheck session after own-profile lookup");
  assert.equal(found.calls.table, "aha_profiles");
  assert.equal(found.calls.column, "id");
  assert.equal(found.calls.field, "id");
  assert.equal(found.calls.value, "test-user-1");
  assert.equal(found.calls.upsert + found.calls.insert + found.calls.delete, 0);
  assert.equal(found.button.disabled, false);

  const loggedOut = makeCase();
  await loggedOut.click();
  loggedOut.emitAuth("SIGNED_OUT", null);
  assert.equal(loggedOut.output.dataset.status, "needs_recheck",
    "Previous profile success must be cleared when user logs out");

  const changed = makeCase({nextUser: {id: "test-user-2"}});
  await changed.click();
  assert.equal(changed.output.dataset.status, "session_changed",
    "Never confirm a former account after an identity change");

  const eventWhileReading = makeCase({eventDuringRead: "SIGNED_IN"});
  await eventWhileReading.click();
  assert.equal(eventWhileReading.output.dataset.status, "session_changed",
    "Reject a profile result when Auth changes while lookup is active");

  const missing = makeCase({profile: null});
  await missing.click();
  assert.equal(missing.output.dataset.status, "profile_missing");

  const denied = makeCase({profileError: {code: "42501"}});
  await denied.click();
  assert.equal(denied.output.dataset.status, "profile_error");

  const signedOut = makeCase({user: null});
  await signedOut.click();
  assert.equal(signedOut.output.dataset.status, "signed_out");
  assert.equal(signedOut.calls.select, 0);

  const wrong = makeCase({url: "https://voglczxxtbwcxjrbffbt.supabase.co"});
  await wrong.click();
  assert.equal(wrong.output.dataset.status, "wrong_project");
  assert.equal(wrong.calls.getUser, 0);
  assert.equal(wrong.calls.select, 0);

  const forged = makeCase({profile: {id: "some-other-user"}});
  await forged.click();
  assert.equal(forged.output.dataset.status, "profile_missing");
  assert.ok(!forged.output.textContent.includes("some-other-user"));
  assert.ok(!found.output.textContent.includes("test-user-1"));
  assert.ok(!source.includes("localStorage"), "No test result must persist in browser storage");
  console.log("Read-only AHA Supabase profile status tests: PASS");
})().catch(error => {console.error(error); process.exitCode = 1;});
