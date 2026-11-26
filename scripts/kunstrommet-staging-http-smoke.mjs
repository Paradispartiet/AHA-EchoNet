import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const URL_BASE="https://sstuzwppsheivczyqrim.supabase.co";
const BUCKET="aha-kunstrommet-private-backups";
const TABLE="aha_kunstrommet_backup_slots";
const env=process.env;
const key=env.KR_STAGING_PUBLISHABLE_KEY||"";
function publicKey(k){
 if(k.startsWith("sb_publishable_"))return true;
 try{return JSON.parse(Buffer.from(k.split(".")[1],"base64url")).role==="anon"}catch{return false}
}
function check(ok,msg){if(!ok)throw Error(msg)}
async function request(path,{method="GET",token,body,headers={}}={}){
 return fetch(URL_BASE+path,{method,redirect:"error",signal:AbortSignal.timeout(20000),headers:{apikey:key,...(token?{Authorization:"Bearer "+token}:{}),...(body!==undefined?{"Content-Type":"application/json"}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
}
async function json(r,label){check(r.ok,label+" HTTP "+r.status);return r.json()}
async function login(email,password){
 const r=await json(await request("/auth/v1/token?grant_type=password",{method:"POST",body:{email,password}}),"Login");
 check(typeof r.access_token==="string","missing access token");
 const u=await json(await request("/auth/v1/user",{token:r.access_token}),"Verify account");
 check(u.email===email&&u.is_anonymous===false&&u.app_metadata?.aha_kunstrommet_backup_pilot===true&&/^[a-f0-9-]{36}$/.test(u.id),"wrong or non-pilot account");
 return {id:u.id,token:r.access_token};
}
const slotPath="/rest/v1/"+TABLE;
const objectPath=p=>"/storage/v1/object/"+BUCKET+"/"+p;
const downloadPath=p=>"/storage/v1/object/authenticated/"+BUCKET+"/"+p;
async function slots(u){return json(await request(slotPath+"?select=slot,object_name&user_id=eq."+u.id,{token:u.token}),"Slots")}
async function deny(r,label){check([400,401,403,404,409,422].includes(r.status),label+" unexpected HTTP "+r.status);console.log("PASS "+label)}
const created=[];
async function run(){
 check(env.KR_STAGING_CONFIRM==="synthetic-test-only","Explicit staging confirmation required");
 check(publicKey(key),"Publishable/anon key required");
 check(env.KR_STAGING_A_PASSWORD&&env.KR_STAGING_B_PASSWORD,"Two test passwords required");
 const a=await login("kunstrommet-qa-a@example.com",env.KR_STAGING_A_PASSWORD);
 const b=await login("kunstrommet-qa-b@example.com",env.KR_STAGING_B_PASSWORD);
 check(a.id!==b.id,"accounts not distinct");
 console.log("PASS two verified staging accounts");
 const makePath=u=>u.id+"/"+randomUUID()+"/"+randomUUID()+".json";
 const body={fixture:"synthetic Kunstrommet storage smoke",nonce:randomUUID()};
 async function upload(u){
  const existing=await slots(u);check(Array.isArray(existing),"invalid slot listing");
  const slot=Array.from({length:16},(_,i)=>i+1).find(n=>!existing.some(s=>s.slot===n));check(slot,"No free reservation; reconcile manually");
  const path=makePath(u);
  await deny(await request(objectPath(path),{method:"POST",token:u.token,body}),"unreserved upload denied");
  await json(await request(slotPath,{method:"POST",token:u.token,body:{user_id:u.id,slot,object_name:path},headers:{Prefer:"return=representation"}}),"Reserve");
  created.push({u,path});
  await json(await request(objectPath(path),{method:"POST",token:u.token,body,headers:{"x-upsert":"false"}}),"Upload");
  assert.deepEqual(await json(await request(downloadPath(path),{token:u.token}),"Download"),body);
  console.log("PASS private upload/readback");
  return path;
 }
 try{
  const pa=await upload(a),pb=await upload(b);
  await deny(await request(downloadPath(pa),{token:b.token}),"B cannot read A");
  await deny(await request(downloadPath(pb),{token:a.token}),"A cannot read B");
  await deny(await request(downloadPath(pa)),"Unauthenticated read denied");
  const foreign=await json(await request(slotPath+"?select=slot,object_name&user_id=eq."+a.id,{token:b.token}),"Foreign slots");
  assert.deepEqual(foreign,[]);console.log("PASS foreign reservation listing empty");
  await deny(await request(objectPath(pa),{method:"POST",token:a.token,body:{changed:true},headers:{"x-upsert":"true"}}),"Overwrite denied");
  assert.deepEqual(await json(await request(downloadPath(pa),{token:a.token}),"Original readback"),body);
 }finally{
  let failed=false;
  for(const {u,path} of created){
   try{
    const r=await request("/storage/v1/object/"+BUCKET,{method:"DELETE",token:u.token,body:{prefixes:[path]}});
    check(r.ok,"cleanup HTTP "+r.status);
    const after=await request(downloadPath(path),{token:u.token});
    check([400,403,404].includes(after.status),"cleanup unconfirmed");
    console.log("PASS synthetic object absent; reservation retained");
   }catch{failed=true;console.error("Synthetic object cleanup unconfirmed; operator must reconcile staging")}
  }
  if(failed)throw Error("cleanup unconfirmed");
 }
}
run().catch(()=>{console.error("Staging smoke failed; inspect safe PASS markers and reconcile reservations. No credentials logged.");process.exitCode=1});
