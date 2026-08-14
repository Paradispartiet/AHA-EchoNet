import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { DATABASE_CONFIG, type DatabaseConfig } from "./database-config.js";
import { CanonicalDatabaseError } from "./database.errors.js";
import {
  DATABASE_CONNECTION_PROVIDER,
  type DatabaseClient,
  type DatabaseConnectionProvider,
  type DatabaseReadiness
} from "./database.types.js";

interface RuntimeSafetyRow extends QueryResultRow {
  row_security_on: boolean;
  bypasses_rls: boolean;
  can_assume_table_owner: boolean;
  profiles_table_present: boolean;
  schema_versions_table_present: boolean;
}

const RUNTIME_SAFETY_QUERY = `
  select
    current_setting('row_security') = 'on' as row_security_on,
    coalesce((
      select r.rolsuper or r.rolbypassrls
      from pg_roles r
      where r.rolname = current_user
    ), true) as bypasses_rls,
    coalesce((
      select pg_has_role(current_user, owner_role.rolname, 'member')
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_roles owner_role on owner_role.oid = c.relowner
      where n.nspname = 'aha' and c.relname = 'profiles'
      limit 1
    ), false) as can_assume_table_owner,
    to_regclass('aha.profiles') is not null as profiles_table_present,
    to_regclass('aha.schema_versions') is not null as schema_versions_table_present
`;

@Injectable()
export class CanonicalDatabaseService implements OnModuleDestroy {
  private readiness: DatabaseReadiness;

  constructor(
    @Inject(DATABASE_CONFIG) private readonly config: DatabaseConfig,
    @Inject(DATABASE_CONNECTION_PROVIDER) private readonly connections: DatabaseConnectionProvider
  ) {
    this.readiness = initialReadiness(connections.configured);
  }

  snapshot(): DatabaseReadiness {
    return Object.freeze({ ...this.readiness });
  }

  async probe(): Promise<DatabaseReadiness> {
    if (!this.connections.configured) {
      this.readiness = initialReadiness(false);
      return this.snapshot();
    }

    let client: DatabaseClient | null = null;
    try {
      client = await this.connections.connect();
      const result = await client.query<RuntimeSafetyRow>(RUNTIME_SAFETY_QUERY);
      this.readiness = readinessFromRow(result.rows[0]);
    } catch {
      this.readiness = Object.freeze({
        configured: true,
        reachable: false,
        safeRuntimeRole: false,
        rowSecurityOn: false,
        canonicalSchemaPresent: false,
        status: "unavailable"
      });
    } finally {
      client?.release();
    }

    return this.snapshot();
  }

  async withReadSession<T>(
    principal: AuthPrincipal,
    operation: (client: DatabaseClient) => Promise<T>
  ): Promise<T> {
    if (!this.connections.configured) {
      throw new CanonicalDatabaseError("DATABASE_NOT_CONFIGURED");
    }

    const client = await this.connections.connect();
    let transactionStarted = false;
    try {
      await client.query("begin");
      transactionStarted = true;
      await client.query("set transaction read only");
      await client.query(
        `select
           set_config('request.jwt.claims', $1, true),
           set_config('row_security', 'on', true),
           set_config('statement_timeout', $2, true),
           set_config('lock_timeout', $3, true),
           set_config('application_name', $4, true)`,
        [
          JSON.stringify(toDatabaseClaims(principal)),
          String(this.config.statementTimeoutMs),
          String(this.config.lockTimeoutMs),
          this.config.applicationName
        ]
      );

      const safety = await client.query<RuntimeSafetyRow>(RUNTIME_SAFETY_QUERY);
      const readiness = readinessFromRow(safety.rows[0]);
      this.readiness = readiness;
      assertReady(readiness);

      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query("rollback");
        } catch {
          // The original safe error remains authoritative.
        }
      }
      if (error instanceof CanonicalDatabaseError) throw error;
      throw new CanonicalDatabaseError("DATABASE_UNAVAILABLE", error);
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.connections.end();
  }
}

function toDatabaseClaims(principal: AuthPrincipal): Readonly<Record<string, unknown>> {
  return Object.freeze({
    sub: principal.subject,
    aha_provider: principal.provider,
    iss: principal.issuer,
    aud: [...principal.audience]
  });
}

function initialReadiness(configured: boolean): DatabaseReadiness {
  return Object.freeze({
    configured,
    reachable: false,
    safeRuntimeRole: false,
    rowSecurityOn: false,
    canonicalSchemaPresent: false,
    status: configured ? "unknown" : "disabled"
  });
}

function readinessFromRow(row: RuntimeSafetyRow | undefined): DatabaseReadiness {
  if (!row) {
    return Object.freeze({
      configured: true,
      reachable: true,
      safeRuntimeRole: false,
      rowSecurityOn: false,
      canonicalSchemaPresent: false,
      status: "unavailable"
    });
  }

  const safeRuntimeRole = !row.bypasses_rls && !row.can_assume_table_owner;
  const canonicalSchemaPresent = row.profiles_table_present && row.schema_versions_table_present;
  const status: DatabaseReadiness["status"] = !safeRuntimeRole
    ? "unsafe_role"
    : !row.row_security_on
      ? "unsafe_role"
      : !canonicalSchemaPresent
        ? "schema_missing"
        : "ready";

  return Object.freeze({
    configured: true,
    reachable: true,
    safeRuntimeRole,
    rowSecurityOn: row.row_security_on,
    canonicalSchemaPresent,
    status
  });
}

function assertReady(readiness: DatabaseReadiness): void {
  if (!readiness.safeRuntimeRole || !readiness.rowSecurityOn) {
    throw new CanonicalDatabaseError("DATABASE_UNSAFE_RUNTIME_ROLE");
  }
  if (!readiness.canonicalSchemaPresent) {
    throw new CanonicalDatabaseError("CANONICAL_SCHEMA_NOT_READY");
  }
}
