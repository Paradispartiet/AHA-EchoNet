"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {spawnSync} = require("node:child_process");

const workflow=fs.readFileSync(".github/workflows/aha-db03-encrypted-backup-manual.yml","utf8");
const script="scripts/aha-db03-backup-github.sh";
assert.match(workflow,/^\s+workflow_dispatch:\s*$/m,"Workflow must remain manual-only");
assert.doesNotMatch(workflow,/^\s+(?:push|pull_request|schedule|workflow_run):\s*$/m);
assert.match(workflow,/inputs\.confirm_export == true/);
assert.match(workflow,/vars\.AHA_DB03_BACKUP_ENABLED == 'yes'/);
assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
assert.match(workflow,/environment: aha-db03-backup/);
assert.match(workflow,/permissions:\s*\n\s+contents: read/);
assert.match(workflow,/AHA_DB03_MANUAL_EXPORT_ACK: 'yes'/);
assert.match(workflow,/retention-days: 7/);
assert.match(workflow,/if-no-files-found: error/);
assert.match(workflow,/\.dump\.age/);
assert.doesNotMatch(workflow,/\.sql\b|\.dump\b(?!\.age)/,"No plaintext dump files in artifact paths");
assert.match(workflow,/uses: actions\/upload-artifact@v4/);
const syntax=spawnSync("bash",["-n",script],{encoding:"utf8"});
assert.equal(syntax.status,0,syntax.stderr);

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"aha-db03-gh-synthetic-"));
const fakeBin=path.join(tmp,"bin");
fs.mkdirSync(fakeBin);
fs.writeFileSync(path.join(fakeBin,"docker"),
  "#!/usr/bin/env bash\n"+
  "set -euo pipefail\n"+
  "if [[ \"$MOCK_DUMP_FAIL\" == yes ]]; then echo 'synthetic read error' >&2; exit 19; fi\n"+
  "if [[ -z \"$PGDATABASE\" ]]; then exit 20; fi\n"+
  "printf 'SYNTHETIC-NOT-A-REAL-DATABASE' \n",
  {mode:0o755});
fs.writeFileSync(path.join(fakeBin,"age"),
  "#!/usr/bin/env bash\n"+
  "set -euo pipefail\n"+
  "output=''\n"+
  "while [[ $# -gt 0 ]]; do\n"+
  "  case \"$1\" in -o) output=\"$2\"; shift 2;; *) shift;; esac\n"+
  "done\n"+
  "cat >/dev/null\n"+
  "printf 'age-encryption.org/v1\\nMOCK-ENCRYPTED-NO-CONTENT\\n' > \"$output\"\n",
  {mode:0o755});

const recipient="age1"+"q".repeat(58);
const secret="canary-fake-db-password";
const validUrl="postgresql://postgres.wshmybqyksrwkawqleiz:"+secret+
  "@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
function invoke(overrides={}){
  const dir=fs.mkdtempSync(path.join(tmp,"runner-"));
  const env={...process.env,
    PATH:fakeBin+path.delimiter+process.env.PATH,
    GITHUB_ACTIONS:"true",
    GITHUB_REF:"refs/heads/main",
    RUNNER_TEMP:dir,
    AHA_DB03_BACKUP_ENABLED:"yes",
    AHA_DB03_MANUAL_EXPORT_ACK:"yes",
    AHA_DB03_DATABASE_URL:validUrl,
    AHA_DB03_AGE_RECIPIENT:recipient,
    MOCK_DUMP_FAIL:"no",
    ...overrides
  };
  const result=spawnSync("bash",[script],{env,encoding:"utf8",timeout:15000});
  assert.equal(result.stdout.includes(secret),false,"Never print the password");
  assert.equal(result.stderr.includes(secret),false,"Never print the password");
  return {result,dir};
}
try{
  const ok=invoke();
  assert.equal(ok.result.status,0,ok.result.stderr);
  const output=path.join(ok.dir,"aha-db03-encrypted");
  const filenames=fs.readdirSync(output);
  assert.equal(filenames.filter(x=>x.endsWith(".dump.age")).length,1);
  assert.equal(filenames.filter(x=>x.endsWith(".manifest.json")).length,1);
  assert.equal(filenames.some(x=>x.endsWith(".sql")||x.endsWith(".partial")||x.endsWith(".dump")),false);
  const manifest=JSON.parse(fs.readFileSync(path.join(output,"AHA-DB03.manifest.json"),"utf8"));
  assert.equal(manifest.project_ref,"wshmybqyksrwkawqleiz");
  assert.equal(manifest.restore_tested,false);
  assert.equal(manifest.approval,"NOT_APPROVED_FOR_WRITES");
  assert.equal(manifest.encrypted_sha256.length,64);
  for(const env of [
    {AHA_DB03_BACKUP_ENABLED:"no"},
    {AHA_DB03_MANUAL_EXPORT_ACK:"no"},
    {GITHUB_REF:"refs/heads/fake-branch"},
    {AHA_DB03_DATABASE_URL:"postgresql://postgres:fake@db.other.supabase.co:5432/postgres"},
    {AHA_DB03_DATABASE_URL:validUrl.replace(":5432/",":6543/")},
    {AHA_DB03_DATABASE_URL:validUrl + "?host=db.other.supabase.co"},
    {AHA_DB03_DATABASE_URL:validUrl + "?sslmode=prefer"},
    {AHA_DB03_DATABASE_URL:validUrl + "?sslmode=require&sslmode=disable"},
    {AHA_DB03_DATABASE_URL:validUrl.replace("eu-west-1", "eu-west-2")},
    {AHA_DB03_AGE_RECIPIENT:"not-an-age-recipient"},
    {MOCK_DUMP_FAIL:"yes"}
  ]){
    const failed=invoke(env);
    assert.notEqual(failed.result.status,0,"Invalid backup environment must fail");
    const folder=path.join(failed.dir,"aha-db03-encrypted");
    if(fs.existsSync(folder)){
      assert.equal(fs.readdirSync(folder).some(x=>x.endsWith(".dump.age")),false,
        "A failed export may not expose a completed artifact");
    }
  }
  console.log("AHA iPad GitHub encrypted-backup workflow: synthetic PASS (no live DB accessed)");
}finally{
  fs.rmSync(tmp,{recursive:true,force:true});
}
