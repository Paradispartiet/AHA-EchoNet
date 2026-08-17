import { Controller, Get, Inject } from "@nestjs/common";
import { Public } from "./auth/public.decorator.js";
import { APP_CONFIG, type AppConfig } from "./config/app-config.js";
import { CanonicalDatabaseService } from "./database/canonical-database.service.js";
import { CANONICAL_SYNC_CONFIG, type CanonicalSyncConfig } from "./sync/sync.config.js";

@Controller("v1")
export class HealthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CANONICAL_SYNC_CONFIG) private readonly canonicalSync: CanonicalSyncConfig,
    private readonly database: CanonicalDatabaseService
  ) {}

  @Public()
  @Get("health")
  async health() {
    // Health is the production rollout readiness boundary. Probe on request so a
    // newly started Container App reports the live least-privilege database
    // state instead of a stale process-local snapshot. The probe reads only
    // PostgreSQL catalogs and never canonical user payloads.
    const database = await this.database.probe();
    return {
      status: "ok",
      service: this.config.serviceName,
      version: this.config.serviceVersion,
      runtimeActivated: this.config.runtimeActivated,
      existingExpressRuntimePrimary: this.config.existingExpressRuntimePrimary,
      canonicalSync: {
        enabled: this.canonicalSync.enabled
      },
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
