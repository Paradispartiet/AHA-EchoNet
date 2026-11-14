#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const POLICY_PATH = path.join(__dirname, "..", "ops", "social-staging-media-maintenance-v1.json");
const BLOCKED_PROJECTS = new Set(["sstuzwppsheivczyqrim", "wshmybqyksrwkawqleiz"]);
const ROLE_SQL = [
  "select json_build_object(",
  "'schemaPresent', to_regclass('aha_social.media') is not null,",
  "'mayPurge', has_function_privilege(current_user,'aha_social.purge_expired_media_v1()','EXECUTE'),",
  "'isRuntime', current_user like 'aha_runtime%',",
  "'database', current_database());"
].join(" ");
const PREVIEW_SQL = [
  "select json_build_object(",
  "'count',count(*),'bytes',coalesce(sum(octet_length(m.bytes)),0),",
  "'expiredPending',count(*) filter (where m.post_id is null and m.created_at < now()-interval '24 hours'),",
  "'expiredPendingBytes',coalesce(sum(octet_length(m.bytes)) filter (where m.post_id is null and m.created_at < now()-interval '24 hours'),0),",
  "'expiredDeleted',count(*) filter (where p.state='deleted' and p.deleted_at < now()-interval '30 days'),",
  "'expiredDeletedBytes',coalesce(sum(octet_length(m.bytes)) filter (where p.state='deleted' and p.deleted_at < now()-interval '30 days'),0)",
  ") from aha_social.media m left join aha_social.posts p on p.id=m.post_id;"
].join(" ");
const PURGE_SQL = "select aha_social.purge_expired_media_v1();";

// Keep the retention eligibility check and the destructive function call
// in one PostgreSQL transaction. Write locks on BOTH tables block any
// concurrent upload, deletion or moderation change until commit/rollback.
function atomicPurgeSql(expectedCount,expectedBytes) {
 if (!Number.isSafeInteger(expectedCount) || expectedCount<1 || expectedCount>1000000 ||
     !Number.isSafeInteger(expectedBytes) || expectedBytes<0 || expectedBytes>67108864) {
  throw new Error("Invalid confirmed staging purge totals");
 }
 return [
  "BEGIN;",
  "LOCK TABLE aha_social.posts, aha_social.media IN SHARE ROW EXCLUSIVE MODE;",
  "DO $social_purge$ DECLARE v_count bigint; v_bytes bigint; v_deleted integer; BEGIN",
  "SELECT count(*),coalesce(sum(octet_length(m.bytes)),0)",
  "INTO v_count,v_bytes FROM aha_social.media m",
  "LEFT JOIN aha_social.posts p ON p.id=m.post_id",
  "WHERE (m.post_id IS NULL AND m.created_at<now()-interval '24 hours')",
  "OR (p.state='deleted' AND p.deleted_at<now()-interval '30 days');",
  "IF v_count <> "+expectedCount+" OR v_bytes <> "+expectedBytes+" THEN",
  "RAISE EXCEPTION 'staging media totals changed; purge aborted'; END IF;",
  "SELECT aha_social.purge_expired_media_v1() INTO v_deleted;",
  "IF v_deleted <> "+expectedCount+" THEN",
  "RAISE EXCEPTION 'staging media deleted count changed; purge rolled back'; END IF;",
  "END $social_purge$;",
  "COMMIT;",
  "SELECT "+expectedCount+"::integer;"
 ].join("\n");
}

