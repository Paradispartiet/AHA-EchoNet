import {
  BadRequestException,
  ValidationPipe,
  type INestApplication
} from "@nestjs/common";
import type { AppConfig } from "./config/app-config.js";
import { RequestContextMiddleware } from "./common/request-context.middleware.js";

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
    allowedHeaders: ["authorization", "content-type", "idempotency-key", "x-request-id"],
    exposedHeaders: ["x-request-id"],
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("origin_not_allowed"), false);
    }
  });
}
