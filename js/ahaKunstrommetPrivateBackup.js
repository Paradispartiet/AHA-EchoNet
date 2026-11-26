// Opt-in staging candidate. No SDK bootstrap, requests or background sync on load.
(function(global){
  "use strict";
  const BUCKET="aha-kunstrommet-private-backups";
  const PILOT_BYTES=6*1024*1024;
  const RESTORE_BYTES=36*1024*1024;
  // Advisory only: the actual aggregate quota must be enforced server-side
  // before enabling the pilot. Concurrent devices can race a client check.
  const ADVISORY_QUOTA=100*1024*1024;
  const INVENTORY_LIMIT=200;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const REV=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/;
  // Must be wired to a dedicated, verified staging deployment before use.
  // A client flag is NOT authorization; RLS and server pilot metadata are required.
  const enabled=()=>global.AHA_KUNSTROMMET_BACKUP_STAGING_ENABLED===true &&
    global.location?.origin==="https://aha-preview.aha-echonet-preview.pages.dev";
  function fail(code){throw Object.assign(new Error(code),{code});}
  function profile(){try{return global.localStorage.getItem("aha_profile_id");}catch(_){return null;}}
  async function account(expected,upload=false){
    if(!enabled())fail("disabled");
    const client=global.AHADb?.getClient?.();
    if(!client?.auth?.getUser||!client?.storage?.from)fail("not_configured");
    const {data,error}=await client.auth.getUser();
    const user=data?.user;
    if(error||!UUID.test(user?.id||"")||user.is_anonymous!==false)fail("login_required");
    if(expected&&user.id!==expected || profile()!==user.id)fail("account_changed");
    if(upload&&user.app_metadata?.aha_kunstrommet_backup_pilot!==true)fail("pilot_required");
    return {id:user.id,bucket:client.storage.from(BUCKET)};
  }
  function payload(data,maxBytes=PILOT_BYTES){
    if(data?.format!=="aha-kunstrommet-v2"||data.version!==2||
       !Number.isInteger(data.width)||!Number.isInteger(data.height)||
       data.width<320||data.height<320||data.width>1600||data.height>1600||
       data.width*data.height>1440000||!Array.isArray(data.layers)||
       data.layers.length<1||data.layers.length>Math.max(8,Math.min(16,Math.floor(7680000/(data.width*data.height)))))fail("invalid_project");
    // Only portable export fields. Do not send local account or collection metadata.
    const portable={format:data.format,version:data.version,width:data.width,height:data.height,
      title:String(data.title||"").slice(0,120),note:String(data.note||"").slice(0,4000),layers:data.layers};
    const blob=new Blob([JSON.stringify(portable)],{type:"application/json"});
    if(blob.size>maxBytes)fail("too_large");
    return {blob,portable};
  }
  function checkPath(project,revision){
    if(!UUID.test(project)||!REV.test(revision))fail("invalid_path");
  }
  async function storageUsage(expected){
    const {id,bucket}=await account(expected);
    const folders=await bucket.list(id,{limit:INVENTORY_LIMIT+1,sortBy:{column:"name",order:"asc"}});
    if(folders.error||!Array.isArray(folders.data)||folders.data.length>INVENTORY_LIMIT)fail("quota_unknown");
    let bytes=0,files=0;
    for(const folder of folders.data){
      if(folder.id!==null||!UUID.test(folder.name))continue;
      await account(id);
      const result=await bucket.list(id+"/"+folder.name,{limit:INVENTORY_LIMIT+1,sortBy:{column:"name",order:"asc"}});
      if(result.error||!Array.isArray(result.data)||result.data.length>INVENTORY_LIMIT)fail("quota_unknown");
      for(const item of result.data){
        if(!REV.test(item.name)||!item.id)continue;
        const size=item.metadata?.size;
        if(!Number.isSafeInteger(size)||size<0||size>RESTORE_BYTES||++files>INVENTORY_LIMIT)fail("quota_unknown");
        bytes+=size;
      }
    }
    await account(id);
    return {bytes,files,quota:ADVISORY_QUOTA};
  }
  async function saveCurrent({confirm}={}){
    const first=await account(null,true);
    const snap=global.AHAKunstrommetV2.cloudSnapshot(first.id);
    if(!UUID.test(snap.projectId))fail("invalid_path");
    const {blob}=payload(snap.data);
    if(typeof confirm!=="function"||!await confirm(blob.size))fail("cancelled");
    const usage=await storageUsage(first.id);
    if(usage.bytes+blob.size>usage.quota)fail("quota_reached");
    const fresh=await account(first.id,true);
    const path=first.id+"/"+snap.projectId+"/"+global.crypto.randomUUID()+".json";
    const {data,error}=await fresh.bucket.upload(path,blob,{contentType:"application/json",upsert:false,cacheControl:"0"});
    if(error||data?.path!==path)fail("upload_unconfirmed");
    await account(first.id);
    return {projectId:snap.projectId,bytes:blob.size};
  }
  async function listProjects(){
    const {id,bucket}=await account();
    const {data,error}=await bucket.list(id,{limit:51,sortBy:{column:"name",order:"asc"}});
    await account(id);
    if(error||!Array.isArray(data))fail("list_failed");
    return {account:id,items:data.filter(x=>x.id===null&&UUID.test(x.name)).slice(0,50).map(x=>x.name),limited:data.length>50};
  }
  async function listRevisions(project,expected){
    if(!UUID.test(project))fail("invalid_path");
    const {id,bucket}=await account(expected);
    const {data,error}=await bucket.list(id+"/"+project,{limit:51,sortBy:{column:"created_at",order:"desc"}});
    await account(id);
    if(error||!Array.isArray(data))fail("list_failed");
    return {items:data.filter(x=>REV.test(x.name)&&x.id).slice(0,50).map(x=>({name:x.name,createdAt:x.created_at||""})),limited:data.length>50};
  }
  async function restore(project,revision,expected){
    checkPath(project,revision);
    const {id,bucket}=await account(expected);
    const {data,error}=await bucket.download(id+"/"+project+"/"+revision);
    await account(id);
    if(error||!data||typeof data.text!=="function"||!Number.isFinite(data.size)||data.size>RESTORE_BYTES)fail("download_failed");
    let parsed;
    try{parsed=JSON.parse(await data.text());}catch(_){fail("invalid_project");}
    const {portable}=payload(parsed,RESTORE_BYTES);
    await account(id);
    // Editor performs full bitmap/mask validation and inserts a new local copy.
    return global.AHAKunstrommetV2.saveCloudCopy(portable,id,()=>account(id));
  }
  const api=Object.freeze({enabled,saveCurrent,listProjects,listRevisions,restore,storageUsage,maxBytes:PILOT_BYTES,maxRestoreBytes:RESTORE_BYTES});
  global.AHAKunstrommetPrivateBackup=api;
  const messages={disabled:"Piloten er ikke aktivert.",not_configured:"Skylagring er ikke konfigurert.",login_required:"Logg inn med AHA-kontoen.",account_changed:"Konto eller lokal profil er endret. Start på nytt.",pilot_required:"Kontoen har ikke pilottilgang.",too_large:"Prosjektet er større enn 6 MiB. Eksporter lokalt.",invalid_project:"Ugyldig prosjektfil.",invalid_path:"Ugyldig prosjektadresse.",cancelled:"Avbrutt. Ingen opplasting.",upload_unconfirmed:"Opplasting ikke bekreftet. Behold den lokale kopien og sjekk listen før nytt forsøk.",list_failed:"Kunne ikke hente listen.",download_failed:"Kunne ikke hente prosjektet.",quota_unknown:"Kunne ikke kontrollere lagringsplassen sikkert. Ingen ny opplasting.",quota_reached:"Pilotens foreløpige lagringsgrense på 100 MiB er nådd."};
  function bind(){
    const doc=global.document, panel=doc?.getElementById("kv2-cloud-backup");
    if(!panel||!enabled())return;
    panel.hidden=false;
    const $=name=>doc.getElementById("kv2-cloud-"+name);
    const projects=$("project"),revisions=$("revision");
    let expected=null,working=false;
    const message=t=>{$("status").textContent=t;};
    const reset=(select,label)=>{select.replaceChildren();const o=doc.createElement("option");o.value="";o.textContent=label;select.appendChild(o);};
    const add=(select,value,label)=>{const o=doc.createElement("option");o.value=value;o.textContent=label;select.appendChild(o);};
    function controls(){ $("save").disabled=working;$("list").disabled=working;projects.disabled=working||!expected||projects.options.length<2;revisions.disabled=working||revisions.options.length<2;$("restore").disabled=working||!expected||!projects.value||!revisions.value;}
    async function run(fn){if(working)return;working=true;controls();try{await fn();}catch(e){message(messages[e?.code]||"Handlingen ble ikke bekreftet. Det åpne prosjektet er ikke erstattet.");}finally{working=false;controls();}}
    $("save").addEventListener("click",()=>run(async()=>{
      const result=await saveCurrent({confirm:bytes=>global.confirm("Lagre privat prosjektkopi ("+(bytes/1048576).toFixed(2)+" MiB), inkludert tittel, notat og alle lag? Kopien er ikke ende-til-ende-kryptert.")});
      message("Ny skybackup bekreftet. Lagre også lokalt.");
    }));
    $("list").addEventListener("click",()=>run(async()=>{
      expected=null;reset(projects,"Velg prosjekt");reset(revisions,"Velg versjon");
      const result=await listProjects();expected=result.account;
      result.items.forEach((id,i)=>add(projects,id,"Prosjekt "+(i+1)+" · "+id.slice(0,8)));
      message(result.limited?"Viser inntil 50 prosjekter.":result.items.length?"Velg et prosjekt.":"Ingen skybackuper.");
    }));
    projects.addEventListener("change",()=>run(async()=>{
      reset(revisions,"Velg versjon");
      if(!projects.value||!expected)return;
      const result=await listRevisions(projects.value,expected);
      result.items.forEach(x=>add(revisions,x.name,(x.createdAt?new Date(x.createdAt).toLocaleString("no-NO")+" · ":"")+x.name.slice(0,8)));
      message(result.limited?"Viser inntil 50 versjoner.":"Velg en versjon.");
    }));
    revisions.addEventListener("change",controls);
    $("restore").addEventListener("click",()=>run(async()=>{
      if(!global.confirm("Hent en ny lokal kopi? Det åpne kunstverket beholdes."))return;
      await restore(projects.value,revisions.value,expected);
      message("Lokal kopi lagret i Mine prosjekter. Det åpne kunstverket er beholdt.");
    }));
    controls();
  }
  bind();
})(window);
