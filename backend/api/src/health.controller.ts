import { Controller, Get, Inject } from "@nestjs/common";
import { Public } from "./auth/public.decorator.js";
import { APP_CONFIG, type AppConfig } from "./config/app-config.js";
import { CanonicalDatabaseService } from "./database/canonical-database.service.js";

@Controller("v1")
export class HealthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly database: CanonicalDatabaseService
  ) {}

  @Public()
  @Get("health")
  health() {
    const database = this.database.snapshot();
    return {
      status: "ok",
      service: this.config.serviceName,
      version: this.config.serviceVersion,
      runtimeActivated: this.config.runtimeActivated,
      existingExpressRuntimePrimary: this.config.existingExpressRuntimePrimary,
      database: {
        configured: database.configured,
        connected: database.reachable,
        status: database.status,
        safeRuntimeRole: database.safeRuntimeRole,
        canonicalSchema: database.canonicalSchemaPresent ? "present" : "not_connected"
      },
      auth: {
        configured: Boolean(this.config.auth)
      }
    } as const;
  }
}
