import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { ApiException } from "../dist/api/api-exception.js";
import { FysenAuthorizationService } from "../dist/fysen-integration/fysen-authorization.service.js";
import { loadFysenIntegrationConfig } from "../dist/fysen-integration/fysen-integration.config.js";

const redirectUri = "https://fysen.example/api/aha/callback";
const principal = Object.freeze({
  subject: "subject-fysen-123",
  provider: "supabase",
  issuer: "https://issuer.example",
  audience: Object.freeze(["aha-api"])
});

function config(overrides = {}) {
  return Object.freeze({
    enabled: true,
    authorizationSecret: "fysen-authorization-secret-that-is-longer-than-thirty-two-characters",
    authorizationTtlSeconds: 180,
    allowedRedirectUris: Object.freeze([redirectUri]),
    policyVersion: "aha_fysen_connection_v1",
    ...overrides
  });
}

function verifier() { return "a".repeat(64); }
function challenge(value = verifier()) { return createHash("sha256").update(value, "utf8").digest("base64url"); }

test("Fysen integration is fail-closed by default and can use the protected runtime root", () => {
  const disabled = loadFysenIntegrationConfig({});
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.authorizationSecret, null);

  assert.throws(
    () => loadFysenIntegrationConfig({ AHA_FYSEN_INTEGRATION_ENABLED: "true", AHA_FYSEN_AUTHORIZATION_SECRET: "short", AHA_FYSEN_REDIRECT_URIS: redirectUri }),
    /at least 32 characters/
  );
  assert.throws(
    () => loadFysenIntegrationConfig({ AHA_FYSEN_INTEGRATION_ENABLED: "true", AHA_FYSEN_AUTHORIZATION_SECRET: "x".repeat(40) }),
    /at least one exact redirect URI/
  );

  const productionStyle = loadFysenIntegrationConfig({
    AHA_FYSEN_INTEGRATION_ENABLED: "true",
    AHA_AUDIT_HASH_SALT: "protected-runtime-root-secret-that-is-longer-than-thirty-two-characters",
    AHA_FYSEN_REDIRECT_URIS: redirectUri,
    AHA_FYSEN_AUTHORIZATION_TTL_SECONDS: "180"
  });
  assert.equal(productionStyle.enabled, true);
  assert.equal(productionStyle.authorizationSecret, "protected-runtime-root-secret-that-is-longer-than-thirty-two-characters");
  assert.deepEqual(productionStyle.allowedRedirectUris, [redirectUri]);
});

test("authorization code is principal-, redirect- and PKCE-bound without sharing AHA data", () => {
  const service = new FysenAuthorizationService(config());
  const issued = service.issue(principal, { clientId: "fysen", redirectUri, codeChallenge: challenge() });
  assert.match(issued.authorizationCode, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(issued.dataShared, false);
  assert.deepEqual(issued.scopes, ["fysen:min_mat", "fysen:analysis_handoff"]);
  assert.doesNotMatch(JSON.stringify(issued), /subject-fysen-123/);

  const exchanged = service.exchange({ clientId: "fysen", redirectUri, codeVerifier: verifier(), authorizationCode: issued.authorizationCode });
  assert.equal(exchanged.subject, principal.subject);
  assert.equal(exchanged.provider, "supabase");
  assert.equal(typeof exchanged.authorizationId, "string");

  assert.throws(
    () => service.exchange({ clientId: "fysen", redirectUri, codeVerifier: "b".repeat(64), authorizationCode: issued.authorizationCode }),
    (error) => error instanceof ApiException && error.code === "FYSEN_AUTHORIZATION_INVALID"
  );
});

test("redirect URI is exact-allowlist only", () => {
  const service = new FysenAuthorizationService(config());
  assert.throws(
    () => service.issue(principal, { clientId: "fysen", redirectUri: "https://evil.example/callback", codeChallenge: challenge() }),
    (error) => error instanceof ApiException && error.code === "FYSEN_REDIRECT_NOT_ALLOWED"
  );
});
