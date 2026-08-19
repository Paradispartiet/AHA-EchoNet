import assert from "node:assert/strict";
import test from "node:test";
import { ApiExceptionFilter } from "../dist/api/api-exception.filter.js";
import { CanonicalDatabaseService } from "../dist/database/canonical-database.service.js";
import { CanonicalDatabaseError } from "../dist/database/database.errors.js";

const principal = Object.freeze({
  subject: "11111111-1111-4111-8111-111111111111",
  provider: "supabase",
  issuer: "https://issuer.example",
  audience: Object.freeze(["aha-api"])
});

const config = Object.freeze({
  enabled: true,
  connectionString: "postgresql://example.invalid/aha_test",
  sslMode: "disable",
  sslCaCertificate: null,
  poolMax: 1,
  connectionTimeoutMs: 1_000,
  idleTimeoutMs: 1_000,
  statementTimeoutMs: 8_000,
  lockTimeoutMs: 2_000,
  applicationName: "aha-nest-api"
});

const SAFE_RUNTIME_ROW = Object.freeze({
  row_security_on: true,
  bypasses_rls: false,
  has_privileged_role_membership: false,
  can_assume_table_owner: false,
  profiles_table_present: true,
  schema_versions_table_present: true
});

function fakeConnections() {
  const calls = [];
  let released = false;
  const client = {
    async query(statement, values = []) {
      calls.push({ statement, values });
      if (statement.includes("current_setting('row_security') = 'on'")) {
        return { rows: [SAFE_RUNTIME_ROW], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {
      released = true;
    }
  };
  return {
    configured: true,
    async connect() { return client; },
    async end() {},
    calls,
    released: () => released
  };
}

function pgAuthorizationError(message) {
  const error = new Error(message);
  error.code = "42501";
  return error;
}

test("known canonical tenancy denials become DATABASE_FORBIDDEN and roll back safely", async () => {
  for (const message of [
    "authenticated canonical profile required",
    "workspace access denied",
    "workspace edit denied"
  ]) {
    const connections = fakeConnections();
    const database = new CanonicalDatabaseService(config, connections);

    await assert.rejects(
      database.withReadSession(principal, async () => {
        throw pgAuthorizationError(message);
      }),
      (error) => error instanceof CanonicalDatabaseError
        && error.code === "DATABASE_FORBIDDEN"
        && error.cause?.code === "42501"
    );

    assert.equal(connections.released(), true);
    assert.ok(
      connections.calls.some(({ statement }) => statement === "rollback"),
      "authorization denial must roll back the transaction"
    );
  }
});

test("unrecognized PostgreSQL 42501 errors remain fail-closed as DATABASE_UNAVAILABLE", async () => {
  const connections = fakeConnections();
  const database = new CanonicalDatabaseService(config, connections);

  await assert.rejects(
    database.withReadSession(principal, async () => {
      throw pgAuthorizationError("permission denied for function unexpected_future_function");
    }),
    (error) => error instanceof CanonicalDatabaseError
      && error.code === "DATABASE_UNAVAILABLE"
      && error.cause?.code === "42501"
  );
  assert.equal(connections.released(), true);
});

test("API filter exposes DATABASE_FORBIDDEN only as generic HTTP 403 FORBIDDEN", () => {
  const filter = new ApiExceptionFilter({ serviceVersion: "test-api-sha" });
  let statusCode = null;
  let body = null;
  const response = {
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      body = value;
      return this;
    }
  };
  const host = {
    switchToHttp() {
      return {
        getRequest() { return { requestId: "request-test-1" }; },
        getResponse() { return response; }
      };
    }
  };

  filter.catch(new CanonicalDatabaseError("DATABASE_FORBIDDEN"), host);

  assert.equal(statusCode, 403);
  assert.equal(body.error.code, "FORBIDDEN");
  assert.equal(body.error.status, 403);
  assert.equal(body.error.message, "The requested canonical workspace is not permitted");
  assert.equal(body.error.requestId, "request-test-1");
  assert.equal(body.meta.apiVersion, "test-api-sha");
  assert.equal(JSON.stringify(body).includes("workspace access denied"), false);
  assert.equal(JSON.stringify(body).includes("42501"), false);
});
