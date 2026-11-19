// Fail-closed AHA Azure cost-stop workflow: disabled subscription must cause no writes.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const wf = fs.readFileSync(".github/workflows/aha-azure-emergency-cost-stop.yml", "utf8");

assert.match(wf, /schedule:[\s\S]*cron: "17 \*\/6 \* \* \*"/, "Retain automated stop when subscription is re-enabled");
assert.match(wf, /id: subscription[\s\S]*az account show --query state -o tsv/, "Read current subscription state first");
assert.match(wf, /Enabled\)[\s\S]*enabled=true/, "Explicitly allow only enabled subscription");
assert.match(wf, /Disabled\)[\s\S]*enabled=false/, "Disabled subscription must skip all write steps");
assert.match(wf, /Unexpected Azure subscription state; refusing resource writes/, "Unknown state must fail closed");
for (const name of ["Prepare Container Apps CLI", "Verify production resource group exists"]) {
  const escaped = name.replace(/[.*+?^\x24{}()|[\]\\]/g, "\\$&");
  assert.match(wf, new RegExp("- name: " + escaped + "\\n        if: steps\\.subscription\\.outputs\\.enabled == 'true'"));
}
for(const name of [
  "Stop all PostgreSQL Flexible Servers in AHA production",
  "Scale all production Container Apps to zero",
  "Downgrade production Azure Container Registry to Basic",
  "Final cost-stop verification"
]){
  const escaped = name.replace(/[.*+?^\x24{}()|[\]\\]/g, "\\$&");
  assert.match(wf, new RegExp("- name: " + escaped + "\\n        if: steps\\.subscription\\.outputs\\.enabled == 'true' && steps\\.rg\\.outputs\\.exists == 'true'"));
}
assert.doesNotMatch(wf, /az account (enable|update)|az postgres flexible-server start/, "Never reactivate disabled resources");
console.log("Azure disabled-subscription cost-stop gates: PASS");
