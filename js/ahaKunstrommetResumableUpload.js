// Staging TUS transport. Loading this file does not initiate requests or enable it.
// Caller must first reserve a path under an independently verified server quota.
(function(global){
 "use strict";
 const CHUNK=6*1024*1024, MAX=36*1024*1024;
 const UUID="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
 const PATH=new RegExp("^"+UUID+"/"+UUID+"/"+UUID+"[.]json$");
 function fail(code){throw Object.assign(new Error(code),{code});}
 function create({projectRef,bucket,path,userId,blob,authorize,request,verifyStored,progress=()=>{}}){
  if(typeof projectRef!=="string"||!/^[a-z0-9]{20}$/.test(projectRef)||
     typeof bucket!=="string"||!/^[a-z0-9-]{1,63}$/.test(bucket)||
     typeof path!=="string"||!PATH.test(path)||path.split("/")[0]!==userId||
     !blob||blob.type!=="application/json"||!Number.isSafeInteger(blob.size)||
     blob.size<1||blob.size>MAX||typeof blob.slice!=="function"||
     typeof authorize!=="function"||typeof request!=="function"||typeof verifyStored!=="function")fail("invalid_upload");
  const root="https://"+projectRef+".storage.supabase.co", endpoint=root+"/storage/v1/upload/resumable";
  let url=null, attempted=false, complete=false, running=false, terminal=false, offset=0;
  function safeURL(raw){
    if(typeof raw!=="string"||!raw)fail("location_unconfirmed");
    let u;try{u=new URL(raw,endpoint);}catch(_){fail("location_unconfirmed");}
    if(u.origin!==root||u.username||u.password||u.hash||
       !u.pathname.startsWith("/storage/v1/upload/resumable/")||
       u.pathname==="/storage/v1/upload/resumable/")fail("location_unconfirmed");
    return u.href;
  }
  async function send(method,target,headers={},body){
    const auth=await authorize(userId);
    if(auth?.userId!==userId||typeof auth.accessToken!=="string"||!auth.accessToken)fail("account_changed");
    // Never send a credential to a redirected URL.
    const response=await request(target,{method,headers:{"Tus-Resumable":"1.0.0",Authorization:"Bearer "+auth.accessToken,...headers},body,redirect:"error",credentials:"omit",cache:"no-store"});
    return response;
  }
  function readOffset(response){
    const value=response.headers?.get("Upload-Offset");
    if(typeof value!=="string"||!/^[0-9]+$/.test(value))fail("offset_unconfirmed");
    const n=Number(value);
    if(!Number.isSafeInteger(n)||n<0||n>blob.size||(n!==blob.size&&n%CHUNK!==0))fail("offset_unconfirmed");
    return n;
  }
  function metadata(){
    return Object.entries({bucketName:bucket,objectName:path,contentType:"application/json",cacheControl:"0"})
      .map(([key,value])=>key+" "+global.btoa(value)).join(",");
  }
  async function resume(){
    if(running)fail("upload_busy");
    if(terminal)fail("reconciliation_required");
    if(complete)return {stored:true,bytes:blob.size};
    running=true;
    try{
      if(!url){
        if(attempted)fail("creation_unconfirmed");
        // Never repeat a possibly accepted POST automatically.
        attempted=true;
        let response;
        try{response=await send("POST",endpoint,{"Upload-Length":String(blob.size),"Upload-Metadata":metadata()});}
        catch(e){terminal=true;throw e;}
        if(response.status!==201){terminal=true;fail("creation_unconfirmed");}
        try{url=safeURL(response.headers?.get("Location"));}catch(e){terminal=true;throw e;}
      }else if(offset<blob.size){
        // Retry a known upload URL only, using the server's authoritative offset.
        const response=await send("HEAD",url);
        if(response.status===404||response.status===410){terminal=true;fail("reconciliation_required");}
        if(response.status!==200&&response.status!==204)fail("resume_unconfirmed");
        const length=response.headers?.get("Upload-Length");
        if(length!==String(blob.size)){terminal=true;fail("length_mismatch");}
        const next=readOffset(response);
        if(next<offset){terminal=true;fail("offset_unconfirmed");}
        offset=next;
      }
      progress(offset,blob.size);
      while(offset<blob.size){
        const end=Math.min(offset+CHUNK,blob.size);
        const response=await send("PATCH",url,{"Content-Type":"application/offset+octet-stream","Upload-Offset":String(offset)},blob.slice(offset,end));
        if(response.status===404||response.status===410){terminal=true;fail("reconciliation_required");}
        if(response.status!==204)fail("chunk_unconfirmed");
        const next=readOffset(response);
        if(next!==end)fail("offset_unconfirmed");
        offset=next;
        progress(offset,blob.size);
      }
      // Receipt is separate from bytes sent: require private object readback
      // by the caller, for the exact path, account, size and content digest.
      const auth=await authorize(userId);
      if(auth?.userId!==userId)fail("account_changed");
      if(await verifyStored({userId,bucket,path,blob})!==true)fail("receipt_unconfirmed");
      const after=await authorize(userId);
      if(after?.userId!==userId)fail("account_changed");
      complete=true;return {stored:true,bytes:blob.size};
    }finally{running=false;}
  }
  return Object.freeze({resume,status:()=>({offset,total:blob.size,complete,running,reconciliationRequired:terminal})});
 }
 global.AHAKunstrommetResumableUpload=Object.freeze({create,chunkBytes:CHUNK,maxBytes:MAX});
})(typeof window!=="undefined"?window:globalThis);
