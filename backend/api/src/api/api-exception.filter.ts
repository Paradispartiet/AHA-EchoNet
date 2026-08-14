import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  type ExceptionFilter
} from "@nestjs/common";
import type { Response } from "express";
import type { AhaRequest } from "../common/request-context.js";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { CanonicalDatabaseError } from "../database/database.errors.js";
import type { ApiErrorBody } from "./api-contract.js";
import { ApiException, type ApiErrorCode } from "./api-exception.js";

interface SafeError {
  status: number;
  code: ApiErrorCode;
  message: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("AhaApiErrors");

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<AhaRequest>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId || "missing-request-id";
    const safe = normalizeError(exception);

    if (safe.status >= 500) {
      this.logger.error(JSON.stringify({
        event: "api_request_failed",
        requestId,
        code: safe.code,
        status: safe.status
      }));
    }

    const body: ApiErrorBody = {
      error: {
        code: safe.code,
        message: safe.message,
        status: safe.status,
        requestId
      },
      meta: {
        apiVersion: this.config.serviceVersion,
        timestamp: new Date().toISOString()
      }
    };

    response.status(safe.status).json(body);
  }
}

function normalizeError(exception: unknown): SafeError {
  if (exception instanceof ApiException) {
    return {
      status: exception.getStatus(),
      code: exception.code,
      message: exception.safeMessage
    };
  }

  if (exception instanceof CanonicalDatabaseError) {
    return databaseError(exception.code);
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === HttpStatus.BAD_REQUEST) {
      return { status, code: "VALIDATION_FAILED", message: "Request validation failed" };
    }
    if (status === HttpStatus.UNAUTHORIZED) {
      return { status, code: "AUTH_REQUIRED", message: "A valid bearer token is required" };
    }
    if (status === HttpStatus.FORBIDDEN) {
      return { status, code: "FORBIDDEN", message: "The requested action is not permitted" };
    }
    if (status === HttpStatus.NOT_FOUND) {
      return { status, code: "NOT_FOUND", message: "The requested resource was not found" };
    }
    if (status === HttpStatus.CONFLICT) {
      return { status, code: "CONFLICT", message: "The request conflicts with the current resource state" };
    }
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: "INTERNAL_ERROR",
    message: "The request could not be completed"
  };
}

function databaseError(code: CanonicalDatabaseError["code"]): SafeError {
  if (code === "DATABASE_NOT_CONFIGURED") {
    return { status: 503, code, message: "The canonical database is not configured" };
  }
  if (code === "DATABASE_UNSAFE_RUNTIME_ROLE") {
    return { status: 503, code, message: "The canonical database runtime role is not safe" };
  }
  if (code === "CANONICAL_SCHEMA_NOT_READY") {
    return { status: 503, code, message: "The canonical database schema is not ready" };
  }
  return { status: 503, code: "DATABASE_UNAVAILABLE", message: "The canonical database is unavailable" };
}
