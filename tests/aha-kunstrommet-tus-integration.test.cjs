const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const {Blob}=require("node:buffer"),{webcrypto}=require("node:crypto");
const id="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const project="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const rev="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ref="sstuzwppsheivczyqrim",origin="https://"+ref+".supabase.co";
const host="https://"+ref+".storage.supabase.co",endpoint=host+"/storage/v1/upload/resumable",url=endpoint+"/fixture";
const object=id+"/"+project+"/"+rev+".json";
const art={format:"aha-kunstrommet-v2",version:2,width:320,height:320,title:"Fixture",note:"",layers:[{bitmap:"fixture"}]};
function fixture(){
 let local=id,user=id,tokenUser=id,reserves=0,posts=0,patches=0,heads=0,offset=0,length=0,stored,lose=true,badReceipt=false;
 const bucket={list:async()=>({data:[]}),download:async p=>{
  assert.equal(p,object);return {data:badReceipt?new Blob(["x".repeat(stored.size)],{type:"application/json"}):stored};
 }};
 const client={supabaseUrl:origin,auth:{
  getUser:async token=>({data:{user:{id:token?tokenUser:user,is_anonymous:false,app_metadata:{aha_kunstrommet_backup_pilot:true}}}}),
  getSession:async()=>({data:{session:{user:{id:user},access_token:"test-token"}}})
 },storage:{from:()=>bucket},from:table=>{
  assert.equal(table,"aha_kunstrommet_backup_slots");
  return {select:()=>({eq:async()=>({data:[]})}),insert:row=>{reserves++;assert.equal(row.object_name,object);return {select:()=>({single:async()=>({data:row})})};}};
 }};
 const response=(status,headers={})=>({status,headers:{get:k=>headers[k]??null}});
 const window={location:{origin:"https://aha-preview.aha-echonet-preview.pages.dev"},
  AHA_KUNSTROMMET_BACKUP_STAGING_ENABLED:true,AHA_KUNSTROMMET_TUS_STAGING_ENABLED:true,
  AHA_KUNSTROMMET_TUS_STAGING_PROJECT_REF:ref,AHA_SUPABASE_URL:origin,
  localStorage:{getItem:()=>local},crypto:{subtle:webcrypto.subtle,randomUUID:()=>rev},
  btoa:s=>Buffer.from(s,"ascii").toString("base64"),AHADb:{getClient:()=>client},
  AHAKunstrommetV2:{cloudSnapshot:u=>{assert.equal(u,id);return {projectId:project,data:art};}},
  fetch:async(target,opt)=>{
   assert.ok(target===url||target===endpoint);assert.equal(opt.redirect,"error");assert.equal(opt.headers.Authorization,"Bearer test-token");
   if(opt.method==="POST"){posts++;length=Number(opt.headers["Upload-Length"]);return response(201,{Location:url});}
   if(opt.method==="HEAD"){heads++;return response(200,{"Upload-Offset":String(offset),"Upload-Length":String(length)});}
   assert.equal(opt.method,"PATCH");patches++;stored=opt.body;offset+=stored.size;
   if(lose){lose=false;throw Error("network lost after receipt");}
   return response(204,{"Upload-Offset":String(offset)});
  }};
 for(const name of ["ahaKunstrommetResumableUpload.js","ahaKunstrommetPrivateBackup.js"])
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../js",name),"utf8"),{window,Blob,URL});
 return {window,client,api:window.AHAKunstrommetPrivateBackup,stats:()=>({reserves,posts,patches,heads}),switchToken:()=>{tokenUser=other;},
  restoreToken:()=>{tokenUser=id;},bad:()=>{badReceipt=true;},good:()=>{badReceipt=false;}};
}
const rejects=(f,code)=>assert.rejects(f,e=>e.code===code);
(async()=>{
 const prod=fixture();prod.window.AHA_KUNSTROMMET_TUS_STAGING_PROJECT_REF="wshmybqyksrwkawqleiz";
 prod.window.AHA_SUPABASE_URL="https://wshmybqyksrwkawqleiz.supabase.co";
 await rejects(()=>prod.api.prepareResumable({confirm:()=>true}),"tus_disabled");assert.equal(prod.stats().reserves,0);
 const wrong=fixture();wrong.client.supabaseUrl="https://wrong.supabase.co";
 await rejects(()=>wrong.api.prepareResumable({confirm:()=>true}),"not_configured");assert.equal(wrong.stats().reserves,0);
 const cancelled=fixture();await rejects(()=>cancelled.api.prepareResumable({confirm:()=>false}),"cancelled");assert.equal(cancelled.stats().reserves,0);
 const f=fixture(),progress=[];
 const job=await f.api.prepareResumable({confirm:()=>true,progress:(done,total)=>progress.push([done,total])});
 assert.equal(f.stats().reserves,1);assert.equal(f.stats().posts,0);
 await assert.rejects(()=>job.resume(),/network lost/);assert.equal(f.stats().patches,1);
 f.switchToken();await rejects(()=>job.resume(),"account_changed");assert.equal(f.stats().heads,0);f.restoreToken();
 f.bad();await rejects(()=>job.resume(),"receipt_unconfirmed");assert.equal(job.status().complete,false);
 f.good();assert.equal((await job.resume()).stored,true);assert.equal(job.status().complete,true);
 assert.equal(f.stats().reserves,1);assert.equal(f.stats().posts,1);assert.equal(f.stats().patches,1);assert.equal(f.stats().heads,1);
 assert.equal(progress.at(-1)[0],progress.at(-1)[1]);
 console.log("Kunstrommet gated TUS integration: PASS");
})().catch(e=>{console.error(e);process.exitCode=1;});
