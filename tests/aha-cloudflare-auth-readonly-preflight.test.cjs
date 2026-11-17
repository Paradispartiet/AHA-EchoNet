// Offline regression for Cloudflare-only read-only Auth behavior.
// Does not contact Supabase or run on genuine sessions/data.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const auth = fs.readFileSync(path.join(root, "js/ahaAuth.js"), "utf8");
const callback = fs.readFileSync(path.join(root, "js/ahaAuthCallback.js"), "utf8");
const builder = fs.readFileSync(path.join(root, "scripts/build-cloudflare-preview.mjs"), "utf8");
const guard = fs.readFileSync(path.join(root, "scripts/check-cloudflare-preview.mjs"), "utf8");

const profileReadAnchor = "    const existing = await loadProfile(user);";
const profileReadMarker = "    if (true) return existing; // AHA_CLOUDFLARE_PREVIEW_AUTH_PROFILE_READ_ONLY";
const profileNameAnchor = "  async function saveProfileName(displayName) {";
const profileNameMarker = '    return { ok: false, reason: "preview_read_only" }; // AHA_CLOUDFLARE_PREVIEW_NO_PROFILE_NAME_WRITE';
const callbackAnchor = '    if (!session?.user?.id) return { ok: false, reason: "missing_user" };';
const callbackMarker = `    if (true) {
      // AHA_CLOUDFLARE_PREVIEW_CALLBACK_READ_ONLY: no fallback profile upsert.
      const readProfile = global.AHAAuth?.loadProfile;
      return typeof readProfile === "function"
        ? await readProfile(session.user)
        : { ok: false, reason: "preview_read_only" };
    }`;

const occurrences = (s, marker) => s.split(marker).length - 1;
assert.equal(occurrences(auth, profileReadAnchor), 1);
assert.equal(occurrences(auth, profileNameAnchor), 1);
assert.equal(occurrences(callback, callbackAnchor), 1);
assert.equal(occurrences(builder, "AHA_CLOUDFLARE_PREVIEW_AUTH_PROFILE_READ_ONLY"), 1);
assert.equal(occurrences(builder, "AHA_CLOUDFLARE_PREVIEW_NO_PROFILE_NAME_WRITE"), 1);
assert.equal(occurrences(builder, "AHA_CLOUDFLARE_PREVIEW_CALLBACK_READ_ONLY"), 1);
for (const marker of [
  "AHA_CLOUDFLARE_PREVIEW_AUTH_PROFILE_READ_ONLY",
  "AHA_CLOUDFLARE_PREVIEW_NO_PROFILE_NAME_WRITE",
  "AHA_CLOUDFLARE_PREVIEW_CALLBACK_READ_ONLY"
]) {
  assert.ok(guard.includes(marker), "Build verifier must enforce " + marker);
}
assert.ok(!auth.includes(profileReadMarker), "Original GitHub Pages Auth source must stay unmodified");
assert.ok(!callback.includes("AHA_CLOUDFLARE_PREVIEW_CALLBACK_READ_ONLY"), "Original callback source must remain unmodified");
const previewAuth = auth
  .replace(profileReadAnchor, profileReadAnchor + "\n" + profileReadMarker)
  .replace(profileNameAnchor, profileNameAnchor + "\n" + profileNameMarker);
const previewCallback = callback.replace(callbackAnchor, callbackAnchor + "\n" + callbackMarker);

function fakeContext(source) {
  const calls = {select:0, upsert:0, read:0, events:0, remoteProfileNames:0};
  const session = {user:{id:"fixture-A",email:"fixture@example.test"}};
  const profile = {id:"fixture-A",display_name:"Existing user"};
  const client = {
    auth: {async getSession() {return {data:{session},error:null};}},
    from(name) {
      assert.equal(name, "aha_profiles");
      return {
        select() {
          calls.select++;
          return {
            eq(field, value) {
              assert.equal(field,"id");
              assert.equal(value, session.user.id);
              return {async maybeSingle(){calls.read++;return {data:profile,error:null};}};
            }
          };
        },
        upsert() {calls.upsert++;throw Error("Unexpected upsert during read-only preview auth");}
      };
    }
  };
  const listeners = {};
  const doc = {
    readyState:"loading",
    addEventListener(name, fn) {listeners[name]=fn;},
    getElementById() {return null;}
  };
  const storage = {
    getItem() {return null;},
    setItem(){},
    removeItem(){}
  };
  const window = {
    document:doc,
    localStorage:storage,
    location:{origin:"https://aha-preview.aha-echonet-preview.pages.dev",pathname:"/auth-callback.html",search:"",hash:"",href:"https://aha-preview.aha-echonet-preview.pages.dev/auth-callback.html",replace(){}},
    history:{replaceState(){}},
    AHADb:{getClient:()=>client},
    dispatchEvent(){calls.events++;}
  };
  const context = {
    window,document:doc,localStorage:storage,console,
    setTimeout:()=>0,clearTimeout(){},URLSearchParams,Date,Promise,CustomEvent:class {constructor(type,opts){this.type=type;this.detail=opts?.detail;}}
  };
  vm.runInNewContext(source,context,{filename:"previewAuth.js"});
  return {window,calls,listeners,client,session,profile,context};
}

(async()=>{
  const a=fakeContext(previewAuth);
  const current=await a.window.AHAAuth.ensureProfile();
  assert.equal(current.ok,true);
  assert.equal(current.data.id,"fixture-A");
  const name=await a.window.AHAAuth.saveProfileName("Should not save");
  assert.equal(name.ok,false);
  assert.equal(name.reason,"preview_read_only");
  await a.window.AHAAuth.renderAuthStatus();
  assert.equal(a.calls.upsert,0);
  assert.ok(a.calls.read>=2,"Both auth-render and explicit ensure must be read-only");
  assert.ok(a.calls.events>=1,"Preview auth-ready UI still works");

  // Simulate auth-callback.html as loaded: it must use loadProfile even if
  // ensureProfile exists, and never fall through to direct Supabase .upsert().
  const cb=fakeContext(previewCallback);
  let load=0,ensure=0;
  cb.window.AHAAuth={
    async loadProfile(user){load++;assert.equal(user.id,"fixture-A");return {ok:true,data:cb.profile};},
    async ensureProfile(){ensure++;throw Error("ensureProfile must not be called from preview callback");}
  };
  await cb.listeners.DOMContentLoaded();
  assert.equal(load,1);
  assert.equal(ensure,0);
  assert.equal(cb.calls.upsert,0);

  const cbMissing=fakeContext(previewCallback);
  cbMissing.window.AHAAuth={};
  await cbMissing.listeners.DOMContentLoaded();
  assert.equal(cbMissing.calls.upsert,0,"Missing AHAAuth must fail closed, not fallback upsert");

  console.log("AHA Cloudflare read-only Auth preflight regression: PASS (offline, no Supabase writes).");
})().catch(err=>{console.error(err);process.exitCode=1;});
