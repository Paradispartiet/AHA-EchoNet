const assert = require("node:assert/strict");
const fs = require("node:fs");

const RUNTIME_ROLE = "scripts/aha-canonical-sync-hosted-staging-runtime-role.sh";
const runtimeRole = fs.readFileSync(RUNTIME_ROLE, "utf8");

// psql does not expand -v variables inside SQL sent with -c. The runtime-role
// helper must strip -c/--command and feed that SQL through stdin so :'name'
// and :"name" are interpolated and safely quoted by psql before execution.
assert.match(runtimeRole, /local -a psql_args=\(\)/);
assert.match(runtimeRole, /-c\|--command\)/);
assert.match(runtimeRole, /sql_command="\$2"/);
assert.match(runtimeRole, /psql_args\+=\("\$1"\)/);
assert.match(runtimeRole, /<<<"\$sql_command"/);
assert.match(runtimeRole, /does not perform psql\s*\n\s*# variable interpolation/);

// Keep all SQL call sites on the shared helper instead of bypassing its
// interpolation boundary with a direct psql -c invocation.
assert.doesNotMatch(runtimeRole, /^\s*psql\b[^\n]*\s-c\s/m);

console.log("aha-canonical-sync-psql-interpolation-v1.test.cjs passed");
