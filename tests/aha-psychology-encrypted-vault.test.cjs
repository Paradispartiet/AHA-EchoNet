const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const code = fs.readFileSync("js/ahaPsychologyEncryptedVault.js", "utf8");
const sql = fs.readFileSync("supabase/psychology-encrypted-vault.sql", "utf8");
const page = fs.readFileSync("psykologi-vault.html", "utf8");
const flags = fs.readFileSync("js/ahaPsychologyVaultConfig.js", "utf8");
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const TABLE = "aha_psychology_encrypted_backups";
const env = JSON.stringify({
  format: "history-go-psychology-encrypted-backup-v1", version: 1,
  kdf: "PBKDF2-SHA256", iterations: 310000, cipher: "AES-256-GCM",
  salt: Buffer.alloc(16, 1).toString("base64"),
  iv: Buffer.alloc(12, 2).toString("base64"),
  data: Buffer.alloc(48, 3).toString("base64")
});

let accesses = 0;
const cloud = new Map();
function mockClient(uid) {
  const session = { data: { session: uid ? { user: { id: uid } } : null }, error: null };
  return {
    auth: { async getSession() { accesses++; return session; } },
    from(name) {
      accesses++;
      assert.equal(name, TABLE);
      return {
        select(columns) {
          assert.ok(["created_at", "encrypted_file,created_at"].includes(columns));
          return {
            eq(column, id) {
              assert.equal(column, "user_id");
              return {
                async maybeSingle() {
                  if (id !== uid) return { data: null, error: null };
                  const value = cloud.get(id);
                  return { data: value ? { created_at: value.created_at,
                    ...(columns.includes("encrypted_file") ? { encrypted_file: value.text } : {}) } : null, error: null };
                }
              };
            }
          };
        },
        async insert(row) {
          assert.equal(row.user_id, uid, "upload always uses authenticated user ID");
          assert.deepEqual(Object.keys(row).sort(), ["encrypted_file", "user_id"]);
          if (cloud.has(uid)) return { error: { code: "23505" } };
          cloud.set(uid, { text: row.encrypted_file, created_at: "2026-11-20T00:00:00Z" });
          return { error: null };
        },
        delete() {
          return {
            async eq(column, id) {
              assert.equal(column, "user_id");
              if (id !== uid) return { error: { code: "42501" } };
              cloud.delete(id);
              return { error: null };
            }
          };
        }
      };
    }
  };
}

const global = { AHA_PSYCHOLOGY_ACCOUNT_VAULT_ENABLED: false };
global.window = global;
vm.createContext(global);
vm.runInContext(code, global, { filename: "ahaPsychologyEncryptedVault.js" });
const vault = global.AHAPsychologyEncryptedVault;

async function run() {
  assert.equal(accesses, 0, "importing the module must never contact the account");
  assert.equal(vault.enabled(), false);
  await assert.rejects(vault.upload(env, { client: mockClient(UUID_A) }), /not_activated/);
  assert.equal(accesses, 0);

  global.AHA_PSYCHOLOGY_ACCOUNT_VAULT_ENABLED = true;
  assert.equal(vault.validateEncryptedFile(env).bytes, Buffer.byteLength(env));
  assert.throws(() => vault.validateEncryptedFile(JSON.stringify({ ...JSON.parse(env), note: "private text" })), /invalid_file/,
    "extra raw note properties must be rejected");
  assert.throws(() => vault.validateEncryptedFile(JSON.stringify({
    ...JSON.parse(env), data: "what happened to me"
  })), /invalid_file/);
  assert.throws(() => vault.validateEncryptedFile(JSON.stringify({
    ...JSON.parse(env), cipher: "none"
  })), /invalid_file/);
  await assert.rejects(vault.status({ client: mockClient(null) }), /login_required/);
  assert.equal(cloud.size, 0, "login failure must not write");

  const alice = { client: mockClient(UUID_A) };
  const bob = { client: mockClient(UUID_B) };
  assert.equal((await vault.status(alice)).exists, false);
  assert.equal((await vault.upload(env, alice)).stored, true);
  assert.equal((await vault.status(alice)).exists, true);
  assert.equal((await vault.status(bob)).exists, false, "B must not see A's status");
  await assert.rejects(vault.download(bob), /no_backup/, "B must not fetch A's file");
  assert.equal((await vault.download(alice)).text, env);
  await assert.rejects(vault.upload(env, alice), /already_exists/,
    "duplicate upload must not silently overwrite");
  assert.equal(cloud.get(UUID_A).text, env);
  await assert.rejects(vault.remove(alice), /confirmation_required/);
  assert.equal(cloud.size, 1);
  assert.equal((await vault.remove({ ...alice, confirmed: true })).removed, true);
  assert.equal(cloud.size, 0);
  assert.equal(await vault.upload(env, bob).then(x => x.stored), true);
  assert.equal((await vault.status(alice)).exists, false);
  assert.equal((await vault.download(bob)).text, env);
  assert.equal(cloud.size, 1);
  assert.equal([...cloud.values()].every(x => x.text === env), true);

  // The feature is intentionally dead until RLS/hosted staging approval.
  assert.match(flags, /AHA_PSYCHOLOGY_ACCOUNT_VAULT_ENABLED\s*=\s*false/);
  assert.match(page, /js\/ahaPsychologyVaultConfig\.js/);
  assert.match(page, /id="aha-psych-vault-panel"[^>]+hidden/);
  assert.doesNotMatch(page, /name="password"|type="password"/);
  assert.doesNotMatch(code, /fetch\(|XMLHttpRequest|postMessage|AHARepository|sync_enabled/);

  // Contract tests supplement, but DO NOT replace, a real PostgreSQL RLS test.
  assert.match(sql, /encrypted_file::jsonb \?& array\[/i,
    "server must demand every required encrypted envelope property");
  assert.match(sql, /encrypted_file::jsonb - array\[/i,
    "server must reject any extra plaintext envelope properties");
  assert.match(sql, /encrypted_file::jsonb -> 'iterations'\) = '310000'::jsonb/i,
    "server must reject unexpected password derivation parameters");
  assert.match(sql, /encrypted_file::jsonb ->> 'salt'\) ~ /i,
    "server must enforce salt encoding");
  assert.match(sql, /alter table public\.aha_psychology_encrypted_backups force row level security/i);
  assert.match(sql, /for select to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(sql, /for insert to authenticated with check \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(sql, /for delete to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(sql, /grant select, insert, delete .*authenticated/is);
  assert.doesNotMatch(sql, /grant[\s\S]{0,100}\bupdate\b[\s\S]{0,100}\bto authenticated/i);
  console.log("AHA psychology encrypted vault: manual opt-in, envelope-only, own-account, no overwrite and SQL policy contracts PASS");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
