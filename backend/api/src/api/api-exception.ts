import { HttpException } from "@nestjs/common";

export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "PROFILE_NOT_FOUND"
  | "CONFLICT"
  | "DATABASE_NOT_CONFIGURED"
  | "DATABASE_UNAVAILABLE"
  | "DATABASE_UNSAFE_RUNTIME_ROLE"
  | "CANONICAL_SCHEMA_NOT_READY"
  | "LOCAL_IMPORT_DISABLED"
  | "IMPORT_COUNTS_INVALID"
  | "IMPORT_TOO_LARGE"
  | "IMPORT_PLAN_INVALID"
  | "IMPORT_PLAN_CHANGED"
  | "IMPORT_CONFIRMATION_INVALID"
  | "IMPORT_CONSENT_REQUIRED"
  | "IMPORT_ID_CONFLICT"
  | "CANONICAL_SYNC_DISABLED"
  | "SYNC_LIMIT_INVALID"
  | "SYNC_PAYLOAD_INVALID"
  | "SYNC_PAYLOAD_HASH_INVALID"
  | "SYNC_PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR";

export class ApiException extends HttpException {
  readonly code: ApiErrorCode;
  readonly safeMessage: string;

  constructor(status: number, code: ApiErrorCode, safeMessage: string) {
    super({ statusCode: status, error: code, message: safeMessage }, status);
    this.name = "ApiException";
    this.code = code;
    this.safeMessage = safeMessage;
  }
}
