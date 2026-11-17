// AHA Cloudflare preflight: the REAL copied Supabase DB shim must refuse writes.
// Offline and synthetic: no Supabase requests, secrets, or personal data.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const original = read("js/ahaDb.js");
const guard = read("js/ahaPreviewDataApiReadOnly.js");
const builder = read("scripts/build-cloudflare-preview.mjs");
const checker = read("scripts/check-cloudflare-preview.mjs");
assert.ok(guard.includes("AHA_CLOUDFLARE_PREVIEW_DATA_API_READ_ONLY"));
assert.ok(!original.includes("AHA_CLOUDFLARE_PREVIEW_DATA_API_READ_ONLY"),
  "Published GitHub Pages db bootstrap must remain unchanged");
assert.ok(builder.includes('path.join(out, "js/ahaDb.js")'));
assert.ok(builder.includes("previewDbSource +"));
assert.ok(checker.includes("Cloudflare preview must block all Supabase Data API mutations"));

const counters = { auth:0, read:0, upsert:0, insert:0, update:0, delete:0, rpc:0 };
const row = { id:"fixture-user-1" };
function queryBuilder(table) {
  const query = {
    method:"GET",
    body:null,
    select() { return this; },
    eq() { return this; },
    limit() { return this; },
    order() { return this; },
    async maybeSingle() { counters.read++;return {data:row,error:null}; },
    async single() { counters.read++;return {data:row,error:null}; },
    upsert() { counters.upsert++;throw Error("Unexpected remote upsert"); },
    insert() { counters.insert++;throw Error("Unexpected remote insert"); },
    update() { counters.update++;throw Error("Unexpected remote update"); },
    delete() { counters.delete++;throw Error("Unexpected remote delete"); },
    then(resolve,reject) { return Promise.resolve({data:[row],error:null}).then(resolve,reject); }
  };
  return query;
}
function restClient() {
  return {
    from: (table) => queryBuilder(table),
    rpc: () => {counters.rpc++;throw Error("Unexpected scoped RPC");},
    schema: () => restClient()
  };
}
const client = {
  auth: {async getUser(){counters.auth++;return {data:{user:{id:row.id}},error:null};}},
  from: (table) => queryBuilder(table),
  rpc: () => {counters.rpc++;throw Error("Unexpected RPC");},
  schema: () => restClient(),
  rest: restClient()
};
const window = {
  AHA_SUPABASE_URL:"https://fixture.invalid",
  AHA_SUPABASE_PUBLISHABLE_KEY:"fake-publishable",
  supabase:{createClient:()=>client}
};
vm.runInNewContext(original+"\n"+guard,{window,Promise,Proxy,Reflect,Set,Object,Error},{filename:"preview-ahaDb.js"});
const db=window.AHADb;
assert.equal(db.isConfigured(),true);
assert.equal(db.getClient(),db.getClient(),"getClient must preserve stable client identity");
assert.equal(window.AHAPreviewDataApiReadOnly.enabled,true);

(async()=>{
  const auth=await db.getClient().auth.getUser();
  assert.equal(auth.data.user.id,"fixture-user-1");
  assert.equal(counters.auth,1);

  const own=await db.getClient().from("aha_profiles").select("id").eq("id",row.id).maybeSingle();
  assert.equal(own.data.id,row.id);
  assert.equal(own.error,null);

  for (const method of ["upsert","insert","update","delete"]) {
    const result=await db.getClient().from("aha_feed_posts")[method]({text:"synthetic"}).select().single();
    assert.equal(result.data,null,method);
    assert.equal(result.error.code,"AHA_PREVIEW_READ_ONLY",method);
  }

  const afterRead = await db.getClient().from("aha_feed_posts").select("id").eq("id",row.id).update({text:"forbidden"}).select().single();
  assert.equal(afterRead.error.code,"AHA_PREVIEW_READ_ONLY");
  const rpc = await db.getClient().rpc("aha_match_insights",{query_embedding:[]});
  assert.equal(rpc.error.code,"AHA_PREVIEW_READ_ONLY");

  // Guard the alternative PostgREST entry points used by supabase-js.
  for (const scoped of [
    db.getClient().schema("public"),
    db.getClient().rest,
    db.getClient().rest.schema("public")
  ]) {
    const forbiddenWrite=await scoped.from("aha_feed_posts").insert({text:"private synthetic"});
    assert.equal(forbiddenWrite.error.code,"AHA_PREVIEW_READ_ONLY");
    const forbiddenRpc=await scoped.rpc("unsafe_mutation", {});
    assert.equal(forbiddenRpc.error.code,"AHA_PREVIEW_READ_ONLY");
    const allowedRead=await scoped.from("aha_profiles").select("id").eq("id",row.id).maybeSingle();
    assert.equal(allowedRead.data.id,row.id);
  }
  // An approved read builder must not be editable into a POST before .then().
  const readBuilder=db.getClient().from("aha_profiles").select("id");
  assert.equal(Reflect.set(readBuilder,"method","POST"),false);
  assert.equal(readBuilder.method,"GET");
  assert.equal(Reflect.set(readBuilder,"body",{text:"private"}),false);
  assert.equal(readBuilder.body,null);
  assert.equal(Reflect.set(db.getClient(),"rpc",()=>null),false);

  assert.equal(counters.upsert+counters.insert+counters.update+counters.delete+counters.rpc,0,
    "No Supabase data mutation/RPC may be invoked");
  assert.ok(counters.read>0);

  // Exercise an actual AHARepository app writer through this preview client.
  window.AHAAuth={async getProfileId(){return row.id;}};
  vm.runInNewContext(read("js/ahaRepository.js"),{window,Date,Promise,console,Map,Set,Object},{filename:"ahaRepository.js"});
  const feed=await window.AHARepository.saveFeedPost({id:"synthetic-feed",text:"private example"});
  assert.equal(feed.ok,false);
  assert.equal(feed.error?.code,"AHA_PREVIEW_READ_ONLY");
  assert.equal(counters.upsert,0,"Feed must not write when signed in");

  console.log("AHA Cloudflare data API read-only regression: PASS; Auth/reads preserved, writes/RPC/schema/rest bypass disabled.");
})().catch(error=>{console.error(error);process.exitCode=1;});
