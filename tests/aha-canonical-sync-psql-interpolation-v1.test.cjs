const assert = require("node:assert/strict");
const fs = require("node:fs");

const RUNTIME_ROLE = "scripts/aha-canonical-sync-hosted-staging-runtime-role.sh";
const PREPARE = "scripts/aha-canonical-sync-hosted-staging-prepare.sh";
const runtimeRole = fs.readFileSync(RUNTIME_ROLE, "utf8");
const prepare = fs.readFileSync(PREPARE, "utf8");

// psql does not expand -v variables inside SQL sent with -c. Helpers that use
// psql variables must strip -c/--command and feed SQL through stdin so :'name'
// and :"name" are interpolated and safely quoted by psql before execution.
for (const [label, script] of [["runtime-role", runtimeRole], ["prepare", prepare]]) {
  assert.match(script, /local -a psql_args=\(\)/, `${label} must collect psql args`);
  assert.match(script, /-c\|--command\)/, `${label} must intercept -c`);
  assert.match(script, /sql_command="\$2"/, `${label} must capture SQL`);
  assert.match(script, /psql_args\+=\("\$1"\)/, `${label} must preserve non-command args`);
  assert.match(script, /<<<"\$sql_command"/, `${label} must feed SQL through stdin`);
  assert.match(script, /does not perform psql\s*\n\s*# variable interpolation/, `${label} must document interpolation boundary`);
}

assert.match(prepare, /-v auth_subject="\$auth_subject"/);
assert.match(prepare, /auth_subject=:'auth_subject'/);
assert.match(prepare, /PGSSLMODE=verify-full/);
assert.match(prepare, /PGSSLROOTCERT="\$AHA_POSTGRES_SSL_ROOT_CERT"/);

// Keep all psql-variable SQL call sites on the shared helpers instead of
// bypassing their interpolation boundary with a direct psql -c invocation.
for (const [label, script] of [["runtime-role", runtimeRole], ["prepare", prepare]]) {
  assert.doesNotMatch(script, /^\s*psql\b[^\n]*\s-c\s/m, `${label} bypasses its helper`);
}

console.log("aha-canonical-sync-psql-interpolation-v1.test.cjs passed");
