import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalDatabaseService } from "../dist/database/canonical-database.service.js";
import { loadDatabaseConfig } from "../dist/database/database-config.js";
import { CanonicalDatabaseError } from "../dist/database/database.errors.js";
import { PgCurrentProfileRepository } from "../dist/profiles/profile.repository.js";

const principal = Object.freeze({
  subject: "subject-123",
  provider: "supabase",
  issuer: "https://issuer.example",
  audience: Object.freeze(["aha-api"])
});

function databaseConfig(overrides = {}) {
  return Object.freeze({
    enabled: true,
    connectionString: "postgresql://user:secret@db.example/aha",
    sslMode: "verify-full",
    poolMax: 4,
    connectionTimeoutMs: 5_000,
    idleTimeoutMs: 30_000,
    statementTimeoutMs: 8_000,
    lockTimeoutMs: 2_000,
    applicationName: "aha-nest-api",
    ...overrides
  });
}

function safeRoleRow(overrides = {}) {
  return {
    row_security_on: true,
    bypasses_rls: false,
    has_privileged_role_membership: false,
    can_assume_table_owner: false,
    profiles_table_present: true,
    schema_versions_table_present: true,
    ...overrides
  };
}

class FakeClient {
  queries = [];
  released = false;
  profileRow = null;
  safetyRow = safeRoleRow();
  failOn = null;

  async query(statement, values = []) {
    this.queries.push({ statement, values: [...values] });
    if (this.failOn && statement.includes(this.failOn)) {
      throw new Error("raw_driver_failure_must_not_escape");
    }
    if (statement.includes("current_setting('row_security')")) {
      return { rows: [this.safetyRow], rowCount: 1 };
    }
    if (statement.includes("from aha.profiles")) {
      const rows = this.profileRow ? [this.profileRow] : [];
      return { rows, rowCount: rows.length };
    }
    return { rows: [], rowCount: 0 };
  }

  release() {
    this.released = true;
  }
}

class FakeConnections {
  constructor(configured = true, client = new FakeClient()) {
    this.configured = configured;
    this.client = client;
    this.connectCount = 0;
    this.ended = false;
  }

  async connect() {
    this.connectCount += 1;
    if (!this.configured) throw new CanonicalDatabaseError("DATABASE_NOT_CONFIGURED");
    return this.client;
  }

  async end() {
    this.ended = true;
  }
}

test("database configuration requires explicit enablement and secure production TLS", () => {
  const disabled = loadDatabaseConfig({ NODE_ENV: "test", AHA_DATABASE_URL: "postgresql://ignored.example/db" });
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.connectionString, null);
  assert.equal(disabled.sslMode, "disable");

  assert.throws(
    () => loadDatabaseConfig({ NODE_ENV: "test", AHA_DATABASE_ENABLED: "true" }),
    /AHA_DATABASE_URL is required/
  );
  assert.throws(
    () => loadDatabaseConfig({
      NODE_ENV: "production",
      AHA_DATABASE_ENABLED: "true",
      AHA_DATABASE_URL: "postgresql://db.example/aha",
      AHA_DATABASE_SSL_MODE: "require"
    }),
    /verify-full/
  );

  const enabled = loadDatabaseConfig({
    NODE_ENV: "production",
    AHA_DATABASE_ENABLED: "true",
    AHA_DATABASE_URL: "postgresql://db.example/aha",
    AHA_DATABASE_SSL_MODE: "verify-full",
    AHA_DATABASE_POOL_MAX: "12"
  });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.sslMode, "verify-full");
  assert.equal(enabled.poolMax, 12);
});

test("read sessions are transactional, read-only, parameterized and RLS-bound", async () => {
  const client = new FakeClient();
  const connections = new FakeConnections(true, client);
  const database = new CanonicalDatabaseService(databaseConfig(), connections);

  const result = await database.withReadSession(principal, async (session) => {
    await session.query("select id from aha.profiles where id = $1", ["profile-1"]);
    return "ok";
  });

  assert.equal(result, "ok");
  assert.equal(client.released, true);
  assert.equal(client.queries[0].statement, "begin");
  assert.equal(client.queries[1].statement, "set transaction read only");
  assert.match(client.queries[2].statement, /set_config\('request\.jwt\.claims', \$1, true\)/);
  assert.deepEqual(JSON.parse(client.queries[2].values[0]), {
    sub: "subject-123",
    aha_provider: "supabase",
    iss: "https://issuer.example",
    aud: ["aha-api"]
  });
  assert.equal(client.queries[2].values[1], "8000");
  assert.equal(client.queries[2].values[2], "2000");
  assert.doesNotMatch(client.queries[2].statement, /subject-123|secret|issuer\.example/);
  assert.match(client.queries.at(-1).statement, /^commit$/);
  assert.equal(client.queries.some((entry) => entry.statement === "rollback"), false);
});

