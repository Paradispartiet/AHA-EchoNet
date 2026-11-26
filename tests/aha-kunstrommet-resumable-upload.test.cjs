const assert=require("node:assert/strict");
const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const {Blob}=require("node:buffer");
const window={btoa:s=>Buffer.from(s,"ascii").toString("base64")};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../js/ahaKunstrommetResumableUpload.js"),"utf8"),{window,URL});
const api=window.AHAKunstrommetResumableUpload,chunk=api.chunkBytes;
const user="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
const object=user+"/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.json";
const root="https://abcdefghijklmnopqrst.storage.supabase.co",url=root+"/storage/v1/upload/resumable/fixture";
const res=(status,headers={})=>({status,headers:{get:k=>headers[k]??null}});
const rejects=(f,code)=>assert.rejects(f,e=>e.code===code);
function fixture({size=chunk*6,location=url,lostPatch=false,lostPost=false,headLength,expired=false,receipt=true}={}){
 let server=0,posts=0,patches=0,heads=0,verified=0,id=user,failPatch=lostPatch,okReceipt=receipt;
 const blob=new Blob([Buffer.alloc(size)],{type:"application/json"});
 const job=api.create({projectRef:"abcdefghijklmnopqrst",bucket:"staging-private",path:object,userId:user,blob,
 authorize:async()=>({userId:id,accessToken:"fixture-token"}),
 request:async(target,opt)=>{
  assert.ok(target===url||target===root+"/storage/v1/upload/resumable");
  assert.equal(opt.redirect,"error");assert.equal(opt.headers.Authorization,"Bearer fixture-token");
  assert.equal(opt.headers["x-upsert"],undefined);
  if(opt.method==="POST"){
   posts++;if(lostPost)throw Error("offline");
   assert.equal(opt.headers["Upload-Length"],String(size));
   return res(201,{Location:location});
  }
  if(opt.method==="HEAD"){heads++;return expired?res(410):res(200,{"Upload-Length":headLength||String(size),"Upload-Offset":String(server)});}
  assert.equal(opt.method,"PATCH");patches++;
  assert.equal(Number(opt.headers["Upload-Offset"]),server);
  assert.ok(opt.body.size<=chunk);server+=opt.body.size;
  if(failPatch){failPatch=false;throw Error("offline after accepted chunk");}
  return res(204,{"Upload-Offset":String(server)});
 },
 verifyStored:async x=>{verified++;assert.equal(x.path,object);assert.equal(server,size);return okReceipt;}
 });
 return {job,stats:()=>({posts,patches,heads,verified,server}),change:()=>{id=other;},confirm:()=>{okReceipt=true;}};
}
(async()=>{
 const full=fixture();assert.equal((await full.job.resume()).bytes,36*1024*1024);
 assert.equal(full.stats().patches,6);assert.equal(full.stats().posts,1);assert.equal(full.stats().verified,1);
 const resumed=fixture({lostPatch:true});await assert.rejects(()=>resumed.job.resume(),/offline/);
 assert.equal(resumed.job.status().offset,0);assert.equal(resumed.stats().server,chunk);
 await resumed.job.resume();assert.equal(resumed.stats().posts,1);assert.equal(resumed.stats().heads,1);assert.equal(resumed.stats().patches,6);
 const missing=fixture({lostPost:true});await assert.rejects(()=>missing.job.resume(),/offline/);
 await rejects(()=>missing.job.resume(),"reconciliation_required");assert.equal(missing.stats().posts,1);
 const foreign=fixture({location:"https://example.org/upload"});await rejects(()=>foreign.job.resume(),"location_unconfirmed");assert.equal(foreign.stats().patches,0);
 const mismatch=fixture({lostPatch:true,headLength:"123"});await assert.rejects(()=>mismatch.job.resume(),/offline/);
 await rejects(()=>mismatch.job.resume(),"length_mismatch");assert.equal(mismatch.stats().patches,1);
 const stale=fixture({lostPatch:true,expired:true});await assert.rejects(()=>stale.job.resume(),/offline/);
 await rejects(()=>stale.job.resume(),"reconciliation_required");assert.equal(stale.stats().posts,1);
 const switched=fixture({lostPatch:true});await assert.rejects(()=>switched.job.resume(),/offline/);switched.change();
 await rejects(()=>switched.job.resume(),"account_changed");assert.equal(switched.stats().heads,0);
 const receipt=fixture({size:chunk+5,receipt:false});await rejects(()=>receipt.job.resume(),"receipt_unconfirmed");
 receipt.confirm();await receipt.job.resume();assert.equal(receipt.stats().patches,2);assert.equal(receipt.stats().posts,1);
 console.log("Kunstrommet isolated resumable transport: PASS");
})().catch(e=>{console.error(e);process.exitCode=1;});
