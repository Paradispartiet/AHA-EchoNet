import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
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
}

export interface CurrentProfileRepository {
  findCurrent(principal: AuthPrincipal): Promise<CurrentProfileReadModel | null>;
}

export const CURRENT_PROFILE_REPOSITORY = Symbol("CURRENT_PROFILE_REPOSITORY");

interface CurrentProfileRow extends QueryResultRow {
  id: string;
  display_name: string | null;
  locale: string;
  timezone: string;
  status: "active";
  created_at: Date | string;
  updated_at: Date | string;
  revision: string | number;
}

@Injectable()
export class PgCurrentProfileRepository implements CurrentProfileRepository {
  constructor(private readonly database: CanonicalDatabaseService) {}

  async findCurrent(principal: AuthPrincipal): Promise<CurrentProfileReadModel | null> {
    return this.database.withReadSession(principal, async (client) => {
      const result = await client.query<CurrentProfileRow>(`
        select
          id,
          display_name,
          locale,
          timezone,
          status,
          created_at,
          updated_at,
          revision
        from aha.profiles
        where id = aha.current_profile_id()
          and status = 'active'
          and deleted_at is null
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
        revision: Number(row.revision)
      });
    });
  }
}

function iso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_profile_timestamp");
  return date.toISOString();
}
