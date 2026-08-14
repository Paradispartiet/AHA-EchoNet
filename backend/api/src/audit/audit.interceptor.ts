import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { catchError, finalize, throwError, type Observable } from "rxjs";
import type { AhaRequest } from "../common/request-context.js";
import { SafeAuditService } from "./safe-audit.service.js";

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: SafeAuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AhaRequest>();
    const response = http.getResponse<Response>();
    const startedAt = request.requestStartedAt || process.hrtime.bigint();
    let errorCode: string | null = null;

    return next.handle().pipe(
      catchError((error: unknown) => {
        errorCode = error instanceof HttpException
          ? `http_${error.getStatus()}`
          : "internal_error";
        return throwError(() => error);
      }),
      finalize(() => {
        const durationNs = process.hrtime.bigint() - startedAt;
        const durationMs = Number(durationNs / 1_000_000n);
        const statusCode = response.statusCode || (errorCode ? 500 : 200);

        void this.audit.write({
          eventId: randomUUID(),
          occurredAt: new Date().toISOString(),
          requestId: request.requestId || randomUUID(),
          principalHash: this.audit.principalHash(request.principal),
          method: String(request.method || "UNKNOWN").toUpperCase(),
          route: safeRoute(request),
          statusCode,
          durationMs,
          outcome: errorCode ? "error" : "success",
          errorCode
        });
      })
    );
  }
}

function safeRoute(request: AhaRequest): string {
  const baseUrl = String(request.baseUrl || "");
  const routePath = String(request.route?.path || "unmatched");
  const route = `${baseUrl}${routePath}`.replace(/\/+/g, "/");
  return route.startsWith("/") ? route.slice(0, 240) : `/${route.slice(0, 239)}`;
}
