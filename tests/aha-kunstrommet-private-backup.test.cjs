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
const staging="https://sstuzwppsheivczyqrim.supabase.co";
let clientURL=staging;
let id=user,local=user,pilot=true,anonymous=false,uploads=0,downloads=0,auth=0,restores=0,lastUpload,changeOnDownload=false,quotaMode="normal",slotMode="normal",reserves=0,removes=0,removed=false;
const bucket={
 async upload(p,b,o){uploads++;lastUpload={p,b,o};return {data:{path:p},error:null};},
 async remove(paths){assert.equal(paths[0],user+"/"+project+"/"+rev);removes++;removed=true;return {data:[{name:paths[0]}]};},
 async list(p,opts){assert.ok(p===user||p===user+"/"+project);if(opts?.search)return {data:removed?[]:[{name:rev,id:"file"}]};return {data:p===user?[{name:project,id:null},{name:"bad",id:null}]:quotaMode==="full"?Array.from({length:3},()=>({name:rev,id:"file",metadata:{size:36*1024*1024}})):[{name:rev,id:"file",created_at:"2026-11-26",metadata:quotaMode==="unknown"?{}:{size:123}}]};},
 async download(p){downloads++;assert.equal(p,user+"/"+project+"/"+rev);if(changeOnDownload)id=other;return {data:new Blob([JSON.stringify(art)])};}
};
const window={AHA_SUPABASE_URL:staging,location:{origin:"https://aha-preview.aha-echonet-preview.pages.dev"},localStorage:{getItem:()=>local},crypto:{randomUUID:()=>rev.slice(0,-5)},
 AHADb:{getClient:()=>({supabaseUrl:clientURL,auth:{getUser:async()=>{auth++;return {data:{user:{id,is_anonymous:anonymous,app_metadata:{aha_kunstrommet_backup_pilot:pilot}}}};}},storage:{from:n=>{assert.equal(n,"aha-kunstrommet-private-backups");return bucket;}},from:name=>{assert.equal(name,"aha_kunstrommet_backup_slots");return {
 select:()=>({eq:async()=>({data:slotMode==="full"?Array.from({length:16},(_,i)=>({slot:i+1})):[]})}),
 insert:row=>{reserves++;return {select:()=>({single:async()=>slotMode==="conflict"?{error:{code:"23505"}}:{data:row}})};}
 };}})},
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
 window.AHA_SUPABASE_URL="https://wshmybqyksrwkawqleiz.supabase.co";
 await rejects(()=>api.listProjects(),"disabled");assert.equal(auth,0);
 window.AHA_SUPABASE_URL=staging;clientURL="https://wshmybqyksrwkawqleiz.supabase.co";
 await rejects(()=>api.saveCurrent({confirm:()=>true}),"not_configured");assert.equal(auth,0);clientURL=staging;
 await rejects(()=>api.saveCurrent({confirm:()=>false}),"cancelled");assert.equal(uploads,0);
 pilot=false;await rejects(()=>api.saveCurrent({confirm:()=>true}),"pilot_required");pilot=true;
 anonymous=true;await rejects(()=>api.listProjects(),"login_required");anonymous=false;
 local=other;await rejects(()=>api.listProjects(),"account_changed");local=user;
 await rejects(()=>api.saveCurrent({confirm:()=>{id=other;return true;}}),"account_changed");id=user;assert.equal(uploads,0);
 quotaMode="unknown";await rejects(()=>api.saveCurrent({confirm:()=>true}),"quota_unknown");
 quotaMode="full";await rejects(()=>api.saveCurrent({confirm:()=>true}),"quota_reached");
 assert.equal(uploads,0);quotaMode="normal";
 const usage=await api.storageUsage(user);assert.equal(usage.bytes,123);
 slotMode="full";await rejects(()=>api.saveCurrent({confirm:()=>true}),"slots_full");assert.equal(reserves,0);
 slotMode="conflict";await rejects(()=>api.saveCurrent({confirm:()=>true}),"reservation_unconfirmed");assert.equal(uploads,0);
 slotMode="normal";
 await api.saveCurrent({confirm:bytes=>bytes>0});assert.equal(uploads,1);assert.equal(reserves,2);
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
 await rejects(()=>api.removeRevision(project,rev,user),"cancelled");assert.equal(removes,0);
 await rejects(()=>api.removeRevision("../other",rev,user,{confirmed:true}),"invalid_path");assert.equal(removes,0);
 await rejects(()=>api.removeRevision(project,rev,other,{confirmed:true}),"account_changed");assert.equal(removes,0);
 const deletion=await api.removeRevision(project,rev,user,{confirmed:true});assert.equal(deletion.removed,true);assert.equal(deletion.slotReleased,false);assert.equal(removes,1);
 console.log("Kunstrommet private backup transport: PASS");
})().catch(e=>{console.error(e);process.exitCode=1;});
