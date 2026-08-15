import { Injectable } from "@nestjs/common";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { CanonicalDatabaseService } from "../database/canonical-database.service.js";
import type { CanonicalSyncObjectType, CanonicalSyncOperation } from "./sync.dto.js";

interface SyncResultRow {
  result: unknown;
}

export interface SyncBootstrapCommand {
  workspaceId: string;
  afterKey: string;
  highWatermark: number | null;
  limit: number;
}

export interface SyncPullCommand {
  workspaceId: string;
  afterCursor: number;
  limit: number;
}

export interface SyncPushCommand {
  workspaceId: string;
  deviceId: string;
  idempotencyKey: string;
  objectType: CanonicalSyncObjectType;
  objectId: string;
  operation: CanonicalSyncOperation;
  baseRevision: number;
  payloadHash: string;
  payload: Record<string, unknown> | null;
}

function requireResult(value: unknown, operation: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid_${operation}_result`);
  }
  return value as Record<string, unknown>;
}

@Injectable()
export class CanonicalSyncRepository {
  constructor(private readonly database: CanonicalDatabaseService) {}

  async bootstrap(principal: AuthPrincipal, command: SyncBootstrapCommand): Promise<Record<string, unknown>> {
    return this.database.withReadSession(principal, async (client) => {
      const response = await client.query<SyncResultRow>(
        `select aha.bootstrap_sync_snapshot_v1(
           $1::text,
           $2::text,
           $3::bigint,
           $4::integer
         ) as result`,
        [command.workspaceId, command.afterKey, command.highWatermark, command.limit]
      );
      return requireResult(response.rows[0]?.result, "sync_bootstrap");
    });
  }

  async pull(principal: AuthPrincipal, command: SyncPullCommand): Promise<Record<string, unknown>> {
    return this.database.withReadSession(principal, async (client) => {
      const response = await client.query<SyncResultRow>(
        `select aha.pull_sync_changes_v1(
           $1::text,
           $2::bigint,
           $3::integer
         ) as result`,
        [command.workspaceId, command.afterCursor, command.limit]
      );
      return requireResult(response.rows[0]?.result, "sync_pull");
    });
  }

  async push(principal: AuthPrincipal, command: SyncPushCommand): Promise<Record<string, unknown>> {
    return this.database.withCommandSession(principal, async (client) => {
      const response = await client.query<SyncResultRow>(
        `select aha.push_sync_change_v1(
           $1::text,
           $2::text,
           $3::text,
           $4::text,
           $5::text,
           $6::text,
           $7::bigint,
           $8::text,
           $9::jsonb
         ) as result`,
        [
          command.workspaceId,
          command.deviceId,
          command.idempotencyKey,
          command.objectType,
          command.objectId,
          command.operation,
          command.baseRevision,
          command.payloadHash,
          command.payload === null ? null : JSON.stringify(command.payload)
        ]
      );
      return requireResult(response.rows[0]?.result, "sync_push");
    });
  }
}
