import { Body, Controller, Get, Inject, Injectable, Param, ParseUUIDPipe, Post, Query, Req } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { apiSuccess } from "../api/api-contract.js";
import { ApiException } from "../api/api-exception.js";
import type { AuthPrincipal } from "../auth/auth.types.js";
import type { AhaRequest } from "../common/request-context.js";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { CanonicalDatabaseService } from "../database/canonical-database.service.js";
import { SocialGate, mapSocialDatabaseError } from "./social-shared.js";

export class ModerationQueueQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(40)
  limit = 20;
}

export class ModerationDecisionInput {
  @IsIn(["hide", "dismiss"])
  action!: "hide" | "dismiss";

  @IsString()
  @Length(5, 500)
  note!: string;
}

@Injectable()
export class SocialModerationRepository {
  constructor(private readonly database: CanonicalDatabaseService) {}

  async queue(principal: AuthPrincipal, limit: number): Promise<Record<string, unknown>[]> {
    try {
      return await this.database.withReadSession(principal, async (client) => {
        const response = await client.query<{ result: unknown }>(
          "select aha_social.moderation_queue_v1($1::integer) as result",
          [limit]
        );
        const result = response.rows[0]?.result;
        if (!Array.isArray(result)) throw new Error("invalid_social_moderation_queue_response");
        return result as Record<string, unknown>[];
      });
    } catch (error) {
      return mapSocialDatabaseError(error);
    }
  }

  async decide(principal: AuthPrincipal, postId: string, action: "hide" | "dismiss", note: string): Promise<Record<string, unknown>> {
    try {
      return await this.database.withCommandSession(principal, async (client) => {
        const response = await client.query<{ result: unknown }>(
          "select aha_social.moderate_post_v1($1::uuid,$2::text,$3::text) as result",
          [postId, action, note]
        );
        const result = response.rows[0]?.result;
        if (!result || typeof result !== "object" || Array.isArray(result)) {
          throw new Error("invalid_social_moderation_decision_response");
        }
        return result as Record<string, unknown>;
      });
    } catch (error) {
      return mapSocialDatabaseError(error);
    }
  }
}

@Injectable()
export class SocialModerationService {
  constructor(
    private readonly gate: SocialGate,
    private readonly repository: SocialModerationRepository
  ) {}

  async queue(principal: AuthPrincipal, query: ModerationQueueQuery) {
    this.gate.assertEnabled();
    return this.repository.queue(principal, query.limit);
  }

  async decide(principal: AuthPrincipal, postId: string, input: ModerationDecisionInput) {
    this.gate.assertEnabled();
    if (!input.note?.trim() || input.note.trim().length < 5) {
      throw new ApiException(400, "VALIDATION_FAILED", "A recorded moderation reason is required");
    }
    return this.repository.decide(principal, postId, input.action, input.note.trim());
  }
}

function requirePrincipal(req: AhaRequest): AuthPrincipal {
  if (!req.principal) throw new ApiException(401, "AUTH_REQUIRED", "A valid bearer token is required");
  return req.principal;
}

@Controller("v1/social/moderation")
export class SocialModerationController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig, private readonly service: SocialModerationService) {}

  @Get("reports")
  async queue(@Req() req: AhaRequest, @Query() query: ModerationQueueQuery) {
    return apiSuccess(req, this.config.serviceVersion, await this.service.queue(requirePrincipal(req), query));
  }

  @Post("posts/:id/decision")
  async decide(@Req() req: AhaRequest, @Param("id", new ParseUUIDPipe()) id: string, @Body() input: ModerationDecisionInput) {
    return apiSuccess(req, this.config.serviceVersion, await this.service.decide(requirePrincipal(req), id, input));
  }
}
