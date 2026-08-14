export interface SafeAuditEvent {
  eventId: string;
  occurredAt: string;
  requestId: string;
  principalHash: string | null;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  outcome: "success" | "error";
  errorCode: string | null;
  service: "aha-nest-api";
  serviceVersion: string;
}

export interface AuditSink {
  write(event: SafeAuditEvent): void | Promise<void>;
}

export const AUDIT_SINK = Symbol("AUDIT_SINK");
