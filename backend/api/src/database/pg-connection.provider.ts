import { Logger } from "@nestjs/common";
import pg, { type Pool, type PoolClient, type QueryResultRow } from "pg";
import type { DatabaseConfig } from "./database-config.js";
import { CanonicalDatabaseError } from "./database.errors.js";
import type {
  DatabaseClient,
  DatabaseConnectionProvider,
  DatabaseQueryResult,
  DatabaseRow
} from "./database.types.js";

const { Pool: PgPool } = pg;

class PgClientAdapter implements DatabaseClient {
  constructor(private readonly client: PoolClient) {}

  async query<Row extends DatabaseRow = Record<string, unknown>>(
    statement: string,
    values: readonly unknown[] = []
  ): Promise<DatabaseQueryResult<Row>> {
    const result = await this.client.query<QueryResultRow>(statement, [...values]);
    return {
      rows: result.rows as Row[],
      rowCount: result.rowCount
    };
  }

  release(): void {
    this.client.release();
  }
}

export class PgConnectionProvider implements DatabaseConnectionProvider {
  private readonly logger = new Logger("AhaPostgresPool");
  private readonly pool: Pool | null;
  readonly configured: boolean;

  constructor(config: DatabaseConfig) {
    this.configured = config.enabled;
    if (!config.enabled || !config.connectionString) {
      this.pool = null;
      return;
    }

    const ssl = config.sslMode === "disable"
      ? false
      : {
          rejectUnauthorized: config.sslMode === "verify-full",
          ...(config.sslCaCertificate ? { ca: config.sslCaCertificate } : {})
        };

    this.pool = new PgPool({
      connectionString: config.connectionString,
      ssl,
      max: config.poolMax,
      connectionTimeoutMillis: config.connectionTimeoutMs,
      idleTimeoutMillis: config.idleTimeoutMs,
      application_name: config.applicationName,
      allowExitOnIdle: true
    });

    this.pool.on("error", () => {
      // Never log the connection string, CA contents or driver error object.
      // Operational telemetry is added through a later redacted database event sink.
      this.logger.error("Unexpected idle PostgreSQL connection error");
    });
  }

  async connect(): Promise<DatabaseClient> {
    if (!this.pool) {
      throw new CanonicalDatabaseError("DATABASE_NOT_CONFIGURED");
    }

    try {
      return new PgClientAdapter(await this.pool.connect());
    } catch (error) {
      throw new CanonicalDatabaseError("DATABASE_UNAVAILABLE", error);
    }
  }

  async end(): Promise<void> {
    if (!this.pool) return;
    await this.pool.end();
  }
}
