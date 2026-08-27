const assert = require("node:assert/strict");
const fs = require("node:fs");

const app = fs.readFileSync("infra/azure/production/app.bicep", "utf8");
const config = fs.readFileSync("backend/api/src/fysen-integration/fysen-integration.config.ts", "utf8");
const service = fs.readFileSync("backend/api/src/fysen-integration/fysen-authorization.service.ts", "utf8");

assert.match(app, /param fysenIntegrationEnabled bool = true/);
assert.match(app, /AHA_FYSEN_INTEGRATION_ENABLED'[\s\S]*?fysenIntegrationEnabled \? 'true' : 'false'/);
assert.match(app, /AHA_FYSEN_AUTHORIZATION_TTL_SECONDS'[\s\S]*?string\(fysenAuthorizationTtlSeconds\)/);
assert.match(app, /AHA_FYSEN_REDIRECT_URIS'[\s\S]*?fysenRedirectUris/);
assert.match(app, /https:\/\/fysen\.vercel\.app\/api\/aha\/callback/);
assert.doesNotMatch(app, /fysen-matsgran-8572s-projects\.vercel\.app/);
assert.match(app, /AHA_AUDIT_HASH_SALT'[\s\S]*?secretRef:\s*'audit-salt'/);
assert.doesNotMatch(app, /AHA_FYSEN_AUTHORIZATION_SECRET/);

assert.match(config, /env\.AHA_FYSEN_AUTHORIZATION_SECRET/);
assert.match(config, /env\.AHA_AUDIT_HASH_SALT/);
assert.match(config, /const secret = explicitSecret \|\| protectedRuntimeRoot/);
assert.match(service, /aha-fysen-authorization-signing-key-v1/);
assert.match(service, /createHmac\("sha256", rootSecret\)[\s\S]*?SIGNING_KEY_CONTEXT[\s\S]*?\.digest\(\)/);
assert.match(service, /createHmac\("sha256", signingKey\)/);

console.log("AHA Fysen production wiring is persistent and domain-separated");
