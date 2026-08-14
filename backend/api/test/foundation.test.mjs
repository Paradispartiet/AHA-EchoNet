import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../dist/app.module.js";
import { AUDIT_SINK } from "../dist/audit/audit.types.js";
import { AUTH_TOKEN_VERIFIER } from "../dist/auth/auth.types.js";
import { configureApplication, createGlobalValidationPipe } from "../dist/bootstrap.js";
import { APP_CONFIG, loadAppConfig } from "../dist/config/app-config.js";
import { FoundationCommandEnvelope } from "../dist/foundation-command.dto.js";

class MemoryAuditSink {
  events = [];

  write(event) {
    this.events.push(structuredClone(event));
  }
}

const fakeVerifier = {
  async verify(token) {
    if (token !== "valid-test-token") throw new Error("signature_details_must_not_leak");
    return Object.freeze({
      subject: "profile-subject-123",
      provider: "test-provider",
      issuer: "https://issuer.example",
      audience: Object.freeze(["aha-api"])
    });
  }
};

function testConfig(overrides = {}) {
  return Object.freeze({
    environment: "test",
    port: 3100,
    serviceName: "aha-nest-api",
    serviceVersion: "0.1.0-test",
    allowedOrigins: Object.freeze(["https://app.example"]),
    auditHashSalt: "test-audit-salt-with-more-than-32-characters",
    auth: Object.freeze({
      issuer: "https://issuer.example",
      audience: "aha-api",
      jwksUrl: "https://issuer.example/.well-known/jwks.json",
      provider: "test-provider"
    }),
    runtimeActivated: false,
    databaseConnected: false,
    existingExpressRuntimePrimary: true,
    ...overrides
  });
}

async function createTestApp(config = testConfig()) {
  const sink = new MemoryAuditSink();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .overrideProvider(AUTH_TOKEN_VERIFIER)
    .useValue(fakeVerifier)
    .overrideProvider(AUDIT_SINK)
    .useValue(sink)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApplication(app, config);
  await app.init();
  return { app, sink };
}

async function settleAudit() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("health is public and reports the foundation boundary truthfully", async (t) => {
  const { app } = await createTestApp();
  t.after(() => app.close());

  const response = await request(app.getHttpServer())
    .get("/v1/health")
    .expect(200);

  assert.equal(response.body.status, "ok");
  assert.equal(response.body.runtimeActivated, false);
  assert.equal(response.body.existingExpressRuntimePrimary, true);
  assert.equal(response.body.database.connected, false);
  assert.equal(response.body.database.canonicalSchema, "not_connected");
  assert.equal(response.body.auth.configured, true);
});

test("protected routes reject missing and invalid bearer tokens without verifier details", async (t) => {
  const { app } = await createTestApp();
  t.after(() => app.close());

  await request(app.getHttpServer())
    .get("/v1/auth/context")
    .expect(401)
    .expect(({ body }) => {
      assert.equal(body.message, "A valid bearer token is required");
      assert.doesNotMatch(JSON.stringify(body), /signature_details|jwks|issuer\.example/i);
    });

  await request(app.getHttpServer())
    .get("/v1/auth/context")
    .set("authorization", "Bearer invalid-test-token")
    .expect(401)
    .expect(({ body }) => {
      assert.equal(body.message, "A valid bearer token is required");
      assert.doesNotMatch(JSON.stringify(body), /signature_details_must_not_leak/i);
    });
});

test("verified auth context exposes only immutable principal fields", async (t) => {
  const { app } = await createTestApp();
  t.after(() => app.close());

  const response = await request(app.getHttpServer())
    .get("/v1/auth/context")
    .set("authorization", "Bearer valid-test-token")
    .set("x-request-id", "req-auth-12345678")
    .expect("x-request-id", "req-auth-12345678")
    .expect(200);

  assert.deepEqual(response.body, {
    authenticated: true,
    requestId: "req-auth-12345678",
    principal: {
      subject: "profile-subject-123",
      provider: "test-provider",
      issuer: "https://issuer.example",
      audience: ["aha-api"]
    }
  });
  assert.doesNotMatch(JSON.stringify(response.body), /valid-test-token|user_metadata|raw_user_meta_data/i);
});

test("request IDs are preserved only when valid and generated otherwise", async (t) => {
  const { app } = await createTestApp();
  t.after(() => app.close());

  const valid = await request(app.getHttpServer())
    .get("/v1/health")
    .set("x-request-id", "external-req-1234")
    .expect(200);
  assert.equal(valid.headers["x-request-id"], "external-req-1234");

  const invalid = await request(app.getHttpServer())
    .get("/v1/health")
    .set("x-request-id", "bad id")
    .expect(200);
  assert.match(String(invalid.headers["x-request-id"]), /^[0-9a-f-]{36}$/i);
  assert.notEqual(invalid.headers["x-request-id"], "bad id");
});

test("audit records are redacted and never include token, query or raw subject", async (t) => {
  const { app, sink } = await createTestApp();
  t.after(() => app.close());

  await request(app.getHttpServer())
    .get("/v1/auth/context?private=must-not-appear")
    .set("authorization", "Bearer valid-test-token")
    .set("x-request-id", "req-audit-123456")
    .expect(200);
  await settleAudit();

  const event = sink.events.find((item) => item.requestId === "req-audit-123456");
  assert.ok(event);
  assert.equal(event.route, "/v1/auth/context");
  assert.equal(event.outcome, "success");
  assert.match(event.principalHash, /^sub_[0-9a-f]{64}$/);
  const serialized = JSON.stringify(event);
  assert.doesNotMatch(serialized, /valid-test-token|must-not-appear|profile-subject-123|authorization/i);
});

test("global DTO validation rejects unknown fields and accepts a strict envelope", async () => {
  const pipe = createGlobalValidationPipe();
  const metadata = { type: "body", metatype: FoundationCommandEnvelope, data: "" };

  await assert.rejects(
    pipe.transform({
      workspaceId: "workspace-1",
      command: "health_check",
      idempotencyKey: "idem-12345678",
      unexpected: "blocked"
    }, metadata),
    (error) => error?.getStatus?.() === 400
  );

  const value = await pipe.transform({
    workspaceId: "workspace-1",
    command: "health_check",
    idempotencyKey: "idem-12345678"
  }, metadata);
  assert.ok(value instanceof FoundationCommandEnvelope);
  assert.equal(value.workspaceId, "workspace-1");
});

test("production configuration is fail-closed", () => {
  assert.throws(
    () => loadAppConfig({ NODE_ENV: "production" }),
    /AHA_ALLOWED_ORIGINS|auth configuration|AUDIT_HASH_SALT/
  );

  assert.throws(
    () => loadAppConfig({
      NODE_ENV: "production",
      AHA_ALLOWED_ORIGINS: "*",
      AHA_AUDIT_HASH_SALT: "x".repeat(40),
      AHA_AUTH_ISSUER: "https://issuer.example",
      AHA_AUTH_AUDIENCE: "aha-api",
      AHA_AUTH_JWKS_URL: "https://issuer.example/jwks.json"
    }),
    /wildcard/
  );
});

test("foundation contains no product write routes", async (t) => {
  const { app } = await createTestApp();
  t.after(() => app.close());

  await request(app.getHttpServer())
    .post("/v1/insights")
    .set("authorization", "Bearer valid-test-token")
    .send({ title: "must not write" })
    .expect(404);
});
