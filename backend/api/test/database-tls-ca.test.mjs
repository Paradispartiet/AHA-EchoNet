import assert from "node:assert/strict";
import test from "node:test";
import { loadDatabaseConfig } from "../dist/database/database-config.js";

const TEST_CA = [
  "-----BEGIN CERTIFICATE-----",
  "test-ca-material",
  "-----END CERTIFICATE-----"
].join("\n");

test("explicit PostgreSQL CA is accepted only with verify-full", () => {
  const config = loadDatabaseConfig({
    NODE_ENV: "production",
    AHA_DATABASE_ENABLED: "true",
    AHA_DATABASE_URL: "postgresql://runtime:secret@db.example/aha",
    AHA_DATABASE_SSL_MODE: "verify-full",
    AHA_DATABASE_SSL_CA_CERT: TEST_CA
  });

  assert.equal(config.sslMode, "verify-full");
  assert.equal(config.sslCaCertificate, TEST_CA);

  assert.throws(
    () => loadDatabaseConfig({
      NODE_ENV: "test",
      AHA_DATABASE_ENABLED: "true",
      AHA_DATABASE_URL: "postgresql://runtime:secret@db.example/aha",
      AHA_DATABASE_SSL_MODE: "require",
      AHA_DATABASE_SSL_CA_CERT: TEST_CA
    }),
    /requires AHA_DATABASE_SSL_MODE=verify-full/
  );

  assert.throws(
    () => loadDatabaseConfig({
      NODE_ENV: "production",
      AHA_DATABASE_ENABLED: "true",
      AHA_DATABASE_URL: "postgresql://runtime:secret@db.example/aha",
      AHA_DATABASE_SSL_MODE: "verify-full",
      AHA_DATABASE_SSL_CA_CERT: "not-a-pem"
    }),
    /must contain a PEM certificate/
  );
});

test("explicit CA rejects connection-string SSL options that would replace pg ssl config", () => {
  for (const parameter of ["sslmode=require", "sslrootcert=%2Ftmp%2Froot.crt", "sslcert=%2Ftmp%2Fclient.crt", "sslkey=%2Ftmp%2Fclient.key"]) {
    assert.throws(
      () => loadDatabaseConfig({
        NODE_ENV: "production",
        AHA_DATABASE_ENABLED: "true",
        AHA_DATABASE_URL: `postgresql://runtime:secret@db.example/aha?${parameter}`,
        AHA_DATABASE_SSL_MODE: "verify-full",
        AHA_DATABASE_SSL_CA_CERT: TEST_CA
      }),
      /must not contain ssl/
    );
  }

  const withoutCustomCa = loadDatabaseConfig({
    NODE_ENV: "test",
    AHA_DATABASE_ENABLED: "true",
    AHA_DATABASE_URL: "postgresql://runtime:secret@db.example/aha?sslmode=require",
    AHA_DATABASE_SSL_MODE: "require"
  });
  assert.equal(withoutCustomCa.sslCaCertificate, null);
});
