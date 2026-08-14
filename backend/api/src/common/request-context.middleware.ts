import { Injectable, type NestMiddleware } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { NextFunction, Response } from "express";
import type { AhaRequest } from "./request-context.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: AhaRequest, response: Response, next: NextFunction): void {
    const incoming = String(request.headers["x-request-id"] || "").trim();
    const requestId = REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();

    request.requestId = requestId;
    request.requestStartedAt = process.hrtime.bigint();
    response.setHeader("x-request-id", requestId);
    next();
  }
}