function loadPolicy() { return JSON.parse(fs.readFileSync(POLICY_PATH,"utf8")); }
function validate(mode, env, policy, readFile=fs.readFileSync) {
  if (mode==="plan") return { mode, authorized:false };
  if (!["preview","purge"].includes(mode)) throw new Error("Invalid maintenance action");
  const ref=String(policy.stagingProjectRef||"");
  if (policy.status!=="approved_separate_social_staging" ||
      !/^[a-z0-9]{20}$/.test(ref) || BLOCKED_PROJECTS.has(ref) ||
      policy.previewAuthorized!==true || (mode==="purge" && policy.purgeAuthorized!==true)) {
    throw new Error("Separate social staging database is not approved");
  }
  if (env.AHA_SOCIAL_MAINTENANCE_ENV!=="staging" ||
      env.AHA_SOCIAL_MAINTENANCE_EXPECTED_PROJECT_REF!==ref ||
      env.AHA_SOCIAL_MAINTENANCE_CONFIRMATION!==
        (mode==="purge"?"RUN_AHA_SOCIAL_STAGE_MEDIA_PURGE":"CHECK_AHA_SOCIAL_STAGE_MEDIA")) {
    throw new Error("Exact operator acknowledgement and project confirmation required");
  }
  let url;
  try {url=new URL(String(env.AHA_SOCIAL_STAGING_ADMIN_DATABASE_URL||""));}
  catch {throw new Error("Valid staging database URL required");}
  if (!["postgres:","postgresql:"].includes(url.protocol) ||
      url.search || url.hash || !url.username || !url.password ||
      !url.hostname || decodeURIComponent(url.pathname.slice(1))!==policy.databaseName) {
    throw new Error("Staging database URL cannot override TLS or database identity");
  }
  const user=decodeURIComponent(url.username);
  const direct=url.hostname==="db."+ref+".supabase.co";
  const pooler=url.hostname.endsWith(".pooler.supabase.com") && user.endsWith("."+ref);
  if (!direct && !pooler) throw new Error("Target is not the separately approved social staging project");
  const ca=String(env.AHA_SOCIAL_STAGING_CA_FILE||"");
  let pem;
  try {pem=readFile(ca,"utf8");}
  catch {throw new Error("Pinned staging CA is required");}
  if (!pem.includes("-----BEGIN CERTIFICATE-----") || !pem.includes("-----END CERTIFICATE-----")) {
    throw new Error("Invalid staging CA file");
  }
  return {mode,authorized:true,pg:{
    PGHOST:url.hostname,PGPORT:url.port||"5432",PGDATABASE:policy.databaseName,
    PGUSER:user,PGPASSWORD:decodeURIComponent(url.password),
    PGSSLMODE:"verify-full",PGSSLROOTCERT:ca,PGCONNECT_TIMEOUT:"5"
  }};
}
function run(mode,env=process.env,policy=loadPolicy(),spawn=spawnSync,readFile=fs.readFileSync) {
  const checked=validate(mode,env,policy,readFile);
  if (mode==="plan") return {mode,connected:false,changed:false,authorized:false};
  const childEnv={...env,...checked.pg};
  for (const name of ["PGHOSTADDR","PGSERVICE","PGSERVICEFILE","PGSSLCERT","PGSSLKEY","PGSSLPASSWORD"]) {
    delete childEnv[name];
  }
  function query(sql,readOnly) {
    const options={...childEnv,
      PGOPTIONS:"-c statement_timeout=8000 -c lock_timeout=2000"+
        (readOnly?" -c default_transaction_read_only=on":"")};
    const result=spawn("psql",["-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-c",sql],
      {env:options,encoding:"utf8",timeout:12000,maxBuffer:65536,shell:false});
    if (result.error || result.status!==0) {
      throw new Error("Staging SQL check failed; credentials and SQL output are not displayed");
    }
    return String(result.stdout||"").trim();
  }
  const role=JSON.parse(query(ROLE_SQL,true));
  if (!role.schemaPresent || !role.mayPurge || role.isRuntime ||
      role.database!==policy.databaseName) {
    throw new Error("Staging schema or operator privileges failed safety checks");
  }
  const before=JSON.parse(query(PREVIEW_SQL,true));
  if (mode==="preview") return {mode,connected:true,changed:false,totals:before};

  // A destructive operator action is allowed only for the exact number and
  // total bytes previously reviewed during a separate read-only preview.
  // Recheck from the live database immediately before invoking the purge
  // function. Any drift fails closed without calling the write function.
  function boundedExpected(value, max) {
    if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,9})$/.test(value)) return null;
    const count=Number(value);
    return Number.isSafeInteger(count) && count<=max ? count : null;
  }
  const expectedCount=boundedExpected(env.AHA_SOCIAL_MAINTENANCE_EXPECTED_PURGE_COUNT,1000000);
  const expectedBytes=boundedExpected(env.AHA_SOCIAL_MAINTENANCE_EXPECTED_PURGE_BYTES,67108864);
  const counts=[before.expiredPending,before.expiredDeleted,
    before.expiredPendingBytes,before.expiredDeletedBytes];
  if (counts.some(n=>!Number.isSafeInteger(n)||n<0)) {
    throw new Error("Staging expiry summary was invalid; purge not attempted");
  }
  const actualCount=counts[0]+counts[1];
  const actualBytes=counts[2]+counts[3];
  if (expectedCount===null || expectedBytes===null || actualCount===0 ||
      actualCount!==expectedCount || actualBytes!==expectedBytes) {
    throw new Error("Staging expiry figures changed or were not explicitly confirmed; purge not attempted");
  }
  const deleted=Number(query(atomicPurgeSql(expectedCount,expectedBytes),false));
  if (!Number.isSafeInteger(deleted) || deleted<0) throw new Error("Invalid purge count");
  const after=JSON.parse(query(PREVIEW_SQL,true));
  return {mode,connected:true,changed:true,deleted,
    reviewed:{count:expectedCount,bytes:expectedBytes},
    countChangedDuringPurge:deleted!==expectedCount,
    totalsBefore:before,totalsAfter:after};
}
if (require.main===module) {
  try {
    const mode={"--plan":"plan","--preview":"preview","--purge":"purge"}[process.argv[2]||"--plan"];
    if (!mode) throw new Error("Use --plan, --preview or --purge");
    process.stdout.write(JSON.stringify(run(mode))+"\n");
  } catch (error) {
    process.stderr.write("AHA staging media maintenance: "+error.message+"\n");
    process.exitCode=1;
  }
}
module.exports={loadPolicy,validate,run,PREVIEW_SQL,ROLE_SQL,PURGE_SQL,atomicPurgeSql};
