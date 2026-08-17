import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { configureApplication } from "../dist/bootstrap.js";

function testConfig() {
  return Object.freeze({
    environment: "test",
    port: 3100,
    serviceName: "aha-nest-api",
    serviceVersion: "0.2.0-test",
    allowedOrigins: Object.freeze(["https://paradispartiet.github.io"]),
    auditHashSalt: "test-audit-salt-with-more-than-32-characters",
    auth: Object.freeze({
      issuer: "https://issuer.example",
      audience: "aha-api",
      jwksUrl: "https://issuer.example/.well-known/jwks.json",
      provider: "test-provider"
    }),
    runtimeActivated: false,
    databaseConnected: false,
    existingExpressRuntimePrimary: true
  });
}

async function createTestApp() {
  const moduleRef = await Test.createTestingModule({}).compile();
  const app = moduleRef.createNestApplication();
  configureApplication(app, testConfig());
  await app.init();
  return app;
}

test("canonical browser sync preflight accepts auth plus browser no-store cache headers", async (t) => {
  const app = await createTestApp();
  t.after(() => app.close());

  const response = await request(app.getHttpServer())
    .options("/v1/sync/bootstrap")
    .set("Origin", "https://paradispartiet.github.io")
    .set("Access-Control-Request-Method", "GET")
    .set("Access-Control-Request-Headers", "authorization, cache-control, pragma")
    .expect(204);

  assert.equal(response.headers["access-control-allow-origin"], "https://paradispartiet.github.io");
  const allowed = String(response.headers["access-control-allow-headers"] || "").toLowerCase();
  for (const header of ["authorization", "cache-control", "pragma"]) {
    assert.match(allowed, new RegExp(`(?:^|,\\s*)${header}(?:,|$)`));
  }
});

test("canonical browser sync POST preflight accepts JSON content type", async (t) => {
  const app = await createTestApp();
  t.after(() => app.close());

  const response = await request(app.getHttpServer())
    .options("/v1/sync/push")
    .set("Origin", "https://paradispartiet.github.io")
    .set("Access-Control-Request-Method", "POST")
    .set("Access-Control-Request-Headers", "authorization, content-type, cache-control, pragma")
    .expect(204);

  assert.equal(response.headers["access-control-allow-origin"], "https://paradispartiet.github.io");
  const allowed = String(response.headers["access-control-allow-headers"] || "").toLowerCase();
  for (const header of ["authorization", "content-type", "cache-control", "pragma"]) {
    assert.match(allowed, new RegExp(`(?:^|,\\s*)${header}(?:,|$)`));
  }
});
