const assert = require('node:assert/strict');
const fs = require('node:fs');

const workflow = fs.readFileSync('.github/workflows/aha-canonical-sync-hosted-staging-rehearsal.yml', 'utf8');
const runtimeRole = fs.readFileSync('scripts/aha-canonical-sync-hosted-staging-runtime-role.sh', 'utf8');
const preflight = fs.readFileSync('scripts/aha-postgresql-hosted-staging-preflight.sh', 'utf8');
const prepare = fs.readFileSync('scripts/aha-canonical-sync-hosted-staging-prepare.sh', 'utf8');

assert.match(workflow, /secrets\.AHA_STAGING_DATABASE_CA_CERT/);
assert.match(workflow, /Materialize pinned Supabase database CA/);
assert.match(workflow, /openssl x509 -in "\$ca_file" -noout/);
assert.match(workflow, /AHA_POSTGRES_SSL_ROOT_CERT=/);
assert.match(workflow, /NODE_EXTRA_CA_CERTS=/);
assert.doesNotMatch(workflow, /sslmode=(?:disable|allow|prefer|require)(?:\b|&)/i);

for (const script of [runtimeRole, preflight, prepare]) {
  assert.match(script, /PGSSLMODE=verify-full/);
  assert.match(script, /PGSSLROOTCERT="\$AHA_POSTGRES_SSL_ROOT_CERT"/);
  assert.doesNotMatch(script, /ca-certificates\.crt/);
}

assert.match(runtimeRole, /drop_role\(\) \{\s*local role_name=/s);
assert.match(runtimeRole, /no role metadata; cleanup skipped/);

console.log('aha-canonical-sync-supabase-ca-v1.test.cjs passed');
