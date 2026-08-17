const assert = require("node:assert/strict");
const fs = require("node:fs");

const runner = fs.readFileSync("infra/azure/production/db-init/run.sh", "utf8");

// postgres:16-alpine uses BusyBox mktemp. Its template must end in XXXXXX;
// suffixes after the placeholder fail at runtime with `mktemp: Invalid argument`.
assert.match(runner, /mktemp \/tmp\/aha-production-ca\.XXXXXX\)/);
assert.doesNotMatch(runner, /mktemp \/tmp\/aha-production-ca\.XXXXXX\.[A-Za-z0-9]/);

console.log("aha-production-db-init-mktemp.test.cjs passed");
