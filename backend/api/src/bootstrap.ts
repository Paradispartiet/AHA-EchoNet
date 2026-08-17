import {
  BadRequestException,
  ValidationPipe,
  type INestApplication
} from "@nestjs/common";
import type { AppConfig } from "./config/app-config.js";
import { RequestContextMiddleware } from "./common/request-context.middleware.js";

type CorsDecision = (error: Error | null, allow?: boolean) => void;

export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    stopAtFirstError: true,
    exceptionFactory: () => new BadRequestException({
      statusCode: 400,
      error: "Bad Request",
      message: "Request validation failed"
    })
  });
}

export function configureApplication(app: INestApplication, config: AppConfig): void {
  const requestContext = new RequestContextMiddleware();
  app.use(requestContext.use.bind(requestContext));
  app.useGlobalPipes(createGlobalValidationPipe());
  app.enableShutdownHooks();
  app.enableCors({
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // The browser canonical-sync client uses fetch(cache: "no-store"). On
    // WebKit/Chromium this can add Cache-Control/Pragma to the actual request,
    // which makes them part of the CORS preflight header set. Keep the allowlist
    // explicit, but include those cache directives so an authenticated browser
    // request is not blocked before it reaches NestJS.
    allowedHeaders: [
      "accept",
      "authorization",
      "cache-control",
      "content-type",
      "idempotency-key",
      "pragma",
      "x-request-id"
    ],
    exposedHeaders: ["x-request-id"],
    origin(origin: string | undefined, callback: CorsDecision): void {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("origin_not_allowed"), false);
    }
  });
}
