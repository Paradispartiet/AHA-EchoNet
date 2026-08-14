import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { configureApplication } from "./bootstrap.js";
import { APP_CONFIG, type AppConfig } from "./config/app-config.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    abortOnError: true
  });
  const config = app.get<AppConfig>(APP_CONFIG);
  configureApplication(app, config);
  await app.listen(config.port, "0.0.0.0");

  const logger = new Logger("AhaNestApi");
  logger.log(JSON.stringify({
    event: "api_started",
    service: config.serviceName,
    version: config.serviceVersion,
    port: config.port,
    runtimeActivated: config.runtimeActivated,
    databaseConnected: config.databaseConnected,
    existingExpressRuntimePrimary: config.existingExpressRuntimePrimary
  }));
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger("AhaNestApi");
  logger.error("AHA NestJS API failed to start", error instanceof Error ? error.stack : undefined);
  process.exitCode = 1;
});
