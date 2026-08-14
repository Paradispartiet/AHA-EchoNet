import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { AUDIT_SINK, type AuditSink, type SafeAuditEvent } from "./audit.types.js";

@Injectable()
export class ConsoleAuditSink implements AuditSink {
  private readonly logger = new Logger("AhaSafeAudit");

  write(event: SafeAuditEvent): void {
    this.logger.log(JSON.stringify(event));
  }
}

@Injectable()
export class SafeAuditService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AUDIT_SINK) private readonly sink: AuditSink
  ) {}

  principalHash(principal: AuthPrincipal | undefined): string | null {
    if (!principal) return null;
    const stableIdentity = `${principal.provider}:${principal.subject}`;
    return `sub_${createHmac("sha256", this.config.auditHashSalt)
      .update(stableIdentity)
      .digest("hex")}`;
  }

  async write(event: Omit<SafeAuditEvent, "service" | "serviceVersion">): Promise<void> {
    const safeEvent: SafeAuditEvent = Object.freeze({
      ...event,
      service: this.config.serviceName,
      serviceVersion: this.config.serviceVersion
    });

    try {
      await this.sink.write(safeEvent);
    } catch {
      // Audit transport failures must not leak secrets or alter the response.
      // A durable sink and operational alerting are delivered in a later PR.
    }
  }
}
