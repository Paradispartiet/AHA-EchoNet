import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ApiExceptionFilter } from "./api/api-exception.filter.js";
import { AuditInterceptor } from "./audit/audit.interceptor.js";
import { AUDIT_SINK } from "./audit/audit.types.js";
import { ConsoleAuditSink, SafeAuditService } from "./audit/safe-audit.service.js";
import { AuthGuard } from "./auth/auth.guard.js";
import { AUTH_TOKEN_VERIFIER } from "./auth/auth.types.js";
import { JoseTokenVerifier } from "./auth/jose-token-verifier.js";
import { AuthContextController } from "./auth-context.controller.js";
import { ConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health.controller.js";
import { ProfilesModule } from "./profiles/profiles.module.js";

@Module({
  imports: [ConfigModule, DatabaseModule, ProfilesModule],
  controllers: [HealthController, AuthContextController],
  providers: [
    {
      provide: AUTH_TOKEN_VERIFIER,
      useClass: JoseTokenVerifier
    },
    {
      provide: AUDIT_SINK,
      useClass: ConsoleAuditSink
    },
    SafeAuditService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor
    },
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter
    }
  ]
})
export class AppModule {}