test("unsafe runtime roles and missing canonical schema fail before repository access", async () => {
  for (const scenario of [
    { row: safeRoleRow({ bypasses_rls: true }), code: "DATABASE_UNSAFE_RUNTIME_ROLE" },
    { row: safeRoleRow({ has_privileged_role_membership: true }), code: "DATABASE_UNSAFE_RUNTIME_ROLE" },
    { row: safeRoleRow({ can_assume_table_owner: true }), code: "DATABASE_UNSAFE_RUNTIME_ROLE" },
    { row: safeRoleRow({ row_security_on: false }), code: "DATABASE_UNSAFE_RUNTIME_ROLE" },
    { row: safeRoleRow({ profiles_table_present: false }), code: "CANONICAL_SCHEMA_NOT_READY" }
  ]) {
    const client = new FakeClient();
    client.safetyRow = scenario.row;
    const database = new CanonicalDatabaseService(databaseConfig(), new FakeConnections(true, client));
    let operationCalled = false;

    await assert.rejects(
      database.withReadSession(principal, async () => {
        operationCalled = true;
      }),
      (error) => error instanceof CanonicalDatabaseError && error.code === scenario.code
    );
    assert.equal(operationCalled, false);
    assert.equal(client.queries.some((entry) => entry.statement === "rollback"), true);
    assert.equal(client.released, true);
  }
});

test("runtime safety query rejects membership in superuser or BYPASSRLS roles", async () => {
  const client = new FakeClient();
  const database = new CanonicalDatabaseService(databaseConfig(), new FakeConnections(true, client));
  await database.probe();
  const safetyQuery = client.queries.find((entry) => entry.statement.includes("current_setting('row_security')"));
  assert.ok(safetyQuery);
  assert.match(safetyQuery.statement, /privileged_role\.rolsuper\s+or\s+privileged_role\.rolbypassrls/);
  assert.match(safetyQuery.statement, /pg_has_role\(current_user,\s*privileged_role\.oid,\s*'member'\)/);
  assert.match(safetyQuery.statement, /has_privileged_role_membership/);
  assert.doesNotMatch(safetyQuery.statement, /service_role|authenticator|postgres/);
});

test("driver failures roll back and expose only a safe database code", async () => {
  const client = new FakeClient();
  client.failOn = "select protected";
  const database = new CanonicalDatabaseService(databaseConfig(), new FakeConnections(true, client));

  await assert.rejects(
    database.withReadSession(principal, async (session) => {
      await session.query("select protected from aha.profiles");
    }),
    (error) => {
      assert.equal(error instanceof CanonicalDatabaseError, true);
      assert.equal(error.code, "DATABASE_UNAVAILABLE");
      assert.doesNotMatch(String(error.message), /raw_driver_failure|select protected|secret/);
      return true;
    }
  );
  assert.equal(client.queries.some((entry) => entry.statement === "rollback"), true);
});

test("database probe reports safe role and schema state without role names", async () => {
  const client = new FakeClient();
  const database = new CanonicalDatabaseService(databaseConfig(), new FakeConnections(true, client));
  const readiness = await database.probe();

  assert.deepEqual(readiness, {
    configured: true,
    reachable: true,
    safeRuntimeRole: true,
    rowSecurityOn: true,
    canonicalSchemaPresent: true,
    status: "ready"
  });
  assert.doesNotMatch(JSON.stringify(readiness), /user|role_name|connection|secret/i);
});

test("current profile repository maps only the stable read model", async () => {
  const client = new FakeClient();
  client.profileRow = {
    id: "profile-1",
    display_name: "Mats",
    locale: "nb-NO",
    timezone: "Europe/Oslo",
    status: "active",
    created_at: new Date("2026-08-14T00:00:00.000Z"),
    updated_at: "2026-08-14T01:00:00.000Z",
    revision: "7",
    auth_subject: "must-not-be-selected",
    metadata: { private: true }
  };
  const database = new CanonicalDatabaseService(databaseConfig(), new FakeConnections(true, client));
  const repository = new PgCurrentProfileRepository(database);
  const profile = await repository.findCurrent(principal);

  assert.deepEqual(profile, {
    id: "profile-1",
    displayName: "Mats",
    locale: "nb-NO",
    timezone: "Europe/Oslo",
    status: "active",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T01:00:00.000Z",
    revision: 7
  });
  const profileQuery = client.queries.find((entry) => entry.statement.includes("from aha.profiles"));
  assert.ok(profileQuery);
  assert.match(profileQuery.statement, /where id = aha\.current_profile_id\(\)/);
  assert.doesNotMatch(profileQuery.statement, /auth_subject|metadata|select \*/i);
});

test("disabled adapter never attempts a connection", async () => {
  const connections = new FakeConnections(false);
  const database = new CanonicalDatabaseService(databaseConfig({ enabled: false, connectionString: null }), connections);

  await assert.rejects(
    database.withReadSession(principal, async () => null),
    (error) => error instanceof CanonicalDatabaseError && error.code === "DATABASE_NOT_CONFIGURED"
  );
  assert.equal(connections.connectCount, 0);
  assert.equal(database.snapshot().status, "disabled");
  await database.onModuleDestroy();
  assert.equal(connections.ended, true);
});
