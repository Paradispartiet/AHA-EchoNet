"use strict";
// Synthetic offline tests: no Supabase data, keys, real encryption or database connections.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const script = "scripts/aha-db03-verify-ipad.sh";
assert.equal(spawnSync("bash", ["-n", script], { encoding: "utf8" }).status, 0);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aha-ipad-verify-synthetic-"));
const bin = path.join(temp, "bin");
fs.mkdirSync(bin);
function executable(name, lines) {
  fs.writeFileSync(path.join(bin, name), "#!/usr/bin/env bash\nset -euo pipefail\n" + lines.join("\n") + "\n", { mode: 0o755 });
}
executable("age", [
  '[[ "$1" == "-d" && "$2" == "-i" && "$4" == *.dump.age ]] || exit 31',
  '[[ -f "$3" && "$(cat "$3")" == "SYNTHETIC-IDENTITY" ]] || exit 32',
  '[[ "$MOCK_AGE_FAIL" != yes ]] || exit 33',
  'printf "SYNTHETIC-RESTORE-STREAM\n"'
]);
executable("pg_restore", [
  'if [[ "$1" == "--version" ]]; then',
  '  echo "pg_restore (PostgreSQL) $MOCK_PG_MAJOR.2"; exit 0',
  'fi',
  '[[ "$#" -eq 1 && "$1" == "--file=/dev/null" ]] || exit 41',
  'IFS= read -r first || exit 42',
  '[[ "$first" == "SYNTHETIC-RESTORE-STREAM" ]] || exit 43',
  '[[ "$MOCK_RESTORE_FAIL" != yes ]] || exit 44',
  'cat >/dev/null'
]);
const archive = path.join(temp, "AHA-DB03-20261119T093000Z.dump.age");
const manifest = path.join(temp, "AHA-DB03.manifest.json");
const identity = path.join(temp, "private-identity.txt");
const payload = Buffer.from("NOT-A-REAL-BACKUP-CIPHERTEXT", "utf8");
fs.writeFileSync(archive, payload);
fs.writeFileSync(identity, "SYNTHETIC-IDENTITY", { mode: 0o600 });
const base = {
  project_ref: "wshmybqyksrwkawqleiz",
  archive_format: "age-encrypted PostgreSQL-17 custom-format logical dump",
  encrypted_bytes: payload.length,
  encrypted_sha256: crypto.createHash("sha256").update(payload).digest("hex"),
  restore_tested: false,
  approval: "NOT_APPROVED_FOR_WRITES"
};
function run(data = base, env = {}, archiveArg = archive, identityArg = identity) {
  fs.writeFileSync(manifest, JSON.stringify(data));
  return spawnSync("bash", [script, archiveArg, manifest, identityArg], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
      MOCK_AGE_FAIL: "no", MOCK_RESTORE_FAIL: "no", MOCK_PG_MAJOR: "17", ...env },
    encoding: "utf8",
    timeout: 10000
  });
}
function mustReject(result, reason) {
  assert.notEqual(result.status, 0, reason);
  assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC-IDENTITY|NOT-A-REAL-BACKUP-CIPHERTEXT/);
}
try {
  const ok = run();
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /hash and size: OK/);
  assert.match(ok.stdout, /full pg_restore read: OK/);
  assert.match(ok.stdout, /NOT a tested restore/);
  mustReject(run({ ...base, project_ref: "wrong-supabase-project" }), "Wrong project must fail");
  mustReject(run({ ...base, encrypted_sha256: "0".repeat(64) }), "Changed checksum must fail");
  mustReject(run({ ...base, encrypted_bytes: payload.length + 1 }), "Changed size must fail");
  mustReject(run({ ...base, approval: "APPROVED_FOR_WRITES" }), "Unknown approval state must fail");
  mustReject(run(base, { MOCK_AGE_FAIL: "yes" }), "Failed decryption must fail");
  mustReject(run(base, { MOCK_RESTORE_FAIL: "yes" }), "Failed archive read must fail");
  mustReject(run(base, { MOCK_PG_MAJOR: "16" }), "pg_restore 16 must fail");
  mustReject(run(base, {}, archive, path.join(temp, "no-key")), "Missing private key must fail");
  const wrongName = path.join(temp, "unapproved.dump.age");
  fs.writeFileSync(wrongName, payload);
  mustReject(run(base, {}, wrongName), "Unexpected archive name must fail");
  console.log("AHA iPad encrypted backup verification: synthetic PASS (no live services)");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
