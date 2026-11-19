// Synthetic browser-only test: account A/B/guest partitions, no network, no cloud writes.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ARCHIVE = "aha_feed_accounts_v1";
const LEGACY = "aha_feed_posts_v1";
const values = new Map([[LEGACY, JSON.stringify([{id:"legacy-1",text:"Historic unassigned post",created_at:"2026-01-01"}])]]);
const storage = {
 getItem(k){return values.has(k)?values.get(k):null;},
 setItem(k,v){values.set(k,String(v));},
 removeItem(k){values.delete(k);}
};
let identity=A, authError=false;
const listeners = new Map();
let html="";
const mount={set innerHTML(v){html=v},set textContent(v){html=v}};
const status={textContent:""};
const form={addEventListener(){}};
const list={addEventListener(){}};
const document={
 readyState:"complete",
 getElementById(id){
   if(id==="feed-form")return form;
   if(id==="feed-list")return mount;
   if(id==="feed-scope-status")return status;
   return null;
 }
};
let serverWrites=0;
const client={
 auth:{async getUser(){
   return authError?{data:{user:null},error:{message:"offline"}}
     :{data:{user:identity?{id:identity}:null},error:null};
 }}
};
const context={
 window:null,document,localStorage:storage,Date,Math,JSON,String,Number,Array,Set,console,
 HTMLElement:function(){},
 fetch(){throw Error("Network forbidden in synthetic fixture");},
 AHARepository:new Proxy({},{get(){serverWrites++;throw Error("Cloud write/read forbidden")}})
};
context.addEventListener=(name,cb)=>listeners.set(name,cb);
context.AHADb={
 getConfig:()=>({url:"https://wshmybqyksrwkawqleiz.supabase.co"}),
 getClient:()=>client
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaFeed.js","utf8"),context);
const Feed=context.AHAFeed;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function changed(next,error=false){
 identity=next;
 authError=error;
 listeners.get("aha:auth-ready")();
 assert.equal(Feed.load().length,0,"Auth transition must immediately hide old account");
 await tick();
}

(async()=>{
 await tick();
 assert.equal(Feed.load().length,0,"Account A must not inherit unassigned legacy posts");
 assert.ok(status.textContent.includes("eldre lokale innlegg"),"Preserved legacy archive must be disclosed");
 const fromA=await Feed.addPost({id:"same-id",text:"Account A only"});
 assert.equal(fromA.profile_id,A);
 assert.equal(Feed.load().length,1);
 assert.equal(Feed.load()[0].text,"Account A only");
 assert.equal(JSON.parse(values.get(LEGACY)).length,1,"Never automatically migrate historical unassigned posts");
 assert.equal(JSON.parse(values.get(ARCHIVE)).accounts[A].length,1);
 assert.equal(serverWrites,0);

 await changed(B);
 assert.ok(!html.includes("Account A only"),"B must never display A's local posts");
 assert.equal(await Feed.deletePost("same-id"),null,"B may not delete A's post");
 const fromB=await Feed.addPost({id:"same-id",text:"Account B only"});
 assert.equal(fromB.profile_id,B);
 assert.equal(Feed.load()[0].text,"Account B only");
 const all=JSON.parse(values.get(ARCHIVE));
 assert.equal(all.accounts[A][0].text,"Account A only");
 assert.equal(all.accounts[B][0].text,"Account B only");

 await changed(A);
 assert.equal(Feed.load().length,1);
 assert.equal(Feed.load()[0].text,"Account A only");
 const deleted=await Feed.deletePost("same-id");
 assert.ok(deleted?.deleted_at,"A should retain its own tombstone");
 assert.equal(JSON.parse(values.get(ARCHIVE)).accounts[B][0].deleted_at,undefined);

 await changed(null);
 assert.equal(Feed.load()[0].text,"Historic unassigned post","Guest sees only unassigned history");
 assert.ok(!html.includes("Account B only"),"Guest must not display any account-scoped post");
 const guest=await Feed.addPost({id:"guest-2",text:"Anonymous local draft"});
 assert.equal(guest.profile_id,undefined);
 assert.equal(JSON.parse(values.get(LEGACY)).length,2);
 assert.equal(Object.keys(JSON.parse(values.get(ARCHIVE)).accounts).length,2);

 await changed(B);
 assert.equal(Feed.load()[0].text,"Account B only","B's local archive survives logout/login");
 await changed(A,true);
 assert.equal(Feed.load().length,0,"Failed Auth may not fall back to another account");
 assert.equal(await Feed.addPost({text:"Should fail"}),null);
 assert.ok(status.textContent.includes("kunne ikke bekreftes"));
 assert.equal(JSON.parse(values.get(LEGACY)).length,2);

 // Existing but corrupt account cache is NOT overwritten by save.
 values.set(ARCHIVE,"{invalid local data");
 await changed(A);
 assert.equal(await Feed.addPost({text:"Must not overwrite damaged data"}),null);
 assert.equal(values.get(ARCHIVE),"{invalid local data");
 assert.equal(serverWrites,0,"No implicit Supabase calls, ever");
 console.log("AHA Feed account partition and preservation tests: PASS");
})().catch(error=>{console.error(error);process.exitCode=1});
