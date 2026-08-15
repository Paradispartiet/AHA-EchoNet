import { Injectable } from "@nestjs/common";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { CanonicalDatabaseService } from "../database/canonical-database.service.js";

interface ImportResultRow {
  result: unknown;
}

export interface LocalImportCommand {
  sourceKind: "aha_local_backup";
  sourceVersion: "v1";
  payloadHash: string;
  planHash: string;
  idempotencyKey: string;
  policyVersion: string;
  plan: Record<string, unknown>;
}

@Injectable()
export class LocalImportRepository {
  constructor(private readonly database: CanonicalDatabaseService) {}

  async commit(principal: AuthPrincipal, command: LocalImportCommand): Promise<Record<string, unknown>> {
    return this.database.withCommandSession(principal, async (client) => {
      const response = await client.query<ImportResultRow>(
        `select aha.commit_local_import_v1(
           $1::text,
           $2::text,
           $3::text,
           $4::text,
           $5::text,
           $6::text,
           $7::jsonb
         ) as result`,
        [
          command.sourceKind,
          command.sourceVersion,
          command.payloadHash,
          command.planHash,
          command.idempotencyKey,
          command.policyVersion,
          JSON.stringify(command.plan)
        ]
      );
      const value = response.rows[0]?.result;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("invalid_import_result");
      }
      return value as Record<string, unknown>;
    });
  }
}
