export type DatabaseErrorCode =
  | "DATABASE_NOT_CONFIGURED"
  | "DATABASE_UNAVAILABLE"
  | "DATABASE_UNSAFE_RUNTIME_ROLE"
  | "CANONICAL_SCHEMA_NOT_READY";

export class CanonicalDatabaseError extends Error {
  readonly code: DatabaseErrorCode;

  constructor(code: DatabaseErrorCode, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "CanonicalDatabaseError";
    this.code = code;
  }
}
