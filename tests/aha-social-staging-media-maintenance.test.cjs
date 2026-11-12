const test=require("node:test");
const assert=require("node:assert/strict");
const {loadPolicy,validate,run,PREVIEW_SQL,PURGE_SQL}=
 require("../scripts/aha-social-staging-media-maintenance.cjs");

const ref="aaaaaaaaaaaaaaaaaaaa";
const policy={status:"approved_separate_social_staging",stagingProjectRef:ref,
  databaseName:"postgres",previewAuthorized:true,purgeAuthorized:false};
const env={
  AHA_SOCIAL_MAINTENANCE_ENV:"staging",
  AHA_SOCIAL_MAINTENANCE_EXPECTED_PROJECT_REF:ref,
  AHA_SOCIAL_MAINTENANCE_CONFIRMATION:"CHECK_AHA_SOCIAL_STAGE_MEDIA",
  AHA_SOCIAL_STAGING_ADMIN_DATABASE_URL:"postgresql://operator:synthetic-secret@db."+ref+".supabase.co/postgres",
  AHA_SOCIAL_STAGING_CA_FILE:"/test/certificate.crt"
};
const readCA=()=>"-----BEGIN CERTIFICATE-----\nsynthetic-test\n-----END CERTIFICATE-----";

test("default policy denies all database access",()=>{
 const actual=loadPolicy();
 assert.equal(actual.stagingProjectRef,null);
 assert.equal(actual.previewAuthorized,false);
 assert.equal(actual.purgeAuthorized,false);
 let requests=0;
 const fake=()=>{requests++;throw Error("no DB allowed");};
 assert.equal(run("plan",{},actual,fake,readCA).connected,false);
 assert.throws(()=>run("preview",env,actual,fake,readCA),/not approved/);
 assert.throws(()=>run("purge",env,actual,fake,readCA),/not approved/);
 assert.equal(requests,0);
});
test("rejects wrong DSN, missing authorization and TLS downgrade before network",()=>{
 assert.equal(validate("preview",env,policy,readCA).pg.PGSSLMODE,"verify-full");
 const invalid=[
  {AHA_SOCIAL_MAINTENANCE_CONFIRMATION:""},
  {AHA_SOCIAL_MAINTENANCE_ENV:"production"},
  {AHA_SOCIAL_MAINTENANCE_EXPECTED_PROJECT_REF:"other"},
  {AHA_SOCIAL_STAGING_ADMIN_DATABASE_URL:"postgresql://operator:pw@localhost/postgres"},
  {AHA_SOCIAL_STAGING_ADMIN_DATABASE_URL:"postgresql://operator:pw@db."+ref+".supabase.co/postgres?sslmode=disable"},
  {AHA_SOCIAL_STAGING_ADMIN_DATABASE_URL:"postgresql://operator:pw@db."+ref+".supabase.co/other"},
  {AHA_SOCIAL_STAGING_ADMIN_DATABASE_URL:"postgresql://operator:pw@db.sstuzwppsheivczyqrim.supabase.co/postgres"}
 ];
 for(const x of invalid)assert.throws(()=>validate("preview",{...env,...x},policy,readCA));
 for(const blocked of ["sstuzwppsheivczyqrim","wshmybqyksrwkawqleiz"])
  assert.throws(()=>validate("preview",env,{...policy,stagingProjectRef:blocked},readCA));
 assert.throws(()=>validate("preview",env,policy,()=>""),/Invalid staging CA/);
});
test("preview uses read-only aggregate queries and never reveals connection secrets in process args",()=>{
 const calls=[];
 const totals={count:3,bytes:3000,expiredPending:1,expiredPendingBytes:1000,expiredDeleted:0,expiredDeletedBytes:0};
 const fake=(exe,args,opts)=>{
  calls.push({exe,args,opts});
  assert.equal(exe,"psql");
  assert.equal(opts.shell,false);
  assert.equal(opts.env.PGSSLMODE,"verify-full");
  assert.match(opts.env.PGOPTIONS,/default_transaction_read_only=on/);
  assert.equal(opts.env.PGPASSWORD,"synthetic-secret");
  assert.ok(!args.join(" ").includes("synthetic-secret"));
  const data=args.at(-1).includes("has_function_privilege")
    ? {schemaPresent:true,mayPurge:true,isRuntime:false,database:"postgres"}:totals;
  return {status:0,stdout:JSON.stringify(data)};
 };
 const result=run("preview",env,policy,fake,readCA);
 assert.equal(result.changed,false);
 assert.deepEqual(result.totals,totals);
 assert.equal(calls.length,2);
 assert.ok(!PREVIEW_SQL.includes("select m.bytes"));
});
test("purge requires second authorization and uses only dedicated operator function",()=>{
 let calls=0;
 const noNetwork=()=>{calls++;throw Error("network not allowed");};
 assert.throws(()=>run("purge",env,policy,noNetwork,readCA),/not approved/);
 assert.throws(()=>run("purge",env,{...policy,purgeAuthorized:true},noNetwork,readCA),/acknowledgement/);
 assert.equal(calls,0);
 const approved={...env,AHA_SOCIAL_MAINTENANCE_CONFIRMATION:"RUN_AHA_SOCIAL_STAGE_MEDIA_PURGE"};
 const sql=[];
 const fake=(_exe,args,opts)=>{
  sql.push({query:args.at(-1),options:opts.env.PGOPTIONS});
  if(args.at(-1).includes("has_function_privilege"))
    return {status:0,stdout:JSON.stringify({schemaPresent:true,mayPurge:true,isRuntime:false,database:"postgres"})};
  if(args.at(-1)===PURGE_SQL)return {status:0,stdout:"2"};
  return {status:0,stdout:JSON.stringify({count:0,bytes:0})};
 };
 const result=run("purge",approved,{...policy,purgeAuthorized:true},fake,readCA);
 assert.equal(result.deleted,2);
 assert.equal(sql.length,4);
 assert.equal(sql[2].query,PURGE_SQL);
 assert.doesNotMatch(sql[2].options,/default_transaction_read_only/);
});
test("failed role preflight never purges",()=>{
 let calls=0;
 const fake=()=>{calls++;return {status:0,stdout:JSON.stringify({schemaPresent:true,mayPurge:false,isRuntime:true,database:"postgres"})};};
 assert.throws(()=>run("preview",env,policy,fake,readCA),/safety checks/);
 assert.equal(calls,1);
});
