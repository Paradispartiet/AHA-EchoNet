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
  const SLOT_TABLE="aha_kunstrommet_backup_slots", MAX_SLOTS=16;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const REV=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/;
  // Must be wired to a dedicated, verified staging deployment before use.
  // A client flag is NOT authorization; RLS and server pilot metadata are required.
  const enabled=()=>global.AHA_KUNSTROMMET_BACKUP_STAGING_ENABLED===true &&
    global.location?.origin==="https://aha-preview.aha-echonet-preview.pages.dev";
  // Separate, deliberately off staging gate. Never target the known production project.
  function tusRef(){
    const ref=global.AHA_KUNSTROMMET_TUS_STAGING_PROJECT_REF;
    return enabled()&&global.AHA_KUNSTROMMET_TUS_STAGING_ENABLED===true&&
      /^[a-z0-9]{20}$/.test(ref||"")&&ref!=="wshmybqyksrwkawqleiz"&&
      global.AHA_SUPABASE_URL==="https://"+ref+".supabase.co" ? ref:null;
  }
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
    return {id:user.id,bucket:client.storage.from(BUCKET),client};
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
  async function reservePath(expected,path){
    const {id,client}=await account(expected,true);
    if(typeof client.from!=="function")fail("reservation_unavailable");
    const result=await client.from(SLOT_TABLE).select("slot").eq("user_id",id);
    if(result.error||!Array.isArray(result.data)||result.data.length>MAX_SLOTS)fail("reservation_unavailable");
    const used=new Set(result.data.map(x=>x.slot));
    if([...used].some(x=>!Number.isInteger(x)||x<1||x>MAX_SLOTS))fail("reservation_unavailable");
    const slot=Array.from({length:MAX_SLOTS},(_,i)=>i+1).find(x=>!used.has(x));
    if(!slot)fail("slots_full");
    const fresh=await account(id,true);
    const receipt=await fresh.client.from(SLOT_TABLE).insert({user_id:id,slot,object_name:path}).select("slot,object_name").single();
    if(receipt.error||receipt.data?.slot!==slot||receipt.data?.object_name!==path)fail("reservation_unconfirmed");
    await account(id,true);
  }
  async function saveCurrent({confirm}={}){
    const first=await account(null,true);
    const snap=global.AHAKunstrommetV2.cloudSnapshot(first.id);
    if(!UUID.test(snap.projectId))fail("invalid_path");
    const {blob}=payload(snap.data);
    if(typeof confirm!=="function"||!await confirm(blob.size))fail("cancelled");
    const usage=await storageUsage(first.id);
    if(usage.bytes+blob.size>usage.quota)fail("quota_reached");
    const path=first.id+"/"+snap.projectId+"/"+global.crypto.randomUUID()+".json";
    await reservePath(first.id,path);
    const fresh=await account(first.id,true);
    const {data,error}=await fresh.bucket.upload(path,blob,{contentType:"application/json",upsert:false,cacheControl:"0"});
    if(error||data?.path!==path)fail("upload_unconfirmed");
    await account(first.id);
    return {projectId:snap.projectId,bytes:blob.size};
  }
  async function prepareResumable({confirm,progress=()=>{}}={}){
    const ref=tusRef();
    if(!ref||!global.AHAKunstrommetResumableUpload||!global.crypto?.subtle||!global.fetch)fail("tus_disabled");
    const first=await account(null,true);
    const expectedURL="https://"+ref+".supabase.co";
    if(first.client.supabaseUrl!==expectedURL)fail("tus_disabled");
    const snap=global.AHAKunstrommetV2.cloudSnapshot(first.id);
    if(!UUID.test(snap.projectId))fail("invalid_path");
    // TUS transport can handle 36 MiB, but server pilot allocation is still 6 MiB.
    const {blob}=payload(snap.data);
    if(typeof confirm!=="function"||!await confirm(blob.size))fail("cancelled");
    const usage=await storageUsage(first.id);
    if(usage.bytes+blob.size>usage.quota)fail("quota_reached");
    const path=first.id+"/"+snap.projectId+"/"+global.crypto.randomUUID()+".json";
    async function checked(expected){
      if(tusRef()!==ref)fail("tus_disabled");
      const fresh=await account(expected,true);
      if(fresh.client!==first.client||fresh.client.supabaseUrl!==expectedURL)fail("account_changed");
      return fresh;
    }
    async function authorize(expected){
      const fresh=await checked(expected);
      const session=await fresh.client.auth.getSession();
      const token=session.data?.session?.access_token;
      if(session.error||!token||session.data.session.user?.id!==expected)fail("account_changed");
      const verified=await fresh.client.auth.getUser(token);
      const user=verified.data?.user;
      if(verified.error||user?.id!==expected||user.is_anonymous!==false||
         user.app_metadata?.aha_kunstrommet_backup_pilot!==true||profile()!==expected||tusRef()!==ref)fail("account_changed");
      return {userId:expected,accessToken:token};
    }
    // Verify the exact immutable upload after completion, not just the server offset.
    const digest=async b=>new Uint8Array(await global.crypto.subtle.digest("SHA-256",await b.arrayBuffer()));
    const expectedDigest=await digest(blob);
    const job=global.AHAKunstrommetResumableUpload.create({projectRef:ref,bucket:BUCKET,path,userId:first.id,blob,
      authorize,request:(url,options)=>global.fetch(url,options),progress,
      verifyStored:async()=>{
        const fresh=await checked(first.id);
        const result=await fresh.bucket.download(path);
        if(result.error||result.data?.size!==blob.size)return false;
        const actual=await digest(result.data);
        await checked(first.id);
        return expectedDigest.every((x,i)=>x===actual[i]);
      }
    });
    await checked(first.id);
    await reservePath(first.id,path);
    return job;
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
  async function removeRevision(project,revision,expected,{confirmed=false}={}){
    checkPath(project,revision);
    if(confirmed!==true)fail("cancelled");
    if(!UUID.test(expected||""))fail("account_changed");
    const {id,bucket}=await account(expected);
    const prefix=id+"/"+project,path=prefix+"/"+revision;
    const result=await bucket.remove([path]);
    await account(id);
    if(result.error||!Array.isArray(result.data)||result.data.length!==1||result.data[0]?.name!==path)fail("delete_unconfirmed");
    const check=await bucket.list(prefix,{limit:51,search:revision});
    await account(id);
    if(check.error||!Array.isArray(check.data)||check.data.length>50||check.data.some(x=>x.name===revision))fail("delete_unconfirmed");
    return {removed:true,slotReleased:false};
  }
  const api=Object.freeze({enabled,tusEnabled:()=>Boolean(tusRef()),prepareResumable,saveCurrent,listProjects,listRevisions,restore,storageUsage,removeRevision,maxBytes:PILOT_BYTES,maxRestoreBytes:RESTORE_BYTES});
  global.AHAKunstrommetPrivateBackup=api;
  const messages={disabled:"Piloten er ikke aktivert.",not_configured:"Skylagring er ikke konfigurert.",login_required:"Logg inn med AHA-kontoen.",account_changed:"Konto eller lokal profil er endret. Start på nytt.",pilot_required:"Kontoen har ikke pilottilgang.",too_large:"Prosjektet er større enn 6 MiB. Eksporter lokalt.",invalid_project:"Ugyldig prosjektfil.",invalid_path:"Ugyldig prosjektadresse.",cancelled:"Avbrutt. Ingen opplasting.",upload_unconfirmed:"Opplasting ikke bekreftet. Behold den lokale kopien og sjekk listen før nytt forsøk.",list_failed:"Kunne ikke hente listen.",download_failed:"Kunne ikke hente prosjektet.",quota_unknown:"Kunne ikke kontrollere lagringsplassen sikkert. Ingen ny opplasting.",quota_reached:"Pilotens foreløpige lagringsgrense på 100 MiB er nådd.",slots_full:"Alle 16 pilotplasser er reservert. Lokal lagring fungerer.",reservation_unavailable:"Kunne ikke kontrollere serverens pilotplasser.",reservation_unconfirmed:"Reservering ikke bekreftet. Ingen ny opplasting.",delete_unconfirmed:"Sletting ikke bekreftet. Hent listen på nytt.",tus_disabled:"Avbruddsrobust opplasting er ikke konfigurert i staging.",receipt_unconfirmed:"Opplasting sendt, men innholdet er ikke bekreftet. Prøv å bekrefte på nytt.",reconciliation_required:"Opplastingen må avstemmes. Ikke start en ny automatisk.",creation_unconfirmed:"Starten av opplastingen er ikke bekreftet. Ikke start en ny automatisk."};
  function bind(){
    const doc=global.document, panel=doc?.getElementById("kv2-cloud-backup");
    if(!panel||!enabled())return;
    panel.hidden=false;
    const $=name=>doc.getElementById("kv2-cloud-"+name);
    const projects=$("project"),revisions=$("revision");
    let expected=null,working=false,pending=null;
    const resumable=tusRef()!==null;
    const transfer=$("transfer");
    transfer.hidden=!resumable;
    function showProgress(done,total){
      $("progress").max=total||1;$("progress").value=done;
      $("progress-text").textContent=(done/1048576).toFixed(2)+" / "+(total/1048576).toFixed(2)+" MiB";
    }
    async function resumePending(){
      if(!pending)return;
      try{
        await pending.resume();
        pending=null;
        message("Ny skybackup bekreftet med SHA-256. Lagre også lokalt.");
      }catch(e){
        const state=pending.status();
        showProgress(state.offset,state.total);
        message(state.reconciliationRequired?"Ubekreftet opplasting. Kontakt pilotansvarlig; ingen ny opplasting er startet.":(messages[e?.code]||"Opplasting avbrutt eller ubekreftet. Fortsett i samme fane."));
      }
    }
    const message=t=>{$("status").textContent=t;};
    const reset=(select,label)=>{select.replaceChildren();const o=doc.createElement("option");o.value="";o.textContent=label;select.appendChild(o);};
    const add=(select,value,label)=>{const o=doc.createElement("option");o.value=value;o.textContent=label;select.appendChild(o);};
    function controls(){
      $("save").disabled=working||!!pending;$("list").disabled=working;
      projects.disabled=working||!expected||projects.options.length<2;revisions.disabled=working||revisions.options.length<2;
      $("restore").disabled=working||!expected||!projects.value||!revisions.value;$("delete").disabled=$("restore").disabled;
      $("resume").disabled=working||!pending||pending.status().reconciliationRequired;
      $("discard").disabled=working||!pending;
    }
    async function run(fn){if(working)return;working=true;controls();try{await fn();}catch(e){message(messages[e?.code]||"Handlingen ble ikke bekreftet. Det åpne prosjektet er ikke erstattet.");}finally{working=false;controls();}}
    $("save").addEventListener("click",()=>run(async()=>{
      const confirm=bytes=>global.confirm("Lagre privat prosjektkopi ("+(bytes/1048576).toFixed(2)+" MiB), inkludert tittel, notat og alle lag? Kopien er ikke ende-til-ende-kryptert.");
      if(resumable){
        pending=await prepareResumable({confirm,progress:showProgress});
        showProgress(0,pending.status().total);
        await resumePending();
      }else{
        await saveCurrent({confirm});
        message("Ny skybackup bekreftet. Lagre også lokalt.");
      }
    }));
    $("resume").addEventListener("click",()=>run(resumePending));
    $("discard").addEventListener("click",()=>run(async()=>{
      if(!global.confirm("Avslutte denne lokale opplastingsøkten? En eventuell skyfil eller reservasjon beholdes for avstemming."))return;
      pending=null;showProgress(0,0);
      message("Lokal opplastingsøkt avsluttet. Ingen skyfil eller reservasjon er slettet.");
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
    $("delete").addEventListener("click",()=>run(async()=>{
      if(!global.confirm("Slette denne ene skyversjonen permanent? Lokale kopier beholdes. Pilotplassen frigjøres ikke automatisk."))return;
      await removeRevision(projects.value,revisions.value,expected,{confirmed:true});
      reset(revisions,"Velg versjon");
      message("Skyversjonen er slettet. Lokale kopier er beholdt. Oppdater listen for å fortsette.");
    }));
    controls();
  }
  bind();
})(window);
