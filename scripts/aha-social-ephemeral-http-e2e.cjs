#!/usr/bin/env node
"use strict";
// Real HTTP + real PostgreSQL, but no hosted services or real user data.
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const base="http://127.0.0.1:3100";
function check(env){
 if(env.GITHUB_ACTIONS!=="true"||
    env.AHA_SOCIAL_EPHEMERAL_ACK!=="RUN_AHA_SOCIAL_EPHEMERAL_CI"||
    env.AHA_SOCIAL_E2E_API_ORIGIN!==base||
    env.PGDATABASE!=="aha_rehearsal"||env.NODE_ENV!=="test"||
    env.AHA_SOCIAL_STAGING_ENABLED!=="true")throw new Error("Unsafe ephemeral integration environment");
 const values=[env.AHA_SOCIAL_E2E_TOKEN_A,env.AHA_SOCIAL_E2E_TOKEN_B,env.AHA_SOCIAL_E2E_TOKEN_MOD];
 if(values.some(v=>typeof v!=="string"||v.split(".").length!==3)||new Set(values).size!==3)
  throw new Error("Three distinct test JWTs required");
 return values;
}
async function run(){
 const [a,b,m]=check(process.env);
 async function call(token,route,method="GET",body=null){
  assert.ok(route.startsWith("/v1/")&&!route.startsWith("//"));
  const binary=Buffer.isBuffer(body);
  const res=await fetch(base+route,{
   method,headers:{
    accept:"application/json",
    ...(token?{authorization:"Bearer "+token}:{}),
    ...(body!==null?{"content-type":binary?"image/png":"application/json"}:{}),
    ...(binary?{"idempotency-key":"test-"+randomUUID()}:{}),
   },
   ...(body!==null?{body:binary?body:JSON.stringify(body)}:{}),
   cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)
  });
  const contentType=res.headers.get("content-type")||"";
  const data=contentType.includes("application/json")?await res.json().catch(()=>null):Buffer.from(await res.arrayBuffer());
  return {status:res.status,data:data?.data,bytes:Buffer.isBuffer(data)?data:null,headers:res.headers};
 }
 async function expectHttp(status,token,route,method="GET",body=null){
  const result=await call(token,route,method,body);
  assert.equal(result.status,status,method+" "+route+" returned unexpected HTTP status");
  return result;
 }
 let healthy=false;
 for(let attempt=0;attempt<40;attempt++){
  try{if((await call(null,"/v1/health")).status===200){healthy=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,300));
 }
 assert.ok(healthy,"Ephemeral NestJS server never became ready");
 await expectHttp(401,null,"/v1/social/posts?kind=feed&limit=2");
 const image=Buffer.alloc(108);
 Buffer.from("89504e470d0a1a0a","hex").copy(image);
 image.write("IHDR",12,"ascii");
 image.writeUInt32BE(8,16);image.writeUInt32BE(8,20);
 let uploaded=null,posted=null,pending=null,removed=false;
 try{
  const stored=await expectHttp(201,a,"/v1/social/media","POST",image);
  uploaded=stored.data?.mediaUrl;
  assert.match(uploaded,/^\/v1\/social\/media\/[0-9a-f-]{36}$/);
  await expectHttp(404,b,uploaded);
  await expectHttp(404,b,"/v1/social/posts","POST",{
   kind:"insta",text:"Forbidden borrowed image",mediaUrl:uploaded,
   requestKey:"test-"+randomUUID(),publish:true
  });
  const text="Synthetic 3-profile social E2E "+randomUUID();
  const created=await expectHttp(201,a,"/v1/social/posts","POST",{
   kind:"insta",text,mediaUrl:uploaded,requestKey:"test-"+randomUUID(),publish:true
  });
  posted=created.data?.id;
  assert.match(posted,/^[0-9a-f-]{36}$/);
  const publicList=await expectHttp(200,b,"/v1/social/posts?kind=insta&limit=40");
  assert.ok(publicList.data.some(p=>p.id===posted&&p.mediaUrl===uploaded&&p.text===text&&p.ownPost===false));
  const picture=await expectHttp(200,b,uploaded);
  assert.equal(picture.bytes.length,108);
  assert.equal(picture.headers.get("content-type"),"image/png");
  assert.equal(picture.headers.get("cache-control"),"private, no-store");
  await expectHttp(404,b,uploaded,"DELETE");
  await expectHttp(201,b,"/v1/social/posts/"+posted+"/reports","POST",{reason:"privacy"});
  await expectHttp(403,b,"/v1/social/moderation/reports?limit=40");
  const queue=await expectHttp(200,m,"/v1/social/moderation/reports?limit=40");
  assert.ok(queue.data.some(x=>x.postId===posted));
  const hidden=await expectHttp(201,m,"/v1/social/moderation/posts/"+posted+"/decision","POST",{
   action:"hide",note:"Synthetic moderation of test photo"
  });
  assert.equal(hidden.data.status,"hidden");
  await expectHttp(404,b,uploaded);
  await expectHttp(200,a,uploaded);
  const del=await expectHttp(200,a,"/v1/social/posts/"+posted,"DELETE");
  assert.equal(del.data.deleted,true);
  removed=true;
  await expectHttp(404,a,uploaded);
  await expectHttp(404,b,uploaded);
  const after=await expectHttp(200,b,"/v1/social/posts?kind=insta&limit=40");
  assert.ok(!after.data.some(x=>x.id===posted));
  const unused=await expectHttp(201,a,"/v1/social/media","POST",image);
  pending=unused.data?.mediaUrl;
  await expectHttp(404,b,pending);
  const cancel=await expectHttp(200,a,pending,"DELETE");
  assert.equal(cancel.data.deleted,true);
  pending=null;
  process.stdout.write("Ephemeral real JWT + NestJS + PostgreSQL social 3-account test: PASS\n");
 }finally{
  if(posted&&!removed)try{await call(a,"/v1/social/posts/"+posted,"DELETE");}catch{}
  if(pending)try{await call(a,pending,"DELETE");}catch{}
  if(uploaded&&!posted)try{await call(a,uploaded,"DELETE");}catch{}
 }
}
if(require.main===module)run().catch(err=>{
 process.stderr.write("Ephemeral real-HTTP rehearsal FAIL: "+err.message+"\n");
 process.exitCode=1;
});
module.exports={check};
