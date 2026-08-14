import { Controller, Get, Inject } from "@nestjs/common";
import { Public } from "./auth/public.decorator.js";
import { APP_CONFIG, type AppConfig } from "./config/app-config.js";

@Controller("v1")
export class HealthController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Public()
  @Get("health")
  health() {
    return {
      status: "ok",
      service: this.config.serviceName,
      version: this.config.serviceVersion,
      runtimeActivated: this.config.runtimeActivated,
      existingExpressRuntimePrimary: this.config.existingExpressRuntimePrimary,
      database: {
        connected: this.config.databaseConnected,
        canonicalSchema: "not_connected"
      },
      auth: {
        configured: Boolean(this.config.auth)
      }
    } as const;
  }
}
