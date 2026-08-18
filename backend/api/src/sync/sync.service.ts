import { Inject, Injectable } from "@nestjs/common";
import { ApiException } from "../api/api-exception.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { CANONICAL_SYNC_CONFIG, type CanonicalSyncConfig } from "./sync.config.js";
import type { SyncBootstrapQueryDto, SyncPullQueryDto, SyncPushRequestDto } from "./sync.dto.js";
import { canonicalSyncPayloadBytes, canonicalSyncPayloadHash, syncHashesEqual } from "./sync.hash.js";
import { CanonicalSyncRepository } from "./sync.repository.js";

@Injectable()
export class CanonicalSyncService {
  constructor(
    @Inject(CANONICAL_SYNC_CONFIG) private readonly config: CanonicalSyncConfig,
    private readonly repository: CanonicalSyncRepository
  ) {}

  async bootstrap(principal: AuthPrincipal, query: SyncBootstrapQueryDto): Promise<Record<string, unknown>> {
    this.assertEnabledForPilot(principal);
    return this.repository.bootstrap(principal, {
      workspaceId: query.workspaceId,
      afterKey: query.afterKey || "",
      highWatermark: query.highWatermark ?? null,
      limit: this.resolveLimit(query.limit)
    });
  }

  async pull(principal: AuthPrincipal, query: SyncPullQueryDto): Promise<Record<string, unknown>> {
    this.assertEnabledForPilot(principal);
    return this.repository.pull(principal, {
      workspaceId: query.workspaceId,
      afterCursor: query.afterCursor ?? 0,
      limit: this.resolveLimit(query.limit)
    });
  }

  async push(principal: AuthPrincipal, body: SyncPushRequestDto): Promise<Record<string, unknown>> {
    this.assertEnabledForPilot(principal);

    const payload = body.operation === "upsert" ? body.payload : null;
    if (body.operation === "upsert" && (!payload || typeof payload !== "object" || Array.isArray(payload))) {
      throw new ApiException(400, "SYNC_PAYLOAD_INVALID", "Canonical sync upsert requires an object payload");
    }
    if (body.operation === "delete" && body.payload != null) {
      throw new ApiException(400, "SYNC_PAYLOAD_INVALID", "Canonical sync delete must not include an object payload");
    }

    let actualHash: string;
    let bytes: number;
    try {
      actualHash = canonicalSyncPayloadHash(payload);
      bytes = canonicalSyncPayloadBytes(payload);
    } catch {
      throw new ApiException(400, "SYNC_PAYLOAD_INVALID", "Canonical sync payload is not valid canonical JSON");
    }

    if (bytes > this.config.maxPushBytes) {
      throw new ApiException(413, "SYNC_PAYLOAD_TOO_LARGE", "Canonical sync payload exceeds the configured size limit");
    }
    if (!syncHashesEqual(actualHash, body.payloadHash)) {
      throw new ApiException(400, "SYNC_PAYLOAD_HASH_INVALID", "Canonical sync payload hash does not match the request payload");
    }

    return this.repository.push(principal, {
      workspaceId: body.workspaceId,
      deviceId: body.deviceId,
      idempotencyKey: body.idempotencyKey,
      objectType: body.objectType,
      objectId: body.objectId,
      operation: body.operation,
      baseRevision: body.baseRevision,
      payloadHash: body.payloadHash,
      payload: payload as Record<string, unknown> | null
    });
  }

  private resolveLimit(requested: number | undefined): number {
    const limit = requested ?? this.config.defaultLimit;
    if (!Number.isInteger(limit) || limit < 1 || limit > this.config.maxLimit) {
      throw new ApiException(400, "SYNC_LIMIT_INVALID", "Canonical sync page limit is outside the configured range");
    }
    return limit;
  }

  private assertEnabledForPilot(principal: AuthPrincipal): void {
    if (!this.config.enabled) {
      throw new ApiException(503, "CANONICAL_SYNC_DISABLED", "Canonical sync is not enabled on this API deployment");
    }
    const pilotProfileId = String(this.config.pilotProfileId || "").toLowerCase();
    if (!pilotProfileId || String(principal.subject || "").toLowerCase() !== pilotProfileId) {
      throw new ApiException(403, "CANONICAL_SYNC_PILOT_FORBIDDEN", "Canonical sync is restricted to the protected production pilot profile");
    }
  }
}
