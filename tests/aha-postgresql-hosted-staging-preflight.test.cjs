const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

for (const file of [
  '.github/workflows/aha-postgresql-hosted-staging-preflight.yml',
  'scripts/aha-postgresql-hosted-staging-preflight.sh',
  'docs/AHA_POSTGRESQL_HOSTED_STAGING_PREFLIGHT_V1.md'
]) assert.equal(fs.existsSync(path.join(root, file)), true, `${file} mangler`);

const workflow = read('.github/workflows/aha-postgresql-hosted-staging-preflight.yml');
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /^\s*(push|pull_request|schedule):/m);
assert.match(workflow, /environment:\s*aha-postgresql-staging/);
assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
for (const secret of [
  'AHA_STAGING_ADMIN_DATABASE_URL',
  'AHA_STAGING_RUNTIME_DATABASE_URL',
  'AHA_STAGING_DATABASE_FINGERPRINT'
]) assert.match(workflow, new RegExp(`secrets\\.${secret}`));
assert.match(workflow, /RUN_AHA_HOSTED_STAGING_PREFLIGHT/);
assert.doesNotMatch(workflow, /contents:\s*write|pull-requests:\s*write/);

const script = read('scripts/aha-postgresql-hosted-staging-preflight.sh');
assert.match(script, /default_transaction_read_only=on/);
assert.match(script, /aha\.environment/);
assert.match(script, /aha\.environment_fingerprint/);
assert.match(script, /pg_stat_ssl/);
assert.match(script, /rolsuper/);
assert.match(script, /rolbypassrls/);
assert.match(script, /rolcreatedb/);
assert.match(script, /rolcreaterole/);
assert.match(script, /rolinherit/);
assert.match(script, /role_table_grants/);
assert.match(script, /commit_local_import_v1/);
assert.match(script, /record_local_import_item_v1/);
assert.match(script, /runtime_user.*\^\[A-Za-z_\]/s);
assert.doesNotMatch(script, /psql[^\n]*\s-f\s/);
assert.doesNotMatch(script, /-c\s+["']\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b/i);
assert.doesNotMatch(script, /\bset\s+-x\b/);
assert.doesNotMatch(script, /^\s*(?:env|printenv)(?:\s|$)/m);
for (const secretVar of [
  'AHA_STAGING_ADMIN_DATABASE_URL',
  'AHA_STAGING_RUNTIME_DATABASE_URL',
  'AHA_STAGING_DATABASE_FINGERPRINT'
]) {
  const expandedSecret = String.raw`(?:\$${secretVar}|\$\{${secretVar}\})`;
  assert.doesNotMatch(script, new RegExp(String.raw`(?:echo|printf)[^\n]*${expandedSecret}`));
}

const docs = read('docs/AHA_POSTGRESQL_HOSTED_STAGING_PREFLIGHT_V1.md');
assert.match(docs, /read-only/i);
assert.match(docs, /ikke.*produksjonsaktivering/i);
assert.match(docs, /hosted migration \+ import rehearsal/i);

console.log('aha-postgresql-hosted-staging-preflight.test.cjs passed');
