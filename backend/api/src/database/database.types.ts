import type { QueryResultRow } from "pg";

export interface DatabaseQueryResult<Row extends QueryResultRow = QueryResultRow> {
  rows: Row[];
  rowCount: number | null;
}

export interface DatabaseClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    statement: string,
    values?: readonly unknown[]
  ): Promise<DatabaseQueryResult<Row>>;
  release(): void;
}

export interface DatabaseConnectionProvider {
  readonly configured: boolean;
  connect(): Promise<DatabaseClient>;
  end(): Promise<void>;
}

export const DATABASE_CONNECTION_PROVIDER = Symbol("DATABASE_CONNECTION_PROVIDER");

export interface DatabaseReadiness {
  configured: boolean;
  reachable: boolean;
  safeRuntimeRole: boolean;
  rowSecurityOn: boolean;
  canonicalSchemaPresent: boolean;
  status: "disabled" | "unknown" | "ready" | "unsafe_role" | "schema_missing" | "unavailable";
}
