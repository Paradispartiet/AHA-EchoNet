"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const script = path.join(__dirname,"..","scripts","aha-db03-backup-encrypted.sh");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),"aha-db03-synthetic-"));
const bin = path.join(tmp,"bin");
fs.mkdirSync(bin);
const executable = (name, lines) => {
  fs.writeFileSync(path.join(bin,name),
    ["#!/usr/bin/env bash","set -euo pipefail",...lines].join("\n") + "\n",
    {mode:0o755});
};
executable("pg_dump",[
  'if [[ "$1" == "--version" ]]; then echo "pg_dump (PostgreSQL) 17.6"; exit 0; fi',
  'if [[ "$MOCK_DUMP_FAIL" == 1 ]]; then echo "synthetic failure" >&2; exit 9; fi',
  'printf "SYNTHETIC-ONLY-CUSTOM-ARCHIVE"'
]);
executable("age",[
  'if [[ "$1" == "-r" ]]; then',
  '  output="";',
  '  while [[ $# -gt 0 ]]; do',
  '    case "$1" in -o) output="$2"; shift 2;; *) shift;; esac',
  '  done',
  '  cat > "$output"',
  'elif [[ "$1" == "-d" ]]; then',
  '  while [[ $# -gt 1 ]]; do shift; done',
  '  cat "$1"',
  'else exit 2; fi'
]);
executable("pg_restore",[
  '[[ "$1" == "--list" ]] || exit 2',
  'cat >/dev/null',
  "for entry in 'auth users' 'auth identities' 'auth sessions' 'public aha_profiles' 'public aha_feed_posts' 'public aha_insta_posts' 'storage buckets' 'storage objects' 'vault secrets' 'supabase_migrations schema_migrations' 'aha_friend_private example'; do",
  '  if [[ "$MOCK_MISS_AUTH" == 1 && "$entry" == "auth users" ]]; then continue; fi',
  '  echo "42; 0 1111 TABLE DATA $entry postgres"',
  'done'
]);
const identity = path.join(tmp,"fake-age-identity.txt");
fs.writeFileSync(identity,"synthetic-only");
const url = "postgresql://postgres:fake-password@db.wshmybqyksrwkawqleiz.supabase.co:5432/postgres";
function invoke(opts={}) {
  const dir = opts.dir || path.join(tmp,"backup-"+Math.random().toString(36).slice(2));
  const env = {
    ...process.env,
    PATH:bin+path.delimiter+process.env.PATH,
    AHA_DB_URL:url,
    AHA_BACKUP_IDENTITY:identity,
    AHA_BACKUP_RECIPIENT:"age1synthetic-test-only",
    AHA_BACKUP_DIR:dir,
    MOCK_DUMP_FAIL:"0",
    MOCK_MISS_AUTH:"0",
    ...opts.env
  };
  const result=spawnSync("bash",[script],{encoding:"utf8",env,timeout:10000});
  assert.ok(!result.stdout.includes("fake-password"));
  assert.ok(!result.stderr.includes("fake-password"));
  return {result,dir};
}
try {
  {
    const {result,dir}=invoke();
    assert.equal(result.status,0,result.stderr);
    const files=fs.readdirSync(dir);
    assert.equal(files.filter(x=>x.endsWith(".dump.age")).length,1);
    assert.equal(files.filter(x=>x.endsWith(".manifest.json")).length,1);
    assert.equal(files.filter(x=>x.endsWith(".objects.txt")).length,1);
    assert.equal(files.some(x=>/\.sql$|\.dump$|\.partial$/.test(x)),false,"No plaintext database dump");
    const report=JSON.parse(fs.readFileSync(path.join(dir,files.find(x=>x.endsWith(".manifest.json")))));
    assert.equal(report.project_ref,"wshmybqyksrwkawqleiz");
    assert.equal(report.restore_tested,false);
    assert.match(report.approval,/NOT_APPROVED/);
    assert.equal(report.encrypted_sha256.length,64);
  }
  {
    const {result}=invoke({env:{AHA_DB_URL:"postgresql://postgres:wrong@db.other.supabase.co:5432/postgres"}});
    assert.notEqual(result.status,0,"Must reject wrong Supabase project");
  }
  {
    const {result}=invoke({env:{MOCK_MISS_AUTH:"1"}});
    assert.notEqual(result.status,0,"Must reject archive without auth.users");
  }
  {
    const {result,dir}=invoke({env:{MOCK_DUMP_FAIL:"1"}});
    assert.notEqual(result.status,0,"pg_dump failure must abort backup");
    assert.equal(fs.readdirSync(dir).some(x=>x.endsWith(".dump.age")),false);
  }
  {
    const dir=path.join(tmp,"inside-repo");
    fs.mkdirSync(dir);
    execFileSync("git",["init","--quiet",dir]);
    const {result}=invoke({dir});
    assert.notEqual(result.status,0,"Never save backups inside a Git worktree");
  }
  console.log("AHA DB-03 encrypted-backup helper: synthetic PASS; no live data exported");
} finally {
  fs.rmSync(tmp,{recursive:true,force:true});
}
