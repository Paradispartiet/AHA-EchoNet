const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const {Blob}=require("node:buffer");
const user="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const project="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const rev="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.json";
const art={format:"aha-kunstrommet-v2",version:2,width:320,height:320,title:"Test",note:"",layers:[{bitmap:"fixture"}],owner:"omit"};
let id=user,local=user,pilot=true,anonymous=false,uploads=0,downloads=0,auth=0,restores=0,lastUpload,changeOnDownload=false,quotaMode="normal";
const bucket={
 async upload(p,b,o){uploads++;lastUpload={p,b,o};return {data:{path:p},error:null};},
 async list(p){assert.ok(p===user||p===user+"/"+project);return {data:p===user?[{name:project,id:null},{name:"bad",id:null}]:quotaMode==="full"?Array.from({length:3},()=>({name:rev,id:"file",metadata:{size:36*1024*1024}})):[{name:rev,id:"file",created_at:"2026-11-26",metadata:quotaMode==="unknown"?{}:{size:123}}]};},
 async download(p){downloads++;assert.equal(p,user+"/"+project+"/"+rev);if(changeOnDownload)id=other;return {data:new Blob([JSON.stringify(art)])};}
};
const window={location:{origin:"https://aha-preview.aha-echonet-preview.pages.dev"},localStorage:{getItem:()=>local},crypto:{randomUUID:()=>rev.slice(0,-5)},
 AHADb:{getClient:()=>({auth:{getUser:async()=>{auth++;return {data:{user:{id,is_anonymous:anonymous,app_metadata:{aha_kunstrommet_backup_pilot:pilot}}}};}},storage:{from:n=>{assert.equal(n,"aha-kunstrommet-private-backups");return bucket;}}})},
 AHAKunstrommetV2:{cloudSnapshot:u=>{assert.equal(u,user);return {projectId:project,data:art};},saveCloudCopy:async(data,u,verify)=>{await verify();assert.equal(u,user);assert.equal(data.owner,undefined);restores++;return "new-copy";}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../js/ahaKunstrommetPrivateBackup.js"),"utf8"),{window,Blob});
const api=window.AHAKunstrommetPrivateBackup;
const rejects=(f,code)=>assert.rejects(f,e=>e.code===code);
(async()=>{
 assert.equal(auth,0);
 await rejects(()=>api.saveCurrent({confirm:()=>true}),"disabled");assert.equal(auth,0);
 window.AHA_KUNSTROMMET_BACKUP_STAGING_ENABLED=true;
 window.location.origin="https://echonetaha.github.io";await rejects(()=>api.saveCurrent({confirm:()=>true}),"disabled");assert.equal(auth,0);
 window.location.origin="https://aha-preview.aha-echonet-preview.pages.dev";
 await rejects(()=>api.saveCurrent({confirm:()=>false}),"cancelled");assert.equal(uploads,0);
 pilot=false;await rejects(()=>api.saveCurrent({confirm:()=>true}),"pilot_required");pilot=true;
 anonymous=true;await rejects(()=>api.listProjects(),"login_required");anonymous=false;
 local=other;await rejects(()=>api.listProjects(),"account_changed");local=user;
 await rejects(()=>api.saveCurrent({confirm:()=>{id=other;return true;}}),"account_changed");id=user;assert.equal(uploads,0);
 quotaMode="unknown";await rejects(()=>api.saveCurrent({confirm:()=>true}),"quota_unknown");
 quotaMode="full";await rejects(()=>api.saveCurrent({confirm:()=>true}),"quota_reached");
 assert.equal(uploads,0);quotaMode="normal";
 const usage=await api.storageUsage(user);assert.equal(usage.bytes,123);
 await api.saveCurrent({confirm:bytes=>bytes>0});assert.equal(uploads,1);
 assert.equal(lastUpload.p,user+"/"+project+"/"+rev);assert.equal(lastUpload.o.upsert,false);
 assert.equal(JSON.parse(await lastUpload.b.text()).owner,undefined);
 art.layers[0].bitmap="x".repeat(api.maxBytes+1);await rejects(()=>api.saveCurrent({confirm:()=>true}),"too_large");art.layers[0].bitmap="fixture";assert.equal(uploads,1);
 const list=await api.listProjects();assert.equal(list.items.length,1);assert.equal(list.items[0],project);
 const versions=await api.listRevisions(project,user);assert.equal(versions.items[0].name,rev);
 await rejects(()=>api.restore("../other",rev,user),"invalid_path");assert.equal(downloads,0);
 changeOnDownload=true;await rejects(()=>api.restore(project,rev,user),"account_changed");assert.equal(restores,0);id=user;changeOnDownload=false;
 assert.equal(await api.restore(project,rev,user),"new-copy");assert.equal(restores,1);
 art.layers[0].bitmap="x".repeat(api.maxBytes+1);
 assert.equal(await api.restore(project,rev,user),"new-copy");assert.equal(restores,2);
 art.layers[0].bitmap="fixture";assert.equal(api.maxRestoreBytes,36*1024*1024);
 console.log("Kunstrommet private backup transport: PASS");
})().catch(e=>{console.error(e);process.exitCode=1;});
