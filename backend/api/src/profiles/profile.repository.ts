import { Injectable } from "@nestjs/common";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { CanonicalDatabaseService } from "../database/canonical-database.service.js";

export interface CurrentProfileReadModel {
  id: string;
  displayName: string | null;
  locale: string;
  timezone: string;
  status: "active";
  createdAt: string;
  updatedAt: string;
  revision: number;
  personalWorkspaceId: string | null;
}

export interface CurrentProfileRepository {
  findCurrent(principal: AuthPrincipal): Promise<CurrentProfileReadModel | null>;
}

export const CURRENT_PROFILE_REPOSITORY = Symbol("CURRENT_PROFILE_REPOSITORY");

interface CurrentProfileRow {
  id: string;
  display_name: string | null;
  locale: string;
  timezone: string;
  status: "active";
  created_at: Date | string;
  updated_at: Date | string;
  revision: string | number;
  personal_workspace_id: string | null;
}

@Injectable()
export class PgCurrentProfileRepository implements CurrentProfileRepository {
  constructor(private readonly database: CanonicalDatabaseService) {}

  async findCurrent(principal: AuthPrincipal): Promise<CurrentProfileReadModel | null> {
    return this.database.withReadSession(principal, async (client) => {
      const result = await client.query<CurrentProfileRow>(`
        select
          p.id,
          p.display_name,
          p.locale,
          p.timezone,
          p.status,
          p.created_at,
          p.updated_at,
          p.revision,
          (
            select w.id
            from aha.workspaces w
            where w.owner_profile_id = p.id
              and w.workspace_type = 'personal'
              and w.status = 'active'
              and w.deleted_at is null
            order by w.created_at asc, w.id asc
            limit 1
          ) as personal_workspace_id
        from aha.profiles p
        where p.id = aha.current_profile_id()
          and p.status = 'active'
          and p.deleted_at is null
        limit 1
      `);
      const row = result.rows[0];
      if (!row) return null;

      return Object.freeze({
        id: row.id,
        displayName: row.display_name,
        locale: row.locale,
        timezone: row.timezone,
        status: "active",
        createdAt: iso(row.created_at),
        updatedAt: iso(row.updated_at),
        revision: Number(row.revision),
        personalWorkspaceId: row.personal_workspace_id || null
      });
    });
  }
}

function iso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_profile_timestamp");
  return date.toISOString();
}
